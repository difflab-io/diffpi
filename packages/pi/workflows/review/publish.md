# publish

1. Read the typed target and status flags from `Arguments`. The default is comment.
2. Local mode is not accepted; local reviews use immutable revision dumps and have no publish step.
3. Call `review_context`, then `review_publish` with the selected status.
4. Report the public review status and final PR/MR state. Publishing never merges.
