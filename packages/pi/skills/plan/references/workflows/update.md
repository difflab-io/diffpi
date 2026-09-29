# `/plan update`

## Parse arguments

Syntax: `update <slug> <request>` (optional `--plan <plan-path>` or `--target <plan-path>`).

1. Infer revision intent, unique target and requested edits from explicit args/flags first, then natural language and repository context. Do not require inferable positionals. Ask `ask_user_question` in the caller for material ambiguity; send insufficient intent to [help](help.md).

## Steps

If no native subagents are available, ask for explicit confirmation in the caller **before edits** and follow [the inline exception](inline-fallback.md), including chained validation; otherwise stop with a blocker. Never silently revise inline.

1. Resolve the initiating Git root, absolute PLAN.md and numbered brief paths. Fill all placeholders with actual values before launch. Launch `diffpi-planner` on its configured frontier model with explicit **low** thinking and `inherit_context: true` (fork the parent conversation at launch), in the background with ambient capabilities:

```text
Revise only the requested unfinished plan work in a new user-initiated authoring cycle. Do not validate or dispatch a reviewer.
- Exact requested edits: {exact-request}
- Initiating Git root: {repo-root}
- Absolute PLAN.md path: {plan-path}
- Absolute numbered brief paths: {brief-paths}
- Read PLAN.md and all briefs. Preserve stable IDs, dependencies, completed work, prior reviewed snapshots, verdicts, dispositions and execution history. Amend only draft/pending/blocked work; preserve INCOMPLETE if still incomplete.
- Research affected code and make only requested changes. Keep phase prerequisites/constraints (or None), flat task checkboxes and exactly one action-labeled fenced `text` Files Affected tree immediately after Objective in each brief. Keep ordered steps, acceptance criteria, temporally runnable Verify commands and free-form Implementation Constraints.
- Reread files, leave DRAFT, return changed paths and exact result or blocker. Do not ask background questions.
```

2. Collect the completed edit result. On success the caller launches the separate [validate](validate.md) child for this new authoring cycle (one independent review round maximum) and reports its result; leave DRAFT. Do not put review inside the edit child or discard earlier evidence.
