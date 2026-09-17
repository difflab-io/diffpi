# address

1. Call `review_context` and `review_comments`.
2. Read each target file around its referenced line and propose a concrete fix.
3. In local mode, write proposals for the user. Otherwise apply approved fixes, then use the forge MCP or `review_respond` to reply and resolve each addressed thread.
4. Report applied, skipped, and failed counts; remind the user to commit with the git workflow.
