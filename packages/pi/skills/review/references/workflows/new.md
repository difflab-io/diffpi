# new

1. Parse an optional PR/MR id or URL, `--local`, and `--working-tree`.
2. Call `review_context` with the same target and backend selection.
3. Call `review_diff` and `review_gates`. With `--local`, the default target is the current branch PR/MR when one exists; otherwise it is the working tree. `--working-tree` always selects staged and unstaged local changes.
4. Review the diff for intent, correctness, slop, and adversarial risk. Build findings as `{ file, line, severity, body, reference }`. Collect unanchorable blocking issues separately.
5. For `--local`, call `review_launch` before `review_submit` so tuicr creates the target session. Call `review_submit` with `local: true`. The tool records the exact active provider/model as the tuicr author and writes `.diffpi/reviews/YYMMDD-<short-head-sha>.md` or `.diffpi/reviews/YYMMDD-local.md`.
6. For a remote review, call `review_submit` without `local`. The tool adds the provider/model disclaimer to every comment and leaves the review pending. Do not publish it in this workflow.
7. Report the artifact path, comment count, backend, and whether the user must run a printed tuicr command.
