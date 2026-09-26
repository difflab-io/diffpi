# `/plan annotate`

## PLAN.md task

Review the selected plan in tuicr and save one immutable review.

## Brief

1. Call `plan_context` and resolve the exact plan ID from the slug or conversation; ask the user only if candidates remain ambiguous.
2. Call `plan_annotate` using the plan file; it owns the tuicr session and review artifact.
3. Report the selected plan, launch result, and copyable fallback command. Tell the user to run `/plan update <plan-id>` after closing tuicr.
