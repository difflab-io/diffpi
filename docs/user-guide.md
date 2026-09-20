# User Guide

## Requirements

Install pi before `@difflab/pi`. Automatic setup supports macOS and Linux. Shell activation supports Bash, Zsh, Fish, Nushell, Xonsh, Elvish, and PowerShell, with Bash as the fallback.

## Install

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup`. The skill collects setup choices, installs missing requirements after approval, and reloads pi when required.

## Validate the environment

Ask pi to validate the local setup. The agent calls `diffpi_validate`, which reports missing software and configuration without changing the machine.

## Set up the environment

Ask pi to set up the local environment or run `/skill:diffpi-setup`. Setup manages these groups:

### Development tools

- mise and its shell activation hook
- Node.js 22.19 or newer
- Zellij
- Helix
- tuicr
- Context Mode

### Pi packages

- structured user questions
- subagents and shared Diffpi agents
- first-party inline agent modes
- scheduled prompts
- BTW
- web access
- LSP
- Context Mode
- MCP adapter

### Skills

- Grounded Docs: `docs-search`, `docs-manage`, and `fetch-url`
- Simple English: `simple-english`
- Context Mode bundled skills

### MCP adapters

- Grounded Docs
- mise
- Context Mode
- optional Linear or Jira
- optional GitHub or GitLab forge MCP

## Plan work

A durable plan is an editable `PLAN.md` file with stable machine markers. Diffpi stores each plan and its append-only `logs.txt` file under `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/`.

Create an empty draft when you want to write comments first:

```text
/plan init eng-123-api-cache --branch feature/cache
/plan annotate eng-123-api-cache
/plan update eng-123-api-cache
```

Create a populated plan from a prompt or the current conversation:

```text
/plan new eng-123-api-cache add cache invalidation to the API
/plan new eng-123-api-cache --bg add cache invalidation to the API
/plan update eng-123-api-cache tighten the rollback criteria
/plan update eng-123-api-cache --bg apply all unambiguous comments
```

Background authoring uses a bounded context packet with mode `0600`. Conversation text does not appear in process arguments. A background agent records assumptions and stops on unresolved product decisions. It does not ask questions.

Annotate the file with `tuicr --file`. Do not use `-p` or `--path` because those flags filter a VCS diff.

```text
/plan annotate eng-123-api-cache
npx --yes @difflab/pi@<version> plan annotate eng-123-api-cache --cwd "$PWD"
diffpi plan annotations eng-123-api-cache --cwd "$PWD"
```

Run `/plan update` after annotation. The workflow reads pending comments first, applies valid changes, validates the plan, and acknowledges applied comment IDs. A failed or partial update leaves the other comments pending.

Finalize and run the plan:

```text
/plan finalize eng-123-api-cache
/plan go eng-123-api-cache --no-commit
/plan go eng-123-api-cache --commit --bg
/plan help
```

Finalize requires phases, tasks, acceptance criteria, valid dependencies, no pending comments, and a Design section of 800 words or fewer. Design warnings start above 300 words. The `--branch` flag records or filters a branch. It does not create or switch the branch.

Inline execution selects Worker. Background execution selects Orchestrator but keeps the current foreground mode. Each phase runs the available mise `format:check`, `lint`, and `test` tasks. A missing recipe is recorded as skipped. A warning or failure blocks completion.

`--no-commit` does not create commits. `--commit` requires a clean starting worktree and creates one conventional local commit after each phase passes its gates. Phase commits use `/git commit --yes --no-push`, so the workflow never pushes.

A worker records blockers and evidence in the plan. Planner can revise pending or blocked work two times in a background run. If work needs a user decision, run `/plan update <slug>` and then run `/plan go <slug>` with the prior commit policy.

A crash can occur after Git creates a commit but before the plan records its SHA. Compare `HEAD` with `logs.txt`, then record the existing commit before you resume.

Override the plan template at `~/.difflab/diffpi/templates/plan/PLAN.md`. Zed setup installs the `diffpi: annotate plan` task, which runs a pinned package CLI from `$ZED_WORKTREE_ROOT`.

## Review

`/review` supports local `tuicr` reviews and forge-native GitHub or GitLab reviews. Use `--local` for the current working tree; without it, the repository remote selects the forge. `--bg` runs the workflow in a tracked background orchestrator.

### Local tuicr review

```mermaid
flowchart LR
  A["/review auto --local"] --> B[Inspect and gate changes]
  B --> C["/review address --local"]
  C --> D[Fix and reply locally]
  D --> E["/review publish --local"]
  E --> F["/review complete --local"]
```

Local reviews inspect the whole current branch: committed branch changes plus uncommitted changes, using `tuicr -w -r <base>..HEAD`. The base is the PR base when known or the supported forge default branch; local launch fails if neither is available. `auto` reviews tracked, staged, and untracked changes. `address` applies fixes without committing. `publish` promotes comments to the forge when desired; `complete` archives the local review. Local review records use `.diffpi/review/` and completion archives to `.diffpi/reviews/`. Zed setup installs two stable global tasks: a local full-branch runtime resolver and a remote PR/MR runtime resolver. They use cwd `$ZED_WORKTREE_ROOT`, resolve the current branch and forge target when run, and are never rewritten for a different review. The local task runs `tuicr -w -r <base>..HEAD`; the remote task runs `tuicr pr <number>`.

### Forge-native GitHub/GitLab review

```mermaid
flowchart LR
  A["/review auto <pr-or-mr>"] --> B["/review address <pr-or-mr>"]
  B --> C["/review publish <pr-or-mr> --approve|--comment|--request-changes"]
  C --> D["/review complete <pr-or-mr> --approve|--reject|--abandon"]
  D --> E["/review merge <pr> (GitHub only)"]
```

`auto` creates or opens the review and runs gates. Remote `address` fixes requested changes, commits with `/git commit --no-push`, and replies. `publish` makes the pending review public; `complete` changes review lifecycle without merging. GitLab supports creation, addressing, and publication, but not `--request-changes` or `merge`.

Web search uses `auto-summary`, so searches do not open the browser curator. Pi LSP keeps progressive diagnostics active without writing them to the status line.

## Use shared agents and inline modes

Setup installs the package's `diffpi-*.md` definitions into `$PI_CODING_AGENT_DIR/agents/` (normally `~/.pi/agent/agents/`). These are normal agent files, so `@tintinweb/pi-subagents` can run `tutor`, `copilot`, `worker`, `planner`, `reviewer`, and `orchestrator` in delegated sessions. Inline `/review auto` and `/review address` activate Reviewer on Sol; lifecycle verbs activate Orchestrator on Luna. Reviewer delegates bounded address changes to lightweight Worker agents. With `--bg`, a tracked Orchestrator child owns the complete workflow and routes `auto` or `address` through Reviewer.

Run `/mode` for the fast inline picker. Use `/mode <agent>` for direct selection and `/mode clear` or `/mode reset` to restore the previous model, thinking level, tools, and default prompt. Use `/skill:mode` when skill-agent discovery is needed. Use `--include-skills` to include agents owned by installed skills. Select a skill agent directly with a qualified id such as `/skill:mode spec:planner`. The colon enables skill discovery.

`diffpi_modes_list` reports standard agents by default and accepts `includeSkills: true`. Standard discovery mirrors the subagent plugin: global `$PI_CODING_AGENT_DIR/agents/*.md`, then trusted-project `.agents/agents/*.md`, then trusted-project `.pi/agents/*.md`. Skill discovery additionally reads `agents/*.md` under global and trusted-project `.agents/skills/<skill>/` and `.pi/skills/<skill>/` roots. Project files are ignored until Pi trusts the project.

Agent Markdown uses `name`, `display_name`, `description`, `enabled`, `inline`, `prompt_mode`, `model`, `model_fallbacks`, `thinking`, and `tools`. The body replaces the normal system prompt by default; `prompt_mode: append` preserves normal Pi and Diffpi context first. Inline selection tries model preferences in order, keeps the current model if none are available, and filters the profile tool set against the current registry. The subagent plugin officially supports the singular `model` field; Diffpi owns `model_fallbacks` and materializes the first available preference into `model` during setup.

Override an agent's ordered preferences in `~/.difflab/diffpi/config.yaml` or, when YAML is absent, `~/.difflab/diffpi/config.json`. Use `agents.<agent-id>.models` as an ordered string list. The user list replaces bundled defaults; an empty list disables automatic selection. Run `/skill:diffpi-setup` after changing this file so delegated profiles are rematerialized.

The active id appears as `mode: <id>` through Pi's extension status. The complete profile and the previous runtime are snapshotted in the current session and restored with its active branch. Select the source again to load later file changes.

Inline modes alter behavior and available tools; they are not a security boundary. Prior conversation messages remain, tool selection is not permission enforcement, and later extensions can modify the effective prompt. Use delegated subagents when work needs a separate session, isolation, or nested delegation.

Linear and Jira remain optional. Select one during setup and complete its OAuth login from the MCP adapter afterward. Selecting none preserves existing issue-tracker configuration.
