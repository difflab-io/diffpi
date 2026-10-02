# edit

## Parse arguments

Accept `edit [target] [--local]`. Resolve the existing local review by explicit path or unique plan/ticket match; ask on ambiguity.

## Local steps

Print the selected `.diffpi/review/**/REVIEW-*.md` path. Read it before any edit, preserve all finding IDs, replies, evidence, and checkbox state, and use native `read`, `write`, `edit`, or shell operations only. Do not create a session, parser, backend, or browser launch.

## Remote steps

Call `review_context` and `review_edit`; report the PR/MR URL or selected local Markdown path. Never launch a browser.
