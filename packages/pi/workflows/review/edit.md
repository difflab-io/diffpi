# edit

1. Read `Arguments.target` and `Arguments.local`.
2. Call `review_context`, then `review_edit`.
3. Local mode opens the current working-tree review revision. Remote mode opens the existing PR/MR in tuicr.
4. If no review exists, direct the user to `/review new`.
5. Report the launch result. Do not create findings or change lifecycle state.
