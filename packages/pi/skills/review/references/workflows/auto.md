# auto

## Parse arguments

Accept `auto [target] [--local]`. Resolve the target explicitly; ask when local plan/ticket matches are ambiguous.

## Local steps

Launch a background `diffpi-reviewer` for judgment when native subagents are available; it edits only the selected local Markdown file and never changes lifecycle state.

1. Inspect existing `.diffpi/review/**/REVIEW-*.md` files and select the matching file without fuzzy merging. If none exists, create one using the `new --local` procedure and `templates/REVIEW.md`.
2. Read the diff and review standards. Write findings directly into the selected Markdown file with stable IDs and `[ ]` checkboxes. Preserve existing findings, replies, evidence, and state; never overwrite history or merge similar findings automatically.
3. Record skipped gates and blockers honestly, then report the exact file path. Local review files remain uncommitted unless the caller requests otherwise.

## Remote steps

Call `review_context`, use `review_new` or `review_edit` as appropriate, run gates and diff review, and stage findings through the existing remote review tools. Do not use local file behavior for a remote target.
