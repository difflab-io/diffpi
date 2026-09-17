---
name: review
description: Code review workflows over GitHub, GitLab, or the local tuicr TUI. Use for review open, new, address, publish, complete, merge, or local review requests.
allowed-tools: ask_user_question review_context review_open review_diff review_gates review_submit review_comments review_respond review_publish review_complete review_merge review_launch
---

# review

Parse the first non-flag argument as VERB and preserve remaining flags. Normalize `create`/`draft` to `open`, `ready` to `publish`, and `land` to `merge`. An empty or unknown verb uses `references/workflows/help.md`.

Read and follow `references/workflows/{VERB}.md`. Call `review_context` first in every workflow. Use `ask_user_question` for choices that cannot be derived from the request; never ask those questions as plain chat text.

Workflow index: `open` creates a draft or local session; `new` reviews a diff; `address` handles unresolved comments; `publish` submits pending work; `complete` approves, rejects, closes, or archives; `merge` squash-merges; `help` prints the reference.
