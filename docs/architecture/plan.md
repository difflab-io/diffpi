# Planning

## Live files

The direct-file plan workflow stores PLAN.md and numbered phase briefs in one flat `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/` directory. PLAN.md contains intent, requirements, design, references, ordered phases, phase prerequisites and constraints (or None), and flat task checkboxes. Each brief puts one action-labeled fenced `text` Files Affected tree immediately after Objective, followed by ordered task steps, nested verification, acceptance criteria and free-form Implementation Constraints. Workers derive bounded file scopes from that tree and task steps. Historical managed-plan files are not migrated or parsed.

## Dispatch and ownership

`/plan` forwards to a skill, not an inline role selector. The main thread answers help, gathers material user decisions, or opens optional human annotation UI; `init`, `new`, `update`, `finalize`, and `go` always dispatch an attached background Planner or Orchestrator. A child may delegate further independent bounded work without filters on tools, skills, or extensions. A detached shell or second Pi instance is not an attached background child. The initiating conversation receives the job ID and actual completed result or precise blocker. If callable `Agent`, `get_subagent_result`, `plan_verify`, or another required tool is unavailable, name it before edits instead of doing substantive work inline. A child cannot ask interactive questions; an unexpected decision is returned as a blocker.

Planner authors and repairs live plan files. Orchestrator alone changes execution status and task checkboxes and owns format/lint/test gates, Git and CI policy. Workers edit bounded source/test scopes, never plan files or commits. Phase prerequisites gate scheduling, and overlapping or uncertain scopes serialize; disjoint work may run concurrently. `go --mode no-commit` is the default; `commit` creates a phase commit after gates and `push` also waits on CI for the exact pushed SHA. Code Reviewer handles PR/MR code review separately.

## One independent Plan Reviewer round

`init` leaves an incomplete DRAFT. For each `new` or user-initiated `update` authoring cycle, Planner finishes and rereads the full draft, runs read-only `plan_verify`, and calls exactly one independent `diffpi-plan-reviewer` on that snapshot. Before and after the completed child result, the coordinator captures plan file hashes plus Git HEAD, porcelain status, diff and untracked-file inventory. The result records the reviewed snapshot, actual verdict and findings. Reviewer mutation invalidates that round; behavioral no-mutation instructions are not a sandbox, and claimed model/tool identities are not runtime attestation. A queued, partial, steered, stopped or missing result does not count as completed.

Planner documents each finding and its concrete disposition in References or a linked durable artifact. It repairs actionable findings, rereads changed files, and reruns **only** structural `plan_verify` on the post-fix snapshot. Never automatically invoke the Plan Reviewer again for those repairs. A BLOCKING verdict remains BLOCKING even after all findings are resolved; post-fix structural validity is not a second reviewer PASS. Keep the plan DRAFT.

Only an explicit `finalize` or draft `go` may write READY. Reread current plan files and the evidence. Require a completed review from this authoring cycle, explained changes since review, concrete dispositions for every blocking finding, and `plan_verify` on current files. Missing evidence, unexplained changes, unresolved blockers or failed verification leave DRAFT. Finalize stops after READY; go marks READY before Worker execution. Already-ready files still receive current structural verification. This rule does not limit `/review` code review iterations. An external host can hide a registered tool; package tests do not prove a Cursor SDK bridge is present.

## References

- [User guide](../user-guide.md#plan-work)
- [`packages/pi/src/plan/`](../../packages/pi/src/plan/)
- [Review architecture](review.md)
