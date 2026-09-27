# status

**Owner/tier:** lifecycle coordinator, read-only.

Call `review_context` first with the exact target/backend/local, then `review_status` with the same values. Report branch, worktree, forge/local review, URLs, and tuicr state. Missing or unsupported targets are errors; status never creates, publishes, completes, merges, or changes comments.
