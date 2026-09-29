---
name: review
description: Create, edit, review, address, publish, complete, and merge GitHub/GitLab or local tuicr reviews.
---

# Review

Parse the first non-flag argument as the verb; preserve the exact request and `--local` backend. Aliases: create/draft → new, launch → auto, ready → publish, close → complete, land → merge. Unknown or empty verbs show [help](references/workflows/help.md). Read the selected reference. Never switch an inline profile and never require `--bg` to delegate.

## Dispatch

The main thread handles only help, immediate `status`, `open` (an existing PR/MR), `edit` (opening an existing tuicr UI), material user decisions before dispatch, or a short explicitly approved lifecycle call to publish, complete, or merge with no substantive analysis. `new` (draft creation with target/base checks), `auto` (code review), and `address` (classification, editing, verification and replies) always launch a named attached background Agent (`orchestrator` or `reviewer` as appropriate). If publish/complete/merge needs inspection, verification or further judgment, delegate it too. The coordinator may delegate bounded work further, including multiple disjoint Workers; do not cap it at one child. `auto` and `address` judgment belongs to a Reviewer child; the plan-validation one-round limit does not constrain code review. Worker edits never mutate review lifecycle state.

Before substantive work, check `Agent` and `get_subagent_result` are callable. If unavailable, name the missing capability and stop **before edits**. Pass verb, exact request, absolute repository root, target, backend, `local`, and approved policy to the child with `background: true`; never pass `tools`, `skills`, `extensions`, `isolated`, or other resource allowlists at any depth. A detached shell or second Pi process does not count. Return its job ID immediately, then report its completed result or explicit blocker to the initiating conversation via completion notification or `get_subagent_result`. Partial progress and a stopped/steered child do not establish completion. Gather user choices first; background children return new decisions as blockers rather than asking questions.

Every target-bearing workflow calls `review_context` first, then uses that same target/backend/local/cwd for subsequent calls. The tools own review lifecycle, comments, gates and forge/tuicr integration; do not reimplement them. Report skipped and failed gates honestly. Remote findings stay pending until publish. Do not publish, complete, merge or resolve threads during auto/address. `address` replies use `review_respond(resolve:false)`; remote source edits commit only after checks and user-approved policy, while local edits stay uncommitted.

References: [auto](references/workflows/auto.md), [new](references/workflows/new.md), [open](references/workflows/open.md), [status](references/workflows/status.md), [edit](references/workflows/edit.md), [address](references/workflows/address.md), [publish](references/workflows/publish.md), [complete](references/workflows/complete.md), [merge](references/workflows/merge.md), [help](references/workflows/help.md). `review_merge` is GitHub-only.
