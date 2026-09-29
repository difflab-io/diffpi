---
name: plan
description: Create, revise, review, finalize, and execute live Diffpi plans with direct files and one verified plan reviewer.
---

# Plan

`/plan` forwards raw arguments. Parse `init`, `new`, `update`, `annotate`, `finalize`, `go`, or `help`; infer only unambiguous natural language. Preserve the exact request. Read the selected reference first. Never switch inline profiles. The command alias only forwards arguments.

## Dispatch and capabilities

The invoking main thread may answer help, ask material questions with `ask_user_question`, or open an optional human review UI (`annotate`). Every other verb (`init`, `new`, `update`, `finalize`, `go`) is substantive: check that `Agent` is callable and launch a named attached background child (`planner` for authoring/finalize; `orchestrator` for go) with `background: true`. Pass the verb, exact request, absolute repository root, target plan path, and execution policy (`no-commit` by default). Do not read or edit plan files, assess quality, or execute tasks in the main thread. Do not pass `tools`, `skills`, `extensions`, `isolated`, or other capability filters to Agent at any depth. A worker may delegate further independent bounded work; there is no one-child limit. A shell process, detached Pi instance, or unrelated task runner is not an attached background Agent.

Report the returned job ID immediately, then relay its completed result or exact blocker in the originating conversation through the plugin's completion notification or `get_subagent_result`. A queued/running/steered/partial/stopped child is not completed. An unexpected user decision must return as a blocker; background agents never ask interactive questions. If `Agent`, `get_subagent_result`, `plan_verify`, or another required callable tool is unavailable, name that tool **before** substantive edits. A missing host capability cannot be supplied by Diffpi. Do not silently run substantive work inline.

## Live plan and authoring

Plans live under the initiating nested Git root at `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/`, not nested date/slug directories. Use direct file reads and edits; retain phase constraints, task IDs and order, dependencies, completed evidence, and the numbered briefs' single fenced action-labeled Files Affected trees. `INCOMPLETE` is a marker in a DRAFT, not another status. Planner owns authoring and repairs; Orchestrator alone updates execution status and checkboxes. Worker edits only its declared source/test scope, never plan state or commits.

For each `new`/`update` authoring cycle, finish and reread the draft, run read-only `plan_verify`, and invoke **exactly one** independent `diffpi-plan-reviewer` over the whole snapshot. Wait for an actual completed child result with findings. Before and after that review, hash all plan files and capture Git HEAD, porcelain status, and diff (including untracked-file inventory); if the reviewer mutates files or evidence is incomplete, invalidate the round and block. The reviewer has full ambient tools but is behaviorally prohibited from mutation; this is not a sandbox. Persist the snapshot identity, completed verdict and findings, and each finding's disposition under References (or link to a durable artifact). Planner may repair actionable findings, reread changed files and rerun only `plan_verify`; **never automatically review those repairs again**. Record the post-fix structural verification and snapshot separately. A BLOCKING review stays BLOCKING even when its findings are resolved; do not claim a post-fix reviewer PASS. The plan remains DRAFT. A separate user-initiated plan change starts a new cycle.

Only an explicit `finalize` or draft `go` may move DRAFT to READY. Reread live files, require the completed review evidence, resolved dispositions for all blocking findings, explained changes since review, and `plan_verify` on the current files. Do not invoke a second reviewer. Mark READY before Worker dispatch for go; finalize stops at READY. A plan with missing/partial reviewer evidence or unexplained changes stays DRAFT. Already-READY plans still require current structural verification.

## Execution

`go --mode no-commit|commit|push` defaults to `no-commit`. Orchestrator schedules phases after prerequisites, serializes uncertain/overlapping task scopes, and may fan out disjoint Workers. Run project format, lint and tests; preserve exact failures. Only with user-approved `commit`/`push` may Orchestrator make a phase commit; for push, watch CI on the exact pushed SHA and wait for settlement before continuing. `watch_ci` is not a substitute for local gates. A failed gate blocks execution. Do not apply the one-round plan policy to PR/MR code review.

References: [init](references/workflows/init.md), [new](references/workflows/new.md), [update](references/workflows/update.md), [annotate](references/workflows/annotate.md), [finalize](references/workflows/finalize.md), [go](references/workflows/go.md), [help](references/workflows/help.md).
