# new

**Owner/tier:** foreground or background lifecycle coordinator; no Reviewer or Worker required.

1. Parse title, intent, base, target, and `--local`. Call `review_context` first with the exact selection.
2. Call `review_new` with the same target/backend/local values. This creates a local tuicr review or remote draft PR/MR and opens it; use `review_launch_ui` only when needed.
3. Report the created target and draft state. Do not run findings, publish, complete, or merge.

Missing title/base, unsupported forge, dirty remote branch, or creation failure is an explicit error; never silently switch backend. `--bg` is one named child only.
