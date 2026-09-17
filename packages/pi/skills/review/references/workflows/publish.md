# publish

1. Parse an optional PR/MR id or URL, `--local`, and one status: `--comment`, `--approve`, `--request-changes`, or `--close`. The default is comment.
2. Call `review_context` with the target and backend selection.
3. For `--local`, call `review_publish` with `local: true`. The tool reads the exact tuicr session, promotes its unpublished line comments to a pending forge review, follows the stored local overlay path, posts unpublished replies to their remote threads, and then publishes the selected status. Question replies remain open. The tool does not post an overall review comment.
4. For a remote review, call `review_publish` without `local`. The existing pending forge comments already contain provenance, so the tool only publishes them with the selected status and no overall comment.
5. Comment, approve, and request-changes mark a draft PR/MR ready before publication. Close publishes pending work as comment status and then closes the PR/MR. GitLab rejects request-changes because it has no equivalent review state.
6. Report promoted comment and reply counts, the public status, and the final PR/MR state. Publishing never merges.
