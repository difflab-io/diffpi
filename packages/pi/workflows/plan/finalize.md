# finalize

## Arguments

- **Invocation:** `/plan finalize [short-slug]`
- `[short-slug]` (optional): Plan to validate and mark ready. Omit it only when context resolves exactly one plan.

## Instructions

1. Call `plan_context` and use the current persisted plan, including changes authored through chat.
2. Call `plan_annotations` once. This exports the current plan and any annotations to the revision file. If comments are returned, apply them directly using the update workflow's mutation rules, but do not call `plan_annotations` again. Comments can update `PLAN.md` through plan tools or phase implementation files through `write`. If no annotation session exists or no comments are returned, continue directly.
3. Call `plan_validate` with `strict: true`. Address validation issues and stop on unresolved errors or Design above 800 words. Exported annotations are revision history, not a validation blocker.
4. Mark the draft ready with `plan_update_status`.
5. Use one `ask_user_question` call to choose the next action. Choices are foreground execution, background execution, execute later, or continue planning. When execution is selected, also ask for `no-commit`, `commit`, or `push` mode.
6. Call `diffpi_modes_unset` before returning so finalization exits to the default inline mode. For execution, return the exact `/plan go <short-slug> --mode <mode>` command, adding `--bg` for background execution. Do not call `plan_start_execution`; `/plan go` routes execution to Orchestrator.
