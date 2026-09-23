# go

## Arguments

- **Invocation:** `/plan go <short-slug> [--mode <no-commit|commit|push>] [--bg]`
- `<short-slug>` (required): Plan to execute.
- `--mode no-commit` (optional, default): Execute without creating commits.
- `--mode commit` (optional): Create one local commit after each completed phase. Do not push or monitor remote CI.
- `--mode push` (optional): Create and push one commit after each completed phase, then monitor remote CI before completion.
- `--bg` (optional): Launch the execution Orchestrator in the background and preserve the current foreground mode.

## Instructions

1. Call `plan_context` with the supplied slug.
2. Read the requested commit mode from `--mode`. Use `no-commit` when the flag is omitted. Do not ask the user to select a commit mode.
3. Reject values other than `no-commit`, `commit`, or `push`. The command parser normally performs this validation before invoking the workflow.
4. The command has already selected the foreground Orchestrator or launched the background Orchestrator. Continue as the current Orchestrator and launch implementation Workers as needed.
5. Call `plan_start_execution` with the selected commit mode. This tool initializes durable execution state and returns the execution packet. It does not select a mode, send another turn, or launch an agent.
6. In `no-commit` mode, do not create or push commits. In `commit` mode, create one local commit after each phase passes its gates, but do not push or monitor remote CI. In `push` mode, commit and push each phase, record pending CI, and launch a bounded background Worker to call `watch_ci` for the exact commit and then `plan_record_ci` for the phase while the next phase executes. Collect that monitor before the next push and collect all monitors before completion; failed or timed-out CI blocks execution.
7. For foreground execution, call `diffpi_modes_unset` after the plan is completed. Background execution must not change the foreground mode. Report the execution ID and selected commit mode.
