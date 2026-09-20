# Planning

## Overview

The planning system stores editable implementation plans in a shared repository store. A plan records intent, design, ordered work, progress, gates, commits, and blockers. Planner authors the plan. Worker implements inline work. Orchestrator coordinates background work.

## Requirements

- Plans use `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/PLAN.md` and `logs.txt`.
- `PLAN.md` contains Intent, Requirements, Design, Implementation, and References.
- Design contains Big Ideas, Key API Addition/Updates, and Consequences.
- Stable HTML markers store revisions, IDs, status, ownership, gates, and commit data.
- Users may edit prose but must preserve markers and unique lowercase IDs.
- Annotation uses `tuicr --file`; `-p` and `--path` are VCS-diff filters.
- Background authoring uses a bounded `0600` context packet and never puts conversation text in process arguments.

## Design

### Storage

The repository `.diffpi` symlink points to the global store at `~/.difflab/diffpi/projects/<repository-id>/`. All worktrees for one repository use the same records. `logs.txt` is append-only JSON Lines. `annotations.json` appears after the first annotation session and stores the tuicr session slug and applied comment IDs.

### Mutations and locks

A short mutation creates a lock directory inside the plan record. It reads the latest plan, checks the expected revision or status, writes a temporary file, flushes it, and renames it. A timeout reports lock ownership. The system does not remove a stale lock without user action. Tests, formatters, linters, tuicr, and Git run without a plan lock. Gate results are rejected when the phase changes while a gate command runs.

### Tools and workflows

Authoring tools are `plan_init`, `plan_update_overview`, `plan_add_phase`, `plan_remove_phase`, and `plan_update_phase`. Execution tools are `plan_log_progress`, `plan_update_status`, `plan_run_gates`, and `plan_start_execution`. Annotation tools are `plan_annotate`, `plan_annotations`, and `plan_ack_annotations`. `plan_validate` checks markers, dependencies, cycles, required work, acceptance criteria, annotations, and Design length.

The `/plan` workflow supports init, new, update, annotate, finalize, and go. Inline execution selects Worker. Background execution launches Orchestrator and preserves the foreground mode. Each coordinator claims a task, writes progress, implements the declared scope, validates the result, and updates status. Independent tasks can run together only when dependencies are complete and file scopes do not overlap.

### Execution and recovery

A phase completes only after its tasks finish, format check/lint/test gates pass or are explicitly skipped, and an optional coordinator commit is recorded. Commit mode requires a clean worktree and never pushes. A crash after Git creates a commit but before the plan records its SHA is recoverable by comparing `HEAD` with `logs.txt`.

Worker stores blockers, attempts, and evidence in the plan. Background execution can ask Planner to revise pending or blocked work at most twice per task. Detached processes never ask users questions; human decisions return to the main thread.

## Implementation

The package exposes the `plan_*` tools, Planner agent, plan skill, `/plan` command, annotation adapter, and `diffpi` CLI. The CLI and extension share plan resolution and tuicr session handling. Review and planning share the tracked background launcher. Review publication promotes local tuicr drafts to forge review comments before submission, including drafts made in a remote PR session opened by `/review edit`.

## References

- [User guide](../user-guide.md#plan-work)
- [`src/plan/`](../../packages/pi/src/plan/)
- [`src/tools/plan.ts`](../../packages/pi/src/tools/plan.ts)
- [`src/commands/plan.ts`](../../packages/pi/src/commands/plan.ts)
- [`src/extensions/tuicrx.ts`](../../packages/pi/src/extensions/tuicrx.ts)
- [Review architecture](review.md)
