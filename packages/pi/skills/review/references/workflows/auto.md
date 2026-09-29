# auto

**Owner:** background Reviewer, optionally coordinated by a background Orchestrator. No source edits. The main thread only dispatches and reports the completed result.

1. Require callable `Agent` and `get_subagent_result` before substantive work; otherwise name the missing tool and stop. Parse target and `--local`. Call `review_context` first, then keep exact target/backend/local/cwd.
2. Call `review_new`; if the review already exists, call `review_edit`. Call `review_gates`, then `review_diff`.
3. Reviewer judges intent, correctness, edge cases, quality, minimality, docs, and duplicate findings. Report every gate failure or skip. Submit only grounded findings with `review_submit`; remote findings remain pending. Do not call publish, complete, merge, or resolve threads.

On missing target/backend, unsupported forge, failed creation, or failed gates, preserve state, report exact evidence, and stop or continue only with clearly reported skipped checks. Return artifact, backend, gate results, and finding count.
