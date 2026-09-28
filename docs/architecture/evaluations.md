# Plan evaluations

## Purpose

Plan evaluations run the shipped `/skill:plan` workflow against a small, isolated repository. Promptfoo owns test-case scheduling, `llm-rubric` grading, pass/fail thresholds, and result reporting. A passing evaluation checks the generated plan and its review evidence; it does not prove that application code was implemented or that the separate five-phase fixture replay passed.

## Components

- `evals/promptfooconfig.yaml` is the Promptfoo configuration. It loads named test cases from `evals/cases/*.yaml`, the plan provider, and the read-only judge provider.
- `evals/cases/<name>.json` contains the fixture, ordered skill prompts, and per-stage timeout. Its matching YAML file contains one Promptfoo test case and the two readable judge rubrics. The YAML test description and `vars.case` equal `<name>`.
- `evals/providers/pi-plan.ts` implements Promptfoo's custom provider. Promptfoo can run independent test cases concurrently. The provider starts one Bun worker process per case to keep Pi environment variables and sessions isolated.
- `evals/providers/pi-plan-worker.ts` copies the fixture into `.tmp/evals/<name>-*/project`, starts one Pi SDK session, and runs `new` followed by `update` in that same session. It saves `new.md`, `update.md`, `reviews.json`, the fixture files, and any generation error. Each snapshot includes plan files, Git changes, ordered tool calls, and observed Plan Reviewer results. Generation errors become Promptfoo provider errors, not negative judge verdicts.
- `evals/providers/pi-judge.ts` transports grading prompts to a separate Sol/high Pi session with no tools, skills, or project context. It returns the model response; Promptfoo's `llm-rubric` assertions alone decide scores and pass/fail. `plan_verify` is only a layout check, never a judge substitute.

One Promptfoo test case runs both dependent stages sequentially. Its `plan-new` assertion judges only the snapshot before the update; `plan-update` judges the current snapshot against that baseline. Other named cases can run in parallel because each provider call has its own process, fixture, and output directory. The worker removes its temporary agent directory and copied authentication on exit. The judge uses the existing Pi authentication file with a temporary, empty agent directory and removes that directory after grading.

## Commands and evidence

```bash
mise run eval:list
mise run eval:run plan-tic-tac-toe
mise run eval:all
```

These are root mise tasks. `eval:run` selects a single test by its exact case name; `eval:all` lets Promptfoo schedule all cases with its configured concurrency. Promptfoo's full results, including both assertion scores and reasons, are written to `.tmp/evals/results/<name-or-all>-*/promptfoo.json`. The provider response also records the corresponding generation artifact directory. Inspect `new.md`, `update.md`, and `reviews.json` there to see what was actually generated and reviewed. `mise run clean` removes `.tmp/evals/` but preserves unrelated `.tmp` data. Do not run clean before inspecting a failed evaluation.

To add a case, add its fixture, an ordered `new`/`update` JSON scenario, and a YAML test case with the same slug. Keep generation and grading separate: custom providers may transport prompts and evidence, but only Promptfoo rubrics judge the candidate. Do not make test success depend on text searches or `plan_verify` output.
