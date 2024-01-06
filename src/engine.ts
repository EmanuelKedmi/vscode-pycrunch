import * as vscode from "vscode";
import * as cp from "child_process";
import { sleep } from "./utils";
import assert from "assert";
import { Python } from "./python";

// TODO: figure out this import issue so we can use the types (Socker, ... etc) from socket.io-client
const { io, Socket } = require( "socket.io-client");

export interface ITestResult {
    entry_point: string;
    time_elapsed: number;
    test_metadata: {
        fqn: string;
        filename: string;
        name: string;
        module: string;
        state: string;
    };
    files: Array<{
        filename: string;
        lines_covered: number[];
    }>
    status: string;
    captured_exception: {
        filename: string;
        line_number: number;
        full_traceback: string;
        variables: { [key: string]: string };
    }
    captured_output: string;
    variables_state: { [key: string]: any };
}

export type TestsResults = { [key: string]: ITestResult };

export interface IFileCoverage {
    filename: string;
    exceptions: number[];
    lines_with_entrypoints: { [key: `${number}`]: string[] };
}

export type CombineCoverage = Array<IFileCoverage>;

export class Engine implements vscode.Disposable {
	// Engine Process
	private process?: cp.ChildProcess;
	// Engine Comm Socket
	private socket?: any;

	// Engine State
	private status: string = 'disconnected';
	private connectErrorCount: number = 0;
	private version?: string;
	private testsDiscovered?: any[];
	private combinedCoverage?: any[];
	private testResults?: any[];

	private readonly testsDiscoveredEmitter = new vscode.EventEmitter<any[]>();
	public readonly onTestsDiscovered = this.testsDiscoveredEmitter.event;
	
	private readonly combinedCoverageEmitter = new vscode.EventEmitter<any[]>();
	public readonly onCombinedCoverage = this.combinedCoverageEmitter.event;
	
	private readonly testResultsEmitter = new vscode.EventEmitter<any>();
	public readonly onTestResults = this.testResultsEmitter.event;

	private readonly engineOutputChannel = vscode.window.createOutputChannel("PyCrunch - Engine");

	private _interpreter?: string;

	private readonly _disposables: vscode.Disposable[] = [
		this.testsDiscoveredEmitter,
		this.combinedCoverageEmitter,
		this.testResultsEmitter,
		this.engineOutputChannel
	];

	public constructor(
		private readonly python: Python,
		private readonly outputChannel: vscode.OutputChannel,
		private readonly config: vscode.WorkspaceConfiguration,
	) {
		this._disposables.push(python.onPythonInterpreterChanged(async (interpreter) => {
			// TODO: verify server was started before we decide to restart it
			if (interpreter?.path?.[0]) {
				this._interpreter = interpreter.path[0];
				this.start();
			}
		}));
	}

	public dispose() {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
		this.stop();
	}

	public isReady() {
		return this.process && this.socket && this.status !== "disconnected";
	}

	public async start() {
		const path = this._interpreter ?? this.python.interpreter;
		if (!path) {
			this.outputChannel.appendLine(`PyCrunch - Python interpreter not found`);
			vscode.window.showErrorMessage("PyCrunch - Python interpreter not found");
			return;
		}

		// to check if the package is installed in python:
		// 'pycrunch-engine' in [d.key for d in pkg_resources.find_distributions(p) for p in sys.path]
		
		await this.stop(false);
		
		try {
			this.outputChannel.appendLine(`PyCrunch - Starting server...`);
			const port = this.config.get<number>("port");
			this.process = cp.spawn(path, ["-m", "pycrunch.main", `--port=${port}`], { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath });
			
			this.process.stderr?.on("data", (data) => {
				this.engineOutputChannel.appendLine(`PyCrunch - engine stderr message: ${data}`);
			});
			this.process.stdout?.on("data", (data) => {
				this.engineOutputChannel.appendLine(`PyCrunch - engine stdout message: ${data}`);
			});

			await sleep(1000);
			if (this.process.exitCode != null) {
				throw new Error(`engine process exited with code ${this.process.exitCode}`);
			}

			this.socket = this.attachToEngine();
			this.outputChannel.appendLine(`PyCrunch - Server started`);
			vscode.window.showInformationMessage("PyCrunch - Server started");
		} catch (error) {
			assert(error instanceof Error, "error is not an instance of Error");
			vscode.window.showErrorMessage(`PyCrunch - Error starting server`, { detail: error.toString() }, "View Output").then((selection) => {
				if (selection === "View Output") {
					this.outputChannel.show();
				}
			});
			this.outputChannel.appendLine(`PyCrunch - Error starting server: ${error.message}`);
			throw error;
		}
	}

	public async stop(showMessage = true) {
		if (!this.process && !this.socket) {
			return;
		}
		try {
			this.outputChannel.appendLine(`PyCrunch - Stopping server...`);
			if (showMessage) {
				vscode.window.showInformationMessage("PyCrunch - Stopping server...");
			}

			this.outputChannel.appendLine(`PyCrunch - Sending halt command to engine`);
			this.postHalt();
			this.process?.disconnect?.();

			await sleep(1000);

			this.outputChannel.appendLine(`PyCrunch - Disconnecting engine socket`);
			this.socket?.disconnect();
			this.socket = undefined;
			
			if (this.process) {
				this.outputChannel.appendLine(`PyCrunch - Process still alive, sending SIGTERM`);
				if (!this.process.kill("SIGKILL")) {
					throw new Error("could not kill process");
				}

				// timeout(async (isTimedOut) => {
				// 	while (!this.process?.killed) {
				// 		await isTimedOut;
				// 		await sleep(100);
				// 	}
				// 	return true;
				// }, 3000)

				await sleep(1500);
				if (!this.process.killed) {
					throw new Error("process did not exit within 1.5 seconds");
				}

				this.process = undefined;
			}
			this.outputChannel.appendLine(`PyCrunch - Server stopped`);
			if (showMessage) {
				vscode.window.showInformationMessage("PyCrunch - Server stopped");
			}
		} catch (error) {
			assert(error instanceof Error, "error is not an instance of Error");
			this.outputChannel.appendLine(`PyCrunch - Error stopping server: ${error.message}`);
			vscode.window.showErrorMessage(`PyCrunch - Error stopping server`, { detail: error.message }, "View Output").then((selection) => {
				if (selection === "View Output") {
					this.outputChannel.show();
				}
			});
			throw error;
		}
	}

	public async run() {
		if (!this.isReady()) {
			this.start()
			await sleep(3000);
			if (!this.isReady()) {
				vscode.window.showErrorMessage("PyCrunch - Server not ready");
				return;
			}
		}
		vscode.window.showInformationMessage("PyCrunch - Running tests...");
		this.postDiscovery();
		const disposable = this.testsDiscoveredEmitter.event((discoveredTests) => {
			this.postRunTests(discoveredTests.map((test) => test.fqn));
			disposable.dispose();
		});
	}

	private attachToEngine(): any {
		this.outputChannel.appendLine(`PyCrunch - Attaching to engine socket`);
		const sock = io(`http://localhost:${this.config.get<number>("port")}`);

		sock.on("event", this.onEventMessage.bind(this));
		sock.on("disconnect", () => {
			this.outputChannel.appendLine("PyCrunch - Engine socket disconnected");
			this.status = "disconnected";
			this.connectErrorCount++;
		});
		sock.on("connect", () => {
			this.outputChannel.appendLine("PyCrunch - Engine socket connected");
			this.connectErrorCount = 0;
		});
		sock.on("connect_error", () => {
			this.outputChannel.appendLine("PyCrunch - Engine socket connect error");
			this.status = "disconnected";
			this.connectErrorCount++;
			if (this.connectErrorCount >= 3) {
				this.start();
			}
		});
		return sock;
	}

	private onEventMessage(message: any) {
		const eventType = message.event_type;
		this.outputChannel.appendLine(`PyCrunch - Received event: ${eventType}`);
		switch (eventType) {
			case "connected":
				this.status = "connected";
				this.version = message.version;
				break;
			case "discovery_did_become_available":
				this.status = "discovery_completed";
				this.updateDiscoveredTests(message);
				break;
			case "combined_coverage_updated":
				this.updateCombinedCoverage(message);
				break;
			case "test_run_completed":
				this.updateTestResults(message);
				break;
			case "watchdog_begin":
			case "watchdog_end":
				break;
			default:
				this.outputChannel.appendLine(`PyCrunch - Unknown event type: ${eventType}`);
		}
	}

	private postExtensionVersion() {
		this.outputChannel.appendLine(`PyCrunch - Sending plugin version`);
		this.socket?.emit("my event", { action: "plugin_version", plugin_version: "0.0.1" });
	}

	private postDiscovery() {
		this.outputChannel.appendLine(`PyCrunch - Sending discovery command to engine`);
		this.socket?.emit("my event", { action: "discovery" });
	}

	private postHalt() {
		this.outputChannel.appendLine(`PyCrunch - Sending halt command to engine`);
		this.socket?.emit("my event", { action: "halt" });
	}

	private postRunTests(fqns: string[]) {
		this.outputChannel.appendLine(`PyCrunch - Sending run-tests command to engine`);
		this.socket?.emit("my event", { action: "run-tests", tests: fqns.map((fqn) => ({ fqn })) });
	}

	private updateDiscoveredTests(message: any) {
		// TODO: add validation & typing for message and log errors
		this.testsDiscovered = message.tests;
		this.testsDiscoveredEmitter.fire(this.testsDiscovered!);
		this.outputChannel.appendLine(`PyCrunch - Discovered ${this.testsDiscovered!.length} tests`);
	}

	private updateCombinedCoverage(message: any) {
		// TODO: add validation & typing for message and log errors
		this.combinedCoverage = message.combined_coverage;
		this.combinedCoverageEmitter.fire(this.combinedCoverage!);
		this.outputChannel.appendLine(`PyCrunch - Combined coverage updated`);
	}

	private updateTestResults(message: any) {
		// TODO: add validation & typing for message and log errors
		this.testResults = message.coverage.all_runs;
		this.testResultsEmitter.fire(this.testResults!);
		this.outputChannel.appendLine(`PyCrunch - Test results updated`);
	}
}
