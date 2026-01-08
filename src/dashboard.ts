import * as vscode from 'vscode';
import { ReprCLI, ReprStory, ReprStatus, TrackedRepo, HookStatus, CommitInfo, ModeInfo } from './cli';
import { ReprOutputChannel } from './outputChannel';

export class ReprDashboard {
    private panel: vscode.WebviewPanel | undefined;
    private currentTab: string = 'recent';

    constructor(
        private context: vscode.ExtensionContext,
        private cli: ReprCLI,
        private outputChannel: ReprOutputChannel
    ) {}

    show(): void {
        if (this.panel) {
            this.panel.reveal();
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'reprDashboard',
                'Repr Dashboard',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: []
                }
            );

            // Set loading state immediately
            this.panel.webview.html = this.getLoadingHtml();

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            this.panel.webview.onDidReceiveMessage(
                async (message) => {
                    await this.handleMessage(message);
                },
                undefined,
                this.context.subscriptions
            );
        }

        this.refresh();
    }

    private getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Repr Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }
        .loader {
            width: 40px;
            height: 40px;
            border: 3px solid var(--vscode-panel-border);
            border-top-color: var(--vscode-focusBorder);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .loading-text {
            margin-top: 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="loader"></div>
    <div class="loading-text">Loading Repr Dashboard...</div>
</body>
</html>`;
    }

    async refresh(): Promise<void> {
        if (!this.panel) {
            return;
        }

        // Check if CLI is installed first
        const isInstalled = await this.cli.isInstalled();
        if (!isInstalled) {
            this.panel.webview.html = this.getCliNotInstalledHtml();
            return;
        }

        try {
            // Add timeout to prevent hanging
            const timeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
                return Promise.race([
                    promise,
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
                ]);
            };

            const [status, mode, trackedRepos, hookStatus, storiesData] = await Promise.all([
                timeout(this.cli.getStatus(), 10000),
                timeout(this.cli.getMode(), 10000),
                timeout(this.cli.getTrackedRepos(), 10000),
                timeout(this.cli.getHookStatus(), 10000),
                timeout(this.cli.getStories({ limit: 100 }), 10000)
            ]);

            const actualStoriesCount = storiesData?.stories?.length || storiesData?.total || 0;
            const html = this.getHtmlContent(status, mode, trackedRepos || [], hookStatus || [], actualStoriesCount);
            this.panel.webview.html = html;
        } catch (error) {
            this.outputChannel.appendError(`Dashboard refresh failed: ${error}`);
            this.panel.webview.html = this.getErrorHtml(String(error));
        }
    }

    private getCliNotInstalledHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Repr Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 40px;
            text-align: center;
        }
        .icon { font-size: 48px; margin-bottom: 16px; }
        h1 { font-size: 20px; margin-bottom: 8px; font-weight: 600; }
        p { color: var(--vscode-descriptionForeground); font-size: 13px; margin-bottom: 24px; max-width: 400px; }
        .install-cmd {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 12px 20px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            margin-bottom: 16px;
            cursor: pointer;
        }
        .install-cmd:hover { background-color: var(--vscode-list-hoverBackground); }
        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        .btn:hover { background-color: var(--vscode-button-hoverBackground); }
        .help-text { margin-top: 24px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    </style>
</head>
<body>
    <div class="icon">📦</div>
    <h1>Repr CLI Not Found</h1>
    <p>The Repr CLI is required to use this extension. Install it using the command below:</p>
    <div class="install-cmd" onclick="copyCommand()" title="Click to copy">pipx install repr-cli</div>
    <button class="btn" onclick="refreshDashboard()">Retry</button>
    <div class="help-text">After installation, click Retry or restart VS Code.</div>
    <script>
        const vscode = acquireVsCodeApi();
        function copyCommand() {
            navigator.clipboard.writeText('pipx install repr-cli');
            const cmd = document.querySelector('.install-cmd');
            const original = cmd.textContent;
            cmd.textContent = 'Copied!';
            setTimeout(() => cmd.textContent = original, 1500);
        }
        function refreshDashboard() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
    }

    private getErrorHtml(error: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Repr Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 40px;
            text-align: center;
        }
        .icon { font-size: 48px; margin-bottom: 16px; }
        h1 { font-size: 20px; margin-bottom: 8px; font-weight: 600; }
        p { color: var(--vscode-descriptionForeground); font-size: 13px; margin-bottom: 24px; max-width: 400px; }
        .error-details {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 12px 20px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            margin-bottom: 16px;
            max-width: 500px;
            word-break: break-word;
            color: var(--vscode-errorForeground);
        }
        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        .btn:hover { background-color: var(--vscode-button-hoverBackground); }
    </style>
</head>
<body>
    <div class="icon">⚠️</div>
    <h1>Something Went Wrong</h1>
    <p>Failed to load dashboard data. This might be a temporary issue.</p>
    <div class="error-details">${this.escapeHtml(error)}</div>
    <button class="btn" onclick="refreshDashboard()">Retry</button>
    <script>
        const vscode = acquireVsCodeApi();
        function refreshDashboard() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
    }

    focusStories(): void {
        if (this.panel) {
            this.panel.webview.postMessage({ command: 'switchTab', tab: 'stories' });
        }
    }

    private async handleMessage(message: any): Promise<void> {
        this.outputChannel.appendLine(`Dashboard received message: ${message.command}`);
        switch (message.command) {
            case 'refresh':
                await this.refresh();
                break;

            case 'loadCommits':
                try {
                    this.outputChannel.appendLine(`Loading commits for last ${message.days || 3} days...`);
                    const commits = await this.cli.getCommits({ days: message.days || 3 });
                    this.outputChannel.appendLine(`Received ${commits ? commits.length : 'null'} commits`);
                    
                    if (!commits || !Array.isArray(commits)) {
                        this.outputChannel.appendError(`Invalid commits response: ${JSON.stringify(commits)}`);
                        this.panel?.webview.postMessage({
                            command: 'updateCommits',
                            data: { period: `last ${message.days || 3} days`, repos: [], total_commits: 0 }
                        });
                        break;
                    }
                    
                    // Sort commits by date (most recent first)
                    const sortedCommits = commits.sort((a: any, b: any) => {
                        const dateA = new Date(a.date || a.timestamp || 0).getTime();
                        const dateB = new Date(b.date || b.timestamp || 0).getTime();
                        return dateB - dateA; // Reverse chronological
                    });
                    
                    // Group commits by repo for display
                    // Note: CLI returns repo_name (snake_case), not repoName (camelCase)
                    const commitsByRepo: Record<string, any[]> = {};
                    for (const commit of sortedCommits) {
                        const repo = (commit as any).repo_name || commit.repoName || 'Unknown';
                        if (!commitsByRepo[repo]) {
                            commitsByRepo[repo] = [];
                        }
                        commitsByRepo[repo].push(commit);
                    }
                    
                    const workSummary = {
                        period: `last ${message.days || 3} days`,
                        repos: Object.entries(commitsByRepo).map(([name, repoCommits]) => ({
                            name,
                            commits: repoCommits.length,
                            highlights: repoCommits.slice(0, 5).map((c: any) => {
                                const msg = (c.message || '').split('\n')[0];
                                const date = c.date || c.timestamp;
                                const hash = (c as any).hash || (c as any).sha || msg.substring(0, 8);
                                return { message: msg, date, hash };
                            })
                        })),
                        total_commits: sortedCommits.length
                    };
                    
                    this.outputChannel.appendLine(`Sending updateCommits with ${workSummary.repos.length} repos, ${workSummary.total_commits} total commits`);
                    this.panel?.webview.postMessage({
                        command: 'updateCommits',
                        data: workSummary
                    });
                } catch (error) {
                    this.outputChannel.appendError(`Failed to load commits: ${error}`);
                    // Send empty data so UI updates properly
                    this.panel?.webview.postMessage({
                        command: 'updateCommits',
                        data: { period: `last ${message.days || 3} days`, repos: [], total_commits: 0 }
                    });
                }
                break;

            case 'loadAllCommits':
                try {
                    this.outputChannel.appendLine(`Loading all commits for last ${message.days || 30} days...`);
                    const allCommits = await this.cli.getCommits({ days: message.days || 30 });
                    this.outputChannel.appendLine(`Received ${allCommits ? allCommits.length : 'null'} commits`);
                    
                    if (!allCommits || !Array.isArray(allCommits)) {
                        this.panel?.webview.postMessage({
                            command: 'updateAllCommits',
                            data: { period: `last ${message.days || 30} days`, repos: [], total_commits: 0 }
                        });
                        break;
                    }
                    
                    // Sort commits by date (most recent first)
                    const sortedAllCommits = allCommits.sort((a: any, b: any) => {
                        const dateA = new Date(a.date || a.timestamp || 0).getTime();
                        const dateB = new Date(b.date || b.timestamp || 0).getTime();
                        return dateB - dateA;
                    });
                    
                    // Group commits by repo - NO LIMIT on commits shown
                    const allCommitsByRepo: Record<string, any[]> = {};
                    for (const commit of sortedAllCommits) {
                        const repo = (commit as any).repo_name || commit.repoName || 'Unknown';
                        if (!allCommitsByRepo[repo]) {
                            allCommitsByRepo[repo] = [];
                        }
                        allCommitsByRepo[repo].push(commit);
                    }
                    
                    const allWorkSummary = {
                        period: `last ${message.days || 30} days`,
                        repos: Object.entries(allCommitsByRepo).map(([name, repoCommits]) => ({
                            name,
                            commits: repoCommits.length,
                            highlights: repoCommits.map((c: any) => {
                                const msg = (c.message || '').split('\n')[0];
                                const date = c.date || c.timestamp;
                                const hash = (c as any).hash || (c as any).sha || msg.substring(0, 8);
                                return { message: msg, date, hash };
                            })
                        })),
                        total_commits: sortedAllCommits.length
                    };
                    
                    this.panel?.webview.postMessage({
                        command: 'updateAllCommits',
                        data: allWorkSummary
                    });
                } catch (error) {
                    this.outputChannel.appendError(`Failed to load all commits: ${error}`);
                    this.panel?.webview.postMessage({
                        command: 'updateAllCommits',
                        data: { period: `last ${message.days || 30} days`, repos: [], total_commits: 0 }
                    });
                }
                break;

            case 'generateFromCommits':
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Generating stories from ${message.commits?.length || 0} commits...`,
                    cancellable: false
                }, async () => {
                    // For now, we'll use the standard generate with the commits
                    // The CLI would need to support commit-specific generation
                    // For now, fall back to days-based generation
                    const result = await this.cli.generate({
                        local: message.useLocal,
                        template: message.template,
                        // TODO: Pass specific commit hashes when CLI supports it
                    });

                    if (result && result.generated > 0) {
                        vscode.window.showInformationMessage(
                            `Generated ${result.generated} story(ies)!`,
                            'View Stories'
                        ).then(action => {
                            if (action === 'View Stories') {
                                this.focusStories();
                            }
                        });
                        this.refresh();
                    } else {
                        vscode.window.showWarningMessage('No stories generated');
                    }
                });
                break;

            case 'copyToClipboard':
                await vscode.env.clipboard.writeText(message.text);
                vscode.window.showInformationMessage('Copied to clipboard');
                break;

            case 'loadStories':
                try {
                    const stories = await this.cli.getStories({
                        limit: message.limit || 50,
                        repo: message.repo
                    });
                    this.panel?.webview.postMessage({
                        command: 'updateStories',
                        stories: stories?.stories || []
                    });
                } catch (error) {
                    this.outputChannel.appendError(`Failed to load stories: ${error}`);
                    // Send empty array so UI updates properly
                    this.panel?.webview.postMessage({
                        command: 'updateStories',
                        stories: []
                    });
                }
                break;

            case 'viewStory':
                const story = message.story;
                this.panel?.webview.postMessage({
                    command: 'showStoryPreview',
                    story
                });
                break;

            case 'featureStory':
                // This would need to be implemented in the CLI
                vscode.window.showInformationMessage(`Featured story: ${message.storyId}`);
                break;

            case 'hideStory':
                vscode.window.showInformationMessage(`Hidden story: ${message.storyId}`);
                break;

            case 'generateStories':
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Generating stories...',
                    cancellable: false
                }, async () => {
                    const result = await this.cli.generate({
                        local: message.useLocal,
                        template: message.template,
                        days: message.days,
                        repo: message.repo,
                        batchSize: message.batchSize
                    });

                    if (result && result.generated > 0) {
                        vscode.window.showInformationMessage(
                            `Generated ${result.generated} story(ies)!`,
                            'View Stories'
                        ).then(action => {
                            if (action === 'View Stories') {
                                this.focusStories();
                            }
                        });
                        this.refresh();
                    } else {
                        vscode.window.showWarningMessage('No stories generated');
                    }
                });
                break;

            case 'exportProfile':
                const format = message.format || 'md';
                const exportData = await this.cli.exportProfile(format, message.since);

                if (exportData) {
                    const doc = await vscode.workspace.openTextDocument({
                        content: exportData,
                        language: format === 'md' ? 'markdown' : 'json'
                    });
                    await vscode.window.showTextDocument(doc);
                }
                break;

            case 'syncCloud':
                await vscode.commands.executeCommand('repr.sync');
                break;

            case 'push':
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Pushing to cloud...',
                    cancellable: false
                }, async () => {
                    const result = await this.cli.push({ all: message.all });
                    if (result) {
                        vscode.window.showInformationMessage('Successfully pushed to cloud');
                        this.refresh();
                    }
                });
                break;

            case 'pull':
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Pulling from cloud...',
                    cancellable: false
                }, async () => {
                    const result = await this.cli.pull();
                    if (result) {
                        vscode.window.showInformationMessage('Successfully pulled from cloud');
                        this.refresh();
                    }
                });
                break;

            case 'login':
                await vscode.commands.executeCommand('repr.login');
                break;

            case 'addRepo':
                await vscode.commands.executeCommand('repr.addRepo');
                break;

            case 'removeRepo':
                if (message.repo) {
                    await this.cli.removeRepo(message.repo);
                    this.refresh();
                }
                break;

            case 'installHook':
                if (message.repo) {
                    try {
                        vscode.window.showInformationMessage(`Installing hook for ${message.repo}...`);
                        await this.cli.installHook(message.repo);
                        vscode.window.showInformationMessage('Hook installed successfully!');
                        this.refresh();
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to install hook: ${error}`);
                    }
                }
                break;

            case 'removeHook':
                if (message.repo) {
                    try {
                        await this.cli.removeHook(message.repo);
                        vscode.window.showInformationMessage('Hook removed successfully!');
                        this.refresh();
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to remove hook: ${error}`);
                    }
                }
                break;

            case 'viewMode':
                const modeInfo = await this.cli.getMode();
                if (modeInfo) {
                    const message = `
Current Mode: ${modeInfo.mode}${modeInfo.locked ? ' (locked)' : ''}
LLM Provider: ${modeInfo.llm_provider}
${modeInfo.network_policy ? 'Network: ' + modeInfo.network_policy : ''}
Authenticated: ${modeInfo.authenticated ? 'Yes' : 'No'}
                    `.trim();

                    vscode.window.showInformationMessage(message);
                }
                break;
        }
    }

    private getHtmlContent(
        status: ReprStatus | null,
        mode: ModeInfo | null,
        trackedRepos: TrackedRepo[],
        hookStatus: HookStatus[],
        storiesCount: number = 0
    ): string {
        const isAuthenticated = status?.authenticated || false;
        const modeDisplay = mode?.mode || 'UNKNOWN';
        const modeLocked = mode?.locked || false;
        const llmProvider = mode?.llm_provider || 'unknown';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Repr Dashboard</title>
    <style>
        :root {
            --gap-sm: 8px;
            --gap-md: 16px;
            --gap-lg: 24px;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.5;
            overflow: hidden;
            height: 100vh;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        /* --- Header / Status Bar --- */
        .status-bar {
            padding: var(--gap-md) var(--gap-lg);
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            flex-shrink: 0;
        }

        .status-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--gap-md);
        }

        .brand-section {
            display: flex;
            align-items: center;
            gap: var(--gap-sm);
        }

        .status-title {
            font-size: 18px;
            font-weight: 600;
            letter-spacing: -0.5px;
        }

        .mode-indicator {
            display: flex;
            align-items: center;
            gap: var(--gap-sm);
            font-size: 11px;
        }

        .mode-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 500;
            cursor: pointer;
            border: 1px solid transparent;
            transition: opacity 0.2s;
        }
        
        .mode-badge:hover {
            opacity: 0.8;
        }

        .mode-badge.local-only {
            background-color: var(--vscode-statusBarItem-errorBackground);
            color: var(--vscode-statusBarItem-errorForeground);
        }

        .mode-badge.cloud {
            background-color: var(--vscode-statusBarItem-warningBackground);
            color: var(--vscode-statusBarItem-warningForeground);
        }

        .mode-badge.connected {
            background-color: #28a745;
            color: white;
        }

        .quick-actions {
            display: flex;
            gap: var(--gap-sm);
        }

        /* --- Buttons --- */
        .btn {
            border: none;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            font-family: inherit;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: background-color 0.1s;
        }

        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .btn-icon {
            padding: 4px;
            background: transparent;
            color: var(--vscode-icon-foreground);
        }
        
        .btn-icon:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        /* --- Layout: Sidebar & Main --- */
        .content-area {
            display: flex;
            flex: 1;
            overflow: hidden;
            min-width: 0;
            min-height: 0;
        }

        .main-content {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: var(--gap-lg);
            text-align: left;
            min-width: 0;
            min-height: 0;
        }

        .sidebar {
            width: 300px;
            border-left: 1px solid var(--vscode-panel-border);
            overflow-y: auto;
            padding: var(--gap-lg);
            background-color: var(--vscode-sideBar-background);
            flex-shrink: 0;
        }

        /* --- Tabs --- */
        .tabs {
            display: flex;
            gap: 20px;
            margin-bottom: var(--gap-lg);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }

        .tab {
            padding: 8px 0;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            transition: color 0.1s;
        }

        .tab:hover {
            color: var(--vscode-foreground);
        }

        .tab.active {
            color: var(--vscode-foreground);
            border-bottom-color: var(--vscode-panelTitle-activeBorder);
        }

        .tab-content {
            display: none;
            animation: fadein 0.2s;
            text-align: left;
            width: 100%;
            min-width: 0;
        }

        .tab-content.active {
            display: block;
        }

        @keyframes fadein {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* --- Cards --- */
        .work-section {
            margin-bottom: 32px;
            text-align: left;
            width: 100%;
            min-width: 0;
            overflow: hidden;
        }
        
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--gap-md);
            text-align: left;
        }

        .section-title {
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-editor-foreground);
        }

        .card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            padding: var(--gap-md);
            margin-bottom: var(--gap-md);
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .card:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .repo-work {
            margin-bottom: var(--gap-md);
            padding-bottom: var(--gap-md);
            border-bottom: 1px solid var(--vscode-panel-border);
            text-align: left;
            width: 100%;
            min-width: 0;
            overflow: hidden;
        }

        .repo-work:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }

        .repo-work-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-textLink-foreground);
            text-align: left;
        }

        .work-highlights {
            list-style: disc;
            padding-left: 20px;
            margin: 0;
            text-align: left;
            width: 100%;
            box-sizing: border-box;
        }

        .work-highlights li {
            padding: 4px 0;
            font-size: 12px;
            color: var(--vscode-foreground);
            text-align: left;
            word-wrap: break-word;
            overflow-wrap: break-word;
            word-break: break-word;
            white-space: normal;
            line-height: 1.5;
            max-width: 100%;
        }

        /* Compact story list (like commits) */
        .story-list-item {
            padding: 6px 0;
            border-bottom: 1px solid var(--vscode-widget-border);
            cursor: pointer;
            text-align: left;
        }
        .story-list-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .story-list-item:last-child {
            border-bottom: none;
        }
        .story-list-title {
            font-size: 13px;
            color: var(--vscode-foreground);
            margin-bottom: 4px;
        }
        .story-list-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 12px;
        }
        .story-list-meta span {
            white-space: nowrap;
        }

        /* --- Commit Selection --- */
        .commit-checkbox {
            width: 14px;
            height: 14px;
            margin-right: 8px;
            cursor: pointer;
            accent-color: var(--vscode-focusBorder);
            flex-shrink: 0;
        }

        .commit-item {
            display: flex;
            align-items: flex-start;
            padding: 6px 0;
        }

        .commit-item label {
            display: flex;
            align-items: flex-start;
            cursor: pointer;
            flex: 1;
            min-width: 0;
        }

        .select-all-row {
            display: flex;
            align-items: center;
            padding: 8px 0;
            margin-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .selection-count {
            margin-left: auto;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .btn-generate {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-generate:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn-generate:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* --- Story Cards --- */
        .story-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: var(--gap-md);
            margin-bottom: var(--gap-md);
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
        }

        .story-card:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-1px);
        }

        .story-card.featured {
            border-left: 3px solid #ffc107;
        }

        .story-title {
            font-size: 15px;
            font-weight: 600;
            margin-bottom: 8px;
            line-height: 1.4;
        }

        .story-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .tech-tags {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            margin-top: 8px;
        }

        .tech-tag {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
        }

        .story-actions {
            margin-top: 12px;
            display: flex;
            gap: 8px;
            opacity: 0.7;
            transition: opacity 0.2s;
        }

        .story-card:hover .story-actions {
            opacity: 1;
        }

        /* --- Wizard / Generate --- */
        .wizard-step {
            margin-bottom: 32px;
        }

        .wizard-step h4 {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }

        .wizard-options {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }

        .wizard-option {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 16px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .wizard-option:hover {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-hoverBackground);
        }

        .wizard-option.selected {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .wizard-option-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .wizard-option-desc {
            font-size: 11px;
            opacity: 0.8;
        }

        /* --- Sidebar --- */
        .sidebar-section {
            margin-bottom: 32px;
        }

        .sidebar-section h3 {
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 12px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            letter-spacing: 0.5px;
        }

        .stats-grid {
            display: grid;
            gap: 1px;
            background-color: var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
            border: 1px solid var(--vscode-panel-border);
        }

        .stat-item {
            background-color: var(--vscode-editor-background);
            padding: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        .stat-value {
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .stat-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
            text-transform: uppercase;
        }

        .repo-list-item {
            padding: 10px 12px;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            margin-bottom: 8px;
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: var(--vscode-editor-background);
            gap: 8px;
        }

        .repo-list-item.clickable {
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .repo-list-item.clickable:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }

        .repo-list-item.clickable:hover .status-inactive {
            color: var(--vscode-textLink-foreground);
        }

        .repo-name {
            font-weight: 500;
            color: var(--vscode-foreground);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .repo-status {
            font-size: 10px;
            flex-shrink: 0;
        }

        .status-active {
            color: var(--vscode-testing-iconPassed, #89d185);
        }

        .status-inactive {
            color: var(--vscode-descriptionForeground);
        }

        .status-muted {
            color: var(--vscode-descriptionForeground);
        }

        .hook-btn-install,
        .hook-btn-remove {
            border: none;
            border-radius: 3px;
            padding: 2px 8px;
            font-size: 10px;
            font-family: inherit;
            cursor: pointer;
            flex-shrink: 0;
        }

        .hook-btn-install {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .hook-btn-install:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .hook-btn-remove {
            background-color: #c42b1c;
            color: white;
            opacity: 0;
            transition: opacity 0.15s ease;
        }

        .repo-list-item:hover .hook-btn-remove {
            opacity: 1;
        }

        .hook-btn-remove:hover {
            background-color: #a61b0f;
        }

        .empty-state {
            text-align: center;
            padding: 48px 20px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        /* --- Forms --- */
        select, input[type="text"] {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px 10px;
            border-radius: 2px;
            font-size: 13px;
            font-family: inherit;
            width: 100%;
            margin-bottom: 12px;
        }
        
        select:focus, input:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }

        .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Zone 1: Status Bar -->
        <div class="status-bar">
            <div class="status-top">
                <div class="brand-section">
                    <div class="status-title">Repr Dashboard</div>
                    <div class="mode-badge ${isAuthenticated ? 'connected' : 'local-only'}"
                         onclick="sendMessage('viewMode')"
                         title="Click to view mode details">
                        ${isAuthenticated ? 'CLOUD' : 'LOCAL ONLY'}
                    </div>
                </div>
                
                <div class="quick-actions">
                    ${isAuthenticated ? 
                        '<div class="sync-status">✓ ' + storiesCount + ' stories synced</div>' : 
                        '<button class="btn btn-secondary" onclick="sendMessage(&apos;login&apos;)">Login to Cloud</button>'
                    }
                </div>
            </div>

            <div class="quick-actions">
                <select id="time-range-selector" onchange="loadByTimeRange(this.value)" style="margin-bottom: 0; width: auto; padding: 6px 12px; font-size: 12px;">
                    <option value="3days" selected>Last 3 Days</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                </select>
                <button class="btn btn-secondary" onclick="sendMessage('syncCloud')" title="Push stories to cloud for sharing">
                    ☁️ Sync
                </button>
            </div>
        </div>

        <!-- Zone 2 & 3: Content + Sidebar -->
        <div class="content-area">
            <!-- Main Content -->
            <div class="main-content">
                <div class="tabs">
                    <div class="tab active" data-tab="recent" onclick="switchTab('recent')">Dashboard</div>
                    <div class="tab" data-tab="commits" onclick="switchTab('commits')">All Commits</div>
                    <div class="tab" data-tab="stories" onclick="switchTab('stories')">All Stories</div>
                    <div class="tab" data-tab="generate" onclick="switchTab('generate')">Generate Stories</div>
                </div>

                <!-- Tab: Recent Stories -->
                <div class="tab-content active" id="tab-recent">
                    <div class="work-section">
                        <div class="section-header">
                            <h3 class="section-title">Recent Stories</h3>
                            <button class="btn btn-secondary" onclick="copyStories()">📋 Copy</button>
                        </div>
                        <div id="recent-stories-content" class="loading">Loading stories...</div>
                    </div>

                    <div class="work-section" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--vscode-panel-border);">
                        <div class="section-header">
                            <h3 class="section-title">Raw Commits</h3>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span id="dashboard-selection-count" class="selection-count" style="display: none;"></span>
                                <button class="btn btn-generate" id="dashboard-generate-btn" style="display: none;" onclick="generateFromSelectedCommits('dashboard')">
                                    🪄 Generate Stories
                                </button>
                                <button class="btn btn-secondary" onclick="copyCommits()">📋 Copy</button>
                            </div>
                        </div>
                        <div id="raw-activity-content" class="loading">Loading commits...</div>
                    </div>
                </div>

                <!-- Tab: All Commits -->
                <div class="tab-content" id="tab-commits">
                    <div class="section-header" style="margin-bottom: 16px;">
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <select id="commits-time-range" onchange="loadAllCommits(this.value)" style="margin-bottom: 0; width: auto;">
                                <option value="7">Last 7 Days</option>
                                <option value="14">Last 14 Days</option>
                                <option value="30" selected>Last 30 Days</option>
                                <option value="90">Last 90 Days</option>
                            </select>
                            <select id="commits-repo-filter" onchange="filterCommitsByRepo(this.value)" style="margin-bottom: 0; width: 200px;">
                                <option value="">All Repositories</option>
                                ${trackedRepos.map(r => `<option value="${this.escapeHtml(r.name)}">${this.escapeHtml(r.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <span id="commits-selection-count" class="selection-count" style="display: none;"></span>
                            <button class="btn btn-generate" id="commits-generate-btn" style="display: none;" onclick="generateFromSelectedCommits('commits')">
                                🪄 Generate Stories
                            </button>
                            <button class="btn btn-secondary" onclick="copyAllCommits()">📋 Copy</button>
                        </div>
                    </div>
                    <div id="all-commits-content" class="loading">Loading commits...</div>
                </div>

                <!-- Tab: Stories -->
                <div class="tab-content" id="tab-stories">
                    <div style="margin-bottom: 24px; display: flex; gap: 12px;">
                        <input type="text" placeholder="Search stories..." id="story-search"
                               oninput="filterStories(this.value)" style="margin-bottom: 0;">
                        <select onchange="loadStoriesByRepo(this.value)" style="margin-bottom: 0; width: 200px;">
                            <option value="">All Repositories</option>
                            ${trackedRepos.map(r => `<option value="${r.path}">${this.escapeHtml(r.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div id="stories-list" class="loading">Loading stories...</div>
                </div>

                <!-- Tab: Generate -->
                <div class="tab-content" id="tab-generate">
                    <div class="wizard-step">
                        <h4>1. Source Selection</h4>
                        <select id="gen-source" onchange="onSourceChange(this.value)">
                            <option value="selected" id="gen-source-selected" disabled>Selected Commits (0 selected)</option>
                            <option value="3" selected>Last 3 Days</option>
                            <option value="7">Last 7 Days (Week)</option>
                            <option value="14">Last 14 Days (Sprint)</option>
                            <option value="30">Last 30 Days</option>
                            <option value="custom">Custom Days</option>
                        </select>
                        <div id="gen-source-custom" style="display: none; margin-top: 8px;">
                            <input type="number" id="gen-days" placeholder="Enter number of days" min="1" value="7">
                        </div>
                        <div id="gen-selected-info" style="display: none; margin-top: 8px; padding: 8px 12px; background: var(--vscode-textBlockQuote-background); border-radius: 4px; font-size: 12px;">
                            <span id="gen-selected-summary"></span>
                            <button class="btn btn-secondary" style="margin-left: 8px; padding: 2px 8px; font-size: 11px;" onclick="switchTab('commits')">Edit Selection</button>
                        </div>
                    </div>

                    <div class="wizard-step">
                        <h4>2. Template Selection</h4>
                        <div class="wizard-options">
                            <div class="wizard-option selected" data-template="resume" onclick="selectTemplate('resume')">
                                <div class="wizard-option-title">Resume</div>
                                <div class="wizard-option-desc">Portfolio-ready format</div>
                            </div>
                            <div class="wizard-option" data-template="changelog" onclick="selectTemplate('changelog')">
                                <div class="wizard-option-title">Changelog</div>
                                <div class="wizard-option-desc">Release notes style</div>
                            </div>
                            <div class="wizard-option" data-template="interview" onclick="selectTemplate('interview')">
                                <div class="wizard-option-title">Interview</div>
                                <div class="wizard-option-desc">STAR format</div>
                            </div>
                            <div class="wizard-option" data-template="narrative" onclick="selectTemplate('narrative')">
                                <div class="wizard-option-title">Narrative</div>
                                <div class="wizard-option-desc">Blog-style story</div>
                            </div>
                        </div>
                    </div>

                    <div class="wizard-step">
                        <h4>3. LLM Selection</h4>
                        <select id="gen-llm">
                            <option value="local">Local (${llmProvider})</option>
                            <option value="cloud" ${!isAuthenticated ? 'disabled' : ''}>Cloud (repr.dev)</option>
                        </select>
                    </div>

                    <div class="wizard-step">
                        <button class="btn btn-primary" onclick="runGeneration()" style="width: 100%; padding: 12px;">
                            Generate Stories
                        </button>
                    </div>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="sidebar">
                <div class="sidebar-section">
                    <h3>Quick Stats</h3>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-value">${storiesCount}</span>
                            <span class="stat-label">Stories</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${trackedRepos.filter(r => r.exists !== false).length}</span>
                            <span class="stat-label">Tracked Repos</span>
                        </div>
                    </div>
                </div>

                <div class="sidebar-section">
                    <h3>Tracked Repositories</h3>
                    ${trackedRepos.length > 0 ? trackedRepos.map((repo, index) => {
                        const repoName = repo.name || repo.path.split('/').pop() || 'Unknown';
                        const hasHook = repo.hook_installed;
                        return `
                            <div class="repo-list-item" data-repo-index="${index}" data-has-hook="${hasHook ? 'true' : 'false'}">
                                <span class="repo-name">${this.escapeHtml(repoName)}</span>
                                ${hasHook 
                                    ? `<span class="repo-status status-muted">Hook installed</span><button class="hook-btn-remove" data-action="remove">× remove</button>`
                                    : `<button class="hook-btn-install" data-action="install">install hook</button>`
                                }
                            </div>
                        `;
                    }).join('') : '<div style="font-size: 12px; color: var(--vscode-descriptionForeground); font-style: italic;">No repos tracked</div>'}
                    <button class="btn btn-secondary" onclick="sendMessage('addRepo')" style="width: 100%; margin-top: 12px;">
                        + Add Repository
                    </button>
                </div>
                <script>
                    var repoPaths = ${JSON.stringify(trackedRepos.map(r => r.path))};
                </script>

                <div class="sidebar-section">
                    <h3>Pending Actions</h3>
                    <div id="pending-actions">
                        <div style="font-size: 12px; color: var(--vscode-descriptionForeground); font-style: italic;">No pending actions</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        var vscode = acquireVsCodeApi();
        var selectedTemplate = 'resume';
        
        // Commit selection state
        var selectedCommits = {
            dashboard: new Set(),
            commits: new Set()
        };
        var allCommitsData = {
            dashboard: [],
            commits: []
        };

        function sendMessage(command, data) {
            data = data || {};
            vscode.postMessage(Object.assign({ command: command }, data));
        }

        // Commit selection functions
        function getCommitKey(repo, hash) {
            return repo + '::' + hash;
        }

        function toggleCommitSelection(context, repo, hash, message) {
            var key = getCommitKey(repo, hash);
            if (selectedCommits[context].has(key)) {
                selectedCommits[context].delete(key);
            } else {
                selectedCommits[context].add(key);
            }
            updateSelectionUI(context);
            updateGenerateSourceOption();
        }

        function toggleSelectAll(context, checked) {
            var commits = allCommitsData[context] || [];
            if (checked) {
                commits.forEach(function(c) {
                    var key = getCommitKey(c.repo, c.hash);
                    selectedCommits[context].add(key);
                });
            } else {
                selectedCommits[context].clear();
            }
            
            // Update checkboxes
            var checkboxes = document.querySelectorAll('#' + (context === 'dashboard' ? 'raw-activity-content' : 'all-commits-content') + ' .commit-checkbox');
            checkboxes.forEach(function(cb) {
                cb.checked = checked;
            });
            
            updateSelectionUI(context);
            updateGenerateSourceOption();
        }

        function updateSelectionUI(context) {
            var count = selectedCommits[context].size;
            var countEl = document.getElementById(context + '-selection-count');
            var btnEl = document.getElementById(context + '-generate-btn');
            
            if (countEl && btnEl) {
                if (count > 0) {
                    countEl.textContent = count + ' selected';
                    countEl.style.display = 'inline';
                    btnEl.style.display = 'inline-flex';
                } else {
                    countEl.style.display = 'none';
                    btnEl.style.display = 'none';
                }
            }
            
            // Update select all checkbox
            var selectAllEl = document.getElementById(context + '-select-all');
            if (selectAllEl) {
                var total = (allCommitsData[context] || []).length;
                selectAllEl.checked = count > 0 && count === total;
                selectAllEl.indeterminate = count > 0 && count < total;
            }
        }

        function updateGenerateSourceOption() {
            var totalSelected = selectedCommits.dashboard.size + selectedCommits.commits.size;
            var optionEl = document.getElementById('gen-source-selected');
            var sourceEl = document.getElementById('gen-source');
            var infoEl = document.getElementById('gen-selected-info');
            var summaryEl = document.getElementById('gen-selected-summary');
            
            if (optionEl) {
                if (totalSelected > 0) {
                    optionEl.disabled = false;
                    optionEl.textContent = 'Selected Commits (' + totalSelected + ' selected)';
                } else {
                    optionEl.disabled = true;
                    optionEl.textContent = 'Selected Commits (0 selected)';
                    // If currently selected, switch to default
                    if (sourceEl && sourceEl.value === 'selected') {
                        sourceEl.value = '3';
                        onSourceChange('3');
                    }
                }
            }
        }

        function onSourceChange(value) {
            var customEl = document.getElementById('gen-source-custom');
            var infoEl = document.getElementById('gen-selected-info');
            var summaryEl = document.getElementById('gen-selected-summary');
            
            if (customEl) {
                customEl.style.display = value === 'custom' ? 'block' : 'none';
            }
            
            if (infoEl && summaryEl) {
                if (value === 'selected') {
                    var total = selectedCommits.dashboard.size + selectedCommits.commits.size;
                    summaryEl.textContent = total + ' commits selected for story generation';
                    infoEl.style.display = 'block';
                } else {
                    infoEl.style.display = 'none';
                }
            }
        }

        function generateFromSelectedCommits(context) {
            var commits = [];
            selectedCommits[context].forEach(function(key) {
                var parts = key.split('::');
                commits.push({ repo: parts[0], hash: parts[1] });
            });
            
            if (commits.length === 0) {
                return;
            }
            
            sendMessage('generateFromCommits', {
                commits: commits,
                useLocal: true,
                template: selectedTemplate
            });
        }

        function getSelectedCommitsForGeneration() {
            var commits = [];
            // Combine from both contexts
            ['dashboard', 'commits'].forEach(function(ctx) {
                selectedCommits[ctx].forEach(function(key) {
                    var parts = key.split('::');
                    commits.push({ repo: parts[0], hash: parts[1] });
                });
            });
            return commits;
        }

        function installHook(repoPath) {
            sendMessage('installHook', { repo: repoPath });
        }

        function removeHook(repoPath) {
            sendMessage('removeHook', { repo: repoPath });
        }

        // Event delegation for repo hook install/remove
        document.addEventListener('click', function(e) {
            var target = e.target;
            
            // Check if clicked on hook button
            if (target.classList && (target.classList.contains('hook-btn-install') || target.classList.contains('hook-btn-remove'))) {
                var repoItem = target.closest('.repo-list-item');
                if (repoItem) {
                    var index = parseInt(repoItem.getAttribute('data-repo-index'), 10);
                    var action = target.getAttribute('data-action');
                    if (typeof repoPaths !== 'undefined' && repoPaths[index]) {
                        if (action === 'install') {
                            installHook(repoPaths[index]);
                        } else if (action === 'remove') {
                            removeHook(repoPaths[index]);
                        }
                    }
                }
                return;
            }
        });

        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });

            document.querySelector('.tab[data-tab="' + tabName + '"]').classList.add('active');
            document.getElementById('tab-' + tabName).classList.add('active');

            if (tabName === 'stories') {
                sendMessage('loadStories', { limit: 50 });
            } else if (tabName === 'commits') {
                var days = parseInt(document.getElementById('commits-time-range').value, 10) || 30;
                loadAllCommits(days);
            }
        }

        function loadAllCommits(days) {
            var container = document.getElementById('all-commits-content');
            if (container) {
                container.innerHTML = '<div class="loading">Loading commits...</div>';
            }
            sendMessage('loadAllCommits', { days: parseInt(days, 10) || 30 });
        }

        function filterCommitsByRepo(repoName) {
            var container = document.getElementById('all-commits-content');
            if (!container) return;
            
            var repoSections = container.querySelectorAll('.repo-work');
            repoSections.forEach(function(section) {
                var titleEl = section.querySelector('.repo-work-title');
                if (titleEl) {
                    var sectionRepo = titleEl.textContent.split(' (')[0].trim();
                    section.style.display = (!repoName || sectionRepo === repoName) ? 'block' : 'none';
                }
            });
        }

        function copyAllCommits() {
            if (!window.allCommitsFullData) {
                sendMessage('copyToClipboard', { text: 'No commits to copy' });
                return;
            }
            sendMessage('copyToClipboard', { text: formatWorkForClipboard(window.allCommitsFullData) });
        }

        function loadRecentStories() {
            var container = document.getElementById('recent-stories-content');
            if (container) {
                container.innerHTML = '<div class="loading">Loading stories...</div>';
            }
            
            // Set a timeout to show error if loading takes too long
            var loadTimeout = setTimeout(function() {
                if (container && container.innerHTML.includes('Loading stories')) {
                    container.innerHTML = '<div class="empty-state">Taking longer than expected... <button class="btn btn-secondary" onclick="loadRecentStories()">Retry</button></div>';
                }
            }, 5000);
            
            sendMessage('loadStories', { limit: 10 });
        }

        function loadCommits(days) {
            var container = document.getElementById('raw-activity-content');
            if (container) {
                container.innerHTML = '<div class="loading">Loading commits...</div>';
            }
            
            // Set a timeout to show error if loading takes too long
            var loadTimeout = setTimeout(function() {
                if (container && container.innerHTML.includes('Loading commits')) {
                    container.innerHTML = '<div class="empty-state">Taking longer than expected... <button class="btn btn-secondary" onclick="loadCommits(' + days + ')">Retry</button></div>';
                }
            }, 5000);
            
            sendMessage('loadCommits', { days: days });
        }

        // Master time range function - controls both stories and commits
        function loadByTimeRange(range) {
            if (!range) return;
            
            // Map range to days
            var daysMap = {
                'today': 1,
                'yesterday': 2,
                '3days': 3,
                '7days': 7,
                '30days': 30
            };
            
            var days = daysMap[range] || 3;
            loadCommits(days);
            
            // Also load stories
            loadRecentStories();
        }

        // Store data for copy functionality
        window.currentStoriesData = null;
        window.currentCommitsData = null;

        function copyStories() {
            if (!window.currentStoriesData || window.currentStoriesData.length === 0) {
                sendMessage('copyToClipboard', { text: 'No stories to copy' });
                return;
            }

            var text = 'Recent Stories\\n\\n';
            var storiesByRepo = {};
            
            window.currentStoriesData.forEach(function(story) {
                var repoName = story.repo_name || 'Unknown';
                if (!storiesByRepo[repoName]) {
                    storiesByRepo[repoName] = [];
                }
                storiesByRepo[repoName].push(story);
            });

            Object.keys(storiesByRepo).forEach(function(repoName) {
                var repoStories = storiesByRepo[repoName];
                text += repoName + ' (' + repoStories.length + ' stories):\\n';
                repoStories.forEach(function(story) {
                    var summary = (story.summary || '').split('**').join('');
                    text += '  • ' + summary + '\\n';
                });
                text += '\\n';
            });

            sendMessage('copyToClipboard', { text: text });
        }

        function copyCommits() {
            if (!window.currentCommitsData) {
                sendMessage('copyToClipboard', { text: 'No commits to copy' });
                return;
            }
            sendMessage('copyToClipboard', { text: formatWorkForClipboard(window.currentCommitsData) });
        }

        function renderRecentStories(stories) {
            console.log('renderRecentStories called with', stories ? stories.length : 0, 'stories');
            var container = document.getElementById('recent-stories-content');
            if (!container) {
                console.error('recent-stories-content container not found');
                return;
            }
            
            // Store for copy functionality
            window.currentStoriesData = stories;
            
            if (!stories || stories.length === 0) {
                container.innerHTML = '<div class="empty-state">No stories yet. Go to Generate Stories tab to create your first one!</div>';
                return;
            }

            // Sort stories by date (most recent first)
            var sortedStories = stories.slice().sort(function(a, b) {
                var dateA = new Date(a.last_commit_at || a.created_at || 0).getTime();
                var dateB = new Date(b.last_commit_at || b.created_at || 0).getTime();
                return dateB - dateA; // Reverse chronological
            });

            console.log('Sorted stories:', sortedStories.slice(0, 5).map(function(s) {
                return { summary: s.summary.substring(0, 50), date: s.last_commit_at || s.created_at };
            }));

            // Group stories by repository (preserving order)
            var storiesByRepo = {};
            var repoOrder = [];
            sortedStories.slice(0, 15).forEach(function(story) {
                var repoName = story.repo_name || 'Unknown';
                if (!storiesByRepo[repoName]) {
                    storiesByRepo[repoName] = [];
                    repoOrder.push(repoName);
                }
                storiesByRepo[repoName].push(story);
            });

            // Render stories grouped by repo (in order of first appearance)
            var html = '';
            repoOrder.forEach(function(repoName) {
                var repoStories = storiesByRepo[repoName];
                var totalStories = repoStories.length;
                
                html += '<div class="repo-work">';
                html += '<div class="repo-work-title">' + escapeHtml(repoName) + ' <span style="font-weight:normal; opacity:0.7; font-size:11px;">(' + totalStories + ' ' + (totalStories === 1 ? 'story' : 'stories') + ')</span></div>';
                html += '<ul class="work-highlights">';
                
                repoStories.forEach(function(story) {
                    // Clean markdown ** from summary
                    var summary = (story.summary || '').split('**').join('');
                    
                    // Format date
                    var dateStr = '';
                    if (story.last_commit_at) {
                        var date = new Date(story.last_commit_at);
                        if (!isNaN(date.getTime())) {
                            dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }
                    } else if (story.created_at) {
                        // Fallback to created_at if available (some versions might return it)
                        var date = new Date(story.created_at);
                        if (!isNaN(date.getTime())) {
                            dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }
                    }

                    html += '<li>';
                    html += '<div style="display:flex; justify-content:space-between; gap:8px;">';
                    html += '<span>' + escapeHtml(summary) + '</span>';
                    
                    if (dateStr) {
                        html += '<span style="color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; flex-shrink: 0;">' + dateStr + '</span>';
                    }
                    
                    html += '</div>';
                    html += '</li>';
                });
                
                html += '</ul></div>';
            });
            
            container.innerHTML = html;
            console.log('Recent stories rendered successfully');
        }

        function renderWorkSummary(data, containerId, context) {
            context = context || 'dashboard';
            console.log('renderWorkSummary called with containerId:', containerId, 'context:', context);
            var container = document.getElementById(containerId);
            console.log('Container found:', container ? 'yes' : 'no', container);
            
            if (!container) {
                console.error('Container not found:', containerId);
                return;
            }
            
            // Store for copy functionality
            window.currentCommitsData = data;
            
            // Clear and rebuild commit data for selection
            allCommitsData[context] = [];
            
            if (!data || !data.repos || data.repos.length === 0) {
                container.innerHTML = '<div class="empty-state">No activity found for this period</div>';
                return;
            }

            // Build flat list of commits for selection tracking
            data.repos.forEach(function(repo) {
                (repo.highlights || []).forEach(function(h) {
                    var hash = typeof h === 'object' ? (h.hash || h.message.substring(0, 8)) : h.substring(0, 8);
                    var message = typeof h === 'string' ? h : h.message;
                    allCommitsData[context].push({
                        repo: repo.name,
                        hash: hash,
                        message: message,
                        date: typeof h === 'object' ? h.date : null
                    });
                });
            });

            var html = '';
            
            // Add select all row
            var totalCommits = allCommitsData[context].length;
            html += '<div class="select-all-row">';
            html += '<label style="display:flex; align-items:center; cursor:pointer;">';
            html += '<input type="checkbox" id="' + context + '-select-all" class="commit-checkbox" onchange="toggleSelectAll(\\'' + context + '\\', this.checked)" />';
            html += '<span>Select all (' + totalCommits + ' commits)</span>';
            html += '</label>';
            html += '</div>';
            
            data.repos.forEach(function(repo) {
                var highlights = repo.highlights.slice(0, 5);
                var repoTotalCommits = repo.commits;
                
                html += '<div class="repo-work">';
                html += '<div class="repo-work-title">' + escapeHtml(repo.name) + ' <span style="font-weight:normal; opacity:0.7; font-size:11px;">(' + repoTotalCommits + ' commits)</span></div>';
                html += '<div class="work-highlights" style="list-style:none; padding-left:0;">';
                highlights.forEach(function(h) {
                    var message = typeof h === 'string' ? h : h.message;
                    var hash = typeof h === 'object' ? (h.hash || message.substring(0, 8)) : message.substring(0, 8);
                    var dateStr = '';
                    var key = getCommitKey(repo.name, hash);
                    var isSelected = selectedCommits[context].has(key);
                    
                    if (typeof h === 'object' && h.date) {
                        var date = new Date(h.date);
                        if (!isNaN(date.getTime())) {
                            dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }
                    }
                    
                    html += '<div class="commit-item">';
                    html += '<label style="display:flex; align-items:flex-start; flex:1; cursor:pointer; gap:8px;">';
                    html += '<input type="checkbox" class="commit-checkbox" ' + (isSelected ? 'checked' : '') + ' onchange="toggleCommitSelection(\\'' + context + '\\', \\'' + escapeHtml(repo.name).replace(/'/g, "\\'") + '\\', \\'' + escapeHtml(hash).replace(/'/g, "\\'") + '\\', \\'' + escapeHtml(message).replace(/'/g, "\\'") + '\\')" />';
                    html += '<div style="flex:1; display:flex; justify-content:space-between; gap:8px; min-width:0;">';
                    html += '<span style="word-break:break-word;">' + escapeHtml(message) + '</span>';
                    
                    if (dateStr) {
                        html += '<span style="color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; flex-shrink: 0;">' + dateStr + '</span>';
                    }
                    
                    html += '</div>';
                    html += '</label>';
                    html += '</div>';
                });
                html += '</div></div>';
            });
            console.log('Setting innerHTML, html length:', html.length);
            container.innerHTML = html;
            container.classList.remove('loading');
            console.log('innerHTML set, container now has', container.children.length, 'children');
            
            // Update selection UI
            updateSelectionUI(context);
        }

        function renderAllCommits(data, containerId, context) {
            context = context || 'commits';
            console.log('renderAllCommits called with containerId:', containerId);
            var container = document.getElementById(containerId);
            
            if (!container) {
                console.error('Container not found:', containerId);
                return;
            }
            
            // Clear and rebuild commit data for selection
            allCommitsData[context] = [];
            
            if (!data || !data.repos || data.repos.length === 0) {
                container.innerHTML = '<div class="empty-state">No commits found for this period</div>';
                return;
            }

            // Build flat list of ALL commits for selection tracking (not limited)
            data.repos.forEach(function(repo) {
                (repo.highlights || []).forEach(function(h) {
                    var hash = typeof h === 'object' ? (h.hash || h.message.substring(0, 8)) : h.substring(0, 8);
                    var message = typeof h === 'string' ? h : h.message;
                    allCommitsData[context].push({
                        repo: repo.name,
                        hash: hash,
                        message: message,
                        date: typeof h === 'object' ? h.date : null
                    });
                });
            });

            var html = '';
            
            // Add select all row
            var totalCommits = allCommitsData[context].length;
            html += '<div class="select-all-row">';
            html += '<label style="display:flex; align-items:center; cursor:pointer;">';
            html += '<input type="checkbox" id="' + context + '-select-all" class="commit-checkbox" onchange="toggleSelectAll(\\'' + context + '\\', this.checked)" />';
            html += '<span>Select all (' + totalCommits + ' commits)</span>';
            html += '</label>';
            html += '</div>';
            
            data.repos.forEach(function(repo) {
                // Show ALL commits for the All Commits tab (no limit)
                var highlights = repo.highlights || [];
                var repoTotalCommits = repo.commits;
                
                html += '<div class="repo-work">';
                html += '<div class="repo-work-title">' + escapeHtml(repo.name) + ' <span style="font-weight:normal; opacity:0.7; font-size:11px;">(' + repoTotalCommits + ' commits)</span></div>';
                html += '<div class="work-highlights" style="list-style:none; padding-left:0;">';
                highlights.forEach(function(h) {
                    var message = typeof h === 'string' ? h : h.message;
                    var hash = typeof h === 'object' ? (h.hash || message.substring(0, 8)) : message.substring(0, 8);
                    var dateStr = '';
                    var key = getCommitKey(repo.name, hash);
                    var isSelected = selectedCommits[context].has(key);
                    
                    if (typeof h === 'object' && h.date) {
                        var date = new Date(h.date);
                        if (!isNaN(date.getTime())) {
                            dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }
                    }
                    
                    html += '<div class="commit-item">';
                    html += '<label style="display:flex; align-items:flex-start; flex:1; cursor:pointer; gap:8px;">';
                    html += '<input type="checkbox" class="commit-checkbox" ' + (isSelected ? 'checked' : '') + ' onchange="toggleCommitSelection(\\'' + context + '\\', \\'' + escapeHtml(repo.name).replace(/'/g, "\\'") + '\\', \\'' + escapeHtml(hash).replace(/'/g, "\\'") + '\\', \\'' + escapeHtml(message).replace(/'/g, "\\'") + '\\')" />';
                    html += '<div style="flex:1; display:flex; justify-content:space-between; gap:8px; min-width:0;">';
                    html += '<span style="word-break:break-word;">' + escapeHtml(message) + '</span>';
                    
                    if (dateStr) {
                        html += '<span style="color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; flex-shrink: 0;">' + dateStr + '</span>';
                    }
                    
                    html += '</div>';
                    html += '</label>';
                    html += '</div>';
                });
                html += '</div></div>';
            });
            
            container.innerHTML = html;
            container.classList.remove('loading');
            
            // Update selection UI
            updateSelectionUI(context);
        }

        function generateFromActivity() {
            if (window.currentCommitsData) {
                sendMessage('generateStories', { useLocal: true, template: 'resume', days: 3 });
            }
        }

        function copyWork() {
            if (window.currentWorkData) {
                sendMessage('copyToClipboard', { text: formatWorkForClipboard(window.currentWorkData) });
            }
        }

        function formatWorkForClipboard(data) {
            var text = 'Work Summary (' + data.period + ')\\n\\n';
            data.repos.forEach(function(repo) {
                text += repo.name + ' (' + repo.commits + ' commits):\\n';
                repo.highlights.forEach(function(h) {
                    text += '  • ' + h + '\\n';
                });
                text += '\\n';
            });
            return text;
        }

        function loadStoriesByRepo(repo) {
            sendMessage('loadStories', { limit: 50, repo: repo });
        }

        function filterStories(query) {
            var cards = document.querySelectorAll('.story-card');
            cards.forEach(function(card) {
                var text = card.textContent.toLowerCase();
                card.style.display = text.includes(query.toLowerCase()) ? 'block' : 'none';
            });
        }

        function selectTemplate(template) {
            document.querySelectorAll('.wizard-option').forEach(function(o) { o.classList.remove('selected'); });
            document.querySelector('.wizard-option[data-template="' + template + '"]').classList.add('selected');
            selectedTemplate = template;
        }

        function runGeneration() {
            var source = document.getElementById('gen-source').value;
            var llm = document.getElementById('gen-llm').value;
            
            if (source === 'selected') {
                // Generate from selected commits
                var commits = getSelectedCommitsForGeneration();
                if (commits.length === 0) {
                    return;
                }
                sendMessage('generateFromCommits', {
                    commits: commits,
                    useLocal: llm === 'local',
                    template: selectedTemplate
                });
            } else {
                var days = source === 'custom' ? parseInt(document.getElementById('gen-days').value, 10) : parseInt(source, 10);
                sendMessage('generateStories', {
                    useLocal: llm === 'local',
                    template: selectedTemplate,
                    days: days
                });
            }
        }

        window.addEventListener('message', function(event) {
            var message = event.data;
            console.log('Received message:', message.command, message);

            switch (message.command) {
                case 'updateCommits':
                    console.log('updateCommits received, data:', message.data);
                    console.log('repos count:', message.data ? message.data.repos ? message.data.repos.length : 'no repos' : 'no data');
                    renderWorkSummary(message.data, 'raw-activity-content', 'dashboard');
                    break;
                case 'updateAllCommits':
                    console.log('updateAllCommits received, data:', message.data);
                    window.allCommitsFullData = message.data;
                    renderAllCommits(message.data, 'all-commits-content', 'commits');
                    break;
                case 'updateStories':
                    console.log('updateStories received with', message.stories ? message.stories.length : 0, 'stories');
                    renderStories(message.stories);
                    renderRecentStories(message.stories);
                    break;
                case 'switchTab':
                    switchTab(message.tab);
                    break;
            }
        });

        function renderStories(stories) {
            var container = document.getElementById('stories-list');
            if (!stories || stories.length === 0) {
                container.innerHTML = '<div class="empty-state">No stories found. Generate one!</div>';
                return;
            }

            // Sort stories by date (most recent first)
            var sortedStories = stories.slice().sort(function(a, b) {
                var dateA = new Date(a.last_commit_at || a.created_at || 0).getTime();
                var dateB = new Date(b.last_commit_at || b.created_at || 0).getTime();
                return dateB - dateA; // Reverse chronological
            });

            // Group stories by repository (preserving order)
            var storiesByRepo = {};
            var repoOrder = [];
            sortedStories.forEach(function(story) {
                var repoName = story.repo_name || 'Unknown';
                if (!storiesByRepo[repoName]) {
                    storiesByRepo[repoName] = [];
                    repoOrder.push(repoName);
                }
                storiesByRepo[repoName].push(story);
            });

            // Render stories grouped by repo (in order of first appearance)
            var html = '';
            repoOrder.forEach(function(repoName) {
                var repoStories = storiesByRepo[repoName];
                var totalStories = repoStories.length;
                
                html += '<div class="repo-work">';
                html += '<div class="repo-work-title">' + escapeHtml(repoName) + ' <span style="font-weight:normal; opacity:0.7; font-size:11px;">(' + totalStories + ' ' + (totalStories === 1 ? 'story' : 'stories') + ')</span></div>';
                html += '<ul class="work-highlights">';
                
                repoStories.forEach(function(story) {
                    // Clean markdown ** from summary
                    var summary = (story.summary || '').split('**').join('');
                    
                    // Format date
                    var dateStr = '';
                    if (story.last_commit_at) {
                        var date = new Date(story.last_commit_at);
                        if (!isNaN(date.getTime())) {
                            dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }
                    }

                    html += '<li>';
                    html += '<div style="display:flex; justify-content:space-between; gap:8px;">';
                    html += '<span>' + escapeHtml(summary);
                    if (story.is_featured) {
                        html += ' <span style="color: #ffc107;">★</span>';
                    }
                    html += '</span>';
                    
                    if (dateStr) {
                        html += '<span style="color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; flex-shrink: 0;">' + dateStr + '</span>';
                    }
                    
                    html += '</div>';
                    html += '</li>';
                });
                
                html += '</ul></div>';
            });
            
            container.innerHTML = html;
        }

        function viewStory(storyId) {
            sendMessage('viewStory', { storyId: storyId });
        }

        function escapeHtml(text) {
            if (!text) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Initialize dashboard immediately
        (function initDashboard() {
            try {
                console.log('Dashboard loaded, initializing...');
                // Small delay to ensure vscode API is ready
                setTimeout(function() {
                    // Load with default time range (3 days) - this loads both stories and commits
                    loadByTimeRange('3days');
                }, 100);
            } catch (error) {
                console.error('Error during dashboard initialization:', error);
                // Show error in UI if initialization fails
                var container = document.getElementById('recent-stories-content');
                if (container) {
                    container.innerHTML = '<div class="empty-state">Failed to initialize: ' + error + '</div>';
                }
            }
        })();

        window.onerror = function(message, source, lineno, colno, error) {
            console.error('Dashboard error:', { message: message, source: source, lineno: lineno, colno: colno, error: error });
            return false;
        };
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string | undefined | null): string {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
