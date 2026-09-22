# annotate

## Arguments

- **Invocation:** `/plan annotate [short-slug]`
- `[short-slug]` (optional): Plan to annotate. Omit it only when context resolves exactly one plan.

## Instructions

1. Call `plan_context` and infer planId from the provided short slug/conversation context. Fall back to looking at available active plan candidates, and ask user which to annotate listing available options.
2. Call `plan_annotate`; it uses `tuicr --file .diffpi/plan/{planId}`, never `-p` or `--path`.
3. Report the selected plan, session slug, launch result, and copyable fallback command.
4. Tell the user to run `/plan update <plan-id>` when comments are ready.
