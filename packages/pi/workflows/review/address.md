# address

1. Read `Arguments.target` and `Arguments.local`.
2. Call `review_context`.
3. In local mode, call `review_dump`. This saves one immutable review revision and removes the completed tuicr session. Apply its feedback to the working tree, run relevant checks, then call `review_launch_ui` with `local: true` to begin the next revision. Local reviews have no replies or resolution state.
4. In remote mode, call `review_comments`. Classify every thread and apply only justified changes. Run relevant checks and commit fixes through `/git commit --no-push` when code changes.
5. For remote threads, call `review_respond` with a concise outcome. Leave the thread open unless the user explicitly requested resolution.
6. Report changed, answered, skipped, and remaining items. Do not publish, complete, or merge.
