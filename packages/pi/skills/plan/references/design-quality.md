# Plan authoring quality

Build from repository evidence. Keep the result compact and useful to a Worker.

## PLAN.md

- Keep intent, requirements, design, references, and numbered phases in `PLAN.md`.
- Give each phase a stable ID, title, objective, prerequisites, and documented phase-wide guardrails (use `None` if there are none). Prerequisites and phase constraints belong in `PLAN.md` only; keep detailed technology, algorithm, and invariant instructions for the brief instead of copying them into both places.
- Put each discrete implementation action in a flat task checkbox with a stable task ID and title. Do not put dependency metadata, steps, file scopes, or acceptance criteria under the checkbox.
- Preserve phase/task ID and order parity in every implementation brief.

## Implementation brief

- Give tasks ordered implementation steps. Add nested `Verify` bullets under the relevant task; verification is part of the task, not a separate task. Every Verify command must be executable when that task finishes: do not require a test file, build artifact, dependency, or command created only by a later task. Use an inline smoke check or move the test creation earlier when needed.
- Put `## Files Affected` immediately after `## Objective` and before `## Tasks`. It is the sole phase-level file scope: include exactly one fenced `text` file tree with a directory root and branches whose file leaves start with `[ADD]`, `[MODIFY]`, `[REMOVE]`, `[MOVE from: old/path]`, or `[VERIFY]`. Do not replace the tree with Markdown bullets or add per-task file scopes. Include acceptance criteria for every task.
- Write `## Implementation Constraints` as useful free-form implementation guidance. Add `### Required Libraries & Technology Choices`, `### Key Algorithm Specifications`, or `### Core Invariants` only when useful; do not require any of them. Do not restate or paraphrase the phase-wide guardrails in `PLAN.md` here; refer to the phase ID when a connection is needed.
- Read back each file after writing it. Normal successive write/edit calls are intentional: incomplete drafts remain visible until the plan is ready.

## Review and repair

Template metadata such as managed revisions or snapshots is not part of the live-file contract. Leave historical plan files untouched; current plans use the direct-file format.

After writing the current `PLAN.md` and all numbered briefs, perform observed read-only structural verification, then invoke the independent `diffpi-plan-reviewer` exactly once per authoring cycle over the complete snapshot. Require the actual completed independent `diffpi-plan-reviewer` result, record its verdict and findings, and compare plan hashes and Git state around it; a reviewer mutation invalidates the round. The reviewer is instructed not to mutate but inherits ambient capabilities, so read-only behavior is a policy, not a sandbox.

The Planner documents each actionable finding and its disposition, repairs it, rereads changed files, and reruns only observed read-only structural verification. Do not automatically rerun the reviewer. Keep the plan DRAFT until explicit finalize/go checks completed review evidence and dispositions. A BLOCKING verdict remains BLOCKING even when repaired; a passing review does not prove source implementation. Human review is optional and is not a replacement for the automated round.

## Contracts and consequences

Describe real API or data-flow changes. If there is no public API change, say so and show the relevant internal contract. Explain before/after invocation, what readers or Workers consume, validation and failure visibility, and at least one concrete trade-off. Do not use scaffold placeholders in a plan marked ready.
