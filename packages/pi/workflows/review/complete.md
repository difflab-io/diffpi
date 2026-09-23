# complete

1. Read the typed target, local mode, and lifecycle action from `Arguments`.
2. Call `review_context`.
3. In local mode, call `review_dump` to save the final immutable revision and remove the completed tuicr session.
4. In remote mode, ask for a missing action, then call `review_complete` with `approve`, `reject`, or `abandon`.
5. Report the dump path or remote result. Do not merge.
