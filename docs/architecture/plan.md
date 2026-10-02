# Planning

## Live files

Diffpi stores each live plan in `.diffpi/plan/<plan-id>/`. `PLAN.md` holds intent, requirements, design, references, phases, constraints, and task checkboxes. Numbered briefs live in `implementation/`. Each brief includes a Files Affected tree, task steps, verification commands, and acceptance criteria. The shared `.diffpi` link lets worktrees see the same plan.

Before `/plan update` changes content, the Planner records the exact feedback in `PLAN.md`. It then archives the complete plan and briefs in the sibling `revisions/rev-NNNN/` directory without overwriting older revisions. The Planner increments the live revision once. Historical files remain in place.

## Dispatch and ownership

`/plan` routes to the bundled plan skill. `init` creates an incomplete DRAFT through a bounded Worker. `new` and `update` use a Planner. None of these verbs starts validation. `update` uses low thinking and receives the caller's context. `validate` and `finalize` use a separate Planner to inspect the plan. `go` runs a READY plan through an Orchestrator. When a DRAFT enters `go`, the caller changes only its status to READY and reads it back. `go` does not run validation or a plan review.

Workers receive bounded file scopes from their task steps and Files Affected trees. They edit their assigned source and tests, then run focused checks. After those checks pass, a Worker changes only its exact unchecked task line and reads it back. The Orchestrator owns execution metadata, phase scheduling, reconciliation, project gates, Git, push, and continuous integration (CI). The default `go` mode makes no commit. Commit and push modes require explicit authorization; push waits for settled CI on each exact pushed commit.

If native subagents are unavailable, the caller asks for explicit approval before inline work. A failed child or a failed check does not permit an automatic fallback.

## Optional validation

`/plan validate` is explicit and available for a DRAFT or READY plan. `/plan finalize` invokes it for a DRAFT before changing the status to READY. A Planner runs a structural check and, at most once per authoring cycle, obtains an independent completed Plan Reviewer result. The Planner compares plan hashes and Git state before and after the review. It records the verdict, findings, and dispositions in the validation response only. It does not add proof to the live plan or revision archive.

If a reviewer reports BLOCKING findings, later edits do not turn that verdict into PASS. The Planner can report resolved dispositions and check the repaired structure, but it must describe the original verdict accurately. Validation does not execute plan tasks. A READY plan stays READY during an explicit validation request.

## Execution progress

The live plan records the active execution state and canonical worktree. Each Worker writes milestones to `.diffpi/plan/<plan-id>/logs.jsonl` directly beside `PLAN.md` through the generic `diffpi_log` tool. Each line contains a `message` and an optional `label`. Workers use `progress` for normal work and `deviation` for an actual departure. The old `logs/` directory remains untouched for historical plans. New execution logs do not go in that directory. Logs do not replace checked source, tests, or gates.

The Orchestrator runs prerequisite phases first. It can run disjoint tasks at the same time, but it serializes shared or uncertain file scopes. After each Worker, it reads the plan and reconciles only completions supported by checks. Failed or partial tasks stay unchecked. The execution metadata prevents another worktree from silently taking over an active plan.

## References

- [User guide](../user-guide.md#plan-work)
- [`packages/pi/src/plan/`](../../packages/pi/src/plan/)
- [Review architecture](review.md)
