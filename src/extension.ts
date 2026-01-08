import * as vscode from 'vscode';
import { ReprStatusBar } from './statusBar';
import { ReprCLI } from './cli';
import { ReprDashboard } from './dashboard';
import { AutoDetector } from './autoDetector';
import { ReprOutputChannel } from './outputChannel';

let statusBar: ReprStatusBar;
let cli: ReprCLI;
let dashboard: ReprDashboard;
let autoDetector: AutoDetector;
let outputChannel: ReprOutputChannel;

export function activate(context: vscode.ExtensionContext) {
    console.log('Repr extension is now active');

    // Initialize output channel
    outputChannel = new ReprOutputChannel();
    context.subscriptions.push(outputChannel);

    // Initialize CLI
    cli = new ReprCLI(outputChannel);

    // Initialize dashboard
    dashboard = new ReprDashboard(context, cli, outputChannel);

    // Initialize status bar
    statusBar = new ReprStatusBar(cli);
    context.subscriptions.push(statusBar);

    // Initialize auto detector
    autoDetector = new AutoDetector(cli, statusBar);
    context.subscriptions.push(autoDetector);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('repr.openDashboard', () => {
            dashboard.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.refreshDashboard', async () => {
            await dashboard.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.sync', async () => {
            await handleSync();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.addCurrentRepo', async () => {
            await handleAddCurrentRepo();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.addRepo', async () => {
            await handleAddRepo();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.removeRepo', async () => {
            await handleRemoveRepo();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.listRepos', async () => {
            await handleListRepos();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.installHook', async () => {
            await handleInstallHook();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.checkHookStatus', async () => {
            await handleCheckHookStatus();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.removeHook', async () => {
            await handleRemoveHook();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.showStories', async () => {
            await handleShowStories();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.login', async () => {
            await handleLogin();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.logout', async () => {
            await handleLogout();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.shareProfile', async () => {
            await handleShareProfile();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.openPublicProfile', async () => {
            await handleOpenPublicProfile();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.configureLLM', async () => {
            await handleConfigureLLM();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.showCommits', async () => {
            await handleShowCommits();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.generateLocal', async () => {
            await handleGenerateLocal();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('repr.exportMarkdown', async () => {
            await handleExportMarkdown();
        })
    );

    // Check CLI installation on activation
    checkCLIInstallation();

    // Discover workspace repos and prompt to add
    setTimeout(() => {
        discoverAndPromptForRepos();
    }, 2000); // Wait 2 seconds after activation

    // Show dashboard on startup if configured
    const config = vscode.workspace.getConfiguration('repr');
    if (config.get('dashboard.showOnStartup')) {
        dashboard.show();
    }

    // Start auto-detection if enabled
    autoDetector.start();
}

async function checkCLIInstallation() {
    const isInstalled = await cli.isInstalled();

    if (!isInstalled) {
        statusBar.setState('notInstalled');

        const action = await vscode.window.showWarningMessage(
            'Repr CLI not found',
            'Copy Install Command',
            'Open Terminal',
            'Dismiss'
        );

        if (action === 'Copy Install Command') {
            await vscode.env.clipboard.writeText('pipx install repr-cli');
            vscode.window.showInformationMessage('Install command copied to clipboard');
        } else if (action === 'Open Terminal') {
            const terminal = vscode.window.createTerminal('Repr Installation');
            terminal.show();
            terminal.sendText('# Run this command to install Repr CLI:');
            terminal.sendText('pipx install repr-cli');
        }
    } else {
        // Check authentication status
        const status = await cli.getStatus();
        if (status && status.authenticated) {
            statusBar.setState('synced');
        } else {
            statusBar.setState('notAuthenticated');
        }
    }
}

async function handleSync() {
    statusBar.setState('analyzing');

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Syncing repositories...',
                cancellable: false
            },
            async () => {
                const result = await cli.sync();
                
                if (result && result.synced > 0) {
                    vscode.window.showInformationMessage(`Synced ${result.synced} repository(ies)!`);
                } else if (result && result.synced === 0 && result.skipped > 0) {
                    vscode.window.showInformationMessage('No repositories needed syncing');
                } else {
                    vscode.window.showInformationMessage('Sync complete!');
                }
                
                statusBar.setState('synced');

                // Refresh dashboard if open
                dashboard.refresh();
            }
        );
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Sync failed: ${errorMsg}`);
        statusBar.setState('error');
    }
}

async function handleAddCurrentRepo() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    try {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        await cli.addRepo(workspacePath);
        vscode.window.showInformationMessage(`Added ${workspaceFolders[0].name} to tracked repositories`);
        dashboard.refresh();
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to add repository: ${errorMsg}`);
    }
}

async function handleCheckHookStatus() {
    const trackedRepos = await cli.getTrackedRepos();
    
    if (trackedRepos.length === 0) {
        vscode.window.showInformationMessage('No repositories are being tracked');
        return;
    }

    // Use TrackedRepo.hook_installed directly instead of parsing hooks status
    const installedRepos = trackedRepos.filter(r => r.hook_installed);
    const notInstalledRepos = trackedRepos.filter(r => !r.hook_installed);

    // Build status message
    const statusLines = [
        `📊 Git Hook Status (${trackedRepos.length} repositories)`,
        '',
        `✓ Hooks Installed: ${installedRepos.length}`,
        `○ Hooks Not Installed: ${notInstalledRepos.length}`,
        '',
        '---',
        ''
    ];

    if (installedRepos.length > 0) {
        statusLines.push('✓ Installed in:');
        installedRepos.forEach(repo => {
            statusLines.push(`  • ${repo.name}`);
        });
        statusLines.push('');
    }

    if (notInstalledRepos.length > 0) {
        statusLines.push('○ Not installed in:');
        notInstalledRepos.forEach(repo => {
            statusLines.push(`  • ${repo.name}`);
        });
        statusLines.push('');
    }

    const statusMessage = statusLines.join('\n');

    // Show in a new document
    const doc = await vscode.workspace.openTextDocument({
        content: statusMessage,
        language: 'plaintext'
    });
    await vscode.window.showTextDocument(doc, { preview: true });

    // Also offer actions
    if (notInstalledRepos.length > 0) {
        const action = await vscode.window.showInformationMessage(
            `${installedRepos.length} repo(s) with hooks, ${notInstalledRepos.length} without`,
            'Install Hooks',
            'Close'
        );

        if (action === 'Install Hooks') {
            await handleInstallHook();
        }
    } else {
        vscode.window.showInformationMessage(
            `All ${installedRepos.length} tracked repositories have hooks installed ✓`
        );
    }
}

async function handleInstallHook() {
    const trackedRepos = await cli.getTrackedRepos();
    
    if (trackedRepos.length === 0) {
        vscode.window.showWarningMessage('No repositories are being tracked');
        return;
    }

    // Use TrackedRepo.hook_installed directly
    const reposWithHooks = trackedRepos.filter(r => r.hook_installed);
    const reposWithoutHooks = trackedRepos.filter(r => !r.hook_installed);

    // Show current status
    if (reposWithoutHooks.length === 0 && reposWithHooks.length > 0) {
        const action = await vscode.window.showInformationMessage(
            `All ${reposWithHooks.length} tracked repository(ies) already have hooks installed`,
            'Reinstall Anyway',
            'Cancel'
        );
        
        if (action !== 'Reinstall Anyway') {
            return;
        }
    } else if (reposWithHooks.length > 0 && reposWithoutHooks.length > 0) {
        vscode.window.showInformationMessage(
            `${reposWithHooks.length} repo(s) with hooks installed, ${reposWithoutHooks.length} without`
        );
    }

    const action = await vscode.window.showQuickPick(
        ['Install in all tracked repos', 'Install in current workspace'],
        {
            placeHolder: 'Where do you want to install the git hook?'
        }
    );

    if (!action) {
        return;
    }

    try {
        if (action === 'Install in all tracked repos') {
            await cli.installHook();
            vscode.window.showInformationMessage('Git hooks installed successfully!');
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
            await cli.installHook(workspaceFolders[0].uri.fsPath);
            vscode.window.showInformationMessage(`Git hook installed in ${workspaceFolders[0].name}!`);
        }
        dashboard.refresh();
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to install hook: ${errorMsg}`);
    }
}

async function handleRemoveHook() {
    const trackedRepos = await cli.getTrackedRepos();
    
    if (trackedRepos.length === 0) {
        vscode.window.showInformationMessage('No repositories are being tracked');
        return;
    }

    // Use TrackedRepo.hook_installed directly
    const installedRepos = trackedRepos.filter(r => r.hook_installed);
    const notInstalledRepos = trackedRepos.filter(r => !r.hook_installed);
    
    if (installedRepos.length === 0) {
        vscode.window.showInformationMessage('No git hooks are currently installed in tracked repositories');
        return;
    }

    // Show current status
    if (notInstalledRepos.length > 0) {
        vscode.window.showInformationMessage(
            `${installedRepos.length} repo(s) with hooks installed, ${notInstalledRepos.length} without`
        );
    }

    const action = await vscode.window.showQuickPick(
        [
            {
                label: 'Remove from all repos',
                description: `Remove hooks from ${installedRepos.length} repository(ies)`
            },
            {
                label: 'Remove from current workspace',
                description: 'Remove hook from the current workspace only'
            },
            {
                label: 'Select specific repositories',
                description: 'Choose which repositories to remove hooks from'
            }
        ],
        {
            placeHolder: 'How do you want to remove git hooks?'
        }
    );

    if (!action) {
        return;
    }

    try {
        if (action.label === 'Remove from all repos') {
            await cli.removeHook();
            vscode.window.showInformationMessage('Git hooks removed successfully from all repositories!');
        } else if (action.label === 'Remove from current workspace') {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
            await cli.removeHook(workspaceFolders[0].uri.fsPath);
            vscode.window.showInformationMessage(`Git hook removed from ${workspaceFolders[0].name}!`);
        } else if (action.label === 'Select specific repositories') {
            // Let user select which repos to remove hooks from
            const items = installedRepos.map(repo => ({
                label: repo.name,
                description: repo.path,
                picked: false,
                path: repo.path
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select repositories to remove hooks from (multi-select)',
                canPickMany: true
            });

            if (!selected || selected.length === 0) {
                return;
            }

            // Remove hooks one by one
            let successCount = 0;
            let failCount = 0;
            
            for (const repo of selected) {
                try {
                    await cli.removeHook(repo.path);
                    successCount++;
                } catch (error) {
                    failCount++;
                    outputChannel.appendError(`Failed to remove hook from ${repo.label}: ${error}`);
                }
            }

            if (successCount > 0) {
                vscode.window.showInformationMessage(
                    `Removed hooks from ${successCount} repository(ies)${failCount > 0 ? `, ${failCount} failed` : ''}`
                );
            } else {
                vscode.window.showErrorMessage('Failed to remove hooks from all selected repositories');
            }
        }
        dashboard.refresh();
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to remove hook: ${errorMsg}`);
    }
}

async function handleShowStories() {
    dashboard.show();
    dashboard.focusStories();
}

async function handleLogin() {
    try {
        await cli.login();
        vscode.window.showInformationMessage('Login initiated. Check your browser.');

        // Wait a bit and check status
        setTimeout(async () => {
            const status = await cli.getStatus();
            if (status && status.authenticated) {
                statusBar.setState('synced');
                vscode.window.showInformationMessage('Successfully logged in!');
                dashboard.refresh();
            }
        }, 3000);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Login failed: ${errorMsg}`);
    }
}

async function handleLogout() {
    const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to logout?',
        'Yes',
        'No'
    );

    if (confirm !== 'Yes') {
        return;
    }

    try {
        await cli.logout();
        statusBar.setState('notAuthenticated');
        vscode.window.showInformationMessage('Successfully logged out');
        dashboard.refresh();
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Logout failed: ${errorMsg}`);
    }
}

async function handleShareProfile() {
    try {
        const status = await cli.getStatus();
        if (!status || !status.authenticated) {
            vscode.window.showWarningMessage('Please login first');
            return;
        }

        // Get username from whoami
        const userInfo = await cli.whoami();
        if (userInfo && userInfo.username) {
            const profileUrl = `https://repr.dev/u/${userInfo.username}`;
            await vscode.env.clipboard.writeText(profileUrl);
            vscode.window.showInformationMessage(`Profile URL copied: ${profileUrl}`);
        } else {
            vscode.window.showWarningMessage('No public profile URL available. Please set a username.');
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to get profile URL: ${errorMsg}`);
    }
}

async function handleOpenPublicProfile() {
    try {
        const status = await cli.getStatus();
        if (!status || !status.authenticated) {
            vscode.window.showWarningMessage('Please login first');
            return;
        }

        const userInfo = await cli.whoami();
        if (userInfo && userInfo.username) {
            const profileUrl = `https://repr.dev/u/${userInfo.username}`;
            await vscode.env.openExternal(vscode.Uri.parse(profileUrl));
        } else {
            vscode.window.showWarningMessage('No public profile URL available. Please set a username.');
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to open profile: ${errorMsg}`);
    }
}

async function handleAddRepo() {
    const folderUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Add Repository'
    });

    if (!folderUri || folderUri.length === 0) {
        return;
    }

    const repoPath = folderUri[0].fsPath;

    try {
        await cli.addRepo(repoPath);
        const repoName = repoPath.split('/').pop() || repoPath;
        vscode.window.showInformationMessage(`Added ${repoName} to tracked repositories`);
        dashboard.refresh();
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to add repository: ${errorMsg}`);
    }
}

async function handleRemoveRepo() {
    const trackedRepos = await cli.getTrackedRepos();

    if (trackedRepos.length === 0) {
        vscode.window.showWarningMessage('No repositories are being tracked');
        return;
    }

    const items = trackedRepos.map(repo => ({
        label: repo.name,
        description: repo.path,
        path: repo.path
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a repository to remove'
    });

    if (!selected) {
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Remove ${selected.label} from tracked repositories?`,
        'Yes',
        'No'
    );

    if (confirm !== 'Yes') {
        return;
    }

    try {
        await cli.removeRepo(selected.path);
        vscode.window.showInformationMessage(`Removed ${selected.label} from tracked repositories`);
        dashboard.refresh();
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to remove repository: ${errorMsg}`);
    }
}

async function handleListRepos() {
    const trackedRepos = await cli.getTrackedRepos();

    if (trackedRepos.length === 0) {
        vscode.window.showInformationMessage('No repositories are being tracked');
        return;
    }

    // Open dashboard and show repos
    dashboard.show();
}

async function discoverAndPromptForRepos() {
    // Check if prompting is enabled
    const config = vscode.workspace.getConfiguration('repr');
    if (!config.get('autoDetect.promptForNewRepos')) {
        return;
    }

    // Skip if CLI is not installed
    const isInstalled = await cli.isInstalled();
    if (!isInstalled) {
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    // Check if we already have tracked repos
    const trackedRepos = await cli.getTrackedRepos();
    if (trackedRepos.length > 0) {
        return; // Already have repos, don't prompt
    }

    // Check if current workspace is a git repo
    const workspacePath = workspaceFolders[0].uri.fsPath;
    const gitDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.git');
    
    try {
        const stat = await vscode.workspace.fs.stat(gitDir);
        if (stat.type === vscode.FileType.Directory) {
            // It's a git repo, prompt to add
            const action = await vscode.window.showInformationMessage(
                'Would you like to track this workspace with Repr?',
                'Yes',
                'Not Now',
                'Don\'t Ask Again'
            );

            if (action === 'Yes') {
                try {
                    await cli.addRepo(workspacePath);
                    vscode.window.showInformationMessage(`Added ${workspaceFolders[0].name} to tracked repositories`);
                    dashboard.refresh();
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    vscode.window.showErrorMessage(`Failed to add repository: ${errorMsg}`);
                }
            } else if (action === 'Don\'t Ask Again') {
                // Save preference to not ask again
                await config.update('autoDetect.promptForNewRepos', false, true);
            }
        }
    } catch {
        // Not a git directory, silently ignore
    }
}

async function handleConfigureLLM() {
    const config = vscode.workspace.getConfiguration('repr');

    // Ask for provider
    const provider = await vscode.window.showQuickPick(
        [
            {
                label: 'Cloud',
                description: 'Use repr.dev hosted LLM (requires authentication)',
                value: 'cloud'
            },
            {
                label: 'Local',
                description: 'Use your own local LLM endpoint (e.g., Ollama, LiteLLM)',
                value: 'local'
            }
        ],
        {
            placeHolder: 'Select LLM provider'
        }
    );

    if (!provider) {
        return;
    }

    await config.update('llm.provider', provider.value, true);

    if (provider.value === 'local') {
        // Get endpoint URL
        const endpoint = await vscode.window.showInputBox({
            prompt: 'Enter LLM endpoint URL',
            placeHolder: 'http://localhost:11434',
            value: config.get<string>('llm.endpoint') || ''
        });

        if (endpoint !== undefined) {
            await config.update('llm.endpoint', endpoint, true);
        }

        // Get model name (optional)
        const model = await vscode.window.showInputBox({
            prompt: 'Enter model name (optional)',
            placeHolder: 'llama3',
            value: config.get<string>('llm.model') || ''
        });

        if (model !== undefined) {
            await config.update('llm.model', model, true);
        }

        // Get API key (optional)
        const needsApiKey = await vscode.window.showQuickPick(
            ['No', 'Yes'],
            {
                placeHolder: 'Does your endpoint require an API key?'
            }
        );

        if (needsApiKey === 'Yes') {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter API key',
                password: true,
                value: config.get<string>('llm.apiKey') || ''
            });

            if (apiKey !== undefined) {
                await config.update('llm.apiKey', apiKey, true);
            }
        } else if (needsApiKey === 'No') {
            await config.update('llm.apiKey', '', true);
        }

        vscode.window.showInformationMessage('LLM configuration updated! Local endpoint will be used.');
    } else {
        // Clear local settings when switching to cloud
        await config.update('llm.endpoint', '', true);
        await config.update('llm.model', '', true);
        await config.update('llm.apiKey', '', true);

        vscode.window.showInformationMessage('LLM configuration updated! Cloud endpoint will be used.');
    }
}

async function handleShowCommits() {
    // Ask for days filter
    const daysOptions = [
        { label: 'Last 3 days (standup)', value: 3 },
        { label: 'Last 7 days (week)', value: 7 },
        { label: 'Last 14 days (sprint)', value: 14 },
        { label: 'Last 30 days', value: 30 },
        { label: 'Custom...', value: -1 }
    ];

    const selected = await vscode.window.showQuickPick(
        daysOptions.map(o => ({ label: o.label, days: o.value })),
        { placeHolder: 'Select time range' }
    );

    if (!selected) {
        return;
    }

    let days = selected.days;
    if (days === -1) {
        const customDays = await vscode.window.showInputBox({
            prompt: 'Enter number of days',
            placeHolder: '7',
            validateInput: (value) => {
                const num = parseInt(value, 10);
                if (isNaN(num) || num < 1) {
                    return 'Please enter a valid number';
                }
                return null;
            }
        });
        if (!customDays) {
            return;
        }
        days = parseInt(customDays, 10);
    }

    try {
        const commits = await cli.getCommits({ days });
        if (commits && commits.length > 0) {
            // Show in a document
            const lines = [
                `📊 Commits (last ${days} days) — ${commits.length} total`,
                '',
                '---',
                ''
            ];

            // Group by repo (CLI returns repo_name, not repoName)
            const byRepo: Record<string, typeof commits> = {};
            for (const commit of commits) {
                const repo = commit.repo_name || commit.repoName || 'Unknown';
                if (!byRepo[repo]) {
                    byRepo[repo] = [];
                }
                byRepo[repo].push(commit);
            }

            for (const [repo, repoCommits] of Object.entries(byRepo)) {
                lines.push(`${repo}:`);
                for (const commit of repoCommits.slice(0, 10)) {
                    const sha = commit.short_sha || commit.sha.substring(0, 7);
                    const msg = commit.message.split('\n')[0].substring(0, 50);
                    lines.push(`  ${sha}  ${msg}`);
                }
                if (repoCommits.length > 10) {
                    lines.push(`  ... and ${repoCommits.length - 10} more`);
                }
                lines.push('');
            }

            lines.push('---');
            lines.push('');
            lines.push('To generate stories from these commits:');
            lines.push(`  repr generate --days ${days} --local`);

            const doc = await vscode.workspace.openTextDocument({
                content: lines.join('\n'),
                language: 'plaintext'
            });
            await vscode.window.showTextDocument(doc, { preview: true });
        } else {
            vscode.window.showInformationMessage(`No commits found in the last ${days} days`);
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to get commits: ${errorMsg}`);
    }
}

async function handleGenerateLocal() {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating stories locally...',
            cancellable: false
        }, async () => {
            const result = await cli.generate({ local: true, template: 'resume' });

            if (result && result.generated > 0) {
                vscode.window.showInformationMessage(
                    `Generated ${result.generated} story(ies)!`,
                    'View Stories'
                ).then(action => {
                    if (action === 'View Stories') {
                        dashboard.show();
                        dashboard.focusStories();
                    }
                });
            } else {
                vscode.window.showInformationMessage('No stories generated');
            }
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to generate stories: ${errorMsg}`);
    }
}

async function handleExportMarkdown() {
    try {
        const exportData = await cli.exportProfile('md');

        if (exportData) {
            const doc = await vscode.workspace.openTextDocument({
                content: exportData,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to export profile: ${errorMsg}`);
    }
}

export function deactivate() {
    autoDetector?.stop();
}
