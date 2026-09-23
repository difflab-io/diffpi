# @difflab/pi

Tools and skills for the pi coding agent.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup`. The skill validates or configures the environment and reloads pi when required.

The package includes structured questions and installs the upstream Grounded Docs, Simple English, and Context Mode skills. Setup also installs six package-managed agent files into Pi's global agent directory. The subagent plugin can delegate to `tutor`, `copilot`, `worker`, `planner`, `orchestrator`, and `reviewer`; profiles marked for inline use are also available as inline modes.

```text
/mode
/mode reviewer
/mode reset
/skill:mode --include-skills
/skill:mode spec:planner
```

Standard agents come from the same global and trusted-project directories used by `@tintinweb/pi-subagents`. Skill-owned agents are opt-in for listing and use `skill:agent` ids. Inline selection applies the profile prompt, first available preferred model, thinking level, and available tool set. Clearing restores the previous runtime. Override ordered model preferences with `agents.<id>.models` in `~/.difflab/diffpi/config.yaml` or `config.json`, then rerun setup for delegated agents. Inline modes are not a security boundary.

## Planning

`/plan` creates and runs durable implementation plans. Records live under `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/` and are shared across worktrees.

```text
/plan init <short-slug> [--branch name]
/plan new <short-slug> [--branch name] [--bg] [prompt...]
/plan update [short-slug] [--branch name] [--bg] [instructions...]
/plan annotate [short-slug]
/plan finalize [short-slug]
/plan go <short-slug> [--mode <no-commit|commit|push>] [--bg]
/plan help
```

Foreground `init`, `new`, and `update` select Planner. Foreground `annotate`, `finalize`, and `help` select Worker. Foreground `go` selects Orchestrator, which launches and coordinates implementation Workers. Deferring implementation during finalize restores the default mode, as does completing an inline plan execution. Orchestrator owns background coordination and phase commits. Background work does not change the foreground mode and does not ask questions.

`/plan annotate` uses `tuicr --file <plan-directory>` and saves an immutable plan review when tuicr closes. Run `npx --yes @difflab/pi@<version> plan annotate --cwd <repo>` for direct use. Zed setup installs the pinned `diffpi: annotate plan` task. Override the plan template at `~/.difflab/diffpi/templates/plan/PLAN.md`.

Plan tools cover context, initialization, overview and phase changes, validation, immutable reviews, progress, status, gates, hosted CI monitoring, and durable execution state. Phase gates run `format:check`, `lint`, and `test`. `--mode commit` creates one local conventional commit per completed phase. `--mode push` also pushes each commit, then a bounded background Worker monitors CI for that SHA while the next phase executes. Plan completion waits for every monitor.

## Review

`/review` drives code review over GitHub, GitLab, or the local `tuicr` TUI. The repository remote selects the review forge. When requested, `/skill:diffpi-setup` can install GitHub and/or GitLab CLIs and MCP servers.

```text
/review auto [pr-number|pr-url|branch] [--local] [--bg]
/review new [--local] [--base branch] [--bg]
/review edit [pr-number|pr-url|branch] [--local] [--bg]
/review address [target] [--local] [--bg]
/review publish [target] [--local] [--comment|--approve|--request-changes|--close] [--bg]
/review complete [target] [--local|--approve|--reject|--abandon] [--bg]
/review merge [target] [--bg]
```

The skill delegates mechanics to `review_context`, `review_new`, `review_edit`, `review_diff`, `review_gates`, `review_submit`, `review_add_comment`, `review_comments`, `review_respond`, `review_publish`, `review_complete`, `review_merge`, and `review_launch_ui`. Inline `auto` and `address` activate Reviewer on Sol; lifecycle verbs activate Orchestrator on Luna. Reviewer classifies address threads and delegates bounded edits to lightweight workers. `--bg` leaves the current chat mode unchanged and launches a tracked Orchestrator child. The generic `diffpi_template` tool loads bundled templates or user overrides. GitHub and GitLab support review creation and publication. Merge is intentionally GitHub-only and remains separate from publish and complete.

`--local` selects the `tuicr` working-tree review backend. Without it, targets are a PR/MR number, URL, or branch; no target uses the current branch. Local address flows apply fixes without commits; remote address flows use the upstream `/git commit --no-push` workflow before posting draft responses for changed threads. Local reply overlays preserve remote thread IDs until `publish --local` promotes comments and replies to the forge. Remote comments carry a generated-review notice with the exact provider/model route; local comments use `Agent: <provider/model>` as the author.

Local artifacts live in `.diffpi/review/` and use `YYMMDD-<short-head-sha>.md` or `YYMMDD-uncommitted.md` names. `.diffpi` links to `~/.difflab/diffpi/projects/<repository-name>-<identity-hash>/`, so all worktrees for one remote share records while unrelated same-named repositories remain isolated. The launcher opens a repository-scoped mux tab when zellij, tmux, or screen is detected. Without a mux, Zed lazily gets separate exact-argv tasks for full-branch local reviews and remote PR reviews; other environments receive the command to run.

Draft PR bodies use the bundled `review/draft-pr.md` template. Override it at `~/.difflab/diffpi/templates/review/draft-pr.md`. Setup installs the upstream Codevoyant `/git` skill for conventional commit and safe rebase workflows. During package development, run `mise watch //packages/pi:dev`; the task builds and installs the package when its sources change. Run `/reload` in Pi after each successful install.

The package root exports environment and forge lifecycle adapters, review backends, the plan controller and consumer contracts, gate checks, template helpers, tuicr helpers, setup operations, and inline-mode control. Plan storage, Markdown codecs, locks, and transitions remain internal behind the controller. `@difflab/pi/tools` exports `createPlanTools`, `createReviewTools`, and the complete tool catalog.

See the [repository](https://github.com/difflab-io/diffpi) for details.
