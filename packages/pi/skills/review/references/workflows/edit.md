# edit

This workflow is local-only. It opens a review target in tuicr without generating findings or changing existing comments.

1. Parse an optional PR/MR id or URL and `--working-tree`.
2. Call `review_context` with `local: true` and the supplied target.
3. Call `review_edit`. With no target, the tool opens the current branch PR/MR when one exists and otherwise opens working-tree changes.
4. If an id or URL names a PR/MR on another branch, the tool requires a clean worktree, fetches that branch, and switches the current worktree before it opens tuicr.
5. Report whether tuicr opened in a mux, prepared a Zed task, or returned a command for the user to run.
