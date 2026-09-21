# help

Use these commands:

- `/plan init <short-slug> [--branch <name>]` creates a phase-less draft.
- `/plan new <short-slug> [--branch <name>] [--bg] [prompt...]` creates and populates a plan.
- `/plan update [short-slug] [--branch <name>] [--bg] [instructions...]` applies pending annotations before other instructions.
- `/plan annotate [short-slug]` opens `PLAN.md` with `tuicr --file`.
- `/plan finalize [short-slug]` validates and marks a plan ready.
- `/plan go <short-slug> [--commit|--no-commit] [--bg]` starts execution.
- `/plan help` shows this reference.

`--branch` records or filters a branch. It does not create or switch branches. Background workflows do not ask questions.
