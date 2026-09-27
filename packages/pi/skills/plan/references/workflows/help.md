# `/plan help`

**Owner/tier:** User, read-only. **Tools:** read/grep/find only. **Children:** none.

Explain the verbs and ownership: `init` creates an `INCOMPLETE` live draft; `new` creates a complete plan; `update` edits one selected plan; `annotate` is optional human tuicr/direct-file review; `finalize` reviews and marks `READY`; `go` reviews drafts then orchestrates execution; `help` does nothing. Explain `--bg` launches exactly one named same-session Planner or Orchestrator child with the exact verb/target/cwd/commitMode, without redispatch or questions.

**Effects:** none. **Failure:** unknown or missing input returns this help; no files, reviewer, dispatch, or managed plan calls.
