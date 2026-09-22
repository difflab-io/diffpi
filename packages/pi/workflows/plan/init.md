# init

## Arguments

- **Invocation:** `/plan init <short-slug> [--branch <name>]`
- `<short-slug>` (required): Short, stable name used to identify the plan.
- `--branch <name>` (optional): Branch metadata to record on the plan. It does not create or switch branches.

## Instructions

1. Call `plan_init` with the supplied slug and branch metadata. Include explicit intent, title and issue tracker id/url when available. The tool creates only `PLAN.md`.
2. Open `PLAN.md` in supported IDEs/terminals/multiplexers in a new or available chat-adjacent tab. Skip to next step if IDE/terminal/mux is unsupported.
3. Report the plan ID and path (clickable link so users can click to open in their environment) and explain that `/plan update` imports annotations and populates the draft in PLAN mode. Plan update is iterative via chat as well in PLAN mode until the `/plan finalize` command is called.
