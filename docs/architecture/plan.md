# Planning

## Overview

The planning system stores editable implementation plans in a shared repository store. A plan records intent, design, ordered work, progress, gates, commits, and blockers. Planner authors the plan. Worker implements inline work. Orchestrator coordinates background work.

## Storage

Each plan uses `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/`. The repository `.diffpi` symlink points to the global store at `~/.difflab/diffpi/projects/<repository-id>/`. All worktrees for one repository use the same records.

`PLAN.md` is the source of truth. It contains these headings: Intent, Requirements, Design, Implementation, and References. Design contains Big Ideas, Key API Addition/Updates, and Consequences. HTML comments store the schema version, revisions, stable IDs, status, ownership, gates, and commit data. Users can edit prose but must preserve the markers and unique lowercase IDs.

`logs.txt` is an append-only JSON Lines file. Each line is one event with a unique ID, timestamp, actor, plan revision, and optional execution target. `annotations.json` appears after the first annotation session. It stores the tuicr session slug and applied comment IDs.

## Mutations and locks

A short mutation creates a lock directory inside the plan record. It reads the latest plan, checks the expected revision or status, writes a temporary file, flushes it, and renames it. A timeout reports lock ownership. The system does not remove a stale lock without user action.

Tests, formatters, linters, tuicr, and Git run without a plan lock. A gate run records its phase revision before it starts. The store rejects the result if the phase changed while the command ran.

## Tools

Authoring tools are `plan_init`, `plan_update_overview`, `plan_add_phase`, `plan_remove_phase`, and `plan_update_phase`. `plan_context` resolves exact plan IDs or one unique short suffix. It reports ambiguity instead of selecting the newest plan.

Execution tools are `plan_log_progress`, `plan_update_status`, `plan_run_gates`, and `plan_start_execution`. Annotation tools are `plan_annotate`, `plan_annotations`, and `plan_ack_annotations`. `plan_validate` checks markers, dependencies, cycles, required work, acceptance criteria, annotations, and Design length.

## Annotation lifecycle

`/plan annotate` opens the plan with `tuicr --file <PLAN.md>`. The `--path` and `-p` flags filter a VCS diff, so the planning workflow does not use them. The launcher saves the `tuicr-session:` slug.

`/plan update` reads pending comments before it reads other update instructions. Planner applies comments with structured authoring tools. It validates the result and acknowledges only applied comment IDs. Failed or partial work leaves the remaining comments pending.

The `diffpi` binary exposes the same adapter. Use `npx --yes @difflab/pi@<version> plan annotate --cwd <repo>` or `diffpi plan annotations`. Zed setup adds the pinned `diffpi: annotate plan` task.

## Execution states

A draft becomes ready only after strict validation. A ready or blocked plan can start one active execution. The start operation checks the current branch. The `--branch` flag records or filters a branch but does not create or switch it.

Inline execution selects Worker. Background execution launches Orchestrator and does not change the foreground mode. Each coordinator claims a task, writes progress, implements the declared scope, validates the result, and updates status. Independent tasks can run together only when dependencies are complete and file scopes do not overlap.

A phase ends in this order:

1. Complete or skip every task.
2. Run `format:check`, `lint`, and `test` through mise.
3. If a recipe does not exist, record it as skipped.
4. If a gate fails or warns, repair the phase before continuation.
5. If commit mode is active, run `/git commit --yes --no-push` once.
6. Record the commit SHA and subject.
7. Mark the phase complete.

No-commit mode does not invoke Git. Commit mode requires a clean worktree before execution. Diffpi never pushes a phase commit. A crash can occur after Git creates a commit but before the plan records its SHA. If this occurs, compare `HEAD` with the phase log and record the existing commit before resuming.

## Blockers and resume

Worker stores the blocker, attempts, and evidence. It returns a validated Planner escalation payload. Inline execution selects Planner for the next turn. Background execution can ask Planner to revise pending or blocked work at most twice per task.

A detached process never asks a user a question. If the blocker needs a decision or retries end, the plan stays blocked. Run `/plan update <slug>`, then run `/plan go <slug>` with the prior commit policy.

## Limits

The system does not provide plan archive or deletion. It does not compact large logs. A plan file and a Git commit cannot form one atomic transaction.
