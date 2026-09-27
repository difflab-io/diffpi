# `/plan update`

**Owner/tier:** Planner, frontier/high. **Tools:** read/write/edit/find/grep, `diffpi_modes_set`, `diffpi_modes_status`, Agent, get_subagent_result, steer_subagent. **Child:** exactly one independent `diffpi-plan-reviewer`, frontier/high, read/search-only.

1. Switch to Planner and verify `diffpi_modes_status` on the next turn; stop on unavailable switch or unverifiable evidence.
2. Select exactly one plan by repository-root path. Read current `PLAN.md`, every numbered brief, and the request. Preserve intent, IDs, completed evidence, ownership, dependencies, and order.
3. Research affected code, then successively edit/write authoritative live files and read each back. Keep the marker `DRAFT` (and any `INCOMPLETE` marker) until explicit finalize or go.
4. Invoke exactly one reviewer over the complete current plan. Verify actual model, thinking, and tools evidence. Repair actionable findings and rerun that same reviewer only within bounded attempts.

**Failure:** preserve visible edits and report exact evidence; block on ambiguity, unavailable role/reviewer evidence, failed review, or exhausted repair. No fallback reviewer, redispatch, or background questions.
