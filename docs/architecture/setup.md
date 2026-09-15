---
globs:
  - 'packages/pi/**'
---

# Setup

## Public API

### Tools

#### `diffpi_validate`

Checks the local environment without installing software or changing configuration.

```json
{
  "issueTracker": "none | linear | jira"
}
```

The result lists every requirement with a `ready`, `planned`, or `skipped` status.

#### `diffpi_setup`

Installs missing requirements and updates configuration after the user approves setup.

```json
{
  "issueTracker": "none | linear | jira"
}
```

Linear and Jira are optional. `none` preserves any existing issue-tracker configuration.

#### `diffpi_reload`

Queues a runtime reload after setup changes pi packages, skills, or Model Context Protocol (MCP) configuration.

#### `diffpi_modes_list`

Discovers standard inline agents and optionally skill-owned agents. `includeSkills` defaults to false; skill agents use `skill:agent` ids.

#### `diffpi_modes_set`

Validates a standard or qualified skill-agent id, snapshots its prompt in branch-aware session state, and publishes the active id through Pi's extension status.

#### `diffpi_modes_unset`

Appends a clear state entry and restores default Pi prompting on the next turn.

### Skills

#### `diffpi-setup`

Collects setup choices with `ask_user_question`, validates when requested, runs setup after approval, and reloads pi after successful setup.

### Shared agent installation

`packages/pi/agents/*.md` is the source of package-managed defaults. Setup enumerates these files and idempotently writes them to `$PI_CODING_AGENT_DIR/agents/` with their `diffpi-*.md` filenames. This standard directory makes the same definitions available to `@tintinweb/pi-subagents`. Adding a future bundled file requires no setup catalog change.

### Inline agent runtime

The package extension owns `/modes`, prompt discovery, selection, session restoration, and status publication. `/modes <agent>` and `/modes clear` run directly. `/modes` sends a hidden turn-triggering request that uses the bundled `ask_user_question` tool. `/modes --include-skills` uses the same flow with skill discovery enabled.

Standard discovery follows subagent precedence: bundled defaults, global agents, trusted shared-project agents, then trusted Pi-project agents. Optional skill discovery adds global and trusted-project skill `agents/` directories and qualifies ids as `skill:agent`. A colon-qualified direct selection automatically includes skill roots.

A `replace` agent receives only its snapshotted Markdown body as the next system prompt. An `append` agent preserves Pi's assembled prompt and Diffpi documentation routing before its body. Inline selection never changes the model or active tools. `ctx.ui.setStatus` keeps status rendering compositional; Diffpi does not replace the shared footer.

## Managed dependencies

mise installs and updates command-line development tools:

- Node.js 22.19 or newer
- Zellij
- Helix
- tuicr
- Context Mode

The setup tool also installs package-managed agent files, pi packages, upstream skills, and MCP server configuration. Grounded Docs, mise, and Context Mode are configured as MCP servers. Linear or Jira can be added when selected.

## Requirements

- Validation must not mutate the machine.
- Repeated setup must not duplicate configuration.
- Setup must preserve unrelated user configuration.
- Bundled agent installation must be idempotent and must not delete unrelated agent files.
- Inline agent discovery must respect project trust and must not edit discovered source files.
- Skill agents must remain excluded unless explicitly requested or selected by `skill:agent` id.
- Inline modes must not replace the footer, change the model, or filter tools.
- Public tool names must use the `diffpi_` prefix.
- Maintainer-provided skills must be installed upstream instead of copied or wrapped.

## References

- [pi extension API](https://pi.dev/docs/extensions)
- [pi packages](https://pi.dev/docs/packages)
- [mise](https://mise.jdx.dev/)
- [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter)
