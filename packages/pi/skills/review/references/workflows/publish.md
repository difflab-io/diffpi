# publish

**Owner/tier:** lifecycle coordinator; no Reviewer or Worker.

1. Parse target, `--local`, and one status: comment (default), approve, request-changes, or close. Call `review_context` first and preserve the selected backend. A local promotion may be used only when context identifies the matching local session; never silently switch.
2. Call `review_publish` with the same target/backend/local. It promotes/stages pending local work where applicable and publishes the selected status; remote comments remain pending until this call. Comment/approve/request-changes mark remote drafts ready; close publishes comment then closes. GitLab may reject request-changes.
3. Report promoted bodies/comments/replies, status, and final state. Publish never merges. Unsupported target, unmatched response, or forge failure is explicit.
