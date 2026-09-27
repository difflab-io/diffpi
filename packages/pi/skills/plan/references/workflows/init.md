# `/plan init`

**Owner/tier:** Planner, frontier/high. **Tools:** read/write/edit/find/grep, `diffpi_modes_set`, `diffpi_modes_status`. **Children:** none.

1. Switch to Planner with `diffpi_modes_set`; on the next turn verify `diffpi_modes_status`. If either call or evidence is unavailable, stop with the exact error.
2. Resolve the initiating nested Git root and unique date/slug. Inspect collisions before creating anything; on collision, stop without overwriting.
3. Successively create the live directory, `PLAN.md`, and phase scaffolds with ordinary writes. Put `INCOMPLETE` in the visible `DRAFT` document; it is a marker, not a status enum.
4. Read every created file back and report paths.

**Effects:** only live plan files change. **Failure:** preserve partial files and report the exact path, command, and error; do not dispatch or ask questions in background. Foreground may ask one material goal question before writing.
