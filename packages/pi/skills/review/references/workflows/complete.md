# complete

1. Parse an optional PR/MR id or URL, `--local`, and exactly one remote action: `--approve`, `--reject`, or `--abandon`. The skill-owned `close` alias follows this workflow. Skill-owned `--bg` dispatch has already occurred; a background child must not redispatch or ask questions. If a remote action is missing in foreground mode, ask the user with `header: "Action"`; all question headers must be 16 characters or fewer. In background mode, stop with a blocker instead of guessing.
2. Call `review_context` first with the same target and `local: true` when `--local` is present, otherwise `local: false`.
3. With `--local`, call `review_complete` with `local: true`. It archives the reply overlay to `.diffpi/reviews/<session-slug>.md`, then deletes the exact persisted tuicr session. This is destructive and prevents its comments from appearing in future tuicr sessions.
4. Without `--local`, map `--approve`, `--reject`, or `--abandon` to the `review_complete` action `approve`, `reject`, or `abandon`. The tool applies the remote lifecycle action but does not merge.
5. Report the archive path or remote result. Do not call `review_merge`.
