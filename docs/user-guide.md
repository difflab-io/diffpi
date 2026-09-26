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

A durable plan stores intent, requirements, illustrated API changes, user-facing consequences, ordered phases, and task checkboxes in `PLAN.md`. Each numbered brief (`implementation/phase-1.md`, `phase-2.md`, etc.) relists its tasks with ordered steps, affected files, APIs, algorithms, constraints, and acceptance criteria. Files live under `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/`. Each planning request creates one immutable `revisions/<n>/` snapshot containing the exact request, metadata, the resulting `PLAN.md`, and all phase briefs. For an annotation update, `request.md` pairs the original comments with the LLM's per-comment outcome, and metadata hashes both independently. The root files show the latest revision; execution events go to `logs.txt`, not new authoring snapshots.

Create an empty, phase-less draft when you want to write comments first. Foreground `init` creates exactly one revision and opens the plan editor; it does not add a phase or create a second revision just for opening.

```text
/plan init eng-123-api-cache --branch feature/cache
/plan annotate eng-123-api-cache
/plan update eng-123-api-cache
```

Create a populated plan from a prompt or the current conversation. `new` creates one complete revision and does not open an editor. Use `--bg` for background authoring. Explicit non-opening flows remain available for automation and tests.

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

Run `/plan update` after closing tuicr. The workflow reads the review dump for the current plan revision, applies its feedback, and validates the updated plan. Updating the plan advances its revision, so the same dump is not applied again. The review dump has no mutable reply state; the new revision records each annotation as applied, answered, or unresolved with the LLM response and concrete reason.

Finalize and run the plan:

```text
/plan finalize eng-123-api-cache
/plan go eng-123-api-cache --mode no-commit
/plan go eng-123-api-cache --mode push --bg
/plan help
```

Finalize requires phases, tasks, detailed and non-placeholder briefs, valid dependencies, and a substantive Design. `plan_validate` checks structure and brief completeness; it does not check whether source code implements the plan. The `--branch` flag records or filters a branch. It does not create or switch the branch.

The `/plan` command only forwards to the `plan` skill. The skill calls plan tools directly in the current foreground turn: authoring behaves as Planner, and execution coordinates Workers without an implicit mode switch. `--bg` delegates once to a named Planner or Orchestrator and leaves foreground behavior unchanged. Each phase runs the available mise `format:check`, `lint`, and `test` tasks. A missing recipe is recorded as skipped; a warning or failure blocks completion.

`--mode no-commit` does not create commits and is the default. `--mode commit` requires a clean starting worktree and creates one local conventional commit after each phase passes its gates. `--mode push` also pushes each phase commit. A bounded background Worker monitors hosted CI for that exact SHA while the next phase executes. The coordinator collects the monitor before pushing the next phase and collects every monitor before completing the plan; failed or timed-out CI blocks execution. Repositories without a supported forge or configured commit checks record CI as skipped.

A worker records blockers and evidence in the plan. Planner can revise pending or blocked work two times in a background run. If work needs a user decision, run `/plan update <slug>` and then run `/plan go <slug> --mode <mode>` with the prior commit mode.

A crash can occur after Git creates a commit but before the plan records its SHA. Compare `HEAD` with `logs.txt`, then record the existing commit before you resume.

Override the plan template at `~/.difflab/diffpi/templates/plan/PLAN.md`. Zed setup installs the `diffpi: annotate plan` task, which runs a pinned package CLI from `$ZED_WORKTREE_ROOT`.

## Review

`/review` supports local `tuicr` reviews and forge-native GitHub or GitLab reviews. Use `/review status` to see uncommitted counts, local and remote review sessions, and the remote PR/MR URL. `/review open` opens an existing remote PR/MR in the system browser; `/review open --local` creates or opens the local working-tree review. Use `--local` for the current working tree; without it, the repository remote selects the forge. `--bg` runs the workflow in a tracked background orchestrator.

### Local tuicr review

```mermaid
flowchart LR
  A["/review auto --local"] --> B[Inspect and gate changes]
  B --> C["/review address --local"]
  C --> D[Fix and reply locally]
  D --> E["/review publish --local"]
  E --> F["/review complete --local"]
```

Local reviews inspect the whole current branch: committed branch changes plus uncommitted changes, using `tuicr -w -r <base>..HEAD`. The base is the PR base when known or the supported forge default branch; local launch fails if neither is available. `auto` reviews tracked, staged, and untracked changes. `address` applies fixes without committing. `publish` promotes comments to the forge when desired; `complete` archives the local review. Local review records use `.diffpi/review/` and completion archives to `.diffpi/reviews/`. Each ledger entry displays the original source comment beside the recorded agent response. Addressing applies relevant changes now; deferral is allowed only when the user explicitly asks for it, while unresolved outcomes require a concrete blocker or material decision with attempted fixes and evidence.

### Forge-native GitHub/GitLab review

```mermaid
flowchart LR
  A["/review auto <pr-or-mr>"] --> B["/review address <pr-or-mr>"]
  B --> C["/review publish <pr-or-mr> --approve|--comment|--request-changes"]
  C --> D["/review complete <pr-or-mr> --approve|--reject|--abandon"]
  D --> E["/review merge <pr> (GitHub only)"]
```

`/review edit` opens an existing local or remote review in tuicr; unlike `/review open`, it never opens the system browser. Comments made in a remote PR session remain local drafts until `/review publish` promotes them to the forge. In a remote PR session, a draft on the same file and line as an existing thread becomes a reply; prefix it with `[REOPEN]`, `[RESOLVE]`, or `[DELETE]` to control the thread. `[DELETE]` removes the matched remote thread when supported. Other drafts are published as new comments. The publish workflow also handles a local working-tree session. Review publication does not merge; use `/review merge` separately.

## Configuration notes

Setup installs shared agents into `$PI_CODING_AGENT_DIR/agents/` and reads ordered model preferences from `~/.difflab/diffpi/config.yaml` or `config.json`. YAML takes precedence. Run `/skill:diffpi-setup` after changing the configuration so delegated profiles are rematerialized.

Linear and Jira remain optional. Select one during setup and complete its OAuth login from the MCP adapter afterward. Selecting none preserves existing issue-tracker configuration.
