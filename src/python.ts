import { PythonExtension } from "@vscode/python-extension";
import assert from "assert";
import { Disposable, EventEmitter, Uri } from "vscode";

export interface IInterpreterDetails {
	path?: string[];
	resource?: Uri;
}

export class Python {
	private extension?: PythonExtension;

	private _onPythonInterpreterChangedEmitter = new EventEmitter<IInterpreterDetails>();
	public readonly onPythonInterpreterChanged = this._onPythonInterpreterChangedEmitter.event;

	public async init(disposables: Disposable[]): Promise<Python> {
		this.extension = await PythonExtension.api();
		assert(this.extension, "Python extension could not be initialized");
		disposables.push(
			this.extension.environments.onDidChangeActiveEnvironmentPath((e) => {
				this._onPythonInterpreterChangedEmitter.fire({ path: [e.path], resource: e.resource?.uri });
			})
		);
		this._onPythonInterpreterChangedEmitter.fire(await this.getInterpreterDetails());
		return this;
	}

	private async getInterpreterDetails(resource?: Uri): Promise<IInterpreterDetails> {
		assert(this.extension, "Python extension not initialized");
		const activeInterpreter = await this.extension.environments.resolveEnvironment(
			this.extension.environments.getActiveEnvironmentPath(resource)
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
