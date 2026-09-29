# `/plan update`

**Owner:** background Planner. **Child:** one independent Plan Reviewer per user-initiated authoring cycle.

1. Before edits, require callable `Agent`, `get_subagent_result`, and `plan_verify`; name any missing tool. Select one repository-root plan. Read PLAN.md, all briefs, and the exact user request. Preserve intent, IDs, completed evidence, ownership, order and dependencies. Check that each Verify step can run when its task finishes, without depending on files or commands created only by later tasks.
2. Research affected code, write the requested changes and read files back. Remain DRAFT, with any INCOMPLETE marker visible. A new user requirement is a new authoring cycle; an automatic repair is not.
3. Run read-only `plan_verify`. Capture hashes of every plan file and Git HEAD/status/diff/untracked inventory before and after one whole-plan `diffpi-plan-reviewer` invocation. Require an actual **completed** result and record the reviewed snapshot, verdict, findings and observed child metadata. Reviewer mutation or missing/partial result blocks.
4. Repair actionable findings and record concrete dispositions. Reread changed files and rerun **only** `plan_verify`; record the post-fix snapshot separately. Never automatically reinvoke the reviewer or reinterpret a BLOCKING review as PASS. Leave DRAFT for explicit finalize/go.

Return the background job ID and completed outcome or exact blocker to the initiating conversation. No inline fallback or background questions.
