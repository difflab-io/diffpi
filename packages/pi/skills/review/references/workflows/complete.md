# complete

**Owner/tier:** lifecycle coordinator; no Reviewer or Worker.

1. Parse target, `--local`, or exactly one remote action: approve, reject, abandon. Call `review_context` first with the same values. If a remote action is missing, ask with `ask_user_question`; background mode must stop rather than guess.
2. Call `review_complete` with local true for local archive or the mapped remote action. Local completion archives the overlay and removes the matching tuicr session; remote completion does not merge.
3. Report archive/result and any failure. Never publish or call `review_merge`.
