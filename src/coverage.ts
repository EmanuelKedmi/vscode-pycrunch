import * as util from 'node:util';
import * as vscode from 'vscode';
import { CombineCoverage, Engine, ITestResult, TestsResults } from './engine';
import { IconDecorationDict, createDecorations, decorateEditor } from './decorations';
import { arePathsEqual } from './utils';



export class Coverage implements vscode.Disposable {
    private _disposables: vscode.Disposable[] = [];

    private _combinedCoverage?: CombineCoverage;
    private _testsResults: TestsResults = {};

    private _decorations: IconDecorationDict = createDecorations();

    public constructor(
        private readonly engine: Engine,
        private readonly outputChannel: vscode.OutputChannel,
        private readonly config: vscode.WorkspaceConfiguration,
    ) {
        this._disposables.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                this.removeCoverage(document.uri.fsPath);
                this.updateTestsResults();
            }),
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                this.outputChannel.appendLine(`PyCrunch - (Coverage) Active editor changed: ${editor?.document.fileName}`);
                // Listen to editor changes to update coverage
                if (!editor) {
                    return;
                }
                this.updateTestsResults();
            }),
            this.engine.onTestResults((e) => {
                // TODO: do we need this?
                const prettyResults = util.inspect(e, { depth: 10  }).replace(/\\n/g, '\n\t');
                this.outputChannel.appendLine(`PyCrunch - (Coverage) Test Results:\n${prettyResults}`);
                this._testsResults = {...this._testsResults, ...e};
                this.updateTestsResults();
            }),
            this.engine.onCombinedCoverage((e) => {
                // Listen to combined coverage to update coverage
                const prettyResults = util.inspect(e, { depth: 10 }).replace(/\\n/g, '\n\t');
                this.outputChannel.appendLine(`PyCrunch - (Coverage) Combined Coverage:\n${prettyResults}`);
                this._combinedCoverage = e;
                // this.updateCoverage();
            }),
            this.engine.onTestsDiscovered((e) => {
                // TODO: do we need this?
                const prettyResults = util.inspect(e, { depth: 10 }).replace(/\\n/g, '\n\t');
                this.outputChannel.appendLine(`PyCrunch - (Coverage) Tests Discovered: ${prettyResults}`);
            }),
        )
    }

    public dispose() {
        for (const disposable of this._disposables) {
            disposable.dispose();
        }
    }

    public updateTestsResults() {
        const testsResults = this._testsResults;
        if (!testsResults) {
            return;
        }

        const editors = vscode.window.visibleTextEditors;
        if (editors.length == 0) {
            return;
        }

        for (const editor of editors) {
            const decoratedLinesSet = new Set<number>();

            // const coveredLines = Object.values(testsResults)
            //     .filter((testResult) => testResult.status === 'success')
            //     .flatMap((testResult) => testResult.files)
            //     .filter((file) => arePathsEqual(file.filename, editor.document.fileName))
            //     .flatMap((result) => result.lines_covered);

            // if (coveredLines.length === 0) {
            //     return Object.values(this._decorations)
            //         .forEach((decoration) => editor.setDecorations(decoration, []))
            // }

            const errorSourceLines = Object.values(testsResults)
                .filter((testResult) => testResult.captured_exception && arePathsEqual(testResult.captured_exception.filename, editor.document.fileName))
                .flatMap((testResult) => testResult.captured_exception.line_number);

            errorSourceLines.forEach((line) => decoratedLinesSet.add(line));
            const errorSourceLinesSet = new Set(errorSourceLines);
            decorateEditor(editor, [...errorSourceLinesSet], this._decorations.errorSource);

            const coveredLines = Object.values(testsResults)
                .filter((testResult) => testResult.status === 'success')
                .flatMap((testResult) => testResult.files)
                .filter((file) => arePathsEqual(file.filename, editor.document.fileName))
                .flatMap((result) => result.lines_covered)
                .filter((line) => !decoratedLinesSet.has(line));
            
            coveredLines.forEach((line) => decoratedLinesSet.add(line));
            const coveredLinesSet = new Set(coveredLines);
            decorateEditor(editor, [...coveredLinesSet], this._decorations.covered);

            const errorPathLines = Object.values(testsResults)
                .filter((testResult) => testResult.status === 'failed')
                .flatMap((testResult) => testResult.files)
                .filter((file) => arePathsEqual(file.filename, editor.document.fileName))
                .flatMap((result) => result.lines_covered)
                .filter((line) => !decoratedLinesSet.has(line));

            errorPathLines.forEach((line) => decoratedLinesSet.add(line));
            const errorPathLinesSet = new Set(errorPathLines);
            decorateEditor(editor, [...errorPathLinesSet], this._decorations.errorPath);
        }
    }

    public updateCoverage() {
        const coverage = this._combinedCoverage;
        if (!coverage) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const currentFileCoverage = coverage.filter((file) => arePathsEqual(file.filename, editor.document.fileName));
        if (currentFileCoverage.length === 0) {
            decorateEditor(editor, [], this._decorations.covered);
            decorateEditor(editor, [], this._decorations.errorSource);
        }

        const exceptionLines = new Set(
            currentFileCoverage
            .flatMap((file) => file.exceptions)
            .map((line) => line - 1)
        );
        const coveredLines = new Set(
            currentFileCoverage
                .flatMap((file) => Object.keys(file.lines_with_entrypoints))
                .map((line) => parseInt(line) - 1)
                .filter((line) => !exceptionLines.has(line))
        );

        decorateEditor(editor, [...coveredLines], this._decorations.covered);
        decorateEditor(editor, [...exceptionLines], this._decorations.errorSource);
    }


    public getCoveringTests(lineNumber: any, filename: string): string[] {
		// Search for filename in combinedCoverage
		// todo change to dictionary view for faster search ({filename -> fileCoveragefindTestResult})
		const singleFileInfo = this._combinedCoverage?.find((fileCoverage) => {
			if ( arePathsEqual(fileCoverage.filename, filename)) {
				return fileCoverage;
			}
		});
		if (singleFileInfo) {
			if (lineNumber in singleFileInfo.lines_with_entrypoints) {
				const testFqns = singleFileInfo.lines_with_entrypoints[lineNumber];
				return testFqns;
			}
		}

		vscode.window.showErrorMessage(`getCoveringTests - ${filename}:${lineNumber} not found in combinedCoverage`);
		return [];
	}

    public findTestResult(fqn: string): ITestResult | undefined {
        return this._testsResults?.[fqn];
	}

    private removeCoverage(path: string) {
        for (const value of Object.values(this._testsResults)) {
            value.files = value.files.filter((file) => !arePathsEqual(file.filename, path));
        }
    }
}