# new

1. Read `Arguments.title`, `Arguments.intent`, `Arguments.base`, and `Arguments.local`.
2. Call `review_context` with the selected backend.
3. Call `review_new`. Local mode opens a working-tree review in tuicr. Remote mode creates a draft PR/MR from a clean pushed branch and opens it in tuicr.
4. If the target exists, direct the user to `/review edit` instead.
5. Report the created target and launch instruction. Do not generate findings or publish it.
