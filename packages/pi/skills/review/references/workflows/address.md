# address

**Owner:** background Reviewer with optional background Orchestrator coordination. Reviewer classifies threads and may delegate non-overlapping bounded edits to Workers, who inherit ambient tools. The main thread only dispatches and reports.

1. Call `review_context` first with exact target/backend/local, then `review_comments` with the same values.
2. Reviewer classifies every thread and groups only bounded, non-overlapping requested source changes. Delegate those edits to Workers without capability filters. Workers never commit, reply, publish, complete, merge or resolve; they may delegate independent bounded work where useful. Questions remain open. Report unmatched threads and blockers.
3. Run `review_gates` after edits and report failures/skips. For remote code changes, coordinator invokes upstream `/git commit --no-push` after checks and before replies (`--atomic` for separate logical commits). Local changes stay uncommitted.
4. Coordinator calls `review_respond` for every outcome with `resolve:false`; never resolve or delete threads. With local state, optionally call `review_launch_ui` after replies. Do not publish, complete, or merge.

Report fixed, committed, answered, unresolved, skipped, and failed counts; resolved is always zero.
