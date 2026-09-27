# auto

**Owner/tier:** foreground high-tier Reviewer-coordinator; background Orchestrator coordinates and delegates one high-tier Reviewer child. No source edits.

1. Parse target and `--local` (and let the skill handle `--bg` before this file). Call `review_context` first, then keep exact target/backend/local/cwd.
2. Call `review_new`; if the review already exists, call `review_edit`. Call `review_gates`, then `review_diff`.
3. Reviewer judges intent, correctness, edge cases, quality, minimality, docs, and duplicate findings. Report every gate failure or skip. Submit only grounded findings with `review_submit`; remote findings remain pending. Do not call publish, complete, merge, or resolve threads.

On missing target/backend, unsupported forge, failed creation, or failed gates, preserve state, report exact evidence, and stop or continue only with clearly reported skipped checks. Return artifact, backend, gate results, and finding count.
