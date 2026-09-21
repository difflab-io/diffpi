# complete

1. Parse an optional PR/MR id or URL, `--local`, and exactly one remote action: `--approve`, `--reject`, or `--abandon`. `close` is an alias for this workflow. If the action is omitted, ask the user with `header: "Action"`; all question headers must be 16 characters or fewer.
2. Call `review_context` with the same target and backend selection.
3. With `--local`, call `review_complete` with `local: true`. It archives the reply overlay to `.diffpi/reviews/<session-slug>.md`, then deletes the exact persisted tuicr session. This is destructive and prevents its comments from appearing in future tuicr sessions.
4. Without `--local`, map `--approve`, `--reject`, or `--abandon` to the `review_complete` action `approve`, `reject`, or `abandon`. The tool applies the remote lifecycle action but does not merge.
5. Report the archive path or remote result. Do not call `review_merge`.
