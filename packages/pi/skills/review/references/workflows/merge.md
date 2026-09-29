# merge

## Parse arguments

Accept `merge [target]` and an optional conventional squash subject in the request. Fuzzy-match GitHub PR target from the request and repository. Prefer explicit target/subject, then safe inference, then current PR. Reject `--local`; do not infer it. Call `ask_user_question` only for material target or subject ambiguity before launch; return a precise blocker if a new decision arises later.

## Steps

1. Call `review_context` first with `local:false` and the selected target. Reject non-GitHub or local reviews without switching backend. For a short, explicitly approved merge requiring no substantive analysis, call `review_merge` directly with its resolved target and conventional squash subject if needed. The tool rechecks open, ready, clean PR status and settled CI; branch protection is authoritative, and current-user approval is not required unless protection requires it. Report the actual merge or exact readiness/CI/subject failure. Do not publish or complete in its place.
2. If merge-readiness requires substantive inspection or judgment beyond the tool's checks, when native subagents are available, delegate only that analysis to medium `diffpi-orchestrator` in the background with ambient capabilities. Fill every field in this self-contained prompt with actual values (or `none`), including the exact request; never send raw placeholders:

   ```text
   Inspect GitHub PR merge readiness without merging.
   - Repository: {absolute repo cwd}; exact request: {exact request}.
   - Resolved target: {target}; backend: remote GitHub; local: false; issue URL: {issue URL or none}; proposed conventional squash subject: {subject or none}.
   - Call review_context first with local:false; reuse its target/backend/cwd. Inspect PR readiness, subject and settled CI using review_status and available checks. Treat branch protection as authoritative; do not demand current-user approval unless protection requires it.
   - Return completed evidence and a go/no-go recommendation or precise blocker. Do not merge, publish, complete or resolve threads.
   ```

3. If no native subagents are available for step 2, follow [foreground fallback](foreground-fallback.md) before inspection; only after explicit confirmation inspect inline and report actual evidence without claiming an Orchestrator result. Otherwise require the completed result, not a queued job or claim. Resolve material decisions with the user, then call `review_merge` in the initiating thread only if approval still applies. Report the actual result.
