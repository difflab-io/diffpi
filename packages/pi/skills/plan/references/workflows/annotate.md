# annotate

1. Call `plan_context` and require an exact selection.
2. Call `plan_annotate`; it uses `tuicr --file PLAN.md`, never `-p` or `--path`.
3. Report the selected plan, session slug, launch result, and copyable fallback command.
4. Tell the user to run `/plan update <plan-id>` when comments are ready.
