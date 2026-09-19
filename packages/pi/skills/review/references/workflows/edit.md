# edit

1. Parse an optional PR/MR number, URL, or branch target and `--local`.
2. Call `review_context` with the same target and backend selection.
3. Call `review_edit`. With `--local`, it opens an existing local tuicr session. Without `--local`, it opens an existing PR/MR in tuicr, including a non-draft PR/MR for continued work on its comments.
4. If no matching local session or remote PR/MR exists, report the error and direct the user to `new`. Do not create a review, generate findings, publish, complete, or merge.
5. Report whether tuicr opened in a mux, prepared a Zed task, or returned a command.
