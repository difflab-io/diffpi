# finalize

## Arguments

- **Invocation:** `/plan finalize [short-slug]`
- `[short-slug]` (optional): Plan to validate and mark ready. Omit it only when context resolves exactly one plan.

## Instructions

1. Call `plan_context` and use the current persisted plan, including changes authored through chat.
2. Call `plan_review` once. If a review exists for the current plan revision, apply its feedback using the update workflow's mutation rules. If no review exists, continue directly.
3. Call `plan_validate` with `strict: true`. Address validation issues and stop on unresolved errors or Design above 800 words.
4. Mark the draft ready with `plan_update_status`.
5. Use one `ask_user_question` call to choose the next action. Choices are foreground execution, background execution, execute later, or continue planning. When execution is selected, also ask for `no-commit`, `commit`, or `push` mode.
6. Call `diffpi_modes_unset` before returning so finalization exits to the default inline mode. For execution, return the exact `/plan go <short-slug> --mode <mode>` command, adding `--bg` for background execution. Do not call `plan_start_execution`; `/plan go` routes execution to Orchestrator.
