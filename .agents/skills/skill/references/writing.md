# Skill Writing Rules

- Use an upstream skill when its maintainer supplies one. Install it with `npx skills add`; do not copy or wrap it.
- Put project-authored package skills under `packages/pi/skills/<name>/SKILL.md`.
- Use lowercase letters, numbers, and single hyphens for names. Do not use leading, trailing, or double hyphens. The maximum length is 64 characters.
- Include `name` and `description` in YAML frontmatter. Keep the description within 1024 characters and state what the skill does and when pi should load it.
- Keep the main file short. Put supporting content in `scripts/`, `references/`, or `assets/` and link to it with relative paths.
- When a skill needs user input, permit and call `ask_user_question`. Do not implement another questionnaire or ask as plain chat text.
