# merge

1. Parse an optional PR number, URL, or branch. This workflow is remote-only; reject `--local`. The skill has already handled `--bg`; a background child must not redispatch. Call `review_context` first with the target and `local: false`. Do not query the forge through MCP or duplicate merge-readiness checks: `review_merge` uses the GitHub CLI to confirm the PR is open, non-draft, clean, and its checks are settled before merging. Do not require approval from the current user; authors cannot approve their own PRs. GitHub branch protection remains authoritative.
2. If a conventional squash subject is required and the subject is unclear, use `ask_user_question`.
3. Call `review_merge` with the chosen subject. Treat its CLI-backed readiness result as authoritative.
4. Report the merge result.
