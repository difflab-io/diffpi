# update

## Arguments

- **Invocation:** `/plan update [short-slug] [--branch <name>] [--bg] [instructions...]`
- `[short-slug]` (optional): Plan to update. Omit it only when exactly one plan candidate is selected.
- `--branch <name>` (optional): Branch metadata used to select or update the plan. It does not create or switch branches.
- `--bg` (optional): Whether workflow is running in a bacground agent or main chat thread.
- `[instructions...]` (optional): Natural-language changes to apply after the current plan review.

## Instructions

1. Call `plan_context` with the supplied slug and branch metadata. Infer slug based on recency/chat if not provided.
2. Call `plan_review` before interpreting the supplied instructions. It returns the latest immutable tuicr review dump for the current plan revision. If no review exists, continue with the supplied instructions alone.
3. Apply the review feedback and then the explicit instructions through `plan_update_overview`, `plan_add_phase`, `plan_remove_phase`, or `plan_update_phase`. Updating the plan advances its revision, so the review dump will not be applied again.
4. In foreground mode, use `ask_user_question` for requests which need further discussion. In background mode, do not ask; address with best effort.
5. Call `plan_validate` and address any issues.
6. Tell the user they can continue updating the plan through chat, run `/plan annotate` for another review, finalize with `/plan finalize`, or proceed to implementation.
