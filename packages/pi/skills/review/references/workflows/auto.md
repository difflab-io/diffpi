# auto

## Parse arguments

Accept `auto [target] [--local]`. Fuzzy-match review intent and infer the current branch, PR/MR or working-tree target/backend from the request and repository. Prefer explicit arguments/flags, then safe inference, then current-review defaults. Select local for an explicit working-tree request. Call `ask_user_question` only for material ambiguity before launch; return a precise blocker if a new decision arises later.

## Steps

1. Resolve the concrete target/backend/local and diff scope with `review_context` without analyzing the diff. Read [review standards](../review-standards.md). Substitute actual values for every placeholder, including the exact request, resolved review-context target, diff scope, issue URL if applicable, and standards; never send raw `{placeholders}`. When native subagents are available, launch a frontier/high `diffpi-reviewer` background subagent with the following self-contained prompt and ambient capabilities:

   ```text
   Review this change without editing source.
   - Repository: {absolute repo cwd}; exact request: {exact request}.
   - Resolved review-context target: {target}; backend: {backend}; local: {local}; diff scope: {diff scope}; issue URL: {issue URL or none}; approved policy: {policy}.
   - Review standards: {standards}.
   - Call review_context first; reuse its target/backend/local/cwd. Reject unsupported forge, missing integration or unavailable local base without switching backend.
   - Use review_status if needed to distinguish an existing review. Call review_new for a new local session or remote draft PR/MR; call review_edit for an existing review.
   - Run review_gates, then review_diff. Judge intent, correctness, negative/security paths, scope and duplicate findings. Record failed and skipped format/lint/test/subject/CI checks; stop with evidence if the diff is unavailable.
   - Stage changed-file-and-line-grounded BLOCKING, CONSIDER or NOTE findings with review_submit; submit [] if clean. Include overall issues and not-verified checks where needed. Keep remote findings pending and local findings in draft.
   - Do not edit source, publish, complete, merge or resolve threads.
   - Delegate bounded independent checks when useful, with self-contained task prompts and ambient capabilities. The plan's exactly-one independent review limit does not apply to PR/MR code review.
   - Verify and report artifact, backend, gates, finding count and blockers.
   ```

2. If no native subagents are available, follow [foreground fallback](foreground-fallback.md) before analysis or creation. Only after explicit confirmation, execute the review steps above inline without source edits, following the same standards and staging findings via `review_submit`; label the result foreground fallback. Otherwise verify the attached launch. Stop on failure; report the actual completed child outcome, not merely its queued ID or claim of success.
