# init

1. Require one short slug and accept an optional `--branch`.
2. Call `plan_init` with the explicit intent and title when supplied. The tool creates only `PLAN.md` and `logs.txt`.
3. Call `plan_annotate` when the annotation launcher is available. Otherwise show its exact fallback command.
4. Report the plan ID and explain that `/plan update <id>` imports annotations and populates the draft.
