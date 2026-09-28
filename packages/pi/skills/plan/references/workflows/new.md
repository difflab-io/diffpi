# `/plan new`

**Owner/tier:** Planner, frontier/high. **Tools:** read/write/edit/find/grep, `diffpi_modes_set`, `diffpi_modes_status`, `plan_verify`, Agent, get_subagent_result, steer_subagent. **Child:** exactly one independent `diffpi-plan-reviewer`, frontier/high, read/search-only.

1. Select the shared inline profile with `diffpi_modes_set({agent: "planner"})` (not `plan:planner`) and verify `diffpi_modes_status` on the next turn; stop on unavailable switch or unverifiable evidence.
2. Resolve the initiating nested Git root and a flat `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/` directory (one date-prefixed directory, not `date/slug`). Check collisions and stop before writing an existing match. Research only after selection.
3. Successively write `PLAN.md` and one numbered brief per phase. Document each phase's high-level constraints in `PLAN.md` (use `None` if empty) without copying implementation details there. Do not repeat or paraphrase those phase constraints in a brief; reference the phase ID instead. Give each brief a `## Files Affected` section immediately after `## Objective` and before `## Tasks`, containing exactly one fenced `text` action-labeled file tree rather than Markdown bullets, with free-form `## Implementation Constraints` after tasks; optional implementation subheadings are not mandatory. Preserve phase/task parity, dependencies, scopes, and acceptance criteria; read every file back.
4. Run read-only `plan_verify` against the live directory and repair structural issues before invoking exactly one reviewer. Verify its attestation and review the complete current draft. Repair actionable findings, rerun `plan_verify`, then invoke the same named reviewer profile in a fresh `Agent` call (not `resume`) within bounded attempts.
5. Leave the plan marked `DRAFT` after a successful review. Do not write `READY`; only `/plan finalize` or draft `/plan go` may do that.

**Failure:** preserve visible files and exact evidence; block on collision, failed/unverifiable review, or exhausted repairs. Background never asks questions or redispatches.
