// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Python } from "./python.js";
import { createGutterDecorations } from "./decorations.js";
import { Coverage } from "./coverage.js";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	const outputChannel = vscode.window.createOutputChannel("PyCrunch");
	outputChannel.show(true);
	outputChannel.appendLine("PyCrunch - Initializing...");

	const { Engine } = await import("./engine.js");

	const config = vscode.workspace.getConfiguration("pycrunch");
	const python = await new Python(outputChannel, config).init();
	const engine = new Engine(python, outputChannel, config);
	const coverage = new Coverage(engine, outputChannel, config);

	const decorations = createGutterDecorations();

	context.subscriptions.push(
		python,
		engine,
		coverage,
		outputChannel,
		...Object.values(decorations),
		
	);

	const startCommand = vscode.commands.registerCommand("pycrunch.start", () => {
		return engine.start()
	});

	const stopCommand = vscode.commands.registerCommand("pycrunch.stop", async () => {
		await engine.stop();
	});

	const runCommand = vscode.commands.registerCommand("pycrunch.run", async () => {
		await engine.run();
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
