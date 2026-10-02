# @difflab/pi

Tools and skills for the Pi coding agent.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup` to validate or configure the environment. Setup asks before making changes and reloads Pi when needed. It installs upstream Grounded Docs, Simple English, and Context Mode skills and package-managed agent profiles for the subagent plugin. The package manifest loads every bundled skill and registers `plan_verify`, `review_*`, setup, reload, logging, template, and CI tools without selecting an inline role. Installed package resources and a host's actually callable tools are different facts; if the host withholds `Agent`, `get_subagent_result`, or `plan_verify`, report that exact missing capability. Diffpi does not implement an external Cursor SDK bridge.

If an update leaves copied global agent profiles stale, run `/skill:diffpi-doctor`. It checks the installed package's agents, then uses `diffpi_doctor` to back up and update only changed `diffpi-*.md` profiles. It does not rerun setup or install anything. Reload affected Pi sessions; an existing inline prompt may require a new conversation. Package skills themselves load from the installed package, not copied global files.

## Planning

`/plan` forwards to the bundled `/skill:diffpi-plan`, not an unrelated global `plan` skill. Plans are live `PLAN.md` files plus numbered briefs in `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/`. The old managed plan engine is not shipped; historical files stay on disk.

```text
/plan init <short-slug> [--branch name]
/plan new <short-slug> [prompt...]
/plan update [short-slug] [instructions...]
/plan finalize [short-slug]
/plan go <short-slug> [--mode <no-commit|commit|push>]
/plan help
```

Substantive verbs launch an attached background Planner or Orchestrator by default and return a job ID and completed result to the initiating conversation. Children may delegate further independent tasks with ambient tools, skills, and extensions; there is no one-child limit. The main thread handles help and user decisions. A detached process is not an attached background agent. Background agents cannot ask users questions; an unforeseen decision blocks the job.

`init` leaves an incomplete DRAFT. `new` and `update` write plan files without automatic validation. Before an update changes content, the Planner records feedback and archives the full plan and briefs beside `PLAN.md` under `revisions/`. Explicit `validate` checks structure and obtains one independent Plan Reviewer result per authoring cycle. It keeps review evidence in the response, not in the plan. The original BLOCKING verdict remains BLOCKING after a repair. `finalize` validates a DRAFT before marking it READY. `go` never validates: it changes a DRAFT to READY, reads it back, and starts execution. An existing READY plan starts directly.

The Orchestrator owns plan status, lifecycle, gates, Git, pushes, CI, and reconciliation. It binds execution to the canonical worktree, discovers active or blocked bindings, serializes uncertain or overlapping scopes, and may run disjoint source tasks concurrently. Each Worker receives the absolute plan path, its exact unchecked task line, canonical worktree, and `.diffpi/plan/<plan-id>/logs.jsonl` beside `PLAN.md`; it logs `progress` milestones (or `deviation` only for an actual departure), then marks only its own line after focused checks pass. Targeted edits are not atomic, so the Orchestrator rereads and reconciles evidence after each Worker and barrier; failed or partial tasks remain unchecked. Logs are diagnostic and do not replace source correctness or lifecycle state. `--mode no-commit` is the default. `--mode push` waits for `watch_ci` on each exact pushed SHA before advancing.

## Review

`/review` forwards to the bundled `/skill:diffpi-review`, not an unrelated global `review` skill. Remote workflows call `review_context` first and use GitHub or GitLab forge tools. Local workflows read and edit Markdown files directly without a review backend. Merge is GitHub-only.

```text
/review auto [target] [--local]
/review new [title] [--local] [--base branch]
/review status [target] [--local]
/review edit [target] [--local]
/review address [target] [--local]
/review publish [target] [--comment|--approve|--request-changes|--close]
/review complete [target] [--approve|--reject|--close]
/review merge [target]
```

`new`, `auto`, and `address` launch attached background agents; Reviewer judgment and address edits may delegate to independent Workers. Help/status, gathering user decisions, and short approved lifecycle calls can run in the main thread. Publish, complete, or merge work requiring analysis goes to a child. The plan validation one-round rule does **not** limit PR code review. `auto` stages findings without publishing; `address` responds with `resolve:false`; remote comments remain pending until publish. Local changes stay uncommitted. Local review files live at `.diffpi/review/YYMMDD-{plan-or-ticket}/REVIEW-{n}.md`. Remote `new` fills every section of the packaged PR template before it calls `review_new`. Remote publish and complete are separate: publish CLOSE sends a COMMENT review and closes the PR or MR, while complete close only closes it. Gates and merge checks remain explicit.

Templates may be overridden under `~/.difflab/diffpi/templates/`. Local artifacts use `.diffpi/review/` backed by the shared project store. During package development, build then install this worktree with `mise watch //packages/pi:dev` and reload Pi. The package root exports live-plan verification, forge review tools, setup operations, and templates; `@difflab/pi/tools` exports the direct non-mode tool catalog.

See the [user guide](../../docs/user-guide.md) and [architecture](../../docs/architecture/index.md).
