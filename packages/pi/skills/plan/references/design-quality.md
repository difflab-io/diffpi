# Plan authoring quality

Build the design from repository evidence, not generic slogans. Keep it concise enough to scan, but never shrink a section into an uninformative one-line paragraph just to reach a word count.

## Big Ideas

Use outcome-oriented bullets. Each bullet says what will become different and why it belongs in this plan; do not repeat the phase titles. For example:

- Keep task status and phase ordering in `PLAN.md` so readers can see progress without reading implementation instructions.
- Write one numbered brief per phase so Workers receive concrete steps and file/API contracts.
- Reject incomplete briefs at finalization instead of handing placeholders to execution agents.

## Key API Addition/Updates

Use explanatory paragraphs and illustrative fenced examples showing the actual public call and data contract. Explain which previous call is removed, who calls the new API, what arguments/return value mean, and how errors are surfaced. Do not invent details that the repository has not established; call out a genuine unresolved choice instead. For example:

```ts
await plan_apply_revision({
  mode: 'amend', // use 'create' with shortSlug instead for revision 0
  plan,
  expectedPlanRevision,
  request: { kind: 'user', text: exactRequest },
  title,
  intent,
  requirements,
  design: { bigIdeas, keyApiUpdates, consequences },
  references,
  phases,
  briefs,
});
```

Follow the example with a paragraph describing revision creation and validation, then another covering old mutators or callers being replaced. `mode: 'create'` instead takes `shortSlug` (and optional branch/issue fields) and writes revision 0 directly; `mode: 'amend'` takes `plan` and `expectedPlanRevision` and writes the next revision. Both modes require the same `request`, overview fields, ordered `phases`, and matching `briefs`; there is no `inputs` field and no separate `complete` field. If no public API changes, say so explicitly and show the relevant internal interface or data flow instead.

## Consequences

Write distinct before/after paragraphs: how a user invokes the workflow, what a client or Worker reads/calls, and how failure looks. Describe concrete behavior: editor launch, status transitions, validation, snapshots, and review visibility as applicable. Include at least one trade-off, such as storage cost or compatibility break; do not substitute a generic maintainability claim.

## PLAN.md versus briefs

Under each PLAN.md phase, make **each discrete implementation action a separate stable task checkbox**. Do not embed Steps, File scopes, or Acceptance criteria below its checkbox. In `implementation/phase-<ordinal>.md`, relist every stable task ID and title and provide ordered implementation steps, exact affected files, API/data-contract changes, algorithms/libraries, constraints, and acceptance criteria. A lightweight Worker must be able to implement the task from the brief without guessing. Before finalization, inspect each rendered brief and require strict validation; no scaffold comments or “define during implementation” placeholders are acceptable.
