// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Python } from "./python.js";
import { createDecorations } from "./decorations.js";
import { Coverage } from "./coverage.js";
import { ShowCoveringTestsCommand } from "./commands/viewCoveringTests.js";

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
	const showCoveringTestCommand = new ShowCoveringTestsCommand(coverage, outputChannel);

	const decorations = createDecorations();

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

	const viewCoveringTests = vscode.commands.registerCommand("pycrunch.viewCoveringTests" , async (e) => {
		try {
			await showCoveringTestCommand.viewCoveringTests(e);
		} catch (err) {
			outputChannel.appendLine(`PyCrunch - (Coverage) Error: ${err}`);
			const choice = await vscode.window.showErrorMessage(`PyCrunch - View Covering Tests failed`, `Show Output`);
			if (choice === "Show Output") {
				outputChannel.show(true);
			}
		}
	});

	context.subscriptions.push(startCommand, stopCommand, runCommand, autoRunCommand, viewCoveringTests);
}

// This method is called when your extension is deactivated
export function deactivate() {}
