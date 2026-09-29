# `/plan new`

## Parse arguments

Syntax: `new <slug> <request>` (optional `--target <plan-path>`, `--issue <id>`, `--issue-url <url>`).

1. Infer creation intent, slug, target, branch, issue and requested outcome from explicit args/flags first, then natural language and repository context, then safe defaults. Do not require inferable positionals. Ask `ask_user_question` in the caller for material ambiguity; send insufficient intent to [help](help.md).

## Steps

If no native subagents are available, ask for explicit confirmation in the caller and follow [the inline exception](inline-fallback.md), including chained validation; otherwise stop with a blocker. Never silently draft inline.

1. Resolve the initiating Git root and unique absolute PLAN.md target. Fill every placeholder with actual values before launch (use `none` for absent context). Launch a frontier/high `diffpi-planner` background agent with ambient capabilities:

```text
Draft a complete live plan; do not dispatch a reviewer or mark READY.
- Exact request: {exact-request}
- Initiating Git root: {repo-root}
- Absolute PLAN.md target, branch and issue: {plan-path-and-context}
- Reject collisions; use a flat `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/` directory.
- Inspect the repository and resolve design questions. Write PLAN.md with intent, requirements, design, references, stable phase/task IDs, phase prerequisites and constraints (or None), and flat task checkboxes.
- Write every numbered brief. Put exactly one action-labeled fenced `text` Files Affected tree immediately after Objective. Include ordered task steps, Verify commands runnable before later tasks, acceptance criteria and free-form Implementation Constraints.
- Reread all files. Leave DRAFT. Return paths and completed result or exact blocker; do not ask background questions.
```

2. Collect the completed draft result. On success run [validate](validate.md) once in this authoring cycle, using the resolved plan path; its own child owns the independent review round. Leave DRAFT even on validation PASS. Report actual result and blockers, not just the job ID.
