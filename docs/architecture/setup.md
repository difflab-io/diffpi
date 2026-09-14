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

### Skills

#### `diffpi-setup`

Collects setup choices with `ask_user_question`, validates when requested, runs setup after approval, and reloads pi after successful setup.

## Managed dependencies

mise installs and updates command-line development tools:

- Node.js 22.19 or newer
- Zellij
- Helix
- tuicr
- Context Mode

The setup tool also installs pi packages, upstream skills, and MCP server configuration. Grounded Docs, mise, and Context Mode are configured as MCP servers. Linear or Jira can be added when selected.

## Requirements

- Validation must not mutate the machine.
- Repeated setup must not duplicate configuration.
- Setup must preserve unrelated user configuration.
- Public tool names must use the `diffpi_` prefix.
- Maintainer-provided skills must be installed upstream instead of copied or wrapped.

## References

- [pi extension API](https://pi.dev/docs/extensions)
- [pi packages](https://pi.dev/docs/packages)
- [mise](https://mise.jdx.dev/)
- [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter)
