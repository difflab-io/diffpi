# go

1. Require a plan slug and call `plan_context`.
2. Read explicit `--bg`, `--commit`, and `--no-commit` choices already parsed by the command.
3. If mode or commit policy is missing in foreground mode, use one `ask_user_question` call for only the missing choices. Never silently default.
4. Background mode never asks. If a required preference is missing, return a blocker with the exact complete command.
5. For inline execution, switch the active mode to `WORKER`/`WORK` before calling `plan_start_execution`; restore the prior mode after execution. Background execution uses `Orchestrator` and must preserve the foreground mode.
6. Call `plan_start_execution` with inline/background mode and commit-per-phase/no-commit policy. For `/plan go --bg`, the already-spawned orchestrator must pass `coordinator: current`; normal callers omit it (default `spawn`). Report the execution ID and whether the foreground mode changed.
