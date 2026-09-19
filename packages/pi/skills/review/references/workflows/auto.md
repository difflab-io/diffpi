# auto

1. Parse an optional PR/MR id or URL and `--local`. The `/review` command has already removed `--bg`. `launch` is an alias for this workflow.
2. Call `review_context` with the same target and backend selection.
3. Call `review_new` to create the local tuicr review or remote draft PR/MR and open its tuicr UI. A remote branch must be clean and pushed. If the review already exists, use `review_edit` to open it.
4. Before reviewing, run `review_gates` so the project's discovered format-check and lint tasks run first, followed by its other gates. Preserve and report failures; do not substitute visual inspection for failed or skipped checks.
5. Run review judgment as the reviewer agent. Inline, the reviewer performs the workflow tool calls directly. In background execution, the orchestrator delegates judgment to the reviewer and retains lifecycle calls. The reviewer fetches the diff with `review_diff` and may launch parallel lightweight subagents for independent areas when useful.
6. Review the change for:
   - whether it accomplishes the stated intent;
   - whether the technical approach is the best practical way to accomplish that intent;
   - correctness, including failure paths and edge cases;
   - code quality, readability, and maintainability;
   - minimality and conciseness, including unnecessary agent-generated changes;
   - documentation accuracy and completeness; and
   - reviewer coordination, including keeping lifecycle ownership clear and avoiding duplicate or conflicting findings.
     Use parallel lightweight workers for independent review areas when useful, then reconcile their results before submission.
7. Produce only grounded findings, then call `review_submit`. Pass `local: true` for local findings; remote findings remain pending for `publish` or `complete`.
8. Report the artifact or pending-review state, finding count, gate results, backend, and any launch instruction. Do not complete or merge the review.
