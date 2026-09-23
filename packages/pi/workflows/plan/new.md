# new

## Arguments

- **Invocation:** `/plan new <short-slug> [--branch <name>] [--bg] [prompt...]`
- `<short-slug>` (required): Short, stable name used to identify the plan.
- `--branch <name>` (optional): Branch metadata to record on the plan. It does not create or switch branches.
- `--bg` (optional): Whether this is a background agent, or running in chat thread
- `[prompt...]` (optional): Natural-language scope, requirements, or constraints for the plan.

## Instructions

1. Call `plan_context`, then `plan_init` if the supplied plan does not exist.
2. In foreground mode, if `prompt` is not provided, ask the user "What would you like to plan?". If its clear from recent chat or branch name what is going to be worked on, provide options for the user to choose from along with a free text entry option. Use `ask_user_question` only for decisions that materially change scope.
3. In background mode, never ask; record safe assumptions and stop with a blocker if ambiguity cannot be resolved.
4. Once goal is understood, ground the plan in repository files and the supplied prompt if chat has not established this context..
5. Use `plan_update_overview`, `plan_add_phase`, and `plan_update_phase` to create the plan. Use the planning tools to enforce the declared requirements, references, phase dependencies, file scopes, steps, and acceptance criteria; do not write PLAN.md by hand when a tool can make the change.
6. Create one implementation file per phase at `.diffpi/plan/<plan-id>/implementation/phase-<phase-id>.md`. Fill in the implementation template with the phase summary, file tree, public APIs and data contracts, required libraries or algorithms, and implementation constraints. Keep each phase focused on one or two modules or libraries, preferably one. The only exception is when scaffolding structures for new projects/modules/libraries/etc.
7. Keep Design near 300 words and call `plan_validate` in the background.
8. After validation, if in foreground mode, notify the user that you will continue updating the plan with continued conversation. In background mode, finish planning and notify the user that they can explicitly call `/plan update` if they want to make updates and re-enter plan mode. Also notify them to use `/plan finalize` when ready for implementation.
