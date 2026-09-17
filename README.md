# @difflab/pi

`@difflab/pi` provides tools and skills for the pi coding agent.

## Included tools

- `diffpi_validate` checks the environment without changing it.
- `diffpi_setup` installs missing tools and updates user configuration.
- `diffpi_reload` reloads pi after setup changes its resources.
- `diffpi_modes_list` lists available inline agents and their runtime profiles.
- `diffpi_modes_set` selects an inline agent, model route, thinking level, and tools for later turns.
- `diffpi_modes_unset` restores the previous model, thinking level, tools, and default Pi prompt.
- `review_context`, `review_open`, `review_diff`, `review_gates`, `review_submit`, `review_comments`, `review_respond`, `review_publish`, `review_complete`, `review_merge`, and `review_launch` implement forge and local review workflows.

The package includes structured user questions. Setup manages mise, Zellij, Helix, tuicr, Context Mode, selected pi packages, skills, and MCP servers. Linear and Jira remain optional.

## Included skills

The package bundles `diffpi-setup`, `mode`, and `review`. `/review` opens, creates, addresses, publishes, completes, and launches reviews through the `review_*` tools. Setup installs these upstream skills globally for Pi:

- Grounded Docs: `docs-search`, `docs-manage`, and `fetch-url`
- Simple English: `simple-english`
- Context Mode and its bundled skills

## Shared agents and inline modes

Diffpi installs `tutor`, `copilot`, `worker`, and `orchestrator` as standard Pi agent Markdown files. Tutor teaches with grounded documentation, copilot edits in tandem, worker executes bounded plans, and the delegated-only orchestrator schedules agents in parallel. Profiles include preferred model routes, thinking levels, and tool sets.

Use `/skill:mode` to run tutor, copilot, or worker in the current conversation. Add an agent id for direct selection, or add `clear` to restore the previous model, tools, and default prompt. Use `--include-skills` to list skill-owned agents with ids such as `spec:planner`. Override ordered agent model preferences in `~/.difflab/diffpi/config.yaml` or `config.json`; rerun setup to rematerialize delegated agents.

## Review workflows

Use `/review` with `open`, `new`, `address`, `publish`, `complete`, or `merge`. Add `--local` for a `tuicr` review. Review records live in a global per-repository store under `~/.difflab/diffpi/projects/`; each checkout exposes the same store through `.pi/diffpi`, and repository identity hashing prevents same-named repositories from colliding across worktrees.

GitHub and GitLab support review creation and publication. `review_merge` is intentionally GitHub-only and requires an approved, non-draft, merge-ready PR with successful checks immediately before squash merge.

The package's JavaScript API exports forge adapters, review schemas and rendering helpers, gate checks, store helpers, tuicr session helpers, environment detection, setup operations, and inline-mode control. The `@difflab/pi/tools` entry point exports `createReviewTools` with the rest of the tool catalog. See [Review architecture](docs/architecture/review.md) for contracts and storage details.

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
