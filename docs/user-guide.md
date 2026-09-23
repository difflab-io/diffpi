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

Ask pi to set up the local environment or run `/skill:diffpi-setup`. Setup manages mise, Node.js 22.19 or newer, Zellij, Helix, tuicr, Context Mode, structured questions, subagents, inline modes, scheduled prompts, web access, LSP, the MCP adapter, and optional Linear, Jira, GitHub, or GitLab integrations.

## Use shared agents and inline modes

Setup installs shared agents such as `tutor`, `copilot`, `worker`, and `orchestrator`. Use `/mode` for the fast inline picker or `/mode <agent>` for direct selection. Use `/mode clear` or `/mode reset` to restore the previous model, thinking level, tools, and default prompt.

Run `/skill:mode` when skill-agent discovery is needed. Use `--include-skills` to include agents owned by installed skills. Inline modes alter behavior and available tools; they are not a security boundary. Use delegated subagents when work needs a separate session, isolation, or nested delegation.

## Plan work

A durable plan is an editable `PLAN.md` file with stable machine markers. Diffpi stores each plan, its append-only `logs.txt` file, and one editable implementation brief per phase under `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/`. Phase briefs use `implementation/phase-<phase-id>.md` and the bundled implementation template.

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

Background authoring uses inherited context and one named Planner launched through the pi-subagents in-process RPC adapter. It does not create context packets or recursive Pi processes. A background agent records assumptions and stops on unresolved product decisions. It does not ask questions.

Review the plan with `tuicr --file`. Do not use `-p` or `--path` because those flags filter a VCS diff. Closing tuicr saves one immutable plan review at `reviews/<revision>.json`.

```text
/plan annotate eng-123-api-cache
npx --yes @difflab/pi@<version> plan annotate eng-123-api-cache --cwd "$PWD"
```

Run `/plan update` after closing tuicr. The workflow reads the review dump for the current plan revision, applies its feedback, and validates the updated plan. Updating the plan advances its revision, so the same dump is not applied again. There are no review replies or manual resolution markers.

Finalize and run the plan:

```text
/plan finalize eng-123-api-cache
/plan go eng-123-api-cache --mode no-commit
/plan go eng-123-api-cache --mode push --bg
/plan help
```

Finalize requires phases, tasks, acceptance criteria, valid dependencies, and a Design section of 800 words or fewer. Design warnings start above 300 words. The `--branch` flag records or filters a branch. It does not create or switch the branch.

Foreground `init`, `new`, and `update` select Planner. Foreground `annotate`, `finalize`, and `help` select Worker. Foreground `go` selects Orchestrator, which launches and coordinates implementation Workers. Finalize restores the default mode when implementation is deferred, and completing an inline plan execution restores the default mode automatically. Background execution selects Orchestrator but keeps the current foreground mode. Orchestrator uses `SubagentWorkflow` for dependent pipelines, safe parallel workers, structured outcomes, and gates; plan tools remain the durable source of truth. Each phase runs the available mise `format:check`, `lint`, and `test` tasks. A missing recipe is recorded as skipped. A warning or failure blocks completion.

`--mode no-commit` does not create commits and is the default. `--mode commit` requires a clean starting worktree and creates one local conventional commit after each phase passes its gates. `--mode push` also pushes each phase commit. A bounded background Worker monitors hosted CI for that exact SHA while the next phase executes. The coordinator collects the monitor before pushing the next phase and collects every monitor before completing the plan; failed or timed-out CI blocks execution. Repositories without a supported forge or configured commit checks record CI as skipped.

A worker records blockers and evidence in the plan. Planner can revise pending or blocked work two times in a background run. If work needs a user decision, run `/plan update <slug>` and then run `/plan go <slug> --mode <mode>` with the prior commit mode.

A crash can occur after Git creates a commit but before the plan records its SHA. Compare `HEAD` with `logs.txt`, then record the existing commit before you resume.

Override the plan template at `~/.difflab/diffpi/templates/plan/PLAN.md`. Zed setup installs the `diffpi: annotate plan` task, which runs a pinned package CLI from `$ZED_WORKTREE_ROOT`.

## Review

`/review` supports local `tuicr` reviews and forge-native GitHub or GitLab reviews. Use `--local` for the current working tree; without it, the repository remote selects the forge. `--bg` runs the workflow in a tracked background orchestrator.

### Local tuicr review

```mermaid
flowchart LR
  A["/review auto --local"] --> B[Inspect and gate changes]
  B --> C["/review address --local"]
  C --> D[Dump immutable revision]
  D --> E[Apply feedback]
  E --> F[Open next revision]
```

Local reviews inspect the current branch plus uncommitted changes with `tuicr -w -r <base>..HEAD`. Closing a session and running `address` stores its reviewed diff, comments, and raw tuicr output at `.diffpi/review/<branch-slug>/<revision>.json`. The workflow removes the completed session, applies feedback without committing, runs checks, and launches the next revision. Local reviews have no replies, resolution markers, publication step, completion archive, or remote promotion.

### Forge-native GitHub/GitLab review

```mermaid
flowchart LR
  A["/review auto <pr-or-mr>"] --> B["/review address <pr-or-mr>"]
  B --> C["/review publish <pr-or-mr> --approve|--comment|--request-changes"]
  C --> D["/review complete <pr-or-mr> --approve|--reject|--abandon"]
  D --> E["/review merge <pr> (GitHub only)"]
```

Remote review workflows use GitHub or GitLab directly. `/review address` reads forge threads, applies justified fixes, and posts responses. `/review publish` publishes pending comments and status. Threads remain open unless the user explicitly requests resolution. Review publication does not merge; use `/review merge` separately.

## Configuration notes

Setup installs shared agents into `$PI_CODING_AGENT_DIR/agents/` and reads ordered model preferences from `~/.difflab/diffpi/config.yaml` or `config.json`. YAML takes precedence. Run `/skill:diffpi-setup` after changing the configuration so delegated profiles are rematerialized.

Linear and Jira remain optional. Select one during setup and complete its OAuth login from the MCP adapter afterward. Selecting none preserves existing issue-tracker configuration.
