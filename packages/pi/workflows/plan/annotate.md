# annotate

## Arguments

- **Invocation:** `/plan annotate [short-slug]`
- `[short-slug]` (optional): Plan to annotate. Omit it only when context resolves exactly one plan.

## Instructions

1. Call `plan_context` and infer planId from the provided short slug/conversation context. Fall back to looking at available active plan candidates, and ask user which to annotate listing available options.
2. Call `plan_annotate`; it uses `tuicr --file .diffpi/plan/{planId}`, never `-p` or `--path`.
3. Report the selected plan, launch result, and copyable fallback command. Closing tuicr saves one immutable plan review for the current plan revision.
4. Tell the user to run `/plan update <plan-id>` after closing tuicr.
