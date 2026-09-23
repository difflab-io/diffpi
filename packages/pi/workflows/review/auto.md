# auto

1. Read `Arguments.target` and `Arguments.local`.
2. Call `review_context` with the selected target and backend.
3. Create or open the review with `review_new` or `review_edit`.
4. Run `review_gates`, then call `review_diff` and review only that change.
5. Produce grounded findings and call `review_submit`. Local findings stay in tuicr. Remote findings stay pending until `/review publish`.
6. Report the backend, findings, gate results, artifact, and launch instruction. Do not publish, complete, or merge.
