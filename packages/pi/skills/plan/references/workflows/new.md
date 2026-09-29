# `/plan new`

**Owner:** background Planner; main thread only gathers material decisions and dispatches. **Child:** one independent `diffpi-plan-reviewer` round per authoring cycle.

1. Before edits, require callable `Agent`, `get_subagent_result`, and `plan_verify`; name any missing tool and stop. Pass the exact request, repository root and target to the attached background Planner without resource filters. Resolve a unique flat `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/` under the initiating Git root; reject collisions.
2. Research the repository, write PLAN.md and numbered briefs, and read every file back. Keep phase constraints in PLAN.md, and each brief's single action-labeled fenced `text` tree immediately after Objective. Ensure each task's Verify commands are runnable at that point in the ordered tasks; a test file created only by a later task cannot be used to verify an earlier task. Leave status DRAFT.
3. Run read-only `plan_verify` and repair structural failures. Capture plan file hashes and Git HEAD/status/diff/untracked inventory. Spawn exactly one independent Plan Reviewer against the whole snapshot, without tools/skills/extensions filters; wait for the **completed** child result and record its verdict/findings and runtime evidence. Capture the same state afterward; any reviewer mutation, missing/partial child result, or unexplained change invalidates the round.
4. Repair actionable findings, document a disposition for each under References (or linked durable artifact), reread every changed file, and rerun `plan_verify` on the post-fix snapshot. Do **not** automatically invoke the reviewer again. The original BLOCKING verdict remains BLOCKING even when its findings are resolved. Keep DRAFT; only explicit finalize/go can mark READY.

Report the child job ID and final completed result or precise blocker to the initiating conversation. No foreground fallback, automatic second review, or fabricated PASS.
