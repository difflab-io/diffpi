# Review

## Overview

The `/review` skill supports two paths. Local reviews are Markdown files that agents read and edit directly. Remote reviews use GitHub or GitLab through the existing forge tools. The local path has no review backend, parser, sidecar, or browser launch.

## Local files

`/review new --local` creates `.diffpi/review/YYMMDD-{plan-or-ticket}/REVIEW-{n}.md` from the packaged `REVIEW.md` template. The agent selects a unique plan, ticket, or descriptive slug. It checks existing files before choosing the next number and asks the user when the match is ambiguous. Number selection is best effort, not atomic.

`auto --local` writes findings in the same format. `edit --local` prints the file path. `address --local` updates one unaddressed file, or creates it from pasted review text. Findings have stable IDs and checkboxes. The agent keeps existing replies and leaves failed or partial work open. Local publish and complete are unsupported. No `review_*` tool creates or edits local review files.

## Remote workflow

A remote workflow calls `review_context` first and keeps the resolved target. `new` reads the packaged PR template, inspects actual branch changes and checks, fills every section, then passes the rendered body to `review_new`. The tool rejects missing sections and template markers before it creates a draft PR or MR. `edit` prints the URL without opening a browser.

`auto` runs available gates, reads the diff, and stages grounded findings through `review_submit`. `address` classifies comments, assigns bounded source edits, runs focused checks, and replies through `review_respond`. Remote comments remain pending until `publish`. The Reviewer judges code; the caller owns lifecycle decisions. A Worker never publishes, completes, or merges.

Remote `publish` can send COMMENT, APPROVE, or REQUEST_CHANGES. Its CLOSE status publishes a COMMENT review and then closes the PR or MR. Remote `complete close` closes the PR or MR without first publishing a review. `complete approve` and `complete reject` publish their decisions. Neither command merges. `merge` applies to GitHub only and checks readiness and the squash subject before merging.

## Tool boundary

The package keeps remote `review_context`, `review_status`, `review_new`, `review_edit`, `review_diff`, `review_gates`, `review_submit`, `review_add_comment`, `review_comments`, `review_respond`, `review_publish`, `review_complete`, and `review_merge`. Local workflows use file operations instead. `review_open` and `review_launch_ui` are not part of the package.

The package does not manage editor tasks or keybindings for reviews. A failed gate, unavailable forge, ambiguous target, or missing approval blocks the affected action. The skill reports the actual result rather than treating a skipped check as passed.

## References

- [User guide](../user-guide.md#review)
- [`src/vcs/`](../../packages/pi/src/vcs/)
- [`src/review/`](../../packages/pi/src/review/)
- [`src/tools/review.ts`](../../packages/pi/src/tools/review.ts)
- [Environment architecture](environment.md)
