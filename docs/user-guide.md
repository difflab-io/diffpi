# User Guide

## Install and validate

Install Pi, then install the package:

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup` to validate or configure the environment. Validation calls `diffpi_validate` and changes nothing. Setup asks before installing missing tooling, subagents, and optional Linear, Jira, GitHub, or GitLab integrations; reload Pi when setup requests it. The package manifest provides all bundled skills. Hosts may expose different tool transports; report an actual workflow blocker rather than requiring a particular callable name as a preflight.

After a package update, run `/skill:diffpi-doctor` if copied agent profiles are stale. The `diffpi_doctor` check is read-only; its repair backs up and updates only Diffpi's global agent files from the installed package. It does not run setup. Bundled skill files update with the package; reload each affected Pi session, or start a new conversation if an old inline prompt persists. Planning and review workflows call namespaced `diffpi-*` agents, not generic `planner` or `reviewer` profiles.

## Plan work

Plans are live `PLAN.md` and numbered phase briefs in `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/`. Phase constraints and prerequisites belong in PLAN.md; each brief has one action-labeled fenced `text` Files Affected tree immediately after Objective, then ordered task steps, verification, acceptance criteria and implementation guidance.

```text
/plan init eng-123-api-cache --branch feature/cache
/plan new eng-123-api-cache add cache invalidation to the API
/plan update eng-123-api-cache tighten the rollback criteria
/plan validate eng-123-api-cache
/plan finalize eng-123-api-cache
/plan go eng-123-api-cache --mode no-commit
/plan help
```

`/plan` invokes the uniquely named `/skill:diffpi-plan`, which routes to per-verb workflow instructions even when a global `plan` skill exists. Natural-language requests such as “update the existing plan with this feedback” or “apply review notes to PLAN.md” can route to `update` when the target is unique; metadata and examples improve discovery but do not guarantee host routing. Use `/skill:diffpi-plan update <slug> <request>` when exact routing is required. `help` is informational; use your editor for optional human review of the plan files. `init` uses a lightweight bounded Worker to scaffold an incomplete DRAFT. `new` uses a Planner; `update` uses a low-thinking, context-inheriting Planner. Explicit `validate` works on a DRAFT or READY plan through a Planner; execution uses an attached Orchestrator. The main conversation collects material decisions, launches the job, and reports its ID and completed result. Children may delegate independent bounded work and inherit available tools, skills, and extensions without Diffpi filters. A shell process or separate Pi instance is not an attached child; an unexpected decision blocks a background run instead of asking a question there. Do not require specific dispatch or verification tool names as a preflight. Only if **no native subagent mechanism is available** may the caller offer a last-resort inline path via `ask_user_question` before substantive work. The question warns of reduced isolation/model-tier guarantees and that same-thread plan review is not independent. Decline or unavailable confirmation (including background children and noninteractive evals) blocks; a failed review, gate, implementation or individual child never causes silent fallback.

`init` leaves an incomplete DRAFT. `new` and `update` do not validate automatically. Before an update changes content, the Planner records the exact feedback and archives the current plan and numbered briefs in the sibling `revisions/` directory. Use `/plan validate` when you want a structural check and one independent review round for the current authoring cycle. The Planner keeps the reviewed snapshot, Git evidence, verdict, findings, and dispositions in its response, not in the live plan. A reviewer mutation invalidates the round. If a reviewer reports BLOCKING, later repairs do not change that verdict to PASS. `/plan finalize` validates a DRAFT before changing it to READY. `/plan go` never validates; it changes a DRAFT to READY, reads it back, and starts implementation. Explicit validation remains available for a READY plan.

`go --mode no-commit|commit|push` defaults to no-commit. The Orchestrator owns execution state, schedules phases, reconciles task completion, and runs project gates. Each Worker edits assigned source and tests, then checks only its own exact task line after focused verification. The Orchestrator checks that evidence before advancing. Commit and push require the chosen policy; push waits for CI on the exact pushed commit. The one-round rule applies to plan validation, not code reviews. If native subagents are unavailable, the caller asks for explicit approval before any inline execution.

## Execution progress

During `/plan go`, the Orchestrator gives each Worker the canonical execution worktree, the exact task line, and the relative log filename `.diffpi/plan/<plan-id>/logs.jsonl`. Workers append one JSON object per milestone to that file directly beside `PLAN.md`. Use the `progress` label for normal work and `deviation` only when implementation departs from the READY plan. No new plan events belong in a `logs/` directory or `.diffpi/logs/`; leave historical logs untouched.

The active plan metadata records the canonical worktree. This keeps progress tied to the worktree that owns execution, even when `.diffpi` is shared by worktrees. After focused checks pass, a Worker may check only its own exact task line. Failed or partial work stays unchecked. The Orchestrator still owns lifecycle status, project gates, Git, push, CI, and completion reconciliation.

Workers run in dependency order. Disjoint file scopes can run concurrently, but overlapping or uncertain scopes are serialized. Concurrency improves throughput for independent tasks; serialization prevents conflicting edits and unclear ownership. For example, a README shared by two tasks must be assigned to one Worker at a time, while separate documentation files can be handled independently.

## Review

`/review` invokes the bundled `/skill:diffpi-review`. Local workflows select a Markdown file and edit it directly; they do not use a local review backend. Remote workflows call `review_context` first and keep the resolved PR or MR. A bounded Worker creates a local file or remote draft. Remote draft creation fills the packaged PR template with actual changes and validation before it calls `review_new`. Reviewers inspect diffs; Workers make bounded source edits. The caller handles user decisions and short approved lifecycle calls. If a background job fails or does not return a completed result, report the blocker before further edits.

| Verb             | Effect                                                                           |
| ---------------- | -------------------------------------------------------------------------------- |
| `new`            | Create a local `REVIEW-{n}.md` file or a remote draft PR or MR.                  |
| `auto`           | Record findings in that local file, or stage remote findings without publishing. |
| `edit`, `status` | Print the local path or remote URL, or report state.                             |
| `address`        | Make bounded fixes and update local findings or reply to remote threads.         |
| `publish`        | Publish a remote review. Local publish is unsupported.                           |
| `complete`       | Approve, reject, or close a remote review. Local complete is unsupported.        |
| `merge`          | Check readiness and squash-merge a GitHub PR.                                    |

Local files live at `.diffpi/review/YYMMDD-{plan-or-ticket}/REVIEW-{n}.md`. Their finding IDs, replies, and checkboxes remain in the file. Remote comments stay pending until publish. Publish CLOSE sends a COMMENT review before closing the PR or MR; complete close closes it without publishing first. Local source edits remain uncommitted. Remote address commits use the approved Git workflow after checks. Report skipped and failed gates rather than treating them as passed.

## Configuration

Setup installs delegated agents into `$PI_CODING_AGENT_DIR/agents/` and reads optional model preferences from `~/.difflab/diffpi/config.yaml` or `config.json`. YAML takes precedence. Run `/skill:diffpi-doctor` after changing that configuration to rematerialize delegated profiles without rerunning full setup. Historical session entries from removed profile selection remain inert; no saved tool snapshot is restored.
