import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ReprOutputChannel } from './outputChannel';

const execAsync = promisify(exec);

export interface ReprStatus {
    version: string;
    authenticated: boolean;
    user_email?: string;
    api_base: string;
    last_analyze?: string;
    profiles_count: number;
    stories_count: number;
    pending_sync: boolean;
}

export interface ReprStory {
    id: string;
    summary: string;
    what_was_built?: string;
    technologies: string[];
    repo_name: string;
    commit_shas: string[];
    first_commit_at: string;
    last_commit_at: string;
    files_changed: number;
    lines_added: number;
    lines_removed: number;
}

export interface ReprProfile {
    name: string;
    path: string;
    synced: boolean;
    size: number;
    modified: string;
    repo_count: number;
}

export interface TrackedRepo {
    path: string;
    name: string;
    last_sync: string | null;
    hook_installed: boolean;
    exists: boolean;
}

export interface HookStatus {
    name: string;
    path: string;
    installed: boolean;
    executable: boolean;
}

export interface SyncResult {
    synced: number;
    skipped: number;
    failed: number;
    results: Array<{repo: string; status: string; reason?: string}>;
}

export interface ReprConfig {
    auth: any;
    llm: any;
    api_base: string;
    is_authenticated: boolean;
}

export interface UserInfo {
    username?: string;
    email?: string;
    profile_url?: string;
}

export interface CommitInfo {
    sha: string;
    full_sha?: string;
    short_sha?: string;
    message: string;
    author: string;
    author_email?: string;
    date: string;
    files?: any[];
    insertions?: number;
    deletions?: number;
    files_changed?: number;
    lines_added?: number;
    lines_removed?: number;
    repo_name?: string;
    repoName?: string;
    repoPath?: string;
}

export interface GeneratedStory {
    id: string;
    summary: string;
    technologies: string[];
    commit_shas: string[];
    files_changed: number;
    lines_added: number;
    lines_removed: number;
}

export interface ModeInfo {
    mode: string;
    locked: boolean;
    llm_provider: string;
    network_policy?: string;
    authenticated: boolean;
}

export class ReprCLI {
    private cliPath: string;

    constructor(private outputChannel: ReprOutputChannel) {
        const config = vscode.workspace.getConfiguration('repr');
        this.cliPath = config.get('cli.path') || 'repr';
    }

    private getEnvVarsFromConfig(): Record<string, string> {
        const config = vscode.workspace.getConfiguration('repr');
        const env: Record<string, string> = {};

        const provider = config.get<string>('llm.provider');
        const endpoint = config.get<string>('llm.endpoint');
        const model = config.get<string>('llm.model');
        const apiKey = config.get<string>('llm.apiKey');

        if (provider === 'local' && endpoint) {
            env['REPR_LLM_ENDPOINT'] = endpoint;
        }

        if (model) {
            env['REPR_LLM_MODEL'] = model;
        }

        if (apiKey) {
            env['REPR_LLM_API_KEY'] = apiKey;
        }

        return env;
    }

    async isInstalled(): Promise<boolean> {
        try {
            const { stdout } = await this.execCommand('--version');
            return stdout.trim().length > 0;
        } catch (error) {
            return false;
        }
    }

    async getStatus(): Promise<ReprStatus | null> {
        try {
            const { stdout } = await this.execCommand('status --json');
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to get status: ${error}`);
            return null;
        }
    }

    async getStories(options: {
        repo?: string;
        since?: string;
        limit?: number;
        technologies?: string;
    } = {}): Promise<{ stories: ReprStory[]; total: number } | null> {
        try {
            let args = 'stories --json';

            if (options.repo) {
                args += ` --repo "${options.repo}"`;
            }
            // Note: --since, --limit, --technologies not supported by CLI yet
            // Filter client-side if needed

            const { stdout } = await this.execCommand(args);
            const parsed = JSON.parse(stdout);
            
            // CLI returns an array directly, normalize to { stories, total }
            const stories = Array.isArray(parsed) ? parsed : (parsed.stories || []);
            
            // Client-side limit if requested
            const limitedStories = options.limit ? stories.slice(0, options.limit) : stories;
            
            return {
                stories: limitedStories,
                total: stories.length
            };
        } catch (error) {
            this.outputChannel.appendError(`Failed to get stories: ${error}`);
            return null;
        }
    }

    async getProfiles(): Promise<ReprProfile[] | null> {
        try {
            const { stdout } = await this.execCommand('profiles --json');
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to get profiles: ${error}`);
            return null;
        }
    }

    async getConfig(): Promise<ReprConfig | null> {
        try {
            const { stdout } = await this.execCommand('config --json');
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to get config: ${error}`);
            return null;
        }
    }

    async sync(options?: {repo?: string; background?: boolean; all?: boolean}): Promise<SyncResult | null> {
        let args = 'sync --json';
        
        if (options?.repo) {
            args += ` --repo "${options.repo}"`;
        }
        if (options?.all) {
            args += ' --all';
        }
        if (options?.background) {
            args += ' --background';
        }

        try {
            const { stdout } = await this.execCommand(args);
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to sync: ${error}`);
            return null;
        }
    }

    async getTrackedRepos(): Promise<TrackedRepo[]> {
        try {
            const { stdout } = await this.execCommand('repos list --json');
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to get tracked repos: ${error}`);
            return [];
        }
    }

    async addRepo(path: string): Promise<void> {
        await this.execCommand(`repos add "${path}"`);
    }

    async removeRepo(path: string): Promise<void> {
        await this.execCommand(`repos remove "${path}"`);
    }

    async getHookStatus(): Promise<HookStatus[]> {
        try {
            const { stdout } = await this.execCommand('hooks status');
            // Parse text output - hooks status doesn't have JSON support yet
            const lines = stdout.split('\n').filter(l => l.trim());
            const hooks: HookStatus[] = [];

            let currentRepo: string | null = null;
            for (const line of lines) {
                if (line.startsWith('○') || line.startsWith('✓')) {
                    currentRepo = line.replace(/^[○✓]\s*/, '').trim();
                } else if (currentRepo && line.includes('hook installed')) {
                    const installed = line.includes('✓') || !line.includes('No hook');
                    hooks.push({
                        name: currentRepo,
                        path: currentRepo,
                        installed,
                        executable: installed
                    });
                    currentRepo = null;
                }
            }

            return hooks;
        } catch (error) {
            this.outputChannel.appendError(`Failed to get hook status: ${error}`);
            return [];
        }
    }

    async installHook(repo?: string): Promise<void> {
        let args = 'hooks install';
        if (repo) {
            args += ` --repo "${repo}"`;
        } else {
            args += ' --all';
        }
        await this.execCommand(args);
    }

    async removeHook(repo?: string): Promise<void> {
        let args = 'hooks remove';
        if (repo) {
            args += ` --repo "${repo}"`;
        } else {
            args += ' --all';
        }
        await this.execCommand(args);
    }

    async login(): Promise<void> {
        await this.execCommand('login');
    }

    async logout(): Promise<void> {
        await this.execCommand('logout');
    }

    async whoami(): Promise<UserInfo | null> {
        try {
            const { stdout } = await this.execCommand('whoami --json');
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to get user info: ${error}`);
            return null;
        }
    }

    async getCommits(options: {
        repo?: string;
        limit?: number;
        days?: number;
        since?: string;
    } = {}): Promise<CommitInfo[]> {
        try {
            let args = 'commits --json';

            if (options.repo) {
                args += ` --repo "${options.repo}"`;
            }
            if (options.limit) {
                args += ` --limit ${options.limit}`;
            }
            if (options.days) {
                args += ` --days ${options.days}`;
            }
            if (options.since) {
                args += ` --since "${options.since}"`;
            }

            const { stdout } = await this.execCommand(args);
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to get commits: ${error}`);
            return [];
        }
    }

    async generateStory(commitShas: string[], repo?: string, template?: string, customPrompt?: string): Promise<GeneratedStory | null> {
        try {
            let args = `story ${commitShas.join(',')} --json`;
            if (repo) {
                args += ` --repo "${repo}"`;
            }
            if (template) {
                args += ` --template ${template}`;
            }
            if (customPrompt) {
                args += ` --custom-prompt "${customPrompt}"`;
            }

            const { stdout } = await this.execCommand(args);
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to generate story: ${error}`);
            return null;
        }
    }

    async getMode(): Promise<ModeInfo | null> {
        try {
            const { stdout } = await this.execCommand('mode --json');
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to get mode: ${error}`);
            return null;
        }
    }

    async generate(options: {
        local?: boolean;
        template?: string;
        days?: number;
        repo?: string;
        batchSize?: number;
    } = {}): Promise<{ generated: number; stories: GeneratedStory[] } | null> {
        try {
            let args = 'generate --json';

            if (options.local) {
                args += ' --local';
            }
            if (options.template) {
                args += ` --template ${options.template}`;
            }
            if (options.days) {
                args += ` --days ${options.days}`;
            }
            if (options.repo) {
                args += ` --repo "${options.repo}"`;
            }
            if (options.batchSize) {
                args += ` --batch-size ${options.batchSize}`;
            }

            const { stdout } = await this.execCommand(args);
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to generate stories: ${error}`);
            return null;
        }
    }

    async exportProfile(format: 'md' | 'json', since?: string): Promise<string | null> {
        try {
            let args = `profile export --format ${format}`;
            if (since) {
                args += ` --since "${since}"`;
            }

            const { stdout } = await this.execCommand(args);
            return stdout;
        } catch (error) {
            this.outputChannel.appendError(`Failed to export profile: ${error}`);
            return null;
        }
    }

    async push(options: { all?: boolean; story?: string; dryRun?: boolean } = {}): Promise<any> {
        try {
            let args = 'push --json';

            if (options.all) {
                args += ' --all';
            }
            if (options.story) {
                args += ` --story ${options.story}`;
            }
            if (options.dryRun) {
                args += ' --dry-run';
            }

            const { stdout } = await this.execCommand(args);
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to push: ${error}`);
            return null;
        }
    }

    async pull(): Promise<any> {
        try {
            const { stdout } = await this.execCommand('pull --json');
            return JSON.parse(stdout);
        } catch (error) {
            this.outputChannel.appendError(`Failed to pull: ${error}`);
            return null;
        }
    }

    private async execCommand(args: string): Promise<{ stdout: string; stderr: string }> {
        const command = `${this.cliPath} ${args}`;

        this.outputChannel.appendLine(`> ${command}`);
        const startTime = Date.now();

        try {
            const customEnv = this.getEnvVarsFromConfig();
            const result = await execAsync(command, {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                env: {
                    ...process.env,
                    ...customEnv
                }
            });

            const duration = Date.now() - startTime;

            if (result.stdout) {
                this.outputChannel.appendLine(result.stdout);
            }
            if (result.stderr) {
                this.outputChannel.appendLine(result.stderr);
            }

            this.outputChannel.appendLine(`Command completed in ${duration}ms\n`);

            return result;
        } catch (error: any) {
            const duration = Date.now() - startTime;

            this.outputChannel.appendError(
                `Command failed after ${duration}ms: ${error.message}`
            );

            if (error.stdout) {
                this.outputChannel.appendLine(error.stdout);
            }
            if (error.stderr) {
                this.outputChannel.appendError(error.stderr);
            }

            // Try to parse JSON error
            if (error.stdout) {
                try {
                    const jsonError = JSON.parse(error.stdout);
                    if (jsonError.error) {
                        throw new Error(jsonError.error);
                    }
                } catch {
                    // Not JSON, use original error
                }
            }

            throw error;
        }
    }
}
