# address

1. Parse an optional PR/MR id or URL and `--local`. The `/review` command has already removed `--bg`.
2. Run this workflow as the reviewer coordinator. Call `review_context` with the target and backend selection.
3. Call `review_comments`. With `--local`, it synchronizes every comment in the selected tuicr session to `.diffpi/review/<session-slug>.md`. Existing replies and statuses remain; source comments removed by the user become resolved ledger entries.
4. Classify every thread, group justified code changes into bounded non-overlapping tasks, and delegate those tasks to lightweight worker agents. Keep questions, outcome decisions, integration, and response text in the reviewer coordinator. With `--local`, workers modify the current working tree without committing. Without `--local`, apply a fix only when the comment requests a change.
5. Respond to every thread with its outcome. Answer questions and leave them open. For substantive requests, state what changed and whether it is resolved, but leave the thread open for reviewer confirmation. For a trivial request, reply `Resolved`; remote threads may close, while the user must delete the local tuicr source comment before the next sync marks it resolved.
6. When a remote address flow changes code, invoke the upstream `/git commit --no-push` workflow after checks pass and before drafting responses. Use `--atomic` when the fixes form separate logical commits.
7. Call `review_respond` for each thread. With `--local`, every response is posted to tuicr and recorded in the session ledger. Without `--local`, replies post to the forge immediately.
8. With `--local`, call `review_launch_ui` with `local: true` after replies are recorded so the user can inspect the working-tree review in tuicr.
9. Report fixed, committed, answered, addressed, resolved, and unresolved counts. Do not publish, complete, or merge in this workflow.
