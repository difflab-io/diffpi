---
name: mode
description: List, select, or clear an inline agent profile. Use when the user invokes /skill:mode or asks to change the current Diffpi mode.
allowed-tools: ask_user_question diffpi_modes_list diffpi_modes_set diffpi_modes_unset
---

# Mode

Route the arguments from the `User:` line without manual command parsing in the extension.

## Direct requests

- If the argument is `help`, `-h`, or `--help`, print the usage and examples below. Do not call a tool.
- If the argument is `clear`, call `diffpi_modes_unset` and stop.
- If the argument is one agent id, call `diffpi_modes_set` with that exact id and stop.
- A qualified id such as `spec:planner` is one agent id. The tool enables skill-agent discovery for it.
- If the request contains multiple agent ids or an unsupported flag, print the usage and stop.

```text
/skill:mode [--include-skills] [agent|clear]
/skill:mode
/skill:mode --include-skills
/skill:mode worker
/skill:mode spec:planner
/skill:mode clear
```

## Picker

Use the picker when there are no arguments or when the only argument is `--include-skills`.

1. Call `diffpi_modes_list`. Set `includeSkills` to true only for `--include-skills`.
2. Call `ask_user_question` with one single-select question. Do not ask as plain chat text.
3. Put the complete list of valid ids in the question text. Offer Default plus at most three relevant agents as structured options. The custom-answer row lets the user enter any other valid id.
4. If the user selects Default or enters `clear`, call `diffpi_modes_unset`.
5. Otherwise, call `diffpi_modes_set` with the selected or entered id.

Do not perform unrelated work. Explain that the selected prompt, preferred available model, thinking level, and tool set start on the next turn. Mode selection is not a security boundary.
