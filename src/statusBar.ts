import * as vscode from 'vscode';
import { ReprCLI } from './cli';

export type StatusBarState =
    | 'notInstalled'
    | 'notAuthenticated'
    | 'synced'
    | 'pendingChanges'
    | 'analyzing'
    | 'syncing'
    | 'error';

export class ReprStatusBar implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private currentState: StatusBarState = 'synced';
    private lastSyncTime?: Date;

    constructor(private cli: ReprCLI) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );

        this.statusBarItem.command = 'repr.openDashboard';

        const config = vscode.workspace.getConfiguration('repr');
        if (config.get('statusBar.enabled')) {
            this.statusBarItem.show();
        }

        this.setState('synced');
        this.updateSyncTime();
    }

    private async updateSyncTime(): Promise<void> {
        try {
            const status = await this.cli.getStatus();
            if (status?.last_analyze) {
                this.lastSyncTime = new Date(status.last_analyze);
            }
        } catch (error) {
            // Ignore errors
        }
    }

    private getTimeSince(date: Date): string {
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
        
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    setState(state: StatusBarState, details?: string): void {
        this.currentState = state;

        switch (state) {
            case 'notInstalled':
                this.statusBarItem.text = '$(warning) Repr: Not Installed';
                this.statusBarItem.tooltip = 'Repr CLI is not installed. Click to install.';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.warningBackground'
                );
                break;

            case 'notAuthenticated':
                this.statusBarItem.text = '$(lock) Repr: Login Required';
                this.statusBarItem.tooltip = 'Click to login to Repr';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.warningBackground'
                );
                break;

            case 'synced':
                this.lastSyncTime = new Date();
                const timeSince = this.lastSyncTime ? this.getTimeSince(this.lastSyncTime) : '';
                this.statusBarItem.text = `$(check) Repr: ${timeSince || 'Synced'}`;
                this.statusBarItem.tooltip = 'Your profile is up to date';
                this.statusBarItem.backgroundColor = undefined;
                break;

            case 'pendingChanges':
                this.statusBarItem.text = `$(sync) Repr: ${details || 'Changes detected'}`;
                this.statusBarItem.tooltip = `You have ${details || 'new changes'}. Click to sync.`;
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.prominentBackground'
                );
                break;

            case 'analyzing':
            case 'syncing':
                this.statusBarItem.text = '$(loading~spin) Repr: Syncing...';
                this.statusBarItem.tooltip = 'Syncing your repositories...';
                this.statusBarItem.backgroundColor = undefined;
                break;

            case 'error':
                this.statusBarItem.text = '$(error) Repr: Error';
                this.statusBarItem.tooltip = details || 'An error occurred. Click for details.';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.errorBackground'
                );
                break;
        }
    }

    getState(): StatusBarState {
        return this.currentState;
    }

    show(): void {
        this.statusBarItem.show();
    }

    hide(): void {
        this.statusBarItem.hide();
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
