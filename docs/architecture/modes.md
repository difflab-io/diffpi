---
globs:
  - 'packages/pi/agents/**'
  - 'packages/pi/skills/mode/**'
  - 'packages/pi/src/modes.ts'
  - 'packages/pi/src/tools/modes.ts'
  - 'packages/pi/extensions/index.ts'
  - 'packages/pi/tests/modes.test.ts'
---

# Agent profiles and inline modes

## Overview

Diffpi ships four shared agent profiles: `tutor`, `copilot`, `worker`, and `orchestrator`. The profiles are normal Markdown agent definitions for `@tintinweb/pi-subagents`. Tutor, copilot, and worker can also run inline in the current conversation. Orchestrator is delegated-only because it can launch other agents.

An inline mode applies the selected profile's prompt, first available preferred model, thinking level, and available tool set. Clearing the mode restores the model, thinking level, tools, and prompt that were active before selection.

## Requirements

### Functional

- The mode skill must list, select, clear, and explain inline modes.
- Standard discovery must exclude skill-owned agents unless the user requests them.
- A qualified `skill:agent` id must enable skill-agent discovery during direct selection.
- Selection must store the complete profile and previous runtime state in branch-aware session state.
- Model selection must try the profile's preferences in order and keep the current model when none are available.
- Tool selection must keep the mode-control tools available so the user can switch or clear a mode.
- Orchestrator must remain delegated-only and may route work to any available subagent.

### Non-functional

- Project discovery must require project trust.
- Status updates must not replace the shared footer.
- Public mode tool names must use the `diffpi_` prefix.
- Setup must not ask the user to configure model choices.
- Mode selection must fail safely when optional models or tools are unavailable.

## Design

### Components

```mermaid
graph TD
    Skill["mode skill"] --> Tools["diffpi_modes tools"]
    Tools --> Controller["mode controller"]
    Controller --> Profiles["agent Markdown"]
    Controller --> Runtime["model, thinking, and tools"]
    Controller --> Session["Pi session state"]
    Extension["package extension"] --> Controller
    Orchestrator["delegated orchestrator"] --> Agents["available subagents"]
```

- The `mode` skill routes command arguments and structured picker answers to the public tools.
- The controller discovers profiles, stores the selected snapshot and baseline runtime, applies the profile, and publishes status.
- Agent Markdown files define the same behavior for inline mode and delegated runs.
- `inline: false` excludes a profile from inline discovery without hiding it from the subagent plugin.

### Shared agent policy

| Agent          | Inline | Purpose                                                                | Preferred model route                           | Thinking | Tool policy                                        |
| -------------- | ------ | ---------------------------------------------------------------------- | ----------------------------------------------- | -------- | -------------------------------------------------- |
| `tutor`        | Yes    | Progressive teaching with verified docs, links, snippets, and examples | Sol, then Fable                                 | Medium   | Read-only code, docs, and focused web research     |
| `copilot`      | Yes    | Tandem editing with fast lookups and small implementation steps        | Luna, then Haiku, Qwen Flash, or DeepSeek Flash | Low      | Read, edit, commands, docs, and focused web lookup |
| `worker`       | Yes    | Execute a bounded plan and return precise failure context              | Luna, then Haiku, Qwen Flash, or DeepSeek Flash | Low      | Read, edit, and command tools only                 |
| `orchestrator` | No     | Schedule background agents and optimize routing, cost, and recovery    | Sol, then Fable                                 | High     | Read-only locally; `allowed_subagents: all`        |

The model names are provider catalog ids, not package dependencies. See the provider model references for [OpenAI](https://platform.openai.com/docs/models), [Anthropic](https://docs.anthropic.com/en/docs/about-claude/models/overview), [Qwen](https://qwenlm.github.io/), and [DeepSeek](https://api-docs.deepseek.com/). The primary `model` field is also understood by `@tintinweb/pi-subagents`. The `model_fallbacks` field is used by Diffpi inline mode.

Orchestrator uses background delegation by default. It builds a dependency graph, runs independent tasks in parallel, collects results, steers agents, retries transient failures, and escalates hard work to a stronger model. It does not edit files itself.

### API

#### `diffpi_modes_list`

Discovers standard inline agents. Set `includeSkills` to true to include skill-owned agents with `skill:agent` ids. Delegated-only profiles are omitted.

#### `diffpi_modes_set`

Validates an agent id and applies its complete runtime profile. The changes start on the next model turn.

#### `diffpi_modes_unset`

Clears the selected agent and restores the previous model, thinking level, tools, and default prompt.

#### `/skill:mode`

Calls the mode tools. With no arguments, the skill uses `ask_user_question` to show a structured picker.

```text
/skill:mode help
/skill:mode --include-skills
/skill:mode tutor
/skill:mode spec:planner
/skill:mode clear
```

## Implementation

### Discovery

Standard discovery reads bundled agents, global Pi agents, trusted `.agents/agents/` files, and trusted `.pi/agents/` files in that order. Later sources replace earlier agents with the same id. Files with `enabled: false` or `inline: false` are excluded.

Optional skill discovery reads global and trusted project `agents/*.md` files below skill directories. The controller qualifies each result as `skill:agent`.

### Runtime routing

The controller reads these frontmatter fields:

- `prompt_mode`: `replace` or `append`.
- `model`: the primary provider/model reference.
- `model_fallbacks`: comma-separated fallback references.
- `thinking`: Pi's thinking level.
- `tools`: comma-separated tool names.

Model matching prefers an exact provider/model reference, then an exact model id, then a token match. Unavailable preferences are skipped. Tools are filtered against the current tool registry. The four mode-control tools remain active even when a profile restricts tools.

Before the first mode selection, the controller snapshots the current model, thinking level, and active tools. It stores that baseline with the selected profile in branch-aware session state. Reload, resume, fork, and tree navigation reapply the selected profile. Clearing the mode or navigating to a branch without it restores the baseline.

### Prompt behavior

Replace mode uses only the agent body. Append mode keeps the normal Pi and Diffpi prompt before the agent body. The status key `diffpi-mode` shows `mode: <id>` without replacing the shared footer.

Inline mode is not a security boundary. It changes the active tool list but does not implement permission enforcement, isolation, or a separate conversation. Prior messages remain in context, and later extensions can modify the effective prompt. Use a delegated subagent when work needs isolation or nested delegation.

## References

- [Pi skills](https://pi.dev/docs/skills)
- [Pi extensions](https://pi.dev/docs/extensions)
- [Pi models](https://pi.dev/docs/models)
- [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents)
