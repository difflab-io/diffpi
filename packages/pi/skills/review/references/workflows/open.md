# open

## Parse arguments

Accept `open [target] [--local]`. Fuzzy-match the existing PR/MR or tuicr session from the request and repository. Prefer explicit arguments/flags, then safe inference, then the current-review target. Select local for an explicit working-tree request. Call `ask_user_question` only for material ambiguity.

## Steps

1. Call `review_context` first with the selected target/backend/local; reuse its target/backend/local/cwd. Reject unsupported selections without switching backend.
2. Call `review_open` for an existing remote PR/MR in the browser. For `--local`, call `review_edit` to open only the matching existing tuicr session.
3. Report the opened target or exact missing-session/browser/launch failure. Do not create a review, generate findings or mutate review state.
