# merge

1. Call `review_context` and confirm the GitHub PR is open, non-draft, clean, and its checks are settled. Do not require an approval from the current user; authors cannot approve their own PRs. GitHub branch protection remains authoritative.
2. If a conventional squash subject is required and the subject is unclear, use `ask_user_question`.
3. Call `review_merge` with the chosen subject.
4. Report the merge result.
