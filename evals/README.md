# Named plan evals

Promptfoo runs the named evals. Use the root mise tasks to list, select, or run all cases:

```bash
mise run eval:list
mise run eval:run plan-tic-tac-toe
mise run eval:all
```

Install dependencies with `mise run install` first. A live run needs Pi, the `@tintinweb/pi-subagents` extension, and access to `openai-codex/gpt-5.6-sol` through the existing Pi authentication. Promptfoo is a pinned root development dependency and requires Node.js 22.22 or newer. Runs make model calls and may take several minutes.

`evals/promptfooconfig.yaml` loads `evals/cases/*.yaml` as test cases. Each case has a same-named JSON file declaring a fixture, ordered prompts, model, tools, extensions, skills, captured paths, and a per-stage timeout. Skill names must be unique and match the loaded `SKILL.md` names. The tic-tac-toe YAML case defines `plan-new` and `plan-update` LLM rubrics. To add a case, create a fixture, a JSON scenario, and one YAML test case whose description and `vars.case` equal the filename slug; the glob includes it in `eval:all` automatically. `eval:run` selects it by exact description. The native `mise-tasks/eval/{list,run,all}` tasks list cases or invoke Promptfoo; they do not grade cases.

Promptfoo calls the generic `evals/providers/pi-provider.ts` once per case. It runs Pi's SDK inside a separate process so independent cases may run concurrently without sharing process-wide `PI_*` settings. The tic-tac-toe case runs `new → update` in one uniquely named session and saves plan files, stage snapshots, `agents.json`, `sessions/`, and any generation error under `.tmp/evals/<name>-*/`. The response contains all snapshots; its metadata identifies the artifact directory and Pi session ID. Promptfoo calls `evals/providers/pi-judge.ts` with no tools to grade each stage from its rubric. The full Promptfoo result with both scores and reasons is under `.tmp/evals/results/<name-or-all>-*/promptfoo.json`. Provider errors and judge failures remain distinct; no regex or mechanical verifier result determines a grade.

`mise run clean` removes `.tmp/evals/` but leaves unrelated `.tmp` data intact. Inspect any failing artifacts before cleaning. See [evaluation architecture](../docs/architecture/evaluations.md) for execution, security, and evidence boundaries.
