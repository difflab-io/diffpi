# open

1. Call `review_context`.
2. With `--local` or no forge, call `review_open` with `local: true`; report the record and printed command when no tab opened.
3. Otherwise call `review_open` and report the draft PR/MR URL.
4. Tell the user to fill the body, then run `/review new`.
