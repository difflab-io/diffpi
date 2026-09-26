# Review

## Overview

The `/review` skill provides a review API for GitHub, GitLab, and local `tuicr` reviews. It exposes tools for selecting a target, reading diffs, staging comments, addressing threads, publishing review state, and completing or merging reviews.

`tuicr` is the UI layer. Forge-specific adapters and review backends synchronize remote comments; local comments use `tuicr`.

## Requirements

- Local review selection is explicit through `--local` or a working-tree target.
- Remote reviews require a supported forge and its configured integration.
- Remote comments remain pending until `review_publish`.
- Publish and complete do not merge. Merge is a separate GitHub-only action.
- Review records remain stable across worktrees and unrelated repositories do not share them.

## Design

### Review API

The review API has two observable layers:

- VCS operations select and inspect a review target, create draft reviews, manage lifecycle state, and merge where supported.
- Review operations read and stage comments, list threads, store replies, resolve threads, and publish review status.

The public tools are:

| Tool                                   | Contract                                                              |
| -------------------------------------- | --------------------------------------------------------------------- |
| `review_context`                       | Resolve the repository, target, backend, and matching review session. |
| `review_status`                        | Report branch, worktree, local/remote review, URLs, and tuicr state.       |
| `review_open`                          | Open an existing remote PR/MR in the system browser; never creates one.   |
| `review_new` / `review_edit`           | Create or open a local review or remote draft without generating findings. |
| `review_diff`                          | Return the working-tree or forge diff.                                |
| `review_gates`                         | Run available formatting, lint, test, subject, and CI checks.         |
| `review_submit` / `review_add_comment` | Stage review findings or a single comment.                            |
| `review_comments` / `review_respond`   | Read threads and store replies.                                       |
| `review_publish`                       | Publish pending review work with a selected status.                   |
| `review_complete`                      | Approve, reject, abandon, or archive a review.                        |
| `review_merge`                         | Recheck and squash-merge an approved GitHub PR.                       |
| `review_launch_ui`                     | Launch the `tuicr` review UI or return a command.                     |

### Observable behavior

- A target may be a PR/MR, URL, branch, or current branch. Unsupported remotes are not silently treated as local reviews.
- `--local` selects the current branch plus uncommitted changes and local `tuicr` review state. Launches use `tuicr -w -r <base>..HEAD`; if no PR base or supported forge default exists, they fail explicitly.
- Remote comments use forge-specific adapters and backends; local comments use `tuicr`. When `/review edit` opens a remote PR session, `/review publish` promotes its local draft comments to the forge before submission; `--local` remains available for working-tree reviews.
- Automated review runs only through the explicit `auto` workflow. It reads the diff, runs gates, and stages findings in the selected backend.
- Local address sessions are saved at `.diffpi/review/{slug}.md` so replies and thread state persist between runs. The rendered ledger places each original source comment beside its recorded agent response and outcome evidence.
- Zed integration uses stable global runtime-resolver tasks because Zed has no external task invocation hook. Tasks resolve the current worktree and branch at runtime; they are not rewritten per review.
- `/review` and `/plan` are thin aliases for their skills. Each skill executes its tool workflow directly in the foreground; `--bg` delegates one named child through the available Agent tool and preserves the foreground mode. A background child does not redispatch itself.

## Implementation

The package exposes the `review_*` tools and `diffpi_template`. The skill workflow selects the target and invokes these tools; tools provide the observable review behavior without requiring callers to know backend implementation details.

## References

- [User guide](../user-guide.md#review)
- [`src/vcs/`](../../packages/pi/src/vcs/)
- [`src/review/`](../../packages/pi/src/review/)
- [`src/tools/review.ts`](../../packages/pi/src/tools/review.ts)
- [`src/extensions/tuicrx.ts`](../../packages/pi/src/extensions/tuicrx.ts)
- [Environment architecture](environment.md)
