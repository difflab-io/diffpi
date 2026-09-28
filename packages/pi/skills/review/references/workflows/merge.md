# merge

**Owner/tier:** lifecycle coordinator; remote GitHub-only, no Reviewer or Worker.

Reject `--local`. Call `review_context` first with `local:false`, then `review_merge`; the tool checks open, non-draft, clean PR and settled checks and uses branch protection as authoritative. Approval by the current user is not required. Ask only when a conventional squash subject is materially unclear. Report merge or readiness failure. Merge never publishes or completes review state.
