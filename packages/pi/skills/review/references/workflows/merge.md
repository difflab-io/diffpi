# merge

1. Parse an optional PR number, URL, or branch. This workflow is remote-only; reject `--local`. The skill has already handled `--bg`; a background child must not redispatch. Call `review_context` first with the target and `local: false`, then confirm the GitHub PR is open, non-draft, clean, and its checks are settled. Do not require approval from the current user; authors cannot approve their own PRs. GitHub branch protection remains authoritative.
2. If a conventional squash subject is required and the subject is unclear, use `ask_user_question`.
3. Call `review_merge` with the chosen subject.
4. Report the merge result.
