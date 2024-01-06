import * as vscode from 'vscode';

const icons = ['covered', 'uncovered', 'partiallyCovered', 'errorPath', 'errorSource'] as const;
export type IconDecorationDict = Record<typeof icons[number], vscode.TextEditorDecorationType>;
const lineColors = {
    covered: '#00ff0033',
    uncovered: '#ffffff33',
    partiallyCovered: '#ffff0033',
    errorPath: '#aa000022',
    errorSource: '#ff000033'  
}

export function createDecorations() {
    return Object.fromEntries(
        icons.map((icon) => [
            icon,
            vscode.window.createTextEditorDecorationType({
                isWholeLine: true,
                backgroundColor: lineColors[icon],
                gutterIconPath: require.resolve(`../images/${icon}.svg`),
                gutterIconSize: 'contain',
            })
        ])
    ) as IconDecorationDict;
}

export function decorateEditor(editor: vscode.TextEditor, lines: number[], decoration: vscode.TextEditorDecorationType) {
    lines = lines.filter((line) => line  <= editor.document.lineCount).map((line) => line - 1);
    const options: vscode.DecorationOptions[] = lines.map((line) => ({range: new vscode.Range(line, 0, line, 0)}));
    editor.setDecorations(decoration, options)
}