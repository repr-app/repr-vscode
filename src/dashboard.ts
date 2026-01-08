import * as vscode from 'vscode';
import { ReprCLI, ReprStory, ReprStatus, TrackedRepo, HookStatus, CommitInfo, WorkSummary, ModeInfo } from './cli';
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
        switch (message.command) {
            case 'refresh':
                await this.refresh();
                break;

            case 'loadStandup':
                const standup = await this.cli.getStandup();
                this.panel?.webview.postMessage({
                    command: 'updateStandup',
                    data: standup
                });
                break;

            case 'loadWeek':
                const week = await this.cli.getWeek();
                this.panel?.webview.postMessage({
                    command: 'updateWeek',
                    data: week
                });
                break;

            case 'loadToday':
                const today = await this.cli.getSince('this morning');
                this.panel?.webview.postMessage({
                    command: 'updateToday',
                    data: today
                });
                break;

            case 'saveAsStory':
                const date = message.date || 'this morning';
                await this.cli.getSince(date, true);
                vscode.window.showInformationMessage('Work saved as story!');
                this.refresh();
                break;

            case 'copyToClipboard':
                await vscode.env.clipboard.writeText(message.text);
                vscode.window.showInformationMessage('Copied to clipboard');
                break;

            case 'loadStories':
                const stories = await this.cli.getStories({
                    limit: message.limit || 50,
                    repo: message.repo
                });
                this.panel?.webview.postMessage({
                    command: 'updateStories',
                    stories: stories?.stories || []
                });
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
                        since: message.since,
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
        }

        .main-content {
            flex: 1;
            overflow-y: auto;
            padding: var(--gap-lg);
            display: flex;
            flex-direction: column;
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
        }
        
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--gap-md);
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
        }

        .work-highlights li {
            padding: 2px 0;
            font-size: 12px;
            color: var(--vscode-foreground);
            text-align: left;
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
                <button class="btn btn-primary" onclick="sendMessage('generateStories', {useLocal: true, template: 'resume'})" title="Transform your git commits into readable stories using AI">
                    ✨ Generate Stories
                </button>
                <button class="btn btn-secondary" onclick="loadStandup()" title="View raw commit activity from the last 3 days">
                    📅 Last 3 Days
                </button>
                <button class="btn btn-secondary" onclick="loadWeek()" title="View raw commit activity from the last 7 days">
                    📆 Last 7 Days
                </button>
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
                    <div class="tab" data-tab="stories" onclick="switchTab('stories')">All Stories</div>
                    <div class="tab" data-tab="generate" onclick="switchTab('generate')">Generate</div>
                </div>

                <!-- Tab: Recent Stories -->
                <div class="tab-content active" id="tab-recent">
                    <div class="work-section">
                        <div class="section-header">
                            <h3 class="section-title">Recent Stories</h3>
                            <button class="btn btn-secondary" onclick="loadRecentStories()">Refresh</button>
                        </div>
                        <div id="recent-stories-content" class="loading">Loading stories...</div>
                    </div>

                    <div class="work-section" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--vscode-panel-border);">
                        <div class="section-header">
                            <h3 class="section-title">Raw Commits</h3>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-secondary" onclick="loadStandup()">📅 3 Days</button>
                                <button class="btn btn-secondary" onclick="loadWeek()">📆 7 Days</button>
                            </div>
                        </div>
                        <div id="raw-activity-content" class="empty-state">Click a button above to view raw commit activity</div>
                    </div>
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
                        <select id="gen-source">
                            <option value="week">From Last Week</option>
                            <option value="standup">From Last 3 Days</option>
                            <option value="today">From Today</option>
                            <option value="custom">Custom Date Range</option>
                        </select>
                        <div id="gen-source-custom" style="display: none; margin-top: 8px;">
                            <input type="text" id="gen-since" placeholder="e.g., '2 weeks ago', 'Jan 1'">
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
                        const hook = hookStatus.find(h => h.path === repo.path);
                        const repoName = repo.name || repo.path.split('/').pop() || 'Unknown';
                        const hasHook = hook?.installed;
                        return `
                            <div class="repo-list-item ${hasHook ? '' : 'clickable'}" data-repo-index="${index}" data-has-hook="${hasHook ? 'true' : 'false'}" title="${hasHook ? 'Hook installed' : 'Click to install hook'}">
                                <span class="repo-name">${this.escapeHtml(repoName)}</span>
                                <span class="repo-status ${hasHook ? 'status-active' : 'status-inactive'}">${hasHook ? '✓ Hook' : '+ Install hook'}</span>
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

        function sendMessage(command, data) {
            data = data || {};
            vscode.postMessage(Object.assign({ command: command }, data));
        }

        function installHook(repoPath) {
            sendMessage('installHook', { repo: repoPath });
        }

        // Event delegation for repo hook installation
        document.addEventListener('click', function(e) {
            var target = e.target;
            while (target && target !== document) {
                if (target.classList && target.classList.contains('repo-list-item')) {
                    if (target.getAttribute('data-has-hook') === 'false') {
                        var index = parseInt(target.getAttribute('data-repo-index'), 10);
                        if (typeof repoPaths !== 'undefined' && repoPaths[index]) {
                            installHook(repoPaths[index]);
                        }
                    }
                    return;
                }
                target = target.parentElement;
            }
        });

        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });

            document.querySelector('.tab[data-tab="' + tabName + '"]').classList.add('active');
            document.getElementById('tab-' + tabName).classList.add('active');

            if (tabName === 'stories') {
                sendMessage('loadStories', { limit: 50 });
            }
        }

        function loadRecentStories() {
            sendMessage('loadStories', { limit: 10 });
        }

        function loadToday() {
            sendMessage('loadToday');
        }

        function loadStandup() {
            sendMessage('loadStandup');
        }

        function loadWeek() {
            sendMessage('loadWeek');
        }

        function renderRecentStories(stories) {
            var container = document.getElementById('recent-stories-content');
            if (!stories || stories.length === 0) {
                container.innerHTML = '<div class="empty-state">No stories yet. Click "Generate Stories" to create your first one!</div>';
                return;
            }

            var html = '';
            stories.slice(0, 15).forEach(function(story) {
                // Clean markdown ** from summary
                var title = (story.summary || '').split('**').join('');
                html += '<div class="story-list-item" onclick="viewStory(&apos;' + story.id + '&apos;)">';
                html += '<div class="story-list-title">' + escapeHtml(title) + '</div>';
                html += '<div class="story-list-meta">';
                html += '<span>' + escapeHtml(story.repo_name || '') + '</span>';
                html += '<span>' + (story.files_changed || 0) + ' files</span>';
                html += '<span>+' + (story.lines_added || 0) + ' -' + (story.lines_removed || 0) + '</span>';
                html += '<span>' + new Date(story.last_commit_at).toLocaleDateString() + '</span>';
                html += '</div>';
                html += '</div>';
            });
            container.innerHTML = html;
        }

        function renderWorkSummary(data, containerId) {
            var container = document.getElementById(containerId);
            if (!data || !data.repos || data.repos.length === 0) {
                container.innerHTML = '<div class="empty-state">No activity found for this period</div>';
                return;
            }

            var html = '';
            data.repos.forEach(function(repo) {
                html += '<div class="repo-work">';
                html += '<div class="repo-work-title">' + repo.name + ' <span style="font-weight:normal; opacity:0.7; font-size:11px;">(' + repo.commits + ' commits)</span></div>';
                html += '<ul class="work-highlights">';
                repo.highlights.forEach(function(h) {
                    html += '<li>' + h + '</li>';
                });
                html += '</ul></div>';
            });
            html += '<div style="margin-top: 16px; display: flex; gap: 8px;">';
            html += '<button class="btn btn-secondary" onclick="copyWork()">📋 Copy</button>';
            html += '<button class="btn btn-primary" onclick="generateFromActivity()">✨ Generate Stories</button>';
            html += '</div>';
            container.innerHTML = html;
            window.currentWorkData = data;
        }

        function generateFromActivity() {
            if (window.currentWorkData) {
                sendMessage('generateStories', { useLocal: true, template: 'resume', since: window.currentWorkData.period || '3 days ago' });
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
            var since = source === 'custom' ? document.getElementById('gen-since').value :
                         source === 'week' ? '1 week ago' :
                         source === 'standup' ? '3 days ago' :
                         'this morning';

            sendMessage('generateStories', {
                useLocal: llm === 'local',
                template: selectedTemplate,
                since: since
            });
        }

        window.addEventListener('message', function(event) {
            var message = event.data;

            switch (message.command) {
                case 'updateToday':
                    renderWorkSummary(message.data, 'raw-activity-content');
                    break;
                case 'updateStandup':
                    renderWorkSummary(message.data, 'raw-activity-content');
                    break;
                case 'updateWeek':
                    renderWorkSummary(message.data, 'raw-activity-content');
                    break;
                case 'updateStories':
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

            var html = '';
            stories.forEach(function(story) {
                // Clean markdown ** from summary
                var title = (story.summary || '').split('**').join('');
                html += '<div class="story-list-item" onclick="viewStory(&apos;' + story.id + '&apos;)">';
                html += '<div class="story-list-title">' + escapeHtml(title) + '</div>';
                html += '<div class="story-list-meta">';
                html += '<span>' + escapeHtml(story.repo_name || '') + '</span>';
                html += '<span>' + (story.files_changed || 0) + ' files</span>';
                html += '<span>+' + (story.lines_added || 0) + ' -' + (story.lines_removed || 0) + '</span>';
                html += '<span>' + new Date(story.last_commit_at).toLocaleDateString() + '</span>';
                if (story.is_featured) {
                    html += '<span style="color: #ffc107;">★</span>';
                }
                html += '</div>';
                html += '</div>';
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

        setTimeout(function() {
            try {
                console.log('Dashboard loaded, initializing...');
                loadRecentStories();
            } catch (error) {
                console.error('Error during dashboard initialization:', error);
            }
        }, 500);

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
