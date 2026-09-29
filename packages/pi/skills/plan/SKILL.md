---
name: plan
description: Create, revise, review, finalize, and execute live Diffpi plans with direct files and one verified plan reviewer.
---

# Plan

Route the verb and remaining request to its workflow. Fuzzy-match recognizable natural language; treat argument shapes as hints, not rigid gates.

| Input                                        | Workflow                                     |
| -------------------------------------------- | -------------------------------------------- |
| `init <slug> [--branch <branch>]`            | [init](references/workflows/init.md)         |
| `new <slug> <request>`                       | [new](references/workflows/new.md)           |
| `update <slug> <request>`                    | [update](references/workflows/update.md)     |
| `annotate <plan-path>`                       | [annotate](references/workflows/annotate.md) |
| `validate <slug>`                            | [validate](references/workflows/validate.md) |
| `finalize <slug>`                            | [finalize](references/workflows/finalize.md) |
| `go <slug> [--mode no-commit\|commit\|push]` | [go](references/workflows/go.md)             |
| `help`, missing or unrecognizable request    | [help](references/workflows/help.md)         |

Follow the selected workflow. For `init`, `new`, `update`, DRAFT `validate`, `finalize`, or `go` when no native subagents are available, follow [the explicit inline exception](references/workflows/inline-fallback.md) only after the caller obtains confirmation; never silently fall back.
