# Plan evaluations

## Purpose

Plan evaluations run the shipped `/skill:plan` workflow against a small, isolated repository. Promptfoo owns test-case scheduling, `llm-rubric` grading, pass/fail thresholds, and result reporting. A passing evaluation checks the generated plan and its review evidence; it does not prove that application code was implemented or that the separate five-phase fixture replay passed.

## Components

- `evals/promptfooconfig.yaml` is the Promptfoo configuration. It loads named test cases from `evals/cases/*.yaml`, the generic Pi provider, and the read-only judge provider.
- `evals/cases/<name>.json` declares the fixture, ordered prompts, model, optional agent directory, captured file paths, and per-stage timeout. It does not allowlist candidate tools, skills or package extensions. Its matching YAML file contains the Promptfoo judge rubrics.
- `evals/providers/pi-provider.ts` is Promptfoo's custom provider and Pi SDK integration. It launches itself in one Bun child process per case, so Promptfoo can run independent cases concurrently without sharing process-wide Pi environment variables. The child copies the fixture into `.tmp/evals/<name>-*/project`, runs every declared step in one named Pi session, and saves stage snapshots, `agents.json`, `launches.json`, `lifecycle.json`, `runtime.json`, the session under `sessions/`, the fixture files, and any generation error. Each snapshot includes captured files, Git changes, discovered package skills and callable tools, loaded extensions, ordered tool calls, and native background-child completion results. UI completion notifications are optional and may be consumed before reaching the session transcript. A missing required capability or incomplete child is a provider infrastructure error, not a negative quality score. The package manifest supplies resources; the subagent plugin is an additional host extension. Generation errors become Promptfoo provider errors, not negative judge verdicts.
- `evals/providers/pi-judge.ts` transports grading prompts to a separate Sol/high Pi session with no tools, skills, or project context. It returns the model response; Promptfoo's `llm-rubric` assertions alone decide scores and pass/fail. `plan_verify` is only a layout check, never a judge substitute.

The tic-tac-toe case runs its dependent `new` and `update` stages sequentially. Its `plan-new` assertion judges only the snapshot before the update; `plan-update` judges the current snapshot against that baseline. Other named cases can run in parallel because each provider call has its own process, fixture, and output directory. The provider gives the session a unique case-and-run name and a private session directory. Session IDs isolate conversation history; the separate process also isolates the `PI_*` settings read by the subagent extension. The child removes its temporary agent directory and copied authentication on exit. The judge uses the existing Pi authentication file with a temporary, empty agent directory and removes that directory after grading.

## Commands and evidence

```bash
mise run eval:list
mise run eval:run plan-tic-tac-toe
mise run eval:all
```

These are root mise tasks. `eval:run` selects a single test by its exact case name; `eval:all` lets Promptfoo schedule all cases with its configured concurrency. Promptfoo's full results, including both assertion scores and reasons, are written to `.tmp/evals/results/<name-or-all>-*/promptfoo.json`. The provider response also records the corresponding generation artifact directory. Inspect stage snapshots, `catalog.json`, `agents.json`, `launches.json`, `lifecycle.json`, `runtime.json`, and `sessions/` there to see what was generated and reviewed. `mise run clean` removes `.tmp/evals/` but preserves unrelated `.tmp` data. Do not run clean before inspecting a failed evaluation.

To add a case, add its fixture, a JSON scenario with ordered steps, and a YAML test case with the same slug. Keep generation and grading separate: custom providers may transport prompts and evidence, but only Promptfoo rubrics judge the candidate. Do not make test success depend on text searches or `plan_verify` output.
