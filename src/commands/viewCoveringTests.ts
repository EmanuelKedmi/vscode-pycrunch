import * as vscode from 'vscode';
import { ITestResult } from '../engine';
import { Coverage } from '../coverage';
import { fqnToIcon } from '../iconsUtil';

export interface ICursorPosition {
    lineNumber: number;
    path: string;
}

export class ShowCoveringTestsCommand {
    coverage: Coverage;
    outputChannel: vscode.OutputChannel;
    public constructor(coverage: Coverage, outputChannel: vscode.OutputChannel) {
        this.coverage = coverage;
        this.outputChannel = outputChannel;
    }

    public async viewCoveringTests(event: any | undefined) {
        let cursorPosition = this.getCursorLocationFromEventOrEditor(event);
        this.outputChannel.appendLine(`PyCrunch - (Coverage) View covering tests for ${cursorPosition.path}:${cursorPosition.lineNumber}`);

        const testFqns = this.coverage.getCoveringTests(cursorPosition.lineNumber, cursorPosition.path);
        const items = this.convertTestsToQuickPickItems(testFqns);
        const selectedTest = await vscode.window.showQuickPick(items, {
            placeHolder: `Tests covering this line (:${cursorPosition.lineNumber}):`,
        });

        if (!selectedTest) {
            return;
        }
        let testFqn = selectedTest.label;
        let selectedTestResult = this.coverage.findTestResult(testFqn);
        if (!selectedTestResult) {
            vscode.window.showErrorMessage(`You picked: ${testFqn}; But it was not found in test results`);
            return;
        }

        this.jumpToTest(selectedTestResult);


    }
    private async jumpToTest(selectedTestResult: ITestResult) {
        let filename = selectedTestResult?.test_metadata.filename;
        // fqn is "test_module::test_name", so split by :: and take the last one
        let fqn = selectedTestResult?.test_metadata.fqn;
        if (fqn) {
            let className = null;
            let parts = fqn;
            if (fqn.includes("::")) {
                let split = fqn.split("::");
                parts = split[split.length - 1];
                let className = parts[0];
            }

            let splitResult = parts.split(':');
            let testName = splitResult[splitResult.length - 1];

            this.outputChannel.appendLine(`Going to ${testName} in ${filename}`);

            let uri = vscode.Uri.file(filename);
            let document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);

            await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', document.uri).then((symbols: vscode.DocumentSymbol[]) => {
                if (symbols) {
                    let allSymbols = this.flattenDocumentSymbols(symbols);

                    let targetSymbol = allSymbols.find(symbol => symbol.name === testName);
                    if (targetSymbol) {
                        // Reveal the symbol in the editor
                        vscode.window.showTextDocument(document, {
                            selection: new vscode.Selection(targetSymbol.range.start, targetSymbol.range.start)
                        });
                    } else {
                        vscode.window.showWarningMessage(`Test '${testName}' not found in file '${filename}'`);
                    }
                }
            });
        }
    }

    private flattenDocumentSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
        let flatSymbols: vscode.DocumentSymbol[] = [];
        symbols.forEach(symbol => {
            flatSymbols.push(symbol);
            if (symbol.children && symbol.children.length > 0) {
                flatSymbols = flatSymbols.concat(this.flattenDocumentSymbols(symbol.children));
            }
        });
        return flatSymbols;
    }

    private getCursorLocationFromEventOrEditor(event: any): ICursorPosition {
        let lineNumber;
        let path;
        if (event) {
            // This comes from gutter click
            lineNumber = event.lineNumber;
            path = event.uri.path;
        } else {
            // When the command is called from the command palette 
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const position = editor.selection.active;
                // position.line is zero based
                lineNumber = position.line + 1;
                path = editor.document.uri.path;
            }
        }
        return { path, lineNumber };
    }

    private convertTestsToQuickPickItems(tests: string[]): vscode.QuickPickItem[] {
        return tests.sort().map((test) => {
            const testResult = this.coverage.findTestResult(test);
            if (!testResult) {
                this.outputChannel.appendLine(`convertToQuickPickItems - testResult not found for ${test}`);
                return;
            }
            const iconUri = vscode.Uri.file(fqnToIcon(testResult));
            return {
                label: test,
                iconPath: iconUri,
                // description: testResult.status
            };
        }).filter(item => item !== undefined) as vscode.QuickPickItem[];
    }
}