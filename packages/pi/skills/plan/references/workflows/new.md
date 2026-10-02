# `/plan new`

## Parse arguments

Syntax: `new <slug> <request>` (optional `--target <plan-path>`, `--issue <id>`, `--issue-url <url>`).

1. Infer creation intent, slug, target, branch, issue and requested outcome from explicit args/flags first, then natural language and repository context, then safe defaults. Do not require inferable positionals. Ask `ask_user_question` in the caller for material ambiguity; send insufficient intent to [help](help.md).

## Steps

If no native subagents are available, ask for explicit confirmation in the caller and follow [the inline exception](inline-fallback.md); otherwise stop with a blocker. Never silently draft inline. The draft may include sibling `revisions/`, but must not create a `logs/` directory. `/plan go` creates `logs.jsonl` beside PLAN.md on its first log append.

1. Resolve the initiating Git root and unique absolute PLAN.md target. Fill every placeholder with actual values before launch (use `none` for absent context). Launch a frontier/high `diffpi-planner` background agent with ambient capabilities:

```text
Draft a complete live plan; do not dispatch a reviewer or mark READY.
- Exact request: {exact-request}
- Initiating Git root: {repo-root}
- Absolute PLAN.md target, branch and issue: {plan-path-and-context}
- Reject collisions; use a flat `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/` directory.
- Inspect the repository and resolve design questions. Write PLAN.md with intent, requirements, design, references, stable phase/task IDs, phase prerequisites and constraints (or None), and flat task checkboxes.
- Write every numbered brief. Put exactly one action-labeled fenced `text` Files Affected tree immediately after Objective. Include ordered task steps, Verify commands runnable before later tasks, acceptance criteria and free-form Implementation Constraints. Do not create `logs/` or an empty log file; execution later appends to `logs.jsonl` beside PLAN.md.
- Reread all files. Leave DRAFT. Return paths and completed result or exact blocker; do not ask background questions.
```

2. Collect the completed draft result. Do not run structural validation or dispatch a reviewer automatically. Leave DRAFT and report the created paths and actual result; the user may request [validate](validate.md) or [finalize](finalize.md) explicitly.
