# `/plan finalize`

**Owner/tier:** Planner, frontier/high. **Tools:** read/write/edit, `diffpi_modes_set`, `diffpi_modes_status`, `plan_verify`, Agent, get_subagent_result, steer_subagent. **Child:** exactly one independent `diffpi-plan-reviewer`, frontier/high, read/search-only.

1. Select the shared inline profile with `diffpi_modes_set({agent: "planner"})` (not `plan:planner`) and verify `diffpi_modes_status` on the next turn; stop on unavailable switch or unverifiable evidence.
2. Select one live plan. Reread `PLAN.md` and all numbered briefs.
3. Run read-only `plan_verify` and repair any structural issues. Invoke exactly one reviewer for structure/parity, action labels, quality/risk, consistency, and Worker executability. Verify its attestation before trusting the report.
4. If findings are actionable, repair the live files, rerun `plan_verify`, and invoke the same named reviewer profile again with a fresh `Agent` call (not `resume`) within bounded attempts. Only after a current mechanical PASS and a completed attested reviewer PASS, write `READY` to `PLAN.md`.

**Effects:** only direct plan repairs and the `READY` marker change. Do not execute or freeze files. **Failure:** preserve evidence and remain `DRAFT`; report exact reviewer/preflight/error details. No fallback, redispatch, background questions, or retired plan tools.
