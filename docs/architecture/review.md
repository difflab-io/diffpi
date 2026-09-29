# Review

## Overview

**TARGET contract:** The `/review` skill supports GitHub, GitLab, and local `tuicr` reviews. `review_context` selects the target and backend; `--local` selects the working-tree backend and must remain consistent through the workflow. `tuicr` is the UI layer, while forge adapters own remote state.

**Execution contract:** A high-tier Reviewer owns SOURCE CODE judgment and is read-only for source edits. The Reviewer may invoke review tools to stage findings and respond to threads; the lifecycle coordinator owns new, publish, complete, and merge. A bounded Worker may edit source only for `address`; the Worker never commits. Local thread resolutions remain user-owned. The Orchestrator delegates judgment to a Reviewer when needed, but never edits source. Review lifecycle coordination owns publish, complete, and merge; the high-tier Reviewer owns only auto judgment, address classification, and replies. No workflow silently changes the selected backend. Delegated agents inherit ambient tools, skills and extensions without Diffpi capability filters.

## Requirements

- Local review selection is explicit through `--local` or a working-tree target.
- Remote reviews require a supported forge and its configured integration.
- Remote comments remain pending until `review_publish`.
- Publish and complete do not merge. Merge is a separate GitHub-only action.
- Review records remain stable across worktrees and unrelated repositories do not share them.

## Design

### Workflow ownership

Every verb calls `review_context` first, then uses the effective backend and reports exact failures and skipped gates. `auto` (alias `launch`) is high-tier Reviewer judgment after `review_new`/`review_edit`, `review_gates`, and `review_diff`; the Reviewer may use `review_submit` to stage grounded findings. `new` creates a local `tuicr` draft or remote draft PR/MR; `open` opens an existing remote browser target (local preserves local behavior); `status` reports state without mutation; `edit` opens an existing session without findings. `address` is Reviewer classification, then bounded non-overlapping Worker edits, verification, and `review_respond(resolve:false)`; after checks and before replies, code changes require upstream `/git commit --no-push` (`--atomic` for separate logical commits), while local edits remain uncommitted. The Worker never commits; the coordinator owns that commit. It never publishes, completes, merges, or resolves threads; local thread resolutions remain user-owned. `publish` stages/promotes pending comments and status; `complete` approves/rejects/abandons or archives local state; `merge` is separate, remote GitHub-only, and requires an open, non-draft, clean PR with settled checks, subject to branch protection as authoritative, plus a conventional squash subject if needed. `help` is read-only informational.

**Failure/state rules:** preserve local/remote continuity; reject unsupported or missing targets rather than silently switching backends. Report failed or skipped gates, worker blockers, unmatched replies, and unresolved threads with evidence. Remote comments remain pending until `publish`; local comments remain a `tuicr` draft until promotion or completion. `complete` never merges, and `merge` never replaces review publication.

### Review API

The review API has two observable layers:

- VCS operations select and inspect a review target, create draft reviews, manage lifecycle state, and merge where supported.
- Review operations read and stage comments, list threads, store replies, resolve threads, and publish review status.

The public tools are:

| Tool                                   | Contract                                                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review_context`                       | Resolve the repository, target, backend, and matching review session.                                                                                                                                                      |
| `review_status`                        | Report branch, worktree, local/remote review, URLs, and tuicr state.                                                                                                                                                       |
| `review_open`                          | Open an existing remote PR/MR in the system browser; never creates one.                                                                                                                                                    |
| `review_new` / `review_edit`           | Create or open a local review or remote draft without generating findings.                                                                                                                                                 |
| `review_diff`                          | Return the working-tree or forge diff.                                                                                                                                                                                     |
| `review_gates`                         | Run available formatting, lint, test, subject, and CI checks.                                                                                                                                                              |
| `review_submit` / `review_add_comment` | Stage review findings or a single comment.                                                                                                                                                                                 |
| `review_comments` / `review_respond`   | Read threads and store replies.                                                                                                                                                                                            |
| `review_publish`                       | Publish pending review work with a selected status.                                                                                                                                                                        |
| `review_complete`                      | Approve, reject, abandon, or archive a review.                                                                                                                                                                             |
| `review_merge`                         | Recheck and squash-merge an open, non-draft, clean GitHub PR with settled checks; branch protection is authoritative, and a conventional squash subject is used if needed. Approval from the current user is not required. |
| `review_launch_ui`                     | Launch the `tuicr` review UI or return a command.                                                                                                                                                                          |

### Observable behavior

- A target may be a PR/MR, URL, branch, or current branch. Unsupported remotes are not silently treated as local reviews.
- `--local` selects the current branch plus uncommitted changes and local `tuicr` review state. Launches use `tuicr -w -r <base>..HEAD`; if no PR base or supported forge default exists, they fail explicitly.
- Remote comments use forge-specific adapters and backends; local comments use `tuicr`. When `/review edit` opens a remote PR session, `/review publish` promotes its local draft comments to the forge before submission; `--local` remains available for working-tree reviews.
- Automated review runs only through the explicit `auto` workflow. It reads the diff, runs gates, and stages findings in the selected backend.
- Local address sessions are saved at `.diffpi/review/{slug}.md` so replies and thread state persist between runs. The rendered ledger places each original source comment beside its recorded agent response and outcome evidence.
- Zed integration uses stable global runtime-resolver tasks because Zed has no external task invocation hook. Tasks resolve the current worktree and branch at runtime; they are not rewritten per review.
- `/review` and `/plan` are thin aliases for their skills. Substantive `new`, `auto`, and `address` work runs in attached background agents by default; they may delegate further independent bounded work. The main thread handles help/status, opening an existing PR or review UI, material user decisions, or short approved lifecycle calls without analysis. Publish/complete/merge requiring inspection also delegate. Missing `Agent` or `get_subagent_result` blocks before edits; background child completion is reported to the originating conversation. No detached process substitutes for an Agent. The one-round Plan Reviewer policy does not constrain PR/MR reviews.

## Implementation

The package exposes the `review_*` tools and `diffpi_template`. The skill workflow selects the target and invokes these tools; tools provide the observable review behavior without requiring callers to know backend implementation details.

## References

- [User guide](../user-guide.md#review)
- [`src/vcs/`](../../packages/pi/src/vcs/)
- [`src/review/`](../../packages/pi/src/review/)
- [`src/tools/review.ts`](../../packages/pi/src/tools/review.ts)
- [`src/extensions/tuicrx.ts`](../../packages/pi/src/extensions/tuicrx.ts)
- [Environment architecture](environment.md)
