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
- optional GitHub or GitLab forge MCP

## Review

Use `/review` for GitHub, GitLab, or local `tuicr` reviews. Setup can install one or more hosted VCS CLIs and MCP servers. `--local` selects the local `tuicr` working-tree backend; otherwise the repository remote determines the forge.

```text
/review auto [pr-number|pr-url|branch] [--local] [--bg]
/review new [--local] [--base branch] [--bg]
/review edit [pr-number|pr-url|branch] [--local] [--bg]
/review address [pr-number|pr-url|branch] [--local] [--bg]
/review publish [pr-number|pr-url|branch] [--local] [--comment|--approve|--request-changes|--close] [--bg]
/review complete [pr-number|pr-url|branch] [--local|--approve|--reject|--abandon] [--bg]
/review merge [pr-number|pr-url|branch] [--bg] # approved GitHub PRs only
```

`--local` means the current working tree; without it, a target is a PR/MR number, URL, or branch, and no target means the current branch. `--bg` removes itself before workflow parsing, keeps the current chat mode unchanged, and launches a tracked background Orchestrator. `auto --local` reviews tracked, staged, and untracked changes in the current working tree. `new` creates a local review or a remote draft PR/MR after the branch is clean and pushed. `edit` opens an existing local review or remote PR/MR, including a non-draft PR/MR. `open`, `create`, and `draft` are aliases for `new`; `launch` is an alias for `auto`.

`address --local` applies fixes in the current working tree without committing them. It synchronizes the selected tuicr session to `.diffpi/review/<session-slug>.md`, posts an outcome for every thread, and preserves replies between runs. Questions stay open after an answer; substantive requests remain open for confirmation; a deleted local source comment becomes resolved on the next sync. A remote address flow commits changed fixes with `/git commit --no-push` before it posts draft responses. `publish --local` follows that stable overlay, promotes `tuicr` comments and replies to the forge, and records fingerprints so a retry does not duplicate them. `complete` approves, rejects, or abandons a remote review without merging; local completion archives its overlay to `.diffpi/reviews/` and deletes the matching tuicr session. Question replies stay open; fixed non-question remote threads can resolve. Publish and complete never merge.

Review records live in `.diffpi/review/` as `YYMMDD-<short-head-sha>.md` or `YYMMDD-uncommitted.md`. `.diffpi` links to a repository-identity-keyed directory below `~/.difflab/diffpi/projects/`, so worktrees share artifacts without colliding with unrelated same-named repositories. Remote comments carry the exact active provider/model route; local comments use it as the `tuicr` author.

Draft PR bodies come from `review/draft-pr.md`. Override the bundled template at `~/.difflab/diffpi/templates/review/draft-pr.md`. The bundled `/git` skill provides conventional commit and intent-preserving rebase workflows. The launcher opens a repository-scoped mux tab when zellij, tmux, or screen is active, prepares a Zed task when needed, or prints the command. GitLab supports creation and publication but not `review_merge` or request-changes.

Web search uses `auto-summary`, so searches do not open the browser curator. Pi LSP keeps progressive diagnostics active without writing them to the status line.

## Use shared agents and inline modes

Setup installs the package's `diffpi-*.md` definitions into `$PI_CODING_AGENT_DIR/agents/` (normally `~/.pi/agent/agents/`). These are normal agent files, so `@tintinweb/pi-subagents` can run `tutor`, `copilot`, `worker`, `reviewer`, and `orchestrator` in delegated sessions. Inline `/review auto` and `/review address` activate Reviewer on Sol; lifecycle verbs activate Orchestrator on Luna. Reviewer delegates bounded address changes to lightweight Worker agents. With `--bg`, a tracked Orchestrator child owns the complete workflow and routes `auto` or `address` through Reviewer.

Run `/mode` for the fast inline picker. Use `/mode <agent>` for direct selection and `/mode clear` or `/mode reset` to restore the previous model, thinking level, tools, and default prompt. Use `/skill:mode` when skill-agent discovery is needed. Use `--include-skills` to include agents owned by installed skills. Select a skill agent directly with a qualified id such as `/skill:mode spec:planner`. The colon enables skill discovery.

`diffpi_modes_list` reports standard agents by default and accepts `includeSkills: true`. Standard discovery mirrors the subagent plugin: global `$PI_CODING_AGENT_DIR/agents/*.md`, then trusted-project `.agents/agents/*.md`, then trusted-project `.pi/agents/*.md`. Skill discovery additionally reads `agents/*.md` under global and trusted-project `.agents/skills/<skill>/` and `.pi/skills/<skill>/` roots. Project files are ignored until Pi trusts the project.

Agent Markdown uses `name`, `display_name`, `description`, `enabled`, `inline`, `prompt_mode`, `model`, `model_fallbacks`, `thinking`, and `tools`. The body replaces the normal system prompt by default; `prompt_mode: append` preserves normal Pi and Diffpi context first. Inline selection tries model preferences in order, keeps the current model if none are available, and filters the profile tool set against the current registry. The subagent plugin officially supports the singular `model` field; Diffpi owns `model_fallbacks` and materializes the first available preference into `model` during setup.

Override an agent's ordered preferences in `~/.difflab/diffpi/config.yaml` or, when YAML is absent, `~/.difflab/diffpi/config.json`. Use `agents.<agent-id>.models` as an ordered string list. The user list replaces bundled defaults; an empty list disables automatic selection. Run `/skill:diffpi-setup` after changing this file so delegated profiles are rematerialized.

The active id appears as `mode: <id>` through Pi's extension status. The complete profile and the previous runtime are snapshotted in the current session and restored with its active branch. Select the source again to load later file changes.

Inline modes alter behavior and available tools; they are not a security boundary. Prior conversation messages remain, tool selection is not permission enforcement, and later extensions can modify the effective prompt. Use delegated subagents when work needs a separate session, isolation, or nested delegation.

Linear and Jira remain optional. Select one during setup and complete its OAuth login from the MCP adapter afterward. Selecting none preserves existing issue-tracker configuration.
