# update

## Arguments

- **Invocation:** `/plan update [short-slug] [--branch <name>] [--bg] [instructions...]`
- `[short-slug]` (optional): Plan to update. Omit it only when exactly one plan candidate is selected.
- `--branch <name>` (optional): Branch metadata used to select or update the plan. It does not create or switch branches.
- `--bg` (optional): Whether workflow is running in a bacground agent or main chat thread.
- `[instructions...]` (optional): Natural-language changes to apply after pending annotations.

## Instructions

1. Call `plan_context` with the supplied slug and branch metadata. Infer slug based on recency/chat if not provided.
2. Call `plan_annotations` before interpreting the supplied instructions. This will create a record of the revision at .diffpi/plan/{planId}/revisions/{revisionId}.md with the original plan and exported annotations. A missing annotation session means there is no annotation work, and there's no need to track revisions. Updates can be based on the supplied instructions alone.
3. Apply changes for each unambiguous pending comment, then the explicit instructions, through `plan_update_overview`, `plan_add_phase`, `plan_remove_phase`, or `plan_update_phase`. This will update PLAN.md for the plan.
4. In foreground mode, use `ask_user_question` for requests which need further discussion. In background mode, do not ask; address with best effort.
5. Once all change requests/annotations are resolved, call `plan_validate`. Address any issues.
6. Let user know they can continue updating the plans through continued chat, annotation, save and exit plan mode with `/plan finalize`, or proceed to implementation.
