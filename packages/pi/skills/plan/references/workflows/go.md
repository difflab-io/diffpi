# go

1. Require a plan slug and call `plan_context`.
2. Read explicit `--bg`, `--commit`, and `--no-commit` choices already parsed by the command.
3. If mode or commit policy is missing in foreground mode, use one `ask_user_question` call for only the missing choices. Never silently default.
4. Background mode never asks. If a required preference is missing, return a blocker with the exact complete command.
5. Call `plan_start_execution` with inline/background mode and commit-per-phase/no-commit policy. Report the execution ID and whether the foreground mode changed.
