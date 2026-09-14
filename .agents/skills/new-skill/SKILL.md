---
name: new-skill
description: Scaffold a pi-compatible skill for @difflab/pi when no upstream skill exists. Use when asked to create, add, or start a new skill.
allowed-tools: ask_user_question
---

# New Skill

Create a new skill under `packages/pi/skills/<name>/`.

## Steps

1. If the request leaves a skill decision unspecified, use `ask_user_question` with 2–4 concrete options. Do not ask as plain chat text.
2. Check whether the upstream maintainer supplies a skill. If one exists, install it with `npx skills add`; do not create a wrapper.
3. Choose `<name>`: lowercase letters, numbers, and hyphens only. No leading, trailing, or double hyphens. Max 64 chars.
4. Create the file `packages/pi/skills/<name>/SKILL.md`:

   ```markdown
   ---
   name: <name>
   description: What it does and when to use it. Be specific. Max 1024 chars.
   ---

   # <Title>

   ## Steps

   1. First step.
   2. Second step.
   ```

5. Keep it short. Put extra files in `scripts/`, `references/`, or `assets/` and link to them with relative paths.
6. `name` and `description` are required. The description tells pi when to load the skill, so say what it does and when to use it.
7. Check it with the `check-skills` skill.
