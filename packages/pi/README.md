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
diffpi plan annotate .diffpi/plan/<YYMMDD-short-slug>/PLAN.md
/plan finalize [short-slug]
/plan go <short-slug> [--mode <no-commit|commit|push>]
/plan help
```

Substantive verbs launch an attached background Planner or Orchestrator by default and return a job ID and completed result to the initiating conversation. Children may delegate further independent tasks with ambient tools, skills, and extensions; there is no one-child limit. The main thread handles help, user decisions, and optional human plan annotation. A detached process is not an attached background agent. Background agents cannot ask users questions; an unforeseen decision blocks the job.

`init` leaves an incomplete DRAFT. Each `new` or user-initiated `update` cycle writes files incrementally, runs read-only `plan_verify`, and invokes **one** independent Plan Reviewer over the complete snapshot. Before and after review, compare file hashes and Git state; a reviewer mutation invalidates the round. The reviewer is instructed not to mutate but has full ambient tools, not a sandbox. Planner documents each finding and its disposition, repairs, rereads changed files, and reruns only structural verification; it does not automatically review fixes again. The original BLOCKING verdict remains BLOCKING. DRAFT changes to READY only on explicit `finalize` or `go` after current verification and every blocking disposition is documented. Repaired text has not received a second reviewer PASS.

Orchestrator alone updates plan status and checkboxes during execution. It serializes overlapping scopes, delegates independent tasks, runs format/lint/test gates, and handles user-approved commits or pushes. `--mode no-commit` is the default. `--mode push` waits for `watch_ci` on each exact pushed SHA before advancing. Workers never edit plan state or commit.

## Review

`/review` forwards to the bundled `/skill:diffpi-review`, not an unrelated global `review` skill. Every target-bearing workflow calls `review_context` first, preserving target, backend, cwd, and `--local`. The package supports GitHub/GitLab forge reviews and local `tuicr` sessions; merge is GitHub-only.

```text
/review auto [target] [--local]
/review new [title] [--local] [--base branch]
/review open [target] [--local]
/review status [target] [--local]
/review edit [target] [--local]
/review address [target] [--local]
/review publish [target] [--local] [--comment|--approve|--request-changes|--close]
/review complete [target] [--local|--approve|--reject|--abandon]
/review merge [target]
```

`new`, `auto`, and `address` launch attached background agents; Reviewer judgment and address edits may delegate to independent Workers. Help/status, opening an existing PR or review UI, gathering user decisions, and short approved lifecycle calls can run in the main thread. Publish, complete, or merge work requiring analysis goes to a child. The plan validation one-round rule does **not** limit PR code review. `auto` stages findings without publishing; `address` responds with `resolve:false`; remote comments remain pending until publish. Local changes stay uncommitted. Review tools own forge and tuicr mechanics, gates, publication, and merge checks.

Templates may be overridden under `~/.difflab/diffpi/templates/`. Local artifacts use `.diffpi/review/` backed by the shared project store. During package development, build then install this worktree with `mise watch //packages/pi:dev` and reload Pi. The package root exports live-plan verification, review backends, setup operations, and templates; `@difflab/pi/tools` exports the direct non-mode tool catalog.

See the [user guide](../../docs/user-guide.md) and [architecture](../../docs/architecture/index.md).
