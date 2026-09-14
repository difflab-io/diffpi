---
name: skill
description: Create or validate pi-compatible skills for @difflab/pi. Use "skill new" to scaffold a skill and "skill validate" to check project and package skills.
allowed-tools: ask_user_question
---

# Skill

Parse the first argument as the workflow name. Use `new` or `validate`. If it is missing or unsupported, use `ask_user_question` to select one. Do not ask as plain chat text.

Read and follow `workflows/<workflow>.md`. Both workflows must apply the shared rules in `references/writing.md`.
