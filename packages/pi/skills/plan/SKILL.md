---
name: plan
description: Create, revise, annotate, finalize, and execute durable Diffpi plans. Use for /skill:plan, /plan, or natural-language planning requests.
allowed-tools: read grep find symbol_search module_report read_symbol ask_user_question Agent get_subagent_result steer_subagent plan_context plan_init plan_apply_revision plan_validate plan_review plan_annotate plan_start_execution plan_update_status plan_log_progress plan_run_gates plan_record_ci watch_ci
---

# Plan

This skill owns the workflow. `/plan` only forwards its raw arguments to `/skill:plan`. Do not emit another command to paste or rely on a command handler to select an agent, parse flags, or inject a workflow. Call plan tools directly; never edit managed PLAN.md, implementation briefs, revisions, reviews, or logs with file tools.

Identify the first explicit verb (`init`, `new`, `update`, `annotate`, `finalize`, `go`, `help`) or infer one from the user's request. If the verb or required plan is ambiguous, call `plan_context` and ask only for a material decision using `ask_user_question`. Read exactly the corresponding [workflow reference](references/workflows/) before acting. Preserve the exact incoming user request (and applied review feedback) as revision input; do not paraphrase it.

`new` creates a complete plan without launching an editor; `init` creates a phase-less draft and opens it. For content changes, build a complete candidate and apply it **once per user request** with `plan_apply_revision`. Phase/task status and gates use their dedicated tools and do not constitute a new content revision. Strict `plan_validate` checks document and brief structure, not whether source code implements the plan. `go` calls `plan_start_execution` before any code change; if the plan is draft or on the wrong branch, stop.

`--bg` requests one named background agent through `Agent` (Planner for authoring, Orchestrator for execution); pass the verb, exact arguments, cwd, and a `background: true` instruction. Remove `--bg` from the child's request and explicitly forbid redispatch. Return after launching it. A background child must not ask user questions. If `Agent` is unavailable, stop and report that background execution cannot be started; never silently execute inline. Without `--bg`, execute in the current turn: author as Planner, coordinate go as Orchestrator and delegate bounded Worker tasks; do not assume an inline mode switch occurred. Do not launch a multi-agent workflow unless the user explicitly opts into one.

Operational references: [init](references/workflows/init.md), [new](references/workflows/new.md), [update](references/workflows/update.md), [annotate](references/workflows/annotate.md), [finalize](references/workflows/finalize.md), [go](references/workflows/go.md), [help](references/workflows/help.md).
