# `/plan finalize`

**Owner/tier:** Planner, frontier/high. **Tools:** read/write/edit, `diffpi_modes_set`, `diffpi_modes_status`, Agent, get_subagent_result, steer_subagent. **Child:** exactly one independent `diffpi-plan-reviewer`, frontier/high, read/search-only.

1. Switch to Planner and verify `diffpi_modes_status` on the next turn; stop on unavailable switch or unverifiable evidence.
2. Select one live plan. Reread `PLAN.md` and all numbered briefs.
3. Invoke exactly one reviewer for structure/parity, action labels, quality/risk, consistency, and Worker executability. Verify its attestation before trusting the report.
4. If findings are actionable, repair the live files and rerun the same reviewer only within bounded attempts. On a pass, write `READY` to `PLAN.md`.

**Effects:** only direct plan repairs and the `READY` marker change. Do not execute or freeze files. **Failure:** preserve evidence and remain `DRAFT`; report exact reviewer/preflight/error details. No fallback, redispatch, background questions, or retired plan tools.
