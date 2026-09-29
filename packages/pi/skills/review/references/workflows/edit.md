# edit

## Parse arguments

Accept `edit [target] [--local]`. Fuzzy-match the existing tuicr or PR/MR session from the request and repository. Prefer explicit arguments/flags, then safe inference, then the current-review target. Select local for an explicit working-tree request. Call `ask_user_question` only for material ambiguity.

## Steps

1. Call `review_context` first with the selected target/backend/local; reuse its target/backend/local/cwd. Reject unsupported selections without switching backend.
2. Call `review_edit` with those values to open the existing local session or remote PR/MR in tuicr without generating findings. Keep remote-session draft comments associated with that PR/MR for later promotion at publish.
3. Report the opened session, returned launch command or exact missing-session/launch failure. Do not create, publish, complete, merge, resolve or generate findings.
