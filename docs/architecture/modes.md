# Agent profiles and inline modes

## Overview

Diffpi has two related contracts: the **current** inline-mode controller and the **proposed** shared-agent workflow. They must not be conflated. The controller reads Markdown profiles, selects a profile for the next foreground model turn, and restores it from Pi session state. The workflow profiles describe how Planner, Reviewer, Orchestrator, and Worker roles should be used by plan and review skills; those role rules are policy, not proof that the runtime enforces them.

## Current behavior

### Profile discovery and selection

The controller discovers bundled profiles and trusted project/global agent files. Standard discovery omits skill-owned profiles; a qualified `skill:agent` request enables that discovery. `inline: false` profiles are not selectable inline. The public controls are `diffpi_modes_list`, `diffpi_modes_set`, and `diffpi_modes_unset`, routed by `/skill:mode`.

Selection applies on the **next model turn**:

1. It captures the current model, thinking level, active tools, and prompt baseline.
2. It applies the profile's `prompt_mode` (`replace` or `append`), `thinking`, ordered `model` plus `model_fallbacks`, and `tools`.
3. Model preferences are matched against the current model registry. Unavailable preferences are skipped; if none match, the current model remains active.
4. The effective tool list is the intersection of requested names and the current registered tool names, plus the four mode-control tools (`diffpi_modes_list`, `diffpi_modes_set`, `diffpi_modes_unset`, and the mode status/control surface). Frontmatter/catalog names alone are not callable tools.

The selected profile snapshot and baseline are stored in branch-aware session entries. Compaction, reload, resume, fork, and tree/branch navigation reapply a stored profile when one exists; navigation without a stored profile restores the previous baseline. Clearing restores the baseline model, thinking level, tools, and prompt. Pi restores model and thinking entries during tree navigation; the mode controller owns tool restoration.

The current implementation does **not** guarantee that every advertised profile tool is callable. Selection fails when the requested profile cannot be resolved, but missing optional tools are filtered. Declared tool names in profile frontmatter are not necessarily callable tools in the live registry. It does not provide process isolation, permission enforcement, or a separate conversation: inline mode is not a security boundary.

### Profile contract

Profiles currently carry these fields:

- `display_name`, `description`, and Markdown body: identity and prompt.
- `prompt_mode`: `replace` or `append`.
- `model`: primary provider/model reference.
- `model_fallbacks`: Diffpi's ordered inline fallback list.
- `thinking`: Pi thinking level.
- `tools`: requested tool names, later filtered against the live registry.
- `inline`: whether the profile is eligible for inline selection.

`model_fallbacks` is a Diffpi controller field. Delegated `pi-subagents` profiles use the plugin's singular `model` field; setup may materialize the first available configured preference there. That materialization is separate from foreground mode selection.

## Target/proposed role policy

The following is the intended plan/review contract, not current runtime behavior:

| Role                 | Intended model/thinking | Intended callable capability                                                                                                               | Mutation boundary                                                                  |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Planner              | frontier/high           | read/write/edit inspection plus plan authoring and Agent by policy                                                                         | Writes the authoritative plan files by policy; this is not a Pi tool-path sandbox. |
| diffpi-plan-reviewer | frontier/high           | read/search-only inspection, structural checks, plan quality/consistency/risk review, and per-task lightweight Worker executability checks | One independent verified invocation; no source, plan, or review mutation.          |
| Orchestrator         | medium                  | foreground `/plan go` or one initial same-session `--bg` child; may delegate Workers                                                       | Owns coordination, status, gates, Git, and CI by policy; not a source editor.      |
| Worker               | low                     | bounded source/test reads and edits                                                                                                        | Edits only declared scope; does not commit or change plan status.                  |
| source Reviewer      | frontier/high           | review inspection and bounded lightweight Worker delegation                                                                                | May request bounded Worker edits; does not directly broaden scope.                 |

The single `diffpi-plan-reviewer` invocation combines structural format checks, overall plan quality/consistency/risk review, and per-task lightweight Worker executability checks. It remains read/search-only and independently verified; it is not a separate pass or fallback profile. A background child has its own effective tools, is not automatically equivalent to the parent's tool list, and never redispatches itself. `subagentx` currently only validates RPC v2, sends `type`, prompt, cwd, background, and context inheritance to `pi-subagents`, and returns a task id; the role/tool restrictions above remain policy unless the delegated runtime enforces them.

### Exact failure contract (target)

A role must stop with the exact blocker when its required `Agent`, `read`, `write`, `edit`, `review`, or model override is missing. It must not silently substitute a weaker role or claim that a tool is callable because it appears in profile frontmatter. Current inline selection does not yet implement this target blocker contract for every role.

## Safeguards versus policy

**Implemented safeguards:** trusted discovery for project files; profile and baseline persistence in branch-aware session state; ordered model matching with current-model fallback; live tool filtering; mode-control tools retained; structured subagent escalation parsing; background spawn requires RPC v2 and a returned task id.

**Policy only:** Planner writes only plan files; the unified read/search-only `diffpi-plan-reviewer` invocation; independent verification; Orchestrator ownership of gates/Git/CI; Worker scope and no-commit rules; exact missing-capability blockers; background-child non-redispatch; role-specific model and thinking guarantees. Documentation must describe these as target/proposed until the relevant runtime enforces them.

## Public controls

- `diffpi_modes_list`: list selectable profiles; `includeSkills: true` includes qualified skill-owned ids.
- `diffpi_modes_set`: select a profile for the next turn.
- `diffpi_modes_unset`: clear it and restore the baseline.
- `/skill:mode`: direct selection, `clear`, or a picker backed by `ask_user_question`.

## References

- [`packages/pi/src/modes.ts`](../../packages/pi/src/modes.ts)
- [`packages/pi/src/extensions/subagentx.ts`](../../packages/pi/src/extensions/subagentx.ts)
- [Pi skills](https://pi.dev/docs/skills)
- [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents)
