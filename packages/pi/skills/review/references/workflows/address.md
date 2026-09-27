# address

**Owner/tier:** foreground high-tier Reviewer-coordinator; background Orchestrator coordinates and delegates bounded low-thinking Workers. Reviewer classifies threads; Workers may edit source only.

1. Call `review_context` first with exact target/backend/local, then `review_comments` with the same values.
2. Reviewer classifies every thread and groups only bounded, non-overlapping requested source changes. Delegate those edits to Workers. Workers never commit, reply, publish, complete, merge, resolve, or recurse. Questions remain open. Report unmatched threads and blockers.
3. Run `review_gates` after edits and report failures/skips. For remote code changes, coordinator invokes upstream `/git commit --no-push` after checks and before replies (`--atomic` for separate logical commits). Local changes stay uncommitted.
4. Coordinator calls `review_respond` for every outcome with `resolve:false`; never resolve or delete threads. With local state, optionally call `review_launch_ui` after replies. Do not publish, complete, or merge.

Report fixed, committed, answered, unresolved, skipped, and failed counts; resolved is always zero.
