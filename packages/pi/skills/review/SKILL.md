---
name: review
description: Code review workflows over GitHub, GitLab, or the local tuicr backend. Use for review open, new, edit, address, publish, merge, or local review requests.
allowed-tools: ask_user_question review_context review_open review_edit review_diff review_gates review_submit review_add_comment review_comments review_respond review_publish review_merge review_launch diffpi_template
---

# review

Treat `--local` as a backend selector. The local backend is `tuicr`; the remote backend is the detected GitHub or GitLab forge. Target selection, storage, provenance, templates, comment staging, replies, publication, and forge calls belong to the tools.

Parse the first non-flag argument as VERB and preserve remaining flags. Normalize `create` and `draft` to `open`, `ready` to `publish`, and `land` to `merge`. An empty or unknown verb uses `references/workflows/help.md`. The removed `complete` verb is not an alias.

Read and follow `references/workflows/{VERB}.md`. Call `review_context` first in every workflow. Use `ask_user_question` for choices that cannot be derived from the request. Never ask those questions as plain chat text.

Workflow index: `open` creates a draft PR/MR or opens a local target; `new` generates a review and leaves remote comments pending; `edit` opens an existing target in tuicr without generating comments; `address` fixes comments and records or posts replies; `publish` promotes local drafts and publishes with a status; `merge` is the separate GitHub-only merge action; `help` prints the reference.
