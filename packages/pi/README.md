# @difflab/pi

Tools and skills for the pi coding agent.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup`. The skill validates or configures the environment and reloads pi when required.

The package includes structured questions and installs the upstream Grounded Docs, Simple English, and Context Mode skills. Setup also installs six package-managed agent files into Pi's global agent directory, making `tutor`, `copilot`, `planner`, `worker`, `orchestrator`, and `autonomous` available to both the subagent plugin and inline modes.

```text
/modes
/modes --include-skills
/modes tutor
/modes spec:planner
/modes clear
```

Standard agents come from the same global and trusted-project directories used by `@tintinweb/pi-subagents`. Skill-owned agents are opt-in for listing and use `skill:agent` ids. Inline selection changes subsequent system prompts but does not apply agent model or tool restrictions and is not a security boundary.

See the [repository](https://github.com/difflab-io/diffpi) for details.
