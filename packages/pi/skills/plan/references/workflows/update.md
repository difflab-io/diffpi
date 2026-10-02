# `/plan update`

## Parse arguments

Syntax: `update <slug> <request>` (optional `--plan <plan-path>` or `--target <plan-path>`).

1. Infer revision intent, unique target and requested edits from explicit args/flags first, then natural language and repository context. Recognize requests such as “update the existing plan with this feedback”, “revise PLAN.md”, and “apply these review notes to the cache plan” as update intent. Resolve a unique plan by slug, explicit path, branch, or repository context; do not require inferable positionals. Treat metadata and natural-language examples as routing guidance, not a guarantee. Ask `ask_user_question` in the caller for material ambiguity; send insufficient intent to [help](help.md).

## Steps

When the request names an existing plan but omits a slug, inspect repository plan directories and use the only unambiguous match. Do not silently choose among multiple plans; ask the caller to select one.

If no native subagents are available, ask for explicit confirmation in the caller **before edits** and follow [the inline exception](inline-fallback.md); otherwise stop with a blocker. Never silently revise inline.

1. Resolve the initiating Git root, absolute PLAN.md and numbered brief paths. Fill all placeholders with actual values before launch. Before substantive edits, the planner must append the exact supplied feedback under `### Feedback`, reread PLAN.md, and archive the complete feedback-bearing PLAN.md plus every numbered brief under `.diffpi/plan/<plan-id>/revisions/rev-NNNN/`. The archive is create-only inside the live plan directory: reuse an existing directory only after byte-for-byte verification of PLAN.md and the complete brief set; otherwise stop for reconciliation. Never overwrite an archive. Launch `diffpi-planner` on its configured frontier model with explicit **low** thinking and `inherit_context: true` (fork the parent conversation at launch), in the background with ambient capabilities:

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

2. Collect the completed edit result. Do not launch validation or a reviewer automatically. Leave DRAFT and report changed paths and the exact result; the user may request [validate](validate.md) or [finalize](finalize.md) explicitly. Do not discard earlier evidence.
