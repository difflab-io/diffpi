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

**Current:** Setup installs shared profiles such as `tutor`, `copilot`, `worker`, and `orchestrator`. `/mode <agent>` selects one for the next foreground model turn; it applies the profile prompt (`replace` or `append`), first available model preference, thinking level, and live callable tools. `diffpi_modes_status` is read-only and reports the actual active model, thinking level, tool names, and `capabilityError`; required and forbidden tools and required model/thinking settings are preflighted. Model and thinking changes apply on the next turn, so callers must verify them with status on that turn. Legacy snapshots are normalized on restore, with stored baseline fallback if recovery fails. Optional tools are filtered against the registered tool set, so profile frontmatter is not proof that a tool can be called. Reload, resume, fork, and branch/tree navigation restore the stored profile when present; `/mode clear` restores the captured model, thinking level, tools, and prompt baseline.

Run `/skill:mode --include-skills` for skill-owned ids. Inline mode changes are not a security boundary or a separate session. A delegated background child has its own effective tools and does not redispatch itself.

**Target/proposed:** Planner is a frontier/high author with read/write/edit and Agent by policy; it writes plan files, but is not a Pi tool-path sandbox. One independently verified frontier/high, read/search-only `diffpi-plan-reviewer` performs structural format checks, overall plan quality/consistency/risk review, and per-task lightweight Worker executability in one invocation. The reviewer must self-attest with status and the caller must verify; `subagentx` RPC returns only a task id, not proof of the child's capabilities. It is not a separate pass or fallback profile. Orchestrator is medium-thinking and runs foreground `go` or one initial named same-session `--bg` child, then may delegate Workers. Workers are bounded low-thinking editors; source Reviewers are frontier/high and may delegate bounded lightweight Worker edits. These are policy contracts, not all current runtime safeguards. If `Agent`, `read`, `write`, `edit`, `review`, or a required model override is missing, the target behavior is to stop with the exact blocker rather than silently substitute a weaker capability.

## Plan work

The following is the target workflow proposal. It describes intended behavior; it does not claim the current plugin has migrated. Historical managed records remain untouched.

Planner writes the authoritative visible `PLAN.md` and numbered briefs directly in successive normal write/edit calls. Incomplete files are therefore visible. Prerequisites are phase-only and task checkboxes are flat. Each brief has one action-labeled file tree with nested verification; libraries and algorithms belong under Constraints. This is a proposed workflow, not an implementation claim.

```text
/plan init eng-123-api-cache --branch feature/cache
/plan new eng-123-api-cache add cache invalidation to the API
/plan update eng-123-api-cache tighten the rollback criteria
/plan annotate eng-123-api-cache
/plan finalize eng-123-api-cache
/plan go eng-123-api-cache
/plan help
```

`init` leaves a visible incomplete draft. `new` and `update` write incrementally, then invoke one independent, verified frontier-model, high-thinking, read/search-only `diffpi-plan-reviewer` over current `PLAN.md` and all numbered briefs. In that one pass it checks structure/parity/action labels, overall plan quality/consistency/risk, and whether each task can be executed by a lightweight Worker without guessing. `annotate` remains optional HUMAN tuicr `--file` or direct-file review, not automated structural or semantic review. `finalize` invokes the same reviewer and marks ready only. Draft `go` does the same, marks ready, and executes without freezing files; `--bg` performs one initial same-session Orchestrator dispatch. The Planner repairs actionable findings and reruns the same reviewer within bounded attempts.

A named medium-thinking Orchestrator may delegate multiple bounded low-thinking Workers as phases progress. The Orchestrator owns plan status, project gates, Git, and CI, and does not edit plugin source. Workers edit only declared source/test scope, report evidence, and do not commit or change plan status.

`help` is informational. Keep all of these contracts proposed and distinct from current behavior. Review and mode workflows below are unchanged.

## Review

**TARGET:** `/review` supports local `tuicr` and forge-native GitHub/GitLab reviews. Preserve `--local` and the selected target/backend. Every workflow starts with `review_context`; gates run before findings. `--bg` starts exactly one same-session Orchestrator; it may delegate judgment but never edits source.

**PROPOSED role contract:** A high-tier Reviewer owns `auto` SOURCE CODE judgment and thread classification, but is read-only only for source-code edits. The Reviewer may invoke review tools to stage findings and respond to threads; the inline Reviewer coordinator also invokes lifecycle tools. For `address`, the Reviewer delegates only bounded, non-overlapping edits to Workers; the Reviewer owns replies and evidence, while local thread resolutions remain user-owned. Lifecycle verbs remain coordinator-owned.

| Verb              | Order, state effect, and failure                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auto` / `launch` | `review_context` → `review_new`/`review_edit` → `review_gates` → `review_diff` → Reviewer judgment → `review_submit`. Stages grounded findings; remote findings remain pending. Report failed/skipped gates and backend errors; never complete or merge.                                                                                                                                                                                                                                         |
| `new`             | `review_context` → `review_new`; create local `tuicr` draft or remote draft PR/MR. No findings. Fail on invalid arguments, existing target, dirty/unpushed remote branch, or missing backend.                                                                                                                                                                                                                                                                                                    |
| `open`            | `review_context` → `review_open` (or local `review_new`); open an existing remote browser target. Never creates a remote review; report the URL or direct `/review new`.                                                                                                                                                                                                                                                                                                                         |
| `status`          | `review_context` → `review_status`. Read-only; report worktree, local/remote state, URLs, and `tuicr` state. Remains useful without forge or `tuicr`.                                                                                                                                                                                                                                                                                                                                            |
| `edit`            | `review_context` → `review_edit`; open an existing session in `tuicr`. No findings or lifecycle mutation; fail if no matching session/review.                                                                                                                                                                                                                                                                                                                                                    |
| `address`         | `review_context` → `review_comments` → Reviewer classification → bounded Workers → gates/verification → upstream `/git commit --no-push` when code changed → `review_respond(resolve:false)`. Use `--atomic` for separate logical commits. Local edits remain uncommitted; Workers never commit and the coordinator owns the commit. Do not publish, complete, merge, or resolve; local thread resolutions remain user-owned. Report fixed, answered, unresolved, skipped, and blockers exactly. |
| `publish`         | `review_context` → `review_publish`; select matching local promotion or forge-native pending work → publish status. Local drafts promote; remote comments become visible. Report unmatched replies as new comments; never merge.                                                                                                                                                                                                                                                                 |
| `complete`        | `review_context` → `review_complete`; local archive/delete session, or remote approve/reject/abandon. Separate from merge; missing remote action fails or asks in foreground.                                                                                                                                                                                                                                                                                                                    |
| `merge`           | remote-only `review_context` → `review_merge`. GitHub-only; readiness requires an open, non-draft, clean PR and settled checks. Branch protection is authoritative; use a conventional squash subject if needed. Approval from the current user is optional and not required. Never substitutes for publication.                                                                                                                                                                                 |
| `help`            | Informational only; no tools, context mutation, or state effect.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Local reviews include committed and uncommitted branch changes and use `.diffpi/review/`; completion archives to `.diffpi/reviews/`. Remote comments stay staged until `publish`. Report failures, skipped checks, and external blockers rather than claiming completion.

## Configuration notes

Setup installs shared agents into `$PI_CODING_AGENT_DIR/agents/` and reads ordered model preferences from `~/.difflab/diffpi/config.yaml` or `config.json`. YAML takes precedence. Run `/skill:diffpi-setup` after changing the configuration so delegated profiles are rematerialized.

Linear and Jira remain optional. Select one during setup and complete its OAuth login from the MCP adapter afterward. Selecting none preserves existing issue-tracker configuration.
