---
name: check-skills
description: Check that project and package skills are compatible with pi. Use when asked to validate, lint, or verify skills.
allowed-tools: ask_user_question
---

# Check Skills

Find each `SKILL.md` under `skills/` and `packages/*/skills/`. Read its YAML frontmatter and report any missing `name` or `description` field. Confirm that each name uses lowercase letters, numbers, and single hyphens, with no more than 64 characters. Confirm that each description is present and has no more than 1024 characters. If a skill asks the user for input, confirm that it uses `ask_user_question` and permits that tool. Use `ask_user_question` when validation requires a user decision; do not ask as plain chat text.
