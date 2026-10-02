# `/plan finalize`

## Parse arguments

Syntax: `finalize <slug>` (optional `--plan <plan-path>` or `--target <plan-path>`).

1. Infer readiness intent and unique target from explicit args/flags first, then natural language and repository context. Do not require an inferable slug. Ask `ask_user_question` in the caller for material ambiguity; send insufficient intent to [help](help.md).

## Steps

If DRAFT and no native subagents are available, ask for explicit confirmation in the caller and follow [the inline exception](inline-fallback.md); a passing inline structural and review/disposition validation under that recorded exception permits READY. Otherwise stop with a blocker. Finalize is the only automatic validation entry point.

1. Resolve the initiating Git root, absolute PLAN.md and numbered briefs. If DRAFT, invoke [validate](validate.md) through its **one** separate frontier/high `diffpi-planner` background child with the resolved path, filling the self-contained fenced `text` prompt in validate.md before launch and collecting the completed result. Do not launch a second child or another reviewer. If validation is incomplete or blocked, leave DRAFT and report the blocker.
2. The **calling agent** (not the child) checks the completed validation result against the current files, then makes the short DRAFT → READY transition and reads it back. If the plan is already READY, read it back without revalidation. Do not execute tasks. Report status and memory-only proof or exact blocker.
