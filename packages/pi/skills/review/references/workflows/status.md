# status

## Parse arguments

Accept `status [target] [--local]`. Fuzzy-match the status target/backend from the request and repository. Prefer explicit arguments/flags, then safe inference, then the current-review target. Select local for an explicit working-tree request. Call `ask_user_question` only for material ambiguity.

## Steps

1. Call `review_context` first with the selected target/backend/local; reuse its target/backend/local/cwd. Reject unsupported selections without switching backend.
2. Call `review_status` with those same values. Report branch, worktree, local or remote review, URLs, tuicr session, pending/draft state and exact errors. Do not create a review or mutate source, comments or lifecycle state.
