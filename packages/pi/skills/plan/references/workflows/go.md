# go

1. Require a plan slug and call `plan_context`.
2. Read explicit `--bg`, `--commit`, and `--no-commit` choices already parsed by the command.
3. If mode or commit policy is missing in foreground mode, use one `ask_user_question` call for only the missing choices. Never silently default.
4. Background mode never asks. If a required preference is missing, return a blocker with the exact complete command.
5. Foreground execution runs in `WORKER` mode. Background execution uses Orchestrator and must preserve the foreground mode.
6. Call `plan_start_execution` with inline/background mode and commit-per-phase/no-commit policy. For `/plan go --bg`, the already-spawned orchestrator must pass `coordinator: current`; normal callers omit it (default `spawn`). Commit-per-phase execution pushes each phase commit, records pending CI, and launches a bounded background Worker to call `plan_watch_ci` while the next phase executes. Collect that monitor before the next push and collect all monitors before completion; failed or timed-out CI blocks execution. When an inline execution marks the plan completed, `plan_update_status` exits to the default mode automatically. Report the execution ID and whether the foreground mode changed.
