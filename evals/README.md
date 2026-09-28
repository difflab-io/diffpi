# Named plan evals

Promptfoo runs the named evals. Use the root mise tasks to list, select, or run all cases:

```bash
mise run eval:list
mise run eval:run plan-tic-tac-toe
mise run eval:all
```

Install dependencies with `mise run install` first. A live run needs Pi, the `@tintinweb/pi-subagents` extension, and access to `openai-codex/gpt-5.6-sol` through the existing Pi authentication. Promptfoo is a pinned root development dependency and requires Node.js 22.22 or newer. Runs make model calls and may take several minutes.

`evals/promptfooconfig.yaml` loads `evals/cases/*.yaml` as test cases. Each case has a same-named JSON file containing a fixture, ordered `new` and `update` skill prompts, and a timeout. The YAML case defines `plan-new` and `plan-update` LLM rubrics. To add a case, create a fixture, a JSON scenario, and one YAML test case whose description and `vars.case` equal the filename slug; the glob includes it in `eval:all` automatically. `eval:run` selects it by exact description. The `mise-tasks/eval-command` task invokes Promptfoo; it does not grade or orchestrate cases.

Promptfoo calls `evals/providers/pi-plan.ts` once per case. That provider starts an isolated Bun worker so independent cases may run concurrently without sharing Pi environment variables. The worker runs `new → update` in one fixture and saves the actual plan files, `new.md`, `update.md`, `reviews.json`, and any generation error under `.tmp/evals/<name>-*/`. The response contains both snapshots, and its metadata names that directory. Promptfoo calls `evals/providers/pi-judge.ts` with no tools to grade each stage from its rubric. The full Promptfoo result with both scores and reasons is under `.tmp/evals/results/<name-or-all>-*/promptfoo.json`. Provider errors and judge failures remain distinct; no regex or mechanical verifier result determines a grade.

`mise run clean` removes `.tmp/evals/` but leaves unrelated `.tmp` data intact. Inspect any failing artifacts before cleaning. See [evaluation architecture](../docs/architecture/evaluations.md) for execution, security, and evidence boundaries.
