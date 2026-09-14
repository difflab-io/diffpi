# Validate Skills

1. Read `../references/writing.md` and apply every rule.
2. Find each `SKILL.md` under `.agents/skills/`, `skills/`, and `packages/*/skills/`.
3. Check required frontmatter, name syntax and length, description presence and length, and relative references.
4. If a skill asks for user input, confirm that its frontmatter permits `ask_user_question` and its workflow calls that tool instead of asking as plain chat text.
5. Report each problem with its file path and a concrete correction. If a finding requires a user decision, call `ask_user_question`.
