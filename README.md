# Repr VS Code Extension

Your resume updates itself as you work — and it's always shareable.

## Features

- **Automatic Profile Updates**: Converts your git commit history into a living professional profile
- **Dashboard View**: See your recent stories, repositories, and profile status at a glance
- **Status Bar Integration**: Quick access to your Repr status
- **Auto-Detection**: Automatically detects new commits and prompts for analysis
- **Public Profiles**: Share your profile at `repr.dev/{username}`
- **Flexible LLM Configuration**: Use cloud or local LLM endpoints (Ollama, LiteLLM, etc.)

## Requirements

- VS Code 1.74.0 or higher
- Repr CLI installed via `pipx install repr-cli`
- Python 3.10+

## Installation

1. Install the Repr CLI:
   ```bash
   pipx install repr-cli
   ```

2. Install this extension from the VS Code marketplace

3. Login to Repr:
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Repr: Login" and press Enter
   - Follow the browser authentication flow

## Usage

### Commands

Access these commands via the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`):

#### Profile & Authentication
- **Repr: Open Dashboard** - View your profile status, stories, and repositories
- **Repr: Login** - Authenticate with repr.dev
- **Repr: Logout** - Sign out
- **Repr: Share Public Profile** - Copy your public profile URL
- **Repr: Open Public Profile** - Open your profile in browser

#### Repository Management
- **Repr: Add Current Workspace** - Add current workspace to tracked repositories
- **Repr: Add Repository** - Add a repository to track
- **Repr: Remove Repository** - Remove a tracked repository
- **Repr: List Tracked Repositories** - View all tracked repositories
- **Repr: Sync Now** - Manually sync all tracked repositories

#### Git Hooks
- **Repr: Install Git Hook** - Install git hooks for automatic tracking
  - Checks current installation status
  - Install in all repos or current workspace
  - Shows which repos already have hooks installed
- **Repr: Check Git Hook Status** - View which repositories have hooks installed
  - Shows detailed status for all tracked repositories
  - Offers quick action to install missing hooks
- **Repr: Remove Git Hook** - Remove git hooks from repositories
  - Remove from all repos, current workspace, or select specific repos
  - Shows current installation status before removal

#### Stories & Analysis
- **Repr: Show Recent Stories** - View your recent commit stories
- **Repr: Show Recent Commits** (`Cmd+Shift+C` / `Ctrl+Shift+C`) - View commits with time filters
  - Quick options: Last 3 days (standup), 7 days (week), 14 days (sprint), 30 days, or custom
- **Repr: Generate Stories (Local)** (`Cmd+Shift+G` / `Ctrl+Shift+G`) - Generate stories using local LLM
- **Repr: Export as Markdown** - Export your profile to markdown format

#### Configuration
- **Repr: Configure LLM** - Set up cloud or local LLM endpoint

### Status Bar

The Repr status bar item shows your current status:

- ⚠️ **Not Installed** - Repr CLI needs to be installed
- 🔒 **Login Required** - You need to authenticate
- ✓ **Synced** - Your profile is up to date
- ↻ **X new commits** - New commits detected, ready to analyze
- ◐ **Analyzing...** - Analysis in progress
- ✗ **Error** - An error occurred

Click the status bar item to open the dashboard.

## Extension Settings

This extension contributes the following settings:

### General Settings

- `repr.cli.path`: Custom path to repr CLI executable (leave empty for auto-detection)
- `repr.autoDetect.enabled`: Automatically detect new commits (default: `true`)
- `repr.autoDetect.intervalMinutes`: Interval in minutes to check for new commits (default: `30`)
- `repr.autoDetect.showNotification`: Show notification when new commits are detected (default: `true`)
- `repr.dashboard.showOnStartup`: Show dashboard on VS Code startup (default: `false`)
- `repr.statusBar.enabled`: Show Repr status in status bar (default: `true`)

### LLM Configuration

Configure which LLM endpoint Repr should use for analyzing your commits:

- `repr.llm.provider`: LLM provider to use (options: `cloud`, `local`, default: `cloud`)
  - `cloud`: Use repr.dev's hosted LLM service (requires authentication)
  - `local`: Use your own local LLM endpoint (e.g., Ollama, LiteLLM)

- `repr.llm.endpoint`: Custom LLM endpoint URL (used when provider is `local`)
  - Example: `http://localhost:11434` for Ollama
  - Example: `http://localhost:8000` for LiteLLM

- `repr.llm.model`: LLM model name to use (optional, uses CLI default if empty)
  - Example: `llama3` for Ollama
  - Example: `gpt-4` for OpenAI-compatible endpoints

- `repr.llm.apiKey`: API key for local LLM endpoint (optional, if required by your endpoint)

#### Example: Using Ollama Locally

1. Install and run Ollama: `ollama serve`
2. Pull a model: `ollama pull llama3`
3. Configure VSCode settings:
   ```json
   {
     "repr.llm.provider": "local",
     "repr.llm.endpoint": "http://localhost:11434",
     "repr.llm.model": "llama3"
   }
   ```

#### Example: Using LiteLLM Proxy

1. Run LiteLLM: `litellm --model gpt-4`
2. Configure VSCode settings:
   ```json
   {
     "repr.llm.provider": "local",
     "repr.llm.endpoint": "http://localhost:8000",
     "repr.llm.model": "gpt-4",
     "repr.llm.apiKey": "your-api-key"
   }
   ```

## Development

### Building from Source

1. Clone the repository
2. Install dependencies:
   ```bash
   cd vscode-extension
   npm install
   ```
3. Compile TypeScript:
   ```bash
   npm run compile
   ```
4. Press F5 to launch the extension in debug mode

### Project Structure

```
vscode-extension/
├── src/
│   ├── extension.ts       # Main extension entry point
│   ├── cli.ts            # CLI wrapper
│   ├── statusBar.ts      # Status bar implementation
│   ├── dashboard.ts      # Dashboard webview
│   ├── autoDetector.ts   # Auto-detection logic
│   └── outputChannel.ts  # Output channel for logs
├── package.json          # Extension manifest
└── tsconfig.json         # TypeScript config
```

## Release Notes

### 0.1.0

Initial release:

- Dashboard webview with status, stories, and repositories
- Status bar integration
- Automatic commit detection
- All command palette commands
- CLI integration
- Output channel for logs

## For More Information

- [Repr Website](https://repr.dev)
- [Documentation](https://docs.repr.dev)
- [GitHub Repository](https://github.com/repr/repr)

## License

MIT
