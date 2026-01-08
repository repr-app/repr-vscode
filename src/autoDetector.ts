import * as vscode from 'vscode';
import { ReprCLI } from './cli';
import { ReprStatusBar } from './statusBar';

export class AutoDetector implements vscode.Disposable {
    private timer?: NodeJS.Timeout;
    private isRunning = false;

    constructor(private cli: ReprCLI, private statusBar: ReprStatusBar) {}

    start(): void {
        const config = vscode.workspace.getConfiguration('repr');
        const enabled = config.get<boolean>('autoDetect.enabled');

        if (!enabled) {
            return;
        }

        this.isRunning = true;
        this.scheduleNextSync();
    }

    stop(): void {
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    private scheduleNextSync(): void {
        if (!this.isRunning) {
            return;
        }

        const config = vscode.workspace.getConfiguration('repr');
        const intervalMinutes = config.get<number>('autoDetect.intervalMinutes') || 30;
        const intervalMs = intervalMinutes * 60 * 1000;

        this.timer = setTimeout(() => {
            this.performBackgroundSync();
        }, intervalMs);
    }

    private async performBackgroundSync(): Promise<void> {
        try {
            const status = await this.cli.getStatus();
            if (!status || !status.authenticated) {
                this.scheduleNextSync();
                return;
            }

            // Sync silently in background
            const result = await this.cli.sync({ background: true });
            
            if (result && result.synced > 0) {
                // Update status bar to show last sync time
                this.statusBar.setState('synced');
                
                // Optionally show subtle notification
                const config = vscode.workspace.getConfiguration('repr');
                const showNotification = config.get<boolean>('autoDetect.showNotification');
                
                if (showNotification) {
                    vscode.window.showInformationMessage(
                        `Repr: Synced ${result.synced} repository(ies)`,
                        'View Dashboard'
                    ).then(action => {
                        if (action === 'View Dashboard') {
                            vscode.commands.executeCommand('repr.openDashboard');
                        }
                    });
                }
            } else {
                // No changes, just update status bar
                this.statusBar.setState('synced');
            }
        } catch (error) {
            console.error('Background sync error:', error);
            // Don't show error to user for background sync
            // Just schedule next attempt
        } finally {
            this.scheduleNextSync();
        }
    }

    dispose(): void {
        this.stop();
    }
}
