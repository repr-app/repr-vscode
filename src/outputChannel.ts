import * as vscode from 'vscode';

export class ReprOutputChannel implements vscode.Disposable {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Repr');
    }

    appendLine(message: string): void {
        this.outputChannel.appendLine(message);
    }

    appendError(message: string): void {
        this.outputChannel.appendLine(`[ERROR] ${message}`);
    }

    show(): void {
        this.outputChannel.show();
    }

    clear(): void {
        this.outputChannel.clear();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
