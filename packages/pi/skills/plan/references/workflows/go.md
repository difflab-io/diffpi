# `/plan go`

## Parse arguments

Syntax: `go <slug> [--mode no-commit|commit|push]` (optional `--plan <plan-path>` or `--target <plan-path>`).

1. Infer execution intent, unique target and mode from explicit args/flags first, then natural language and repository context. Default mode to `no-commit`; never infer commit or push authorization from silence. Do not require an inferable slug. Ask `ask_user_question` in the caller for material ambiguity; send insufficient intent to [help](help.md).

## Steps

If no native subagents are available, ask for explicit confirmation in the caller and follow [the inline exception](inline-fallback.md) for DRAFT readiness and/or READY execution; otherwise stop with a blocker. Never silently execute inline. `/plan go` never invokes validation or a reviewer.

1. Resolve the initiating Git root, the unique absolute PLAN.md and all numbered briefs. Scan shared plans for active or blocked canonical-worktree bindings before changing status; ask the caller to resolve an ambiguous target, another worktree's ownership, rebind, restart, or abandonment. If DRAFT, change only `**Status:** DRAFT` to `**Status:** READY`, reread it, and begin execution without `/plan validate`, structural checks, or a reviewer. If already READY, **skip validate** and skip readiness checks; a separate `finalize` is not required. Reread status. Bind the selected READY plan to the canonical worktree before dispatch. Do not send DRAFT to the orchestrator. Take `<plan-id>` from the selected PLAN.md parent directory, not from old log references in its text. Derive the relative filename `.diffpi/plan/<plan-id>/logs.jsonl`. Confirm that `realpath(<repo-root>/.diffpi/plan/<plan-id>)` equals `realpath(dirname(<absolute PLAN.md>))`, even if PLAN.md was selected through the shared store path; block if they differ. This makes the filename relative to the canonical Git root and places `logs.jsonl` directly beside PLAN.md. Do not create a `logs/` directory.
2. Fill every placeholder with actual request, paths, derived log filename, and chosen mode before launch (no literal placeholders). Launch a medium `diffpi-orchestrator` background agent with ambient capabilities and this prompt:

```text
Execute this READY live plan under the user-approved policy. Do not run a plan reviewer or revalidate READY for readiness.
- Exact request: {exact-request}
- Initiating Git root: {repo-root}
- Absolute READY PLAN.md path: {plan-path}
- Absolute numbered brief paths: {brief-paths}
- Relative log filename: {derived-log-filename} (the `logs.jsonl` sibling of the selected PLAN.md, relative to the canonical Git root)
- Mode: {mode} (no-commit|commit|push)
- Read PLAN.md and every brief; require READY. Own execution metadata and lifecycle, schedule phases after prerequisites, and persist actual results before more work.
- Derive bounded task scopes from steps and each brief's sole action-labeled fenced `text` Files Affected tree; serialize uncertain/overlapping scopes, while disjoint source tasks may run concurrently. Targeted task-line edits are not atomic. Delegate each Worker the absolute PLAN.md path, exact unchecked task line and task ID/title, canonical execution root, and the exact derived relative `logs.jsonl` filename. Require `diffpi_log` calls with `cwd` set to the canonical execution root and `filename` set to that supplied relative path at start, meaningful milestones, verification, and completed/failed/partial return, using `label: progress` by default and `label: deviation` only for an actual departure. Never write new plan events under `logs/` or `.diffpi/logs/`; leave historical logs untouched. Workers edit only assigned source/test files plus their one exact task line; they must search for exactly one literal unchecked line, replace only that line after focused checks pass, reread it, and report a discrepancy for missing, duplicated, changed, or already-checked lines. Failed or partial work remains unchecked.
- After each Worker, and at every phase barrier, reread PLAN.md, validate source and check evidence, and restore only supported completion marks lost to concurrent last-writer-wins edits. Logs and checkboxes alone never advance a phase.
- Run project format, lint and tests after phase work; preserve failures, warnings and attempts; block on failed gates. In no-commit, do not commit or push. In commit, create exactly one phase commit after gates, do not push. In push, commit and push, then wait for settled CI on the exact observed SHA before the next phase. Block on unavailable exact-SHA monitoring, timeout, partial or failed CI. Local gates cannot be replaced by CI.
- Return actual completed results or precise blockers, without background questions.
```

3. Report the job ID and actual completed result or precise background-capability blocker.
