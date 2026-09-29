# new

## Parse arguments

Accept `new [title] [--intent text] [--base branch] [--local]` and a target named in the request. Fuzzy-match draft intent. Prefer explicit arguments/flags, then safe natural-language or repository title/intent/target/base/backend, then available defaults. Select local for an explicit working-tree request. Call `ask_user_question` only for material ambiguity before launch; return a precise blocker if a new decision arises later.

## Steps

1. Resolve the concrete target/backend/local and base with `review_context`. Substitute actual values for every placeholder, including the exact request and issue URL if applicable; never send raw `{placeholders}`. When native subagents are available, launch a lightweight/low `diffpi-worker` background subagent for this bounded draft-creation task. Pass the following self-contained prompt with ambient capabilities:

   ```text
   Create a review draft.
   - Repository: {absolute repo cwd}; exact request: {exact request}.
   - Resolved target: {target}; backend: {backend}; local: {local}; title: {title}; intent: {intent}; base: {base}; issue URL: {issue URL or none}; approved policy: {policy}.
   - This explicitly assigned review-draft creation is the only review lifecycle mutation authorized here. Call review_context first. Reuse its target/backend/local/cwd for all subsequent calls; never switch backend silently.
   - Reject unsupported forge, dirty remote branch or unavailable local base/default with exact evidence.
   - Call review_new to create the local tuicr review or remote draft PR/MR. Call review_launch_ui only if needed; report a returned launch command if automatic launch fails.
   - Verify and report the actual created target and draft state or exact failure. Do not stage findings, publish, complete or merge.
   ```

2. If no native subagents are available, follow [foreground fallback](foreground-fallback.md) before creation. Only after explicit confirmation, perform the draft-creation steps above inline and verify with `review_status`; do not claim a Worker result. Otherwise require the completed child result and verify the created target/draft with `review_status`. Stop on failure; report the actual result, not merely a queued ID or claim. Do not assign the Worker publication, merge, findings judgment or substantive inspection.
