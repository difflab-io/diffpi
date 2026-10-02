# address

## Parse arguments

Accept `address [target] [--local]`. Resolve one unaddressed local file by explicit path or unique plan/ticket match; ask `ask_user_question` when matching is ambiguous. If no file exists but review text is pasted, create a file from `templates/REVIEW.md` and immediately address its findings.

## Local steps

Launch a background `diffpi-reviewer` for classification when native subagents are available; it delegates bounded source edits to `diffpi-worker` and keeps lifecycle state untouched.

1. Read the selected REVIEW.md and preserve existing replies, IDs, evidence, and checkbox state.
2. For each finding, inspect the source and run focused verification. Mark `[x]` only when verified; leave blocked or partial findings `[ ]` and explain the blocker in `Status Notes`.
3. Append an explicit reply/outcome and evidence to the Markdown file. Do not resolve or delete findings, publish, complete, invoke a backend, or use a parser.

## Remote steps

Call `review_context`, delegate review judgment to `diffpi-reviewer`, then use existing remote comments and gates. Keep threads open and do not publish, complete, merge, or resolve.
