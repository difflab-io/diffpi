# `/plan finalize`

**Owner:** background Planner; no new reviewer round.

1. Explicit `finalize` authorizes a READY transition, not a second review. Before edits require callable `Agent`, `get_subagent_result`, and `plan_verify`; name missing tools. Select one plan; reread PLAN.md, all numbered briefs, its durable review evidence and dispositions.
2. Require one actual completed whole-plan `diffpi-plan-reviewer` result from this authoring cycle. Check its reviewed snapshot against the recorded plan hashes and Git state. If reviewer mutation, missing/partial result, unexplained change, or unresolved BLOCKING finding remains, stop in DRAFT. A review with BLOCKING findings stays BLOCKING after repairs; require concrete dispositions for each, not a rewritten PASS.
3. Run read-only `plan_verify` on the **current** files. A failed verification blocks READY. The post-fix structural PASS does not mean repaired content passed independent review. If all checks and dispositions pass, write READY and read it back; do not execute.

Return the background job ID, resulting status and exact evidence or blocker. Do not reinvoke the reviewer merely because documented repairs changed the files.
