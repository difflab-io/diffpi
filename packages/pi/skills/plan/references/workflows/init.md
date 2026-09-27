# Init

1. Resolve the supplied short slug and optional branch, title, intent, issue ID, and URL. `--branch` records metadata; it does not switch branches. Call `plan_context` first and stop if the selected plan already exists.
2. Call `plan_init` with `open: true` and `request: {kind: "user", text: <exact incoming request>}`. The tool creates one phase-less draft and its initial request-scoped revision snapshot, then opens `PLAN.md` in a supported adjacent editor tab. Do not perform additional content mutations for this request.
3. Return the plan ID, clickable path, and actual launch outcome or fallback path. Explain that `annotate` stores a plan review, `update` applies review or further instructions, and `finalize` checks completeness before execution.
