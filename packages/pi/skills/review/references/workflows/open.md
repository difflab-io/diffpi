# open

**Owner/tier:** lifecycle coordinator, read-only.

Call `review_context` first with the exact target/backend/local, then call `review_open`. It opens an existing remote PR/MR; it never creates one. With `--local`, preserve the local behavior selected by context. Report unsupported or missing targets and browser/launch failures; do not mutate review state.
