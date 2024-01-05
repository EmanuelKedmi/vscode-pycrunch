import * as vscode from "vscode";
import * as cp from "child_process";
import { io, Socket } from "socket.io-client";
import { promisify } from "util";

export class Server implements vscode.Disposable {
	// Engine Process
	private process?: cp.ChildProcess;
	// Engine Comm Socket
	private socket?: Socket;

	// Engine State
	private status?: string;
	private version?: string;
	private testsDiscovered?: any[];
	private combinedCoverage?: any[];
	private testResults?: any[];

	private readonly testsDiscoveredEmitter = new vscode.EventEmitter<any[]>();
	private readonly combinedCoverageEmitter = new vscode.EventEmitter<any[]>();
	private readonly testResultsEmitter = new vscode.EventEmitter<any[]>();

	public constructor(
		private readonly terminal: vscode.Terminal,
		private readonly config: vscode.WorkspaceConfiguration
	) {}

	public dispose() {
		this.stop();
	}

	public start(path: string) {
		vscode.window.showInformationMessage("PyCrunch - Starting server...");

		this.stop(false);

		const port = this.config.get<number>("port");
		this.process = cp.spawn(path, ["-m", "pycrunch.main", `--port=${port}`]);
		this.socket = this.attachToEngine();
	}

	public stop(showMessage = true) {
		vscode.window.showInformationMessage("PyCrunch - Stopping server...");

		this.postHalt();
		this.socket?.disconnect();
		this.socket = undefined;

		if (this.process) {
			if (!this.process.kill()) {
				this.process.kill("SIGKILL");
			}
			this.process = undefined;
		}
	}

	public async run() {
		vscode.window.showInformationMessage("PyCrunch - Running tests...");
		this.postDiscovery();
		const disposable = this.testsDiscoveredEmitter.event((discoveredTests) => {
			this.postRunTests(discoveredTests);
			disposable.dispose();
		});
	}

	private attachToEngine(): Socket {
		const sock = io(`http://localhost:${this.config.get<number>("port")}`);

		sock.on("event", this.onEventMessage.bind(this));
		sock.on("disconnect", () => {
			console.log("disconnected");
		});
		sock.on("connect", () => {
			console.log("connected");
		});
		sock.on("connect_error", () => {
			console.log("connect_error");
		});
		return sock;
	}

	private onEventMessage(message: any) {
		const eventType = message.event_type;
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
			default:
				console.log(`Unknown event type: ${eventType}`);
		}
	}

	private postExtensionVersion() {
		this.socket?.emit("my event", { action: "plugin_version", plugin_version: "0.0.1" });
	}

	private postDiscovery() {
		this.socket?.emit("my event", { action: "discovery" });
	}

	private postHalt() {
		this.socket?.emit("my event", { action: "halt" });
	}

	private postRunTests(fqns: string[]) {
		this.socket?.emit("my event", { action: "run-tests", tests: fqns.map((fqn) => ({ fqn })) });
	}

	private updateDiscoveredTests(message: any) {
		this.testsDiscovered = message.tests;
		this.testsDiscoveredEmitter.fire(this.testsDiscovered!);
	}

	private updateCombinedCoverage(message: any) {
		this.combinedCoverage = message.combined_coverage;
	}

	private updateTestResults(message: any) {
		this.testResults = message.coverage.all_runs;
	}
}
