// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Python } from "./python";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "pycrunch" is now active!');

	const config = vscode.workspace.getConfiguration("pycrunch");
	const python = await new Python().init(context.subscriptions);

	// const outputChannel = vscode.window.createOutputChannel("PyCrunch");
	// TODO: do something with this output channel

	context.subscriptions.push(
		python.onPythonInterpreterChanged(async (interpreter) => {
			Server.start(interpreter.path);
		})
	);

	const startCommand = vscode.commands.registerCommand("pycrunch.start", () => {
		vscode.window.showInformationMessage("PyCrunch - Starting server...");
	});

	const stopCommand = vscode.commands.registerCommand("pycrunch.stop", () => {
		vscode.window.showInformationMessage("PyCrunch - Stopping server...");
	});

	const runCommand = vscode.commands.registerCommand("pycrunch.run", () => {
		vscode.window.showInformationMessage("PyCrunch - Running tests...");
	});

	const autoRunCommand = vscode.commands.registerCommand("pycrunch.autoRun", () => {
		const autoRun = config.get<boolean>("autoRun");
		config.update("autoRun", !autoRun, vscode.ConfigurationTarget.Workspace);

		const status = !autoRun ? "enabled" : "disabled";

		vscode.window.showInformationMessage(`PyCrunch - autoRun tests ${status}`);
	});

	context.subscriptions.push(startCommand, stopCommand, runCommand, autoRunCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
