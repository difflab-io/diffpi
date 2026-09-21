---
name: plan
description: Create, annotate, validate, update, and execute durable Diffpi plans. Use for /plan workflows, implementation planning, plan annotations, and resumable plan execution.
allowed-tools: ask_user_question plan_context plan_init plan_update_overview plan_add_phase plan_remove_phase plan_update_phase plan_validate plan_annotate plan_annotations plan_ack_annotations plan_update_status plan_start_execution diffpi_modes_set diffpi_modes_unset
---

# plan

Parse the first argument as `init`, `new`, `update`, `annotate`, `finalize`, `go`, or `help`. An empty or unknown verb uses [help](references/workflows/help.md). Read and follow `references/workflows/<verb>.md`.

`--bg` is handled and removed by the `/plan` extension command. A simple background `new`, `update`, or `go` dispatch starts one named planner/orchestrator through the pi-subagents cross-extension RPC; do not add an extra model turn, invoke recursive Pi, or use `/bg --agent`. Background workflows never ask questions. They record safe assumptions and return an actionable blocker for unresolved decisions. For additional delegation, use `Agent`, `get_subagent_result`, and `steer_subagent`; use `SubagentWorkflow` when orchestration must be deterministic and multi-stage. Reserve pi-background-tasks for ordinary long-running shell commands, tests, builds, and servers. Foreground workflows use `ask_user_question` for every choice that cannot be derived from the request; never ask in plain chat.

Use plan tools for every `PLAN.md`, status, log, gate, and annotation mutation. Do not edit managed plan files directly. Validate after authoring. Preserve stable IDs, user prose, completed evidence, and annotation acknowledgement order.
