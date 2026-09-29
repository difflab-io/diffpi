# `/plan init`

**Owner:** background Planner. The main thread gathers any necessary decisions and dispatches an attached Agent, without narrowing resources.

1. Require callable `Agent` and `get_subagent_result` before edits; name either missing capability and stop. The background Planner owns plan scaffolding and may delegate bounded work when useful.
2. Resolve the initiating nested Git root and unique flat `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/` directory (one date-prefixed name, not `date/slug`). Inspect collisions before creating anything; on collision, stop without overwriting.
3. Successively create the live directory, `PLAN.md`, and phase scaffolds with ordinary writes. Put `INCOMPLETE` in the visible `DRAFT` document; it is a marker, not a status enum.
4. Read every created file back and report paths.

**Effects:** only live plan files change. **Failure:** preserve partial files and report the exact path, command, and error; no background questions or foreground authoring fallback. Return job ID and completed result to the initiating conversation.
