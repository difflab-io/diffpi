# new

1. Require a short slug. Call `plan_context`, then `plan_init` if the plan does not exist.
2. Ground the plan in repository files and the explicit prompt. If no prompt was supplied, use the current conversation or the bounded context packet supplied by the command.
3. In foreground mode, use `ask_user_question` only for decisions that materially change scope. In background mode, never ask; record safe assumptions and stop with a blocker if ambiguity cannot be resolved.
4. Use `plan_update_overview`, `plan_add_phase`, and `plan_update_phase`. Give every phase and task a stable ID, dependencies, file scopes, steps, and acceptance criteria. Do not leave research tasks.
5. Keep Design near 300 words and call `plan_validate`. Leave the result as a draft for annotation or finalization.
