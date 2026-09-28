# Plan authoring quality

Build from repository evidence. Keep the result compact and useful to a Worker.

## PLAN.md

- Keep intent, requirements, design, references, and numbered phases in `PLAN.md`.
- Give each phase a stable ID, title, objective, and prerequisites. Prerequisites belong to phases only.
- Put each discrete implementation action in a flat task checkbox with a stable task ID and title. Do not put dependency metadata, steps, file scopes, or acceptance criteria under the checkbox.
- Preserve phase/task ID and order parity in every implementation brief.

## Implementation brief

- Give tasks ordered implementation steps. Add nested `Verify` bullets under the relevant task; verification is part of the task, not a separate task.
- Put all exact file scopes in the single phase-level file tree; do not add per-task file scopes. Include acceptance criteria for every task.
- Put libraries and algorithms under **Implementation Constraints**.
- Include exactly one fenced `text` phase-level directory tree. Label every file leaf with one of `[ADD]`, `[MODIFY]`, `[REMOVE]`, `[MOVE from: path]`, or `[VERIFY]`.
- Read back each file after writing it. Normal successive write/edit calls are intentional: incomplete drafts remain visible until the plan is ready.

## Review and repair

Template metadata such as revision snapshots and managed markers is not an authoring requirement. Treat their removal as a legacy compatibility change: the existing managed parser will stop recognizing these templates until the follow-on source migration adds a replacement contract. Report that break explicitly; do not preserve metadata in the templates solely to hide it.

After writing the current `PLAN.md` and all numbered briefs, independently invoke exactly one VERIFIED frontier/high-thinking `diffpi-plan-reviewer` in read-only mode. The reviewer checks structure and parity, action labels, whole-plan quality, consistency and risk, and whether every task is executable by a lightweight Worker without guessing, in one pass. Do not replace this with cheap separate reviewers or tiered checks.

The Planner repairs actionable findings and reruns the same reviewer within bounded attempts. A passing review does not prove that source code implements the plan. `annotate` is optional human review; it does not replace the automated reviewer.

## Contracts and consequences

Describe real API or data-flow changes. If there is no public API change, say so and show the relevant internal contract. Explain before/after invocation, what readers or Workers consume, validation and failure visibility, and at least one concrete trade-off. Do not use scaffold placeholders in a plan marked ready.
