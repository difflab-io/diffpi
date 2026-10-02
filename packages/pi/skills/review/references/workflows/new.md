# new

## Parse arguments

Accept `new [title] [--intent text] [--base branch] [--local]`. Resolve explicit target, plan/ticket, title, and backend first. For local work, ask `ask_user_question` when multiple plans or tickets match; do not guess.

## Local steps

Use a background `diffpi-worker` when native subagents are available; otherwise follow the foreground fallback after confirmation. The worker performs only direct-file creation.

1. Inspect `.diffpi/review/` and the matching plan/ticket directory before choosing a number. Derive `YYMMDD-{slug}` from the unique matching plan after stripping its date prefix, otherwise the ticket ID, otherwise a descriptive slug.
2. Create `.diffpi/review/YYMMDD-{slug}/REVIEW-{n}.md` by reading `templates/REVIEW.md` and writing a copy. Numbering is best effort, not atomic; preserve existing files.
3. Fill every known title, intent, target, base, and status field. If review text was pasted in the request, record it directly in the file and assign stable `F-001`-style IDs. Preserve replies and checkbox state on later edits.
4. Report the exact path. Do not call `review_new`, create a backend, or claim atomic allocation.

## Remote steps

Call `review_context`, then launch a `diffpi-worker` only for draft creation. Give the worker the resolved repository, branch, base, issue URL (if any), and exact request. The worker must:

1. Read the packaged PR template at `../../templates/review/draft-pr.md` relative to the review skill directory. Inspect the actual branch changes against the selected base and any completed checks; do not invent validation results.
2. Fill **every** template section: distinct intent and concrete changes, checks actually run (or `Not run (draft)`), the issue URL (or `No linked issue`), and known further work (or `Not yet assessed`). Remove all `{{...}}` markers and HTML comments. Pass the fully rendered Markdown as `body` to the existing `review_new` tool, with the resolved title/base/issue URL. The tool rejects missing or incomplete bodies before calling the forge.
3. Report the actual PR/MR URL and draft state or the precise failure. Do not publish, complete, merge, or stage findings.
