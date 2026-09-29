# `/plan annotate`

## Parse arguments

Syntax: `annotate <plan-path>` (no flags required; use an explicit target if supplied).

1. Match `annotate` or clear intent to inspect a plan with a human. Resolve one plan path from explicit input before inferred request/repository context, then a safe default if unique. Do not require a positional path when a single target is evident. Ask via `ask_user_question` only for material ambiguity; route truly insufficient intent to full [help](help.md).

## Steps

1. Open the selected PLAN.md and numbered briefs in `tuicr --file` or a direct-file human review in the foreground. Do not launch an automatic Plan Reviewer.
2. Tie human comments to current plan file paths. Leave plan files, status and checkboxes unchanged. Direct requested edits to a separate explicit `/plan update`, or readiness to `/plan finalize`.
3. Report exact file or review UI failures; do not turn annotation into an automated second reviewer round.
