# update

1. Call `plan_context`. Omit the slug only when exactly one candidate is selected.
2. Call `plan_annotations` before interpreting prompt instructions. A missing annotation session means there is no annotation work.
3. Apply each unambiguous pending comment, then the explicit instructions, through `plan_update_overview`, `plan_add_phase`, `plan_remove_phase`, or `plan_update_phase`. Preserve stable IDs and completed evidence.
4. In foreground mode, use `ask_user_question` for unresolved product decisions. In background mode, do not ask; persist and return a blocker.
5. Call `plan_validate`. Only after successful application, call `plan_ack_annotations` with exactly the applied comment IDs and a concise summary. Failed or partial updates leave unhandled IDs pending.
