# @difflab/pi

`@difflab/pi` provides tools and skills for the pi coding agent.

## Included tools

- `diffpi_validate` checks the environment without changing it.
- `diffpi_setup` installs missing tools and updates user configuration.
- `diffpi_reload` reloads pi after setup changes its resources.
- `diffpi_modes_list` lists available inline agents.
- `diffpi_modes_set` selects an inline agent for later turns.
- `diffpi_modes_unset` restores the default pi prompt.

The package includes structured user questions. Setup manages mise, Zellij, Helix, tuicr, Context Mode, selected pi packages, skills, and MCP servers. Linear and Jira remain optional.

## Included skills

The package bundles `diffpi-setup` and `mode`. Setup installs these upstream skills globally for Pi:

- Grounded Docs: `docs-search`, `docs-manage`, and `fetch-url`
- Simple English: `simple-english`
- Context Mode and its bundled skills

## Shared agents and inline modes

Diffpi installs `tutor`, `copilot`, `planner`, `worker`, and `orchestrator` as standard Pi agent Markdown files. The orchestrator can assign bounded tasks to workers. The same definitions can run as delegated subagents or as the active prompt in the current conversation.

Use `/skill:mode` to choose a standard agent. Add an agent id for direct selection, or add `clear` to restore default behavior. Use `--include-skills` to list skill-owned agents with ids such as `spec:planner`.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup`. The skill validates or configures the environment and reloads pi when required.

The setup tool changes user-level configuration. Run `diffpi_validate` first to preview missing setup.

## Development

```bash
git clone https://github.com/difflab-io/diffpi.git
cd diffpi
mise install
mise run install
mise run //packages/pi:test
mise run //packages/pi:lint
mise run //packages/pi:build
```

## Documentation

- [User guide](docs/user-guide.md)
- [Architecture](docs/architecture/index.md)
- [Development guide](docs/development-guide.md)
- [Infrastructure](docs/infrastructure.md)
