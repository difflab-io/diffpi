# User Guide

## Requirements

Install pi before you install `@difflab/pi`. Automatic setup supports macOS and Linux with Bash, Zsh, or Fish.

## Install

```bash
pi install npm:@juicesharp/rpiv-ask-user-question
pi install npm:@difflab/pi
```

Restart pi so it can load the extension and bundled skills.

## Validate the environment

Ask pi to validate the local setup. The agent calls `diffpi_validate`, which reports missing software and configuration without changing the machine.

## Set up the environment

Ask pi to set up the local environment. The agent calls `diffpi_setup` and installs:

- mise with a shell activation hook
- Zellij
- Helix
- tuicr
- Node.js 22
- Context Mode
- structured user questions
- pi subagents
- pi scheduled prompts
- pi BTW
- pi web access
- pi LSP
- the pi MCP adapter

The tool configures Grounded Docs, mise, and Context Mode Model Context Protocol (MCP) servers. It sets web search to `auto-summary` so searches do not open the browser curator. Pi LSP keeps progressive diagnostics active but does not write them to the status line.

Linear and Jira are optional. Ask for one by name when you request setup. Complete its OAuth login from the MCP adapter after setup.

## Skills

The package bundles `diffpi-setup`. Setup uses `npx skills add` to install the upstream Grounded Docs and Simple English skills. The Context Mode pi package supplies its own skills.
