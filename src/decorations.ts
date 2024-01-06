import * as vscode from 'vscode';

const icons = ['covered', 'uncovered', 'partiallyCovered', 'errorPath', 'errorSource'] as const;
export type IconDecorationDict = Record<typeof icons[number], vscode.TextEditorDecorationType>;
const lineColors = {
    covered: '#00ff0011',
    uncovered: '#ffffff11',
    partiallyCovered: '#ffff0011',
    errorPath: '#aa000011',
    errorSource: '#ff000011'  
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