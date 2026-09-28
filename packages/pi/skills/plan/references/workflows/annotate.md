# `/plan annotate`

**Owner/tier:** Human, interactive/read-only coordinator. **Tools:** tuicr `--file` or direct-file review plus read. **Children:** none; no automatic reviewer.

Open the selected live plan in tuicr with `--file`, or conduct a direct-file human review. Keep comments tied to current PLAN.md/brief paths. The human decides whether to apply edits; if edits are requested, return to `/plan update` or `/plan finalize` explicitly.

**Effects:** only the human review artifact/comments may change. **Failure:** report the exact file or tuicr error and leave plan files unchanged. Do not rewrite, dispatch, mark ready, or run an automated second pass.
