# open

1. Parse an optional title, intent, base branch, and `--local`.
2. Call `review_context`.
3. With `--local`, call `review_open` with `local: true`. The tool auto-detects the current branch PR/MR and opens it in tuicr; when no PR/MR exists, it opens working-tree changes.
4. Without `--local`, derive a concise title and intent from the branch and change context, then call `review_open`. The tool loads `review/draft-pr.md` from the generic template registry, preferring `~/.difflab/diffpi/templates/review/draft-pr.md` over the bundled default, renders it, and creates a draft PR/MR against the requested or repository default branch.
5. Report the PR/MR URL or the tuicr launch instruction. Do not publish or merge.
