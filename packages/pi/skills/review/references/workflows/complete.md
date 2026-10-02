# complete

## Parse arguments

Accept `complete [target] [--approve|--reject|--close]`. Local complete is unsupported; reject stale `--local` or working-tree selectors. Fuzzy-match target/backend/action from the request and repository. Prefer explicit arguments/flags, then safe inference, then current-review target; do not invent a remote action. Call `ask_user_question` only for material ambiguity before launch; return a precise blocker if a new decision arises later.

## Steps

1. Call `review_context` first with the selected remote target/backend and `local:false`. For a short, explicitly approved completion with no substantive inspection, call `review_complete` directly using its resolved values. A remote review needs an explicit `approve`, `reject`, or `close` action. `approve` and `reject` publish their decisions; `close` closes the remote PR/MR without publishing first. Verify and report the actual result or exact failure. Do not merge or resolve threads.
2. If substantive inspection or judgment is required, when native subagents are available, delegate only that analysis to medium `diffpi-orchestrator` in the background with ambient capabilities. Fill every field in this self-contained prompt with actual values (or `none`), including the exact request; never send raw placeholders:

   ```text
   Inspect completion readiness without changing review state.
   - Repository: {absolute repo cwd}; exact request: {exact request}.
   - Resolved target: {target}; backend: {backend}; local: {local}; issue URL: {issue URL or none}; approved remote action: {action or none for local}.
   - Call review_context first; reuse its target/backend/local/cwd. Inspect only the matching review/session and report outstanding findings, status and material decisions. Do not switch backend.
   - Return actual completed evidence and a go/no-go recommendation or precise blocker. Do not complete, publish, merge or resolve threads.
   ```

3. If no native subagents are available for step 2, follow [foreground fallback](foreground-fallback.md) before inspection; only after explicit confirmation inspect inline and report actual evidence without claiming an Orchestrator result. Otherwise require the completed result, not a queued job or claim. Resolve material decisions with the user before calling `review_complete` in the initiating thread if approval still applies.
