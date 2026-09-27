---
name: plan
description: Create, revise, review, finalize, and execute live Diffpi plans with direct files and one verified plan reviewer.
allowed-tools: read grep find write edit ask_user_question Agent get_subagent_result steer_subagent diffpi_modes_set diffpi_modes_status bash ctx_execute ctx_execute_file watch_ci
---

# Plan

`/plan` forwards raw arguments to this skill. Parse the first explicit verb (`init`, `new`, `update`, `annotate`, `finalize`, `go`, `help`); for unknown or empty input, infer a verb from a clear natural-language request. Use `help` only when neither verb nor intent is identifiable; when plan/intent is ambiguous, ask one structured material-decision question. Preserve the exact incoming user request for the Planner. Read the matching reference first. Keep the alias handler thin. Git and project tasks run through `bash` (or the upstream git skill); do not invent tool names for tasks, format, lint, test, CI, or push.

## Roles and preflight

- **Planner** authors and repairs live `PLAN.md` and numbered briefs with frontier/high thinking.
- **diffpi-plan-reviewer** is exactly one independent frontier/high, read/search-only child. It first calls `diffpi_modes_status` and returns actual model, thinking, and tools evidence, then reviews structure, parity, action labels, quality, risk, and Worker executability. Reject missing or unverifiable evidence; do not use a fallback reviewer.
- **Orchestrator** owns go coordination, live-file checkboxes/status, project gates, Git, push, and CI. **Worker** edits only its declared source/test scope and never changes plan files or commits.

For foreground authoring, call `diffpi_modes_set` for the Planner; on the next model turn call `diffpi_modes_status` and stop if the switch or evidence is unavailable. For foreground `go`, do the same for the Orchestrator. `--bg` launches exactly one named same-session child with `Agent` (Planner for `init/new/update/finalize`, Orchestrator for `go`), passing the exact verb, target, cwd, mode, and `background: true`; remove `--bg`. The child never redispatches, asks questions, or falls back inline.

## Live-file contract

Plans live under the initiating nested Git root in a unique date/slug directory. Resolve collisions before writing. Use ordinary `read`/`write`/`edit` calls, read every file back, and preserve intent, IDs, completed evidence, order, dependencies, scopes, and constraints. Edit only live plan files; never managed records, plugin source, tests, or profiles. `INCOMPLETE` is a visible marker inside an open `DRAFT`, not a status enum.

`new` and `update` review the complete current draft with one reviewer, repair actionable findings, and rerun that same reviewer only within bounded attempts. They remain `DRAFT` after a successful review. `finalize` writes `READY` only after its review passes. `go` reviews and repairs a draft before execution, then writes `READY`; an already-ready plan is reread as-is. No retired `plan_*` calls, freezing, or hashing.

## Execution

`go --mode no-commit|commit|push` defaults to `no-commit`. The Orchestrator is the only writer of plan status/checkboxes and coordinates Workers. A draft gets one reviewer and must be repaired/re-reviewed before ready. Schedule a phase only after all prerequisites complete; dispatch one bounded Worker per eligible task. Serialize tasks with overlapping scopes; safe independent tasks may run concurrently only when scopes do not overlap and prerequisites are satisfied. Run project format, lint, test, and CI checks via `bash`/`ctx_execute` as appropriate. On any failure, preserve the exact command/output, attempts, and affected role and block.

With `commit`, after gates pass make one phase commit. With `push`, push it and call `watch_ci` for that exact SHA; do not push the next phase until settled. `--bg` has one child only and that child does not redispatch. No stateful plan tools.

Read: [init](references/workflows/init.md), [new](references/workflows/new.md), [update](references/workflows/update.md), [annotate](references/workflows/annotate.md), [finalize](references/workflows/finalize.md), [go](references/workflows/go.md), [help](references/workflows/help.md).
