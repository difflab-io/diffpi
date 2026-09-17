# @difflab/pi

Tools and skills for the pi coding agent.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup`. The skill validates or configures the environment and reloads pi when required.

The package includes structured questions and installs the upstream Grounded Docs, Simple English, and Context Mode skills. Setup also installs seven package-managed agent files into Pi's global agent directory. The subagent plugin can delegate to `tutor`, `copilot`, `planner`, `worker`, `orchestrator`, `autonomous`, and `reviewer`; profiles marked for inline use are also available as inline modes.

```text
/skill:mode
/skill:mode --include-skills
/skill:mode tutor
/skill:mode spec:planner
/skill:mode clear
```

Standard agents come from the same global and trusted-project directories used by `@tintinweb/pi-subagents`. Skill-owned agents are opt-in for listing and use `skill:agent` ids. Inline selection applies the profile prompt, first available preferred model, thinking level, and available tool set. Clearing restores the previous runtime. Override ordered model preferences with `agents.<id>.models` in `~/.difflab/diffpi/config.yaml` or `config.json`, then rerun setup for delegated agents. Inline modes are not a security boundary.

## Review

`/review` drives code review over GitHub, GitLab, or the local `tuicr` TUI. Choose a forge during `/skill:diffpi-setup` to install `gh` or `glab` and register its MCP server; choose None for local-only review.

```text
/review open [--local]       create a draft PR/MR or tuicr session
/review new [--local]        generate an inline review
/review address [--local]    address unresolved review comments
/review publish [--local]    publish pending review work
/review complete [--accept|--reject|--close|--local]
/review merge                squash-merge an approved PR/MR
```

Local artifacts live in `.pi/diffpi/`, shared across worktrees. The local launcher opens a mux tab when zellij, tmux, or screen is detected; without a mux, Zed gets a `diffpi: tuicr review` task, and other environments receive the command to run.

See the [repository](https://github.com/difflab-io/diffpi) for details.
