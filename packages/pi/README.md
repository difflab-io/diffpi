# @difflab/pi

Tools and skills for the pi coding agent.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup`. The skill validates or configures the environment and reloads pi when required.

The package includes structured questions and installs the upstream Grounded Docs, Simple English, and Context Mode skills. Setup also installs package-managed agent profiles into Pi's global agent directory. The subagent plugin can delegate to `tutor`, `copilot`, `worker`, `planner`, `orchestrator`, `reviewer`, and the independent `diffpi-plan-reviewer`; profiles marked for inline use are also available as inline modes.

```text
/mode
/mode reviewer
/mode reset
/skill:mode --include-skills
/skill:mode spec:planner
```

Standard agents come from the same global and trusted-project directories used by `@tintinweb/pi-subagents`. Skill-owned agents are opt-in for listing and use `skill:agent` ids. Inline selection applies the profile prompt, first available preferred model, thinking level, and available tool set. Clearing restores the previous runtime. Override ordered model preferences with `agents.<id>.models` in `~/.difflab/diffpi/config.yaml` or `config.json`, then rerun setup for delegated agents. Inline modes are not a security boundary.

## Planning

`/plan` is a thin alias owned by the package `plan` skill. Current plans are live `PLAN.md` files and numbered briefs under `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/`. Normal file edits make partial drafts visible. The old managed plan engine is not shipped as a runtime API; existing Markdown files remain on disk but are not parsed or migrated by it.

```text
/plan init <short-slug> [--branch name]
/plan new <short-slug> [--branch name] [--bg] [prompt...]
/plan update [short-slug] [--branch name] [--bg] [instructions...]
diffpi plan annotate .diffpi/plan/<YYMMDD-short-slug>/PLAN.md
/plan finalize [short-slug]
/plan go <short-slug> [--mode <no-commit|commit|push>] [--bg]
/plan help
```

The skill selects and verifies the Planner or Orchestrator inline profile for foreground work. `init` leaves a visible incomplete draft. `new` and `update` edit the files incrementally and reread them. `plan_verify` checks structure and task parity without writing or approving anything; one independent, high-thinking, read-only Plan Reviewer then checks quality, risks, and Worker executability. `finalize` and draft `go` mark the plan ready only after both checks pass. `--bg` launches one named background Planner or Orchestrator without changing the foreground mode, and background work never asks questions.

`diffpi plan annotate <PLAN.md|directory>` opens the live plan in `tuicr --file`; it does not save a managed review. Zed setup installs the pinned `diffpi: annotate plan` task. Override the plan template at `~/.difflab/diffpi/templates/plan/PLAN.md`.

`PLAN.md` keeps Design, numbered phases, phase prerequisites, and flat task checkboxes. Each brief contains ordered steps, nested verification, acceptance criteria, and one action-labeled phase file tree as its sole exact file scope. No per-task or `PLAN.md` file scopes. The Orchestrator alone updates execution status, runs project gates, and owns phase Git/CI actions. `--mode commit` creates one local conventional commit per completed phase. `--mode push` pushes each commit and waits for exact-SHA `watch_ci` results before advancing. Workers only edit source/test scopes derived from their task steps and the phase tree; uncertain or overlapping scopes are serialized.

## Review

`/review` is a thin alias owned by the package `review` skill, which routes to the review tools over GitHub, GitLab, or the local `tuicr` TUI. The repository remote selects the review forge. When requested, `/skill:diffpi-setup` can install GitHub and/or GitLab CLIs and MCP servers.

```text
/review auto [pr-number|pr-url|branch] [--local] [--bg]
/review new [--local] [--base branch] [--bg]
/review open [pr-number|pr-url|branch] [--local]
/review status [pr-number|pr-url|branch]
/review edit [pr-number|pr-url|branch] [--local] [--bg]
/review address [target] [--local] [--bg]
/review publish [target] [--local] [--comment|--approve|--request-changes|--close] [--bg]
/review complete [target] [--local|--approve|--reject|--abandon] [--bg]
/review merge [target] [--bg]
```

The skill delegates mechanics to `review_context`, `review_status`, `review_open`, `review_new`, `review_edit`, `review_diff`, `review_gates`, `review_submit`, `review_add_comment`, `review_comments`, `review_respond`, `review_publish`, `review_complete`, `review_merge`, and `review_launch_ui`. Foreground workflows run directly without selecting an inline mode. Reviewer classifies address threads and delegates bounded edits to lightweight workers. `--bg` leaves the current chat mode unchanged and launches a tracked Orchestrator child. The generic `diffpi_template` tool loads bundled templates or user overrides. GitHub and GitLab support review creation and publication. Merge is intentionally GitHub-only and remains separate from publish and complete.

`--local` selects the `tuicr` working-tree review backend. Without it, targets are a PR/MR number, URL, or branch; no target uses the current branch. Local address flows apply fixes without commits; remote address flows use the upstream `/git commit --no-push` workflow before posting draft responses for changed threads. Local reply overlays preserve remote thread IDs until `publish --local` promotes comments and replies to the forge. Remote comments carry a generated-review notice with the exact provider/model route; local comments use `Agent: <provider/model>` as the author.

Local artifacts live in `.diffpi/review/` and use `YYMMDD-<short-head-sha>.md` or `YYMMDD-uncommitted.md` names. `.diffpi` links to `~/.difflab/diffpi/projects/<repository-name>-<identity-hash>/`, so all worktrees for one remote share records while unrelated same-named repositories remain isolated. The launcher opens a repository-scoped mux tab when zellij, tmux, or screen is detected. Mux launches use persistent shells. Editor selection gives a valid `EDITOR` precedence over `VISUAL` and preserves paths as single argv entries. Without a mux, Zed lazily gets separate exact-argv tasks for full-branch local reviews and remote PR reviews; other environments receive the command to run.

Draft PR bodies use the bundled `review/draft-pr.md` template. Override it at `~/.difflab/diffpi/templates/review/draft-pr.md`. Setup installs the upstream Codevoyant `/git` skill for conventional commit and safe rebase workflows. During package development, run `mise watch //packages/pi:dev`; the task builds and installs the package when its sources change. Run `/reload` in Pi after each successful install.

The package root exports environment and forge lifecycle adapters, review backends, read-only live-plan verification, gate checks, templates, tuicr helpers, setup operations, and inline-mode control. `@difflab/pi/tools` exports `planVerifyTool`, `createReviewTools`, and the complete tool catalog.

See the [repository](https://github.com/difflab-io/diffpi) for details.
