---
name: diffpi-review
description: Create, edit, review, address, publish, complete, and merge GitHub/GitLab or local Markdown reviews.
---

# Review

Local reviews are ordinary Markdown files. For local work, read [the packaged template](templates/REVIEW.md) and [review conventions](references/review-standards.md), then use the native `read`, `write`, `edit`, and shell operations. Resolve a unique plan or ticket, ask on ambiguity, inspect existing files before best-effort numbering, and preserve existing finding IDs, replies, and checkbox state. Remote reviews use forge-backed tools and templates. Do not introduce a parser, backend, allocator, lock, sidecar, or database.

Infer the verb from the request. Route it with its arguments to the selected workflow:

| Command                                                                         | Reference                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------- |
| `new [title] [--intent text] [--base branch] [--local]`                         | [new](references/workflows/new.md)           |
| `auto [target] [--local]`                                                       | [auto](references/workflows/auto.md)         |
| `address [target] [--local]`                                                    | [address](references/workflows/address.md)   |
| `publish [target] [--local] [--comment\|--approve\|--request-changes\|--close]` | [publish](references/workflows/publish.md)   |
| `complete [target] [--local\|--approve\|--reject\|--close]`                     | [complete](references/workflows/complete.md) |
| `merge [target]`                                                                | [merge](references/workflows/merge.md)       |
| `edit [target] [--local]`                                                       | [edit](references/workflows/edit.md)         |
| `help`                                                                          | [help](references/workflows/help.md)         |

Map `create`/`draft` → `new`, `launch` → `auto`, `ready` → `publish`, `close` → `complete`, `land` → `merge`. Local `publish` and `complete` are unsupported; reject them explicitly. Remote edit reports the URL and never launches a browser. Route missing or unrecognizable intent → [help](references/workflows/help.md). For substantive work without native subagents, use the selected workflow's [foreground fallback](references/workflows/foreground-fallback.md) only after explicit confirmation.
