# `/plan help`

**Owner/tier:** User, read-only. **Tools:** read/grep/find only. **Children:** none.

Explain the verbs and ownership: `init` creates an `INCOMPLETE` draft; `new` creates a complete draft with one independent Plan Reviewer round; `update` edits one plan with one round per user authoring cycle; `annotate` is optional human tuicr/direct-file review; `finalize` marks READY only with completed review evidence, dispositions and current structural verification; `go` marks READY if needed and executes phases; `help` does nothing. Substantive verbs launch an attached background Planner or Orchestrator with exact request/target/cwd/commit policy and full ambient capabilities. Children may delegate again. Missing `Agent`, `get_subagent_result`, or `plan_verify` is named before edits, never silently worked around. No inline profile switch or automatic second plan review.

**Effects:** none. **Failure:** unknown or missing input returns this help; no files, reviewer, dispatch, or managed plan calls.
