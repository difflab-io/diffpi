# help

## Arguments

- **Invocation:** `/plan help`
- This workflow accepts no arguments.

## Instructions

Show these commands:

- `/plan init <short-slug> [--branch <name>]` creates a phase-less draft.
- `/plan new <short-slug> [--branch <name>] [--bg] [prompt...]` creates and populates a plan.
- `/plan update [short-slug] [--branch <name>] [--bg] [instructions...]` applies the current plan review before other instructions.
- `/plan annotate [short-slug]` reviews the plan with tuicr and saves an immutable review dump when tuicr closes.
- `/plan finalize [short-slug]` validates and marks a plan ready.
- `/plan go <short-slug> [--mode <no-commit|commit|push>] [--bg]` starts execution.
- `/plan help` shows this reference.

`--branch` records or filters a branch. It does not create or switch branches. Background workflows do not ask questions.
