# new

1. Call `review_context`, `review_diff`, and `review_gates`.
2. Review the diff for intent, correctness, slop, and adversarial risk. Build findings `{ file, line, severity, body, reference }` and collect un-anchorable BLOCKING issues separately.
3. Call `review_submit` with findings, overallIssues, and notVerified; pass `local: true` for the local flow.
4. Report the artifact path and comment count.
