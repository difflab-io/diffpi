# New Skill

1. Read `../references/writing.md` and apply every rule.
2. Use `ask_user_question` with 2–4 concrete options for any important choice the request leaves unspecified.
3. Check whether the upstream maintainer supplies a skill. If one exists, install it with `npx skills add` and stop.
4. Create `packages/pi/skills/<name>/SKILL.md` with valid frontmatter and a short ordered workflow.
5. Add only the supporting files the workflow needs.
6. Run the `validate` workflow and fix every reported problem.
