# diffpi Development Guide

Generated from mise-lib-template v2.15.0.

## Prerequisites

- [mise](https://mise.jdx.dev/) -- manages the bun runtime and tool versions
- bun is installed automatically by mise via `mise install` (it provides its own Node-compatible runtime)

## Getting Started

```bash
# Install all tools and dependencies
mise install
mise run install

# Run tests
mise run //packages/pi:test

# Check code quality
mise run //packages/pi:lint
mise run //packages/pi:format:check
```

Package code tasks live in `packages/pi/mise.toml` in monorepo mode. Repository tasks such as `install`, `clean`, `eval:list`, `eval:run`, `eval:all`, `upversion`, and `version` stay at the root. From inside the package, use short task names such as `mise run test`.

## Project Structure

```
packages/pi/                  # @difflab/pi package
packages/pi/extensions/       # Single pi extension entry point
packages/pi/skills/           # Skills shipped in the pi package
packages/pi/src/setup.ts      # Setup orchestration
packages/pi/src/mise.ts       # mise operations
packages/pi/src/pi.ts         # pi package, skill, and settings operations
packages/pi/src/mcp.ts        # MCP configuration operations
packages/pi/src/tools/        # Tool catalog and definitions
packages/pi/tests/            # Bun test suite
packages/pi/dist/             # Generated package output
packages/pi/package.json      # npm and pi package metadata
package.json               # Workspace root (private)
eslint.config.js           # ESLint flat config
.prettierrc                # Prettier config
mise.toml                  # Task runner and tool versions
```

## Development Workflow

1. Add code in `packages/pi/src/` and tests in `packages/pi/tests/`.
2. Run `mise run //packages/pi:lint` and `mise run //packages/pi:format:check`.
3. Run `mise run //packages/pi:test`.
4. Run `mise run //packages/pi:build`.

## Plan evaluations

Install root dependencies with `mise run install`, then use the Promptfoo-backed root tasks:

```bash
mise run eval:list
mise run eval:run plan-tic-tac-toe
mise run eval:all
```

`eval:run` selects one named case; `eval:all` lets Promptfoo run independent cases concurrently. The tic-tac-toe case creates a disposable fixture and runs `/skill:plan new` before `/skill:plan update` in one uniquely named Pi session. The JSON case declares the fixture, ordered prompts, model and captured paths. The native Pi SDK provider loads all bundled skills and tools through the package manifest without a candidate allowlist, plus the host subagent extension; it records `catalog.json`, `agents.json`, `children.json`, stage snapshots, and the session under `.tmp/evals/<name>-*/`. Missing capabilities or incomplete background children are provider errors, not quality scores. Only Promptfoo's separate tool-free LLM rubric judges plan quality and writes scores/reasons to `.tmp/evals/results/<name-or-all>-*/promptfoo.json`. Pi and the subagent extension must be installed, and the Sol/high model must be available through your Pi authentication. These live evaluations make model calls and may take several minutes. `mise run clean` deletes eval outputs, so inspect failed runs first. See the [evaluation architecture](architecture/evaluations.md) and [eval case guide](../evals/README.md) for setup, file roles, and adding cases.

## Adding Dependencies

```bash
mise exec -- bun add <package>
mise exec -- bun add --dev <package>
```

## Publishing to npm

### Prerequisites

1. Create an npm account at [npmjs.com](https://www.npmjs.com/)
2. Create a publish token: **npmjs.com -> Account -> Access Tokens -> Generate New Token -> Publish**
3. Set the token:
   - **Local**: `export NPM_TOKEN=npm_xxx...`
   - **CI**: Add `NPM_TOKEN` as a GitHub repository secret (Settings -> Secrets and variables -> Actions)

### Manual Publish

```bash
# Bump version based on conventional commits
mise run upversion

# Build and publish to npm
mise run //packages/pi:publish
```

### Automated CI Publish

On every push to `main`:

1. CI runs `mise run upversion` -- bumps version in `package.json`, creates git tag
2. If a new version was released, CI runs `mise run //packages/pi:publish` and publishes `@difflab/pi` to npm.

### npm scope

Publishing requires access to the `@difflab` npm organization.

### Pre-release (RC)

```bash
mise run //packages/pi:publish:rc
# Consumers install with: pi install npm:@difflab/pi@next
```

### Token Expiration and Trusted Publishing

npm Granular Access Tokens **expire after 90 days**. To avoid manual rotation, set up Trusted Publishing (OIDC) after your first release:

1. Go to your package on npmjs.com -> **Settings** -> **Publishing access**
2. Enable publishing from CI/CD with a generated token
3. Set repository owner, repo name, and workflow (`release.yml`)
4. Add `id-token: write` to `release.yml` permissions and `--provenance` to the publish command
5. Remove `NPM_TOKEN` from GitHub secrets.
