# `/plan go`

## Parse arguments

Syntax: `go <slug> [--mode no-commit|commit|push]` (optional `--plan <plan-path>` or `--target <plan-path>`).

1. Infer execution intent, unique target and mode from explicit args/flags first, then natural language and repository context. Default mode to `no-commit`; never infer commit or push authorization from silence. Do not require an inferable slug. Ask `ask_user_question` in the caller for material ambiguity; send insufficient intent to [help](help.md).

## Steps

If no native subagents are available, ask for explicit confirmation in the caller and follow [the inline exception](inline-fallback.md) for DRAFT readiness and/or READY execution; otherwise stop with a blocker. Never silently execute inline.

1. Resolve the initiating Git root, absolute PLAN.md and all numbered briefs. If DRAFT, call [validate](validate.md) through its separate frontier/high planner background child with the resolved paths and collect actual completion; on failed/incomplete validation leave DRAFT and stop. On PASS the calling agent checks current evidence, transitions DRAFT → READY and reads back. If already READY, **skip validate**, reviewer and structural revalidation; read status and proceed. Do not send DRAFT to the orchestrator.
2. Fill every placeholder with actual request, paths and chosen mode before launch (no literal placeholders). Launch a medium `diffpi-orchestrator` background agent with ambient capabilities and this prompt:

```text
Execute this READY live plan under the user-approved policy. Do not run a plan reviewer or revalidate READY for readiness.
- Exact request: {exact-request}
- Initiating Git root: {repo-root}
- Absolute READY PLAN.md path: {plan-path}
- Absolute numbered brief paths: {brief-paths}
- Mode: {mode} (no-commit|commit|push)
- Read PLAN.md and every brief; require READY. Own execution status and checkboxes, schedule phases after prerequisites and persist actual results before more work.
- Derive bounded task scopes from steps and each brief's sole action-labeled fenced `text` Files Affected tree; serialize uncertain/overlapping scopes. Delegate disjoint tasks to lightweight `diffpi-worker` background agents with concrete scopes, acceptance checks and ambient capabilities. Collect completed results, escalate blocked work and route bounded fixes; reload plan state before rescheduling. Workers edit only assigned source/test files, never plan lifecycle or commits.
- Run project format, lint and tests after phase work; preserve failures, warnings and attempts; block on failed gates. In no-commit, do not commit or push. In commit, create exactly one phase commit after gates, do not push. In push, commit and push, then wait for settled CI on the exact observed SHA before the next phase. Block on unavailable exact-SHA monitoring, timeout, partial or failed CI. Local gates cannot be replaced by CI.
- Return actual completed results or precise blockers, without background questions.
```

3. Report the job ID and actual completed result or precise background-capability blocker.
