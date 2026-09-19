---
name: review
description: Code review workflows over GitHub, GitLab, or the local tuicr backend. Use for auto reviews, review opening and editing, addressing, publishing, completing, merging, or local review requests.
allowed-tools: ask_user_question review_context review_new review_edit review_diff review_gates review_submit review_add_comment review_comments review_respond review_publish review_complete review_merge review_launch_ui diffpi_template
---

# review

Treat `--local` as a backend selector. It always uses the local `tuicr` working-tree backend; without it, the detected GitHub or GitLab forge owns the remote target. Treat `--bg` as an execution selector handled by the `/review` command; it is removed before workflow parsing. Target selection, storage, provenance, templates, comment staging, replies, publication, and forge calls belong to the tools.

Parse the first non-flag argument as VERB and preserve remaining flags. Normalize `open`, `create`, and `draft` to `new`; normalize `launch` to `auto`, `ready` to `publish`, `close` to `complete`, and `land` to `merge`. An empty or unknown verb uses `references/workflows/help.md`.

Read and follow `references/workflows/{VERB}.md`. Call `review_context` first in every workflow. Use `ask_user_question` for choices that cannot be derived from the request. Never ask those questions as plain chat text.

For inline execution, `/review auto` and `/review address` activate the reviewer profile on Sol; lifecycle verbs activate the orchestrator profile on Luna. The reviewer coordinates `address`, classifies every thread, and delegates bounded implementation to lightweight worker agents. With `--bg`, the command leaves the current chat mode unchanged and launches a tracked background orchestrator, which routes `auto` and `address` through the reviewer.

Workflow index: `auto` generates findings and leaves remote comments pending; `new` creates a local review or remote draft PR/MR; `edit` opens an existing local or remote review for the user; `address` fixes local or remote comments, commits remote fixes through `/git`, and records or posts replies; `publish` promotes pending review work; `complete` approves, rejects, abandons, or archives a review without merging; `merge` is the separate GitHub-only merge action; `help` prints the reference.
