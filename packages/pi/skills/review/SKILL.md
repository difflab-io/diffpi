---
name: diffpi-review
description: Create, edit, review, address, publish, complete, and merge GitHub/GitLab or local tuicr reviews.
---

# Review

Infer the verb from the request. Route it with its arguments to the selected workflow:

| Command                                                                         | Reference                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------- |
| `new [title] [--intent text] [--base branch] [--local]`                         | [new](references/workflows/new.md)           |
| `auto [target] [--local]`                                                       | [auto](references/workflows/auto.md)         |
| `address [target] [--local]`                                                    | [address](references/workflows/address.md)   |
| `publish [target] [--local] [--comment\|--approve\|--request-changes\|--close]` | [publish](references/workflows/publish.md)   |
| `complete [target] [--local\|--approve\|--reject\|--abandon]`                   | [complete](references/workflows/complete.md) |
| `merge [target]`                                                                | [merge](references/workflows/merge.md)       |
| `status [target] [--local]`                                                     | [status](references/workflows/status.md)     |
| `open [target] [--local]`                                                       | [open](references/workflows/open.md)         |
| `edit [target] [--local]`                                                       | [edit](references/workflows/edit.md)         |
| `help`                                                                          | [help](references/workflows/help.md)         |

Map `create`/`draft` → `new`, `launch` → `auto`, `ready` → `publish`, `close` → `complete`, `land` → `merge`. Route missing or unrecognizable intent → [help](references/workflows/help.md). For substantive work without native subagents, use the selected workflow's [foreground fallback](references/workflows/foreground-fallback.md) only after explicit confirmation.
