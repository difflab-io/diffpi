---
name: review
description: Code review workflows over GitHub, GitLab, or local tuicr revision dumps. Use for auto reviews, review opening and editing, addressing, publishing, completing, merging, or local review requests.
allowed-tools: ask_user_question review_context review_new review_edit review_diff review_gates review_submit review_add_comment review_comments review_dump review_respond review_publish review_complete review_merge review_launch_ui
---

# review

Use the exact package workflow supplied by the `/review` command. Do not look for workflow files inside this skill.

Call `review_context` first. Treat `--local` as a working-tree tuicr flow. A completed local session becomes one immutable review dump; applying feedback starts a new revision. Local reviews have no thread ledger, replies, resolution state, or remote promotion.

Without `--local`, use the detected GitHub or GitLab target directly. Stage findings, read forge threads, post replies, publish status, and perform lifecycle actions through the remote review tools.

Use `ask_user_question` only for decisions that cannot be derived. Inline `auto` and `address` run under Reviewer; lifecycle workflows run under Orchestrator. Background execution is already routed by the command and must not change the foreground mode.
