---
name: diffpi-plan
description: Create, revise, validate, finalize, and execute live Diffpi plans. Use for natural-language requests to change an existing plan, apply feedback, or update plan tasks; inspect the named plan before editing and do not claim routing guarantees.
---

# Plan

Route the verb and remaining request to its workflow. Fuzzy-match recognizable natural language; treat argument shapes as hints, not rigid gates. Requests such as “update the cache plan with this feedback”, “revise PLAN.md”, and “apply review notes to the existing plan” should route to `update` when a unique existing plan can be identified. Metadata and examples improve discovery, but do not guarantee host routing; preserve the explicit `/skill:diffpi-plan` form when deterministic selection matters.

| Input                                        | Workflow                                     |
| -------------------------------------------- | -------------------------------------------- |
| `init <slug> [--branch <branch>]`            | [init](references/workflows/init.md)         |
| `new <slug> <request>`                       | [new](references/workflows/new.md)           |
| `update <slug> <request>`                    | [update](references/workflows/update.md)     |
| `validate <slug>`                            | [validate](references/workflows/validate.md) |
| `finalize <slug>`                            | [finalize](references/workflows/finalize.md) |
| `go <slug> [--mode no-commit\|commit\|push]` | [go](references/workflows/go.md)             |
| `help`, missing or unrecognizable request    | [help](references/workflows/help.md)         |

Follow the selected workflow. `new`, `update`, and `go` do not auto-validate; `finalize` validates before readiness, and `validate` is explicit and memory-only. For `init`, DRAFT `validate`, `finalize`, or `go` when no native subagents are available, follow [the explicit inline exception](references/workflows/inline-fallback.md) only after the caller obtains confirmation; never silently fall back.
