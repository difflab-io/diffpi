# address

## Parse arguments

Accept `address [target] [--local]`. Fuzzy-match the review target/backend from the request and repository. Prefer explicit target/`--local`, then safe inference, then the current-review default. Select local for an explicit working-tree request. Infer commit approval only from an actual user instruction. Call `ask_user_question` only for material ambiguity before launch; return a precise blocker if a new decision arises later.

## Steps

1. Resolve the concrete target/backend/local and review scope with `review_context` without classifying threads. Read [review standards](../review-standards.md). Substitute actual values for every placeholder, including the exact request, resolved review-context target, review scope, issue URL if applicable, and standards; never send raw `{placeholders}`. When native subagents are available, launch a frontier/high `diffpi-reviewer` background subagent with the following self-contained prompt and ambient capabilities:

   ```text
   Address every thread on this review.
   - Repository: {absolute repo cwd}; exact request: {exact request}.
   - Resolved review-context target: {target}; backend: {backend}; local: {local}; review scope: {review scope}; issue URL: {issue URL or none}; approved commit policy: {policy}.
   - Review standards: {standards}.
   - Call review_context first; reuse its target/backend/local/cwd. Call review_comments; classify every thread, preserve IDs and report unmatched threads. Apply every relevant requested change now unless explicitly deferred by the user or concretely blocked.
   - Delegate independent, bounded non-overlapping source/test edits to lightweight/low diffpi-worker agents with ambient capabilities. Each self-contained fenced text task prompt must supply the actual repository, target/backend/local, thread IDs and exact requests, assigned file scope, acceptance checks and no-lifecycle-mutation policy; fill real values before launch, never raw placeholders. Serialize uncertain or overlapping scopes. Keep your source review read-only. Collect completed worker results, inspect actual edits and verification; escalate hard or ambiguous work instead of silently deferring it. Workers must not commit, reply, publish, complete, merge, resolve or mutate review state.
   - Run review_gates after edits; record failed and skipped checks. For remote source changes, commit after checks and before replies through the user-approved upstream /git commit --no-push workflow (--atomic for separate logical commits). Do not commit without approval. Leave local source edits uncommitted.
   - Call review_respond for every thread with resolve:false, explicit fixed/answered/unresolved outcome and verification evidence. Do not claim blocked work was delivered. Keep questions and all threads open for user resolution. Optionally call review_launch_ui for local replies.
   - Never delete or resolve threads, publish, complete or merge. Report fixed, committed, answered, unresolved, skipped and failed counts, unmatched replies, gate evidence and blockers; resolved count is zero. Preserve local replies and thread state between runs.
   ```

2. If no native subagents are available, follow [foreground fallback](foreground-fallback.md) before classifying threads or editing. Only after explicit confirmation, perform the address steps above inline, including source/test edits directly where needed (do not invent Worker results), checks, approved commit policy, and `review_respond(resolve:false)` for every thread; report unresolved and blocked work honestly. Otherwise verify the attached launch. Stop on failure; report the actual completed child outcome, not merely its queued ID or claim of success.
