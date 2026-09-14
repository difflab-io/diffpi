# User Guide

## Requirements

Install pi before `@difflab/pi`. Automatic setup supports macOS and Linux. Shell activation supports Bash, Zsh, Fish, Nushell, Xonsh, Elvish, and PowerShell, with Bash as the fallback.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup`. The skill collects setup choices, installs missing requirements after approval, and reloads pi when required.

## Validate the environment

Ask pi to validate the local setup. The agent calls `diffpi_validate`, which reports missing software and configuration without changing the machine.

## Set up the environment

Ask pi to set up the local environment or run `/skill:diffpi-setup`. Setup manages these groups:

### Development tools

- mise and its shell activation hook
- Node.js 22.19 or newer
- Zellij
- Helix
- tuicr
- Context Mode

### Pi packages

- structured user questions
- subagents
- scheduled prompts
- BTW
- web access
- LSP
- Context Mode
- MCP adapter

### Skills

- Grounded Docs: `docs-search`, `docs-manage`, and `fetch-url`
- Simple English: `simple-english`
- Context Mode bundled skills

### MCP adapters

- Grounded Docs
- mise
- Context Mode
- optional Linear or Jira

Web search uses `auto-summary`, so searches do not open the browser curator. Pi LSP keeps progressive diagnostics active without writing them to the status line.

Linear and Jira remain optional. Select one during setup and complete its OAuth login from the MCP adapter afterward. Selecting none preserves existing issue-tracker configuration.
