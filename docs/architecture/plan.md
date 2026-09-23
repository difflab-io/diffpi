# Planning

## Overview

The planning system stores editable implementation plans in a shared repository store. A plan records intent, design, ordered work, progress, gates, commits, and blockers. Planner authors the plan. Worker implements inline work. Orchestrator coordinates background work.

## Requirements

- Plans use `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/PLAN.md` and `logs.txt`.
- `PLAN.md` contains Intent, Requirements, Design, Implementation, and References.
- Design contains Big Ideas, Key API Addition/Updates, and Consequences.
- Stable HTML markers store revisions, IDs, status, ownership, gates, and commit data.
- Users may edit prose but must preserve markers and unique lowercase IDs.
- Plan review uses `tuicr --file`; `-p` and `--path` are VCS-diff filters.
- Closing tuicr stores one immutable review dump for the reviewed plan revision. Reviews have no reply or resolution state.
- Background authoring uses pi-subagents in-process RPC with inherited context and a named Planner; it does not create packets or recursive Pi processes.

## Design

The plan workflow exposes one durable document API and two execution paths:

```mermaid
flowchart LR
  User --> Commands["/plan init|new|update|annotate|finalize|go"]
  Commands --> Tools[plan_* tools]
  Tools --> Store[Plan store + lock]
  Tools --> Operations[Status and CI operations]
  Tools --> Markdown[Markdown codec]
  Tools --> Planner[Planner]
  Tools --> Worker[Worker / inline mode]
  Tools --> Orchestrator[Orchestrator / background mode]
  Annotate["tuicr --file"] --> Review[Immutable plan review]
```

The plan module has no controller facade. `PlanStore` owns file access and locked mutations. Plain operations apply status and CI transitions. The plan tools call the store, operations, Markdown codec, and plan-review adapter directly.

### Storage

The repository `.diffpi` symlink points to the global store at `~/.difflab/diffpi/projects/<repository-id>/`. All worktrees for one repository use the same records. `logs.txt` is append-only JSON Lines. Each plan revision can have one immutable plan review at `reviews/<revision>.json`. The dump stores the reviewed plan source and exact tuicr output.

### Mutations and locks

A plan mutation creates a temporary lock directory because all worktrees share the same `.diffpi` store. The mutation reads the latest plan, checks the expected revision or status, writes a temporary file, renames it, and removes the lock. Logs append directly, and plan reviews use write-once files without the mutation lock. Gate results are rejected when the phase changes while a gate command runs.

### Tools and workflows

Authoring tools are `plan_init`, `plan_update_overview`, `plan_add_phase`, `plan_remove_phase`, and `plan_update_phase`. Execution tools are `plan_log_progress`, `plan_update_status`, `plan_run_gates`, `plan_record_ci`, and `plan_start_execution`. The generic `watch_ci` tool observes hosted CI without changing plan state. Review tools are `plan_annotate` and `plan_review`. `plan_validate` checks markers, dependencies, cycles, required work, acceptance criteria, and Design length. The separate `diffpi_log` tool provides project-scoped progress, issue, and deviation channels for non-plan workflows such as flows; it is an activity log, not another task system.

The `/plan` command supports init, new, update, annotate, finalize, go, and help through package-owned workflows in `workflows/plan/`. Foreground init, new, and update select Planner; annotate, finalize, and help select Worker; go selects Orchestrator, which launches and coordinates implementation Workers. Background execution launches one named Orchestrator through `src/extensions/subagentx.ts`, the adapter for `@tintinweb/pi-subagents` public RPC v2, and preserves the foreground mode. `plan_start_execution` only initializes durable execution state and returns an execution packet; command invocation owns foreground and background routing. The extension cannot launch workflow children through RPC, so the Orchestrator invokes `SubagentWorkflow` itself for deterministic pipelines, safe parallel workers, structured outcomes, and gates. Plan tools remain the durable source of truth.

### Execution and recovery

A phase completes only after its tasks finish, format check/lint/test gates pass or are explicitly skipped, and an optional coordinator commit is recorded. Commit mode requires a clean worktree, pushes every phase commit, and records pending CI on the phase. A bounded background Worker runs `watch_ci` for the exact SHA and records the result with `plan_record_ci` while the next phase executes. The coordinator collects it before the next push; plan completion requires every phase CI result to pass or be explicitly skipped because no supported forge or commit checks exist. A crash after Git creates or pushes a commit but before the plan records its SHA is recoverable by comparing `HEAD`, its upstream, and `logs.txt`.

Worker stores blockers, attempts, and evidence in the plan. Worker-to-orchestrator escalation uses the generic `subagentx` correlation contract; plan, phase, and task identifiers are metadata rather than a plan-only transport. Background execution can ask Planner to revise pending or blocked work at most twice per task. Background agents never ask users questions; human decisions return to the main thread.

## Implementation

The package exposes the `plan_*` tools, Planner agent, plan skill, `/plan` command, review dump adapter, and `diffpi` CLI. The CLI and extension share plan resolution and immutable tuicr review storage. Review and planning share the pi-subagents RPC adapter for named coordinators. Review publication promotes local tuicr drafts to forge review comments before submission, including drafts made in a remote PR session opened by `/review edit`.

## References

- [User guide](../user-guide.md#plan-work)
- [`src/plan/`](../../packages/pi/src/plan/)
- [`src/plan/operations.ts`](../../packages/pi/src/plan/operations.ts)
- [`src/tools/plan.ts`](../../packages/pi/src/tools/plan.ts)
- [`src/commands/plan.ts`](../../packages/pi/src/commands/plan.ts)
- [`src/plan/parser.ts`](../../packages/pi/src/plan/parser.ts)
- [`src/extensions/subagentx.ts`](../../packages/pi/src/extensions/subagentx.ts)
- [`src/extensions/tuicrx.ts`](../../packages/pi/src/extensions/tuicrx.ts)
- [Review architecture](review.md)
