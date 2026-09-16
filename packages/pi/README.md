# @difflab/pi

Tools and skills for the pi coding agent.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup`. The skill validates or configures the environment and reloads pi when required.

The package includes structured questions and installs the upstream Grounded Docs, Simple English, and Context Mode skills. Setup also installs four package-managed agent files into Pi's global agent directory. The subagent plugin can delegate to `tutor`, `copilot`, `worker`, and `orchestrator`; tutor, copilot, and worker are also available as inline modes.

```text
/skill:mode
/skill:mode --include-skills
/skill:mode tutor
/skill:mode spec:planner
/skill:mode clear
```

Standard agents come from the same global and trusted-project directories used by `@tintinweb/pi-subagents`. Skill-owned agents are opt-in for listing and use `skill:agent` ids. Inline selection applies the profile prompt, first available preferred model, thinking level, and available tool set. Clearing restores the previous runtime. Inline modes are not a security boundary.

See the [repository](https://github.com/difflab-io/diffpi) for details.
