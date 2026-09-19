# @difflab/pi

`@difflab/pi` provides tools and skills for the pi coding agent.

## Included tools

- `diffpi_validate` checks the environment without changing it.
- `diffpi_setup` installs missing tools and updates user configuration.
- `diffpi_reload` reloads pi after setup changes its resources.
- `diffpi_modes_list` lists available inline agents and their runtime profiles.
- `diffpi_modes_set` selects an inline agent, model route, thinking level, and tools for later turns.
- `diffpi_modes_unset` restores the previous model, thinking level, tools, and default Pi prompt.
- `review_context`, `review_new`, `review_edit`, `review_diff`, `review_gates`, `review_submit`, `review_add_comment`, `review_comments`, `review_respond`, `review_publish`, `review_complete`, `review_merge`, and `review_launch_ui` implement forge and local review workflows.
- `diffpi_template` loads bundled workflow templates or user overrides.

The package includes structured user questions. Setup manages mise, Zellij, Helix, tuicr, Context Mode, selected pi packages, skills, and MCP servers. Linear and Jira remain optional.

## Included skills

The package bundles `diffpi-setup`, `git`, `mode`, and `review`. `/git` provides conventional commit and intent-preserving rebase workflows. `/review` opens, creates, automates, addresses, publishes, completes, and merges reviews through the `review_*` tools. Setup installs these upstream skills globally for Pi:

- Grounded Docs: `docs-search`, `docs-manage`, and `fetch-url`
- Simple English: `simple-english`
- Context Mode and its bundled skills

## Shared agents and inline modes

Diffpi installs `tutor`, `copilot`, `worker`, `reviewer`, and `orchestrator` as standard Pi agent Markdown files. Tutor teaches with grounded documentation, copilot edits in tandem, and worker executes bounded plans. Inline `/review auto` and `/review address` use Reviewer on Sol; lifecycle verbs use Orchestrator on Luna. Reviewer delegates bounded address edits to lightweight workers. Profiles include preferred model routes, thinking levels, and tool sets.

Use `/mode` for the fast inline picker, `/mode <agent>` for direct selection, and `/mode clear` or `/mode reset` to restore the previous model, tools, and default prompt. `/skill:mode` remains available when skill-owned agent discovery is needed. Use `--include-skills` to list skill-owned agents with ids such as `spec:planner`. Override ordered agent model preferences in `~/.difflab/diffpi/config.yaml` or `config.json`; rerun setup to rematerialize delegated agents.

## Review workflows

Use `/review` with `auto`, `new`, `edit`, `address`, `publish`, `complete`, or `merge`. `open`, `create`, and `draft` alias `new`; `launch` aliases `auto`. Add `--local` to select the `tuicr` working-tree review backend. Add `--bg` to run the workflow as a tracked background orchestrator without changing the current chat mode. Local review records and reply overlays live in `.diffpi/review/`; completed local reviews move to `.diffpi/reviews/`. The symlink points to the global per-repository store below `~/.difflab/diffpi/projects/` and is shared by worktrees.

Local review always uses the current working tree. Local address flows apply fixes without creating commits; remote address flows use `/git commit --no-push` before draft responses for changed threads. Local comments and remote generated comments include the exact active model route. `publish --local` promotes `tuicr` comments and overlay replies before applying a status. `complete` approves, rejects, or abandons a remote review; local completion archives its overlay and deletes the matching tuicr session. Publish and complete never merge.

GitHub and GitLab support review creation and publication. `review_merge` is intentionally GitHub-only and requires an approved, non-draft, merge-ready PR with successful checks immediately before squash merge. Draft PR bodies use the generic template registry and can be overridden at `~/.difflab/diffpi/templates/review/draft-pr.md`.

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
mise watch //packages/pi:dev # build and project-local install whenever package sources change
```

## Documentation

- [User guide](docs/user-guide.md)
- [Architecture](docs/architecture/index.md)
- [Development guide](docs/development-guide.md)
- [Infrastructure](docs/infrastructure.md)
