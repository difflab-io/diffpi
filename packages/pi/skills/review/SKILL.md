---
name: review
description: Create, edit, review, address, publish, complete, and merge GitHub/GitLab or local tuicr reviews. Use for /skill:review, /review, or natural-language review requests.
allowed-tools: read ask_user_question Agent get_subagent_result steer_subagent review_context review_status review_new review_open review_edit review_diff review_gates review_submit review_add_comment review_comments review_respond review_publish review_complete review_merge review_launch_ui diffpi_template
---

# Review

This skill owns the workflow. `/review` only forwards raw arguments to `/skill:review`; never rely on command-side flag parsing or mode activation. Parse the first non-flag argument as the verb and preserve remaining arguments and their order. Normalize `create`, `draft` → `new`; `launch` → `auto`; `ready` → `publish`; `close` → `complete`; `land` → `merge`. `open` and `status` are first-class lifecycle workflows. Empty/unknown verb shows [help](references/workflows/help.md).

`--local` selects the working-tree tuicr backend and **must be preserved** for the selected workflow; without it, use the forge. `--bg` is an execution flag: remove it from the child request and launch exactly one named background Orchestrator through `Agent`, passing verb, arguments, cwd, and an explicit `background: true` instruction. The child executes the workflow once without redispatch or interactive questions; the current foreground role remains unchanged. Without `--bg`, execute directly in this turn. Do not change inline modes or emit a command for the user to paste. Do not launch a multi-agent workflow unless the user explicitly opts into one.

Read [the selected reference](references/workflows/) before acting. Every operational workflow calls `review_context` first with the same target and `local` setting. Use `ask_user_question` only for material decisions not derivable from the request; never ask as plain chat text. `auto` and `address` require reviewer judgment and thread classification; if a background Orchestrator is running, delegate that bounded judgment to a Reviewer via `Agent`, then collect the result. Delegate non-overlapping implementation only where useful. Lifecycle verbs retain the coordinator role. Tools own target selection, templates, comment staging, replies, publication, and forge calls; do not reimplement them with shell commands.

References: [auto](references/workflows/auto.md), [new](references/workflows/new.md), [open](references/workflows/open.md), [status](references/workflows/status.md), [edit](references/workflows/edit.md), [address](references/workflows/address.md), [publish](references/workflows/publish.md), [complete](references/workflows/complete.md), [merge](references/workflows/merge.md), [help](references/workflows/help.md). Keep publication separate from completion and merge; `review_merge` remains GitHub-only.
