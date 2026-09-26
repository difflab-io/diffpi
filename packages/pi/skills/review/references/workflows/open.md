# open

Call `review_context` first. Without `--local`, call `review_open` to resolve an existing PR/MR and open its URL in the system browser. It must never create a PR/MR; if none exists, direct the user to `/review new`. If browser launch fails, show the plain URL. With `--local`, call `review_new` with `local=true` to preserve local working-tree behavior.
