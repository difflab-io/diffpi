# publish

## Parse arguments

Accept `publish [target] [--comment|--approve|--request-changes|--close]`. Local publish is unsupported; reject stale `--local` or working-tree selectors. Fuzzy-match target/backend/status from the request and repository. Prefer explicit arguments/flags, then safe inference, then current-review target and comment status. Call `ask_user_question` only for material ambiguity before launch; return a precise blocker if a new decision arises later.

## Steps

1. Call `review_context` first with the selected remote target/backend and `local:false`. For a short, explicitly approved publication with no substantive inspection, call `review_publish` directly using its resolved values and selected status (`COMMENT` by default, `APPROVE`, `REQUEST_CHANGES`, or `CLOSE`). Remote findings and replies stay pending until this call. Reject stale local or working-tree selectors; never promote local drafts. Report unmatched promotion, GitLab request-changes rejection, and exact failures; verify the final status. Do not merge or resolve threads.
2. If the request instead needs substantive inspection or judgment before publication, when native subagents are available, delegate only that analysis to medium `diffpi-orchestrator` in the background with ambient capabilities. Fill every field in this self-contained prompt with actual values (or `none`), including the exact request; never send raw placeholders:

   ```text
   Inspect publication readiness without publishing.
   - Repository: {absolute repo cwd}; exact request: {exact request}.
   - Resolved target: {target}; backend: {backend}; local: {local}; selected status: {status}; issue URL: {issue URL or none}; approved policy: {policy}.
   - Call review_context first; reuse its target/backend/local/cwd. Inspect the matching session and pending findings/replies; identify unmatched drafts, failed checks and material decisions. Do not silently switch backends.
   - Return actual completed evidence and a go/no-go recommendation or precise blocker. Do not publish, complete, merge or resolve threads.
   ```

3. If no native subagents are available for step 2, follow [foreground fallback](foreground-fallback.md) before inspection; only after explicit confirmation inspect inline and report actual evidence without claiming an Orchestrator result. Otherwise require the completed inspection result, not a queued job or claim. Resolve material decisions with the user, then call `review_publish` in the initiating thread only if approval still applies. Report the actual published or blocked outcome.
