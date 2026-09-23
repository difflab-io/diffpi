# Review

## Overview

The `/review` command loads package-owned workflows for GitHub, GitLab, and local `tuicr` reviews. Remote reviews use forge state directly. Local reviews use immutable revision dumps.

## Requirements

- `--local` explicitly selects the working-tree flow.
- Remote reviews require a supported forge and configured CLI integration.
- Remote comments remain pending until `review_publish`.
- Publish and complete do not merge. Merge remains a separate GitHub-only action.
- Local review dumps remain stable across worktrees.

## Design

### Local revisions

A local review launches `tuicr -w -r <base>..HEAD`. When the user closes the session, `review_dump` stores the reviewed diff, normalized comments, and exact raw tuicr output at:

```text
.diffpi/review/<branch-slug>/<revision>.json
```

The write uses `wx`, so an existing revision cannot be replaced. A successful dump removes the completed tuicr session. The address workflow applies that revision's feedback and launches a new session for the next revision. There are no local replies, thread ledgers, resolution markers, completion archives, or local-to-remote promotion.

### Remote reviews

GitHub and GitLab adapters create draft reviews, stage findings, list forge threads, post replies, and publish lifecycle events directly. Remote addressing commits code fixes through the `/git` workflow before responses are posted. Threads stay open unless the user explicitly requests resolution.

### Tools

| Tool                                   | Contract                                                        |
| -------------------------------------- | --------------------------------------------------------------- |
| `review_context`                       | Resolve the repository, target, backend, and tuicr session.     |
| `review_new` / `review_edit`           | Create or open a local review or remote draft.                  |
| `review_diff`                          | Return the working-tree or forge diff.                          |
| `review_gates`                         | Run formatting, lint, test, subject, and available CI checks.   |
| `review_submit` / `review_add_comment` | Stage findings in tuicr or the remote pending review.           |
| `review_dump`                          | Save one immutable local revision and remove its tuicr session. |
| `review_comments` / `review_respond`   | Read and reply to remote forge threads.                         |
| `review_publish`                       | Publish pending remote review work with a selected status.      |
| `review_complete`                      | Approve, reject, or abandon a remote review.                    |
| `review_merge`                         | Recheck and squash-merge a green GitHub PR.                     |
| `review_launch_ui`                     | Launch tuicr or return the command.                             |

## Implementation

The `/review` command resolves exact Markdown workflows from `packages/pi/workflows/review/`. The review skill supplies concise operating guidance instead of owning workflow copies. `src/review/local-reviews.ts` owns immutable local persistence; forge backends own remote state.

## References

- [User guide](../user-guide.md#review)
- [`src/vcs/`](../../packages/pi/src/vcs/)
- [`src/review/`](../../packages/pi/src/review/)
- [`src/tools/review.ts`](../../packages/pi/src/tools/review.ts)
- [`src/extensions/tuicrx.ts`](../../packages/pi/src/extensions/tuicrx.ts)
- [Environment architecture](environment.md)
