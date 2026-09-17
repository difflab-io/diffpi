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
/review open [--local] [--base branch]
/review new [target] [--local] [--working-tree]
/review edit [target] [--working-tree]
/review address [target] [--local]
/review publish [target] [--local] [--comment|--approve|--request-changes|--close]
/review merge [target]
```

The skill delegates mechanics to `review_context`, `review_open`, `review_edit`, `review_diff`, `review_gates`, `review_submit`, `review_add_comment`, `review_comments`, `review_respond`, `review_publish`, `review_merge`, and `review_launch`. The generic `diffpi_template` tool loads bundled templates or user overrides. GitHub and GitLab support review creation and publication. Merge is intentionally GitHub-only and remains separate from publish.

`--local` selects `tuicr` as the review backend. It defaults to the current branch PR/MR and falls back to working-tree changes. Local reply overlays preserve remote thread IDs until `publish --local` promotes comments and replies to the forge. Remote comments carry a generated-review notice with the exact provider/model route; local comments use `Agent: <provider/model>` as the author.

Local artifacts live in `.diffpi/reviews/` and use `YYMMDD-<short-head-sha>.md` or `YYMMDD-local.md` names. `.diffpi` links to `~/.difflab/diffpi/projects/<repository-name>-<identity-hash>/`, so all worktrees for one remote share records while unrelated same-named repositories remain isolated. The launcher opens a repository-scoped mux tab when zellij, tmux, or screen is detected; without a mux, Zed lazily gets a `diffpi: tuicr review` task, and other environments receive the command to run.

Draft PR bodies use the bundled `review/draft-pr.md` template. Override it at `~/.difflab/diffpi/templates/review/draft-pr.md`. During package development, `mise run dev` builds the package and launches `pi -e .` with the current worktree plugin.

The package root exports environment and forge lifecycle adapters, review backends, gate checks, review schemas and artifact helpers, template helpers, store helpers, tuicr helpers, setup operations, and inline-mode control. `@difflab/pi/tools` exports `createReviewTools` and the complete tool catalog.

See the [repository](https://github.com/difflab-io/diffpi) for details.
