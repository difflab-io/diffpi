# User Guide

## Install and validate

Install Pi, then install the package:

```bash
pi install npm:@difflab/pi
```

Run `/skill:diffpi-setup` to validate or configure the environment. Validation calls `diffpi_validate` and changes nothing. Setup asks before installing missing tooling, subagents, and optional Linear, Jira, GitHub, or GitLab integrations; reload Pi when setup requests it. The package manifest provides all bundled skills. Hosts may expose different tool transports; report an actual workflow blocker rather than requiring a particular callable name as a preflight.

## Plan work

Plans are live `PLAN.md` and numbered phase briefs in `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/`. Phase constraints and prerequisites belong in PLAN.md; each brief has one action-labeled fenced `text` Files Affected tree immediately after Objective, then ordered task steps, verification, acceptance criteria and implementation guidance.

```text
/plan init eng-123-api-cache --branch feature/cache
/plan new eng-123-api-cache add cache invalidation to the API
/plan update eng-123-api-cache tighten the rollback criteria
/plan validate eng-123-api-cache
diffpi plan annotate .diffpi/plan/<YYMMDD-eng-123-api-cache>/PLAN.md
/plan finalize eng-123-api-cache
/plan go eng-123-api-cache --mode no-commit
/plan help
```

The root `/plan` skill routes to per-verb workflow instructions. `help` is informational; `annotate` opens optional human `tuicr --file` review. `init` uses a lightweight bounded Worker to scaffold an incomplete DRAFT. `new` uses a Planner; `update` uses a low-thinking, context-inheriting Planner. Separate DRAFT-only `validate` uses a Planner, while execution uses an attached Orchestrator. The main conversation collects material decisions, launches the job, and reports its ID and completed result. Children may delegate independent bounded work and inherit available tools, skills, and extensions without Diffpi filters. A shell process or separate Pi instance is not an attached child; an unexpected decision blocks a background run instead of asking a question there. Do not require specific dispatch or verification tool names as a preflight. Only if **no native subagent mechanism is available** may the caller offer a last-resort inline path via `ask_user_question` before substantive work. The question warns of reduced isolation/model-tier guarantees and that same-thread plan review is not independent. Decline or unavailable confirmation (including background children and noninteractive evals) blocks; a failed review, gate, implementation or individual child never causes silent fallback.

`init` leaves an incomplete DRAFT. After each `new` or user-initiated `update` cycle, separate `validate` checks the DRAFT and reuses the cycle's completed reviewer round or runs one independent `diffpi-plan-reviewer` round over the complete plan. The coordinator records hashes of plan files and Git state around the completed child result, its actual verdict and findings, and each disposition. A reviewer mutation invalidates the round. The reviewer is instructed not to mutate, but this is not a sandbox. Planner repairs findings, rereads changed files, and reruns only structural verification; there is no automatic second review of repaired text. An original BLOCKING verdict remains BLOCKING even after its findings are resolved. The plan stays DRAFT until the finalizer or draft `go` caller checks completed review evidence, every blocking disposition, explained changes, and current structural validity before marking READY. Already-READY `go` skips validation and reviewer/structural revalidation. A repaired plan must not be described as reviewer-approved. With explicitly confirmed no-subagent fallback, validation performs a distinct read-only inline Plan Reviewer checklist pass once per authoring cycle and records `INLINE reviewer (same thread, not independent)`, approval, verdict, findings/dispositions and the same before/after hashes and Git evidence. It does not invent a child result or independent PASS. After passing inline structural and review/disposition validation, `finalize` or draft `go` may mark READY under this recorded exception; failed checks still block.

`go --mode no-commit|commit|push` defaults to no-commit. Orchestrator alone updates status and checkboxes, schedules prerequisite phases, serializes overlapping scopes, and runs project gates. Execution Workers edit only bounded source/test scopes and never change plan state or commit; the explicitly assigned `init` Worker may scaffold an incomplete DRAFT. Commit and push require the chosen execution policy; push waits for exact-SHA CI before the next phase. The one-round rule applies to **plan validation only**, not code reviews. If execution also lacks native subagents, an explicitly confirmed caller may perform the same bounded execution inline, with unchanged gates, authorization and exact-SHA CI policy.

## Review

The root `/review` skill routes to per-verb workflow instructions for local `tuicr` and GitHub/GitLab reviews. Keep the selected target and `--local` backend for every call. `review_context` is the first tool for each target-bearing workflow. The main thread may answer help/status, open an existing review or UI, gather user decisions, or perform a short approved lifecycle action with no underlying analysis. Creating drafts uses a lightweight bounded Worker; reviewing and addressing use attached background subagents. Short approved publish/complete/merge lifecycle calls run directly in the caller when no substantive inspection is needed; otherwise inspection delegates. Reviewer judgment may fan out independent Worker edits. Return background job IDs and completed outcomes to the originating conversation. Do not require specific dispatch tool names as a preflight; if attached launch or collection of the completed result actually fails, report the blocker before substantive edits.

| Verb                     | Effect                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `auto`                   | Run gates and review the diff; stage findings without publishing.                                                   |
| `new`                    | Create a local review or remote draft PR/MR.                                                                        |
| `open`, `edit`, `status` | Open an existing PR, open a `tuicr` UI, or report state.                                                            |
| `address`                | Classify threads, fix bounded source changes, run gates, and reply with `resolve:false`; do not publish or resolve. |
| `publish`                | Publish pending comments and selected status.                                                                       |
| `complete`               | Approve/reject/abandon remote review or archive a local review, without merging.                                    |
| `merge`                  | GitHub-only squash merge after open/non-draft/clean/settled readiness checks.                                       |

Remote comments stay pending until publish. Local source edits remain uncommitted. Remote address commits use the approved upstream Git workflow after checks. Report skipped and failed gates rather than treating them as passed.

## Configuration

Setup installs delegated agents into `$PI_CODING_AGENT_DIR/agents/` and reads optional model preferences from `~/.difflab/diffpi/config.yaml` or `config.json`. YAML takes precedence. Re-run setup after changing that configuration to rematerialize delegated profiles. Historical session entries from removed profile selection remain inert; no saved tool snapshot is restored.
