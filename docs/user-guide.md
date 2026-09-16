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
- subagents and shared Diffpi agents
- first-party inline agent modes
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

## Use shared agents and inline modes

Setup installs the package's `diffpi-*.md` definitions into `$PI_CODING_AGENT_DIR/agents/` (normally `~/.pi/agent/agents/`). These are normal agent files, so `@tintinweb/pi-subagents` can run `tutor`, `copilot`, `planner`, `worker`, and `orchestrator` in separate delegated sessions. The orchestrator can assign bounded tasks to workers. Future agent files bundled by Diffpi use the same setup step.

Run `/skill:mode` to choose a standard agent through `ask_user_question`. Add one agent id to select it directly, or add `clear` to restore default Pi behavior. Use `--include-skills` to include agents owned by installed skills. Select a skill agent directly with a qualified id such as `/skill:mode spec:planner`. The colon enables skill discovery.

`diffpi_modes_list` reports standard agents by default and accepts `includeSkills: true`. Standard discovery mirrors the subagent plugin: global `$PI_CODING_AGENT_DIR/agents/*.md`, then trusted-project `.agents/agents/*.md`, then trusted-project `.pi/agents/*.md`. Skill discovery additionally reads `agents/*.md` under global and trusted-project `.agents/skills/<skill>/` and `.pi/skills/<skill>/` roots. Project files are ignored until Pi trusts the project.

Agent Markdown uses `name`, `display_name`, `description`, `enabled`, and `prompt_mode`. The body replaces the normal system prompt by default; `prompt_mode: append` preserves normal Pi and Diffpi context first. When the file runs as a delegated subagent, the subagent plugin can honor its model, tool, skill, isolation, memory, and delegation fields. Inline mode deliberately ignores those fields and changes prompting only.

The active id appears as `mode: <id>` through Pi's extension status. Selection is snapshotted in the current session and restored with its active branch. Select the source again to load later file changes.

Inline modes alter behavior and prompt disclosure; they are not a security boundary. Prior conversation messages and provider-visible tools remain, and later extensions can modify the effective prompt. Use delegated subagents when work needs a separate session or full agent configuration.

Linear and Jira remain optional. Select one during setup and complete its OAuth login from the MCP adapter afterward. Selecting none preserves existing issue-tracker configuration.
