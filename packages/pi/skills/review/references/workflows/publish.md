# publish

1. Parse an optional PR/MR id or URL, `--local`, and one status: `--comment`, `--approve`, `--request-changes`, or `--close`. The default is comment.
2. Call `review_context` with the target and backend selection.
3. For `--local`, call `review_publish` with `local: true`. The tool reads the exact tuicr session. A local line comment on the same file and line as an existing remote thread is treated as a response, not a new comment. A leading `[REOPEN]` or `[RESOLVE]` changes the thread state; the marker is removed from the response body. Other unpublished line comments become new review comments. The tool follows the stored local overlay path, posts unpublished replies to their remote threads, and then publishes the selected status. Question replies remain open. The tool does not post an overall review comment.
4. For a remote review, call `review_publish` without `local`. The existing pending forge comments already contain provenance, so the tool only publishes them with the selected status and no overall comment.
5. Comment, approve, and request-changes mark a draft PR/MR ready before publication. Close publishes pending work as comment status and then closes the PR/MR. GitLab rejects request-changes because it has no equivalent review state.
6. Report promoted comment and reply counts, the public status, and the final PR/MR state. Publishing never merges. If a response cannot be matched by file and line, report it as a new comment rather than silently attaching it to the wrong thread.
