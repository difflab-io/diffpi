# address

1. Parse an optional PR/MR id or URL and `--local`.
2. Call `review_context` with the target and backend selection.
3. Call `review_comments`. With `--local`, the tool pulls remote threads or the exact matching tuicr session into `.diffpi/reviews/YYMMDD-<short-head-sha>.md` or `.diffpi/reviews/YYMMDD-local.md`. This Markdown file is the local reply overlay for remote threads.
4. For each comment, inspect the referenced code. Apply a justified fix when the comment requests a change. Answer every question even when no code change is needed.
5. Call `review_respond` for each thread. With `--local`, replies stay in the local overlay until `publish --local`. Without `--local`, replies post to the forge immediately.
6. Pass `question: true` for a question. Question threads remain open after the reply. A non-question remote thread resolves only after its requested change is applied; otherwise pass `resolve: false`.
7. With `--local`, call `review_edit` after replies are recorded so the user can inspect the PR and local draft in tuicr.
8. Report fixed, answered, unresolved, and deferred counts. Do not publish pending comments or replies in this workflow.
