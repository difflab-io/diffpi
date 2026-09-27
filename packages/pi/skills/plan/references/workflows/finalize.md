# Finalize

1. Call `plan_context` to resolve exactly one persisted plan. Call `plan_review` once for that plan and revision. If a current annotation exists, incorporate its exact feedback as one content request through `plan_apply_revision` before finalizing; do not mutate the plan per individual comment. A stale review must not be applied.
2. Call `plan_validate` with `strict: true` on the resulting revision. Stop if any error remains; this validates plan structure, detailed briefs, and revision snapshots, **not implementation correctness**. Do not mark a plan with empty briefs ready.
3. Call `plan_update_status` to mark the draft `ready`. Do not call `plan_start_execution` until the user chooses execution.
4. In foreground mode, use one `ask_user_question` for next action (execute now in foreground/background, later, or keep planning); if executing, also obtain commit mode (`no-commit`, `commit`, or `push`; default `no-commit` if already specified). If they choose execution, follow the [go workflow](go.md) directly in the selected mode; background execution launches one child, not another slash command. If they choose later or planning, return the ready state. Background finalization cannot ask and must leave execution for an explicit request.
5. No inline mode was selected by a command, so do not unset one as a side effect of finalization.
