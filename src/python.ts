import { PythonExtension } from "@vscode/python-extension";
import assert from "assert";
import * as vscode from "vscode";

export interface IInterpreterDetails {
	path?: string[];
	resource?: vscode.Uri;
}

export class Python implements vscode.Disposable {
	private _extension?: PythonExtension;

	private _interpreterDetails?: IInterpreterDetails;
	private _onPythonInterpreterChangedEmitter = new vscode.EventEmitter<IInterpreterDetails>();
	public readonly onPythonInterpreterChanged = this._onPythonInterpreterChangedEmitter.event;
	public get interpreter(): string | undefined {
		return this._interpreterDetails?.path?.[0];
	}

	private readonly _disposables: vscode.Disposable[] = [];

	public constructor(
		private readonly outputChannel: vscode.OutputChannel,
		private readonly config: vscode.WorkspaceConfiguration,
	) {}

	public dispose() {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
	}

	public async init(): Promise<Python> {
		this.outputChannel.appendLine("PyCrunch - Initializing python extension...");
		this._extension = await PythonExtension.api();
		if (!this._extension) {
			vscode.window.showErrorMessage("PyCrunch - Could not initialize python extension")
			this.outputChannel.appendLine("PyCrunch - Could not initialize python extension");
			throw new Error("Could not initialize python extension");
		}
		this._disposables.push(
			this._extension.environments.onDidChangeActiveEnvironmentPath((e) => {
				this.outputChannel.appendLine(`PyCrunch - Python interpreter changed: ${e.path}`);
				this._interpreterDetails = { path: [e.path], resource: e.resource?.uri };
				this._onPythonInterpreterChangedEmitter.fire(this._interpreterDetails);
			})
		);
		this._interpreterDetails = await this.getInterpreterDetails();
		this.outputChannel.appendLine(`PyCrunch - Python interpreter found: ${this._interpreterDetails.path}`);
		this._onPythonInterpreterChangedEmitter.fire(this._interpreterDetails);
		return this;
	}

	private async getInterpreterDetails(resource?: vscode.Uri): Promise<IInterpreterDetails> {
		const activeInterpreter = await this._extension!.environments.resolveEnvironment(
			this._extension!.environments.getActiveEnvironmentPath(resource)
		);

		if (activeInterpreter?.executable.uri) {
			return {
				path: [activeInterpreter.executable.uri.fsPath],
				resource,
			};
		}

		return { path: undefined, resource };
	}
}
