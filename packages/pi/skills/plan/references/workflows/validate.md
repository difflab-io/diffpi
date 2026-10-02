# `/plan validate`

## Parse arguments

Syntax: `validate <slug>` (optional `--plan <plan-path>` or `--target <plan-path>`).

1. Infer validation intent and a unique target from explicit args/flags first, then natural language and repository context. Do not require an inferable slug. Ask `ask_user_question` in the caller for material ambiguity; send insufficient intent to [help](help.md).

## Steps

If DRAFT and no native subagents are available, ask for explicit confirmation in the caller and follow [the inline exception](inline-fallback.md), including a distinct read-only inline Plan Reviewer pass; otherwise stop with a blocker. Never claim an independent review for inline work.

1. Resolve the initiating Git root, absolute PLAN.md and every numbered brief path. If the plan is inactive READY, perform the manual validation below; do not return early. READY does not require revalidation for go. For DRAFT, fill all placeholders with real values before launch (use `none` where appropriate). Validation is explicit and memory-only. Do not write validation proof, snapshots, findings, dispositions, or verdicts to PLAN.md or any plan artifact. Launch a separate frontier/high `diffpi-planner` background agent with ambient capabilities:

```text
Validate this DRAFT without marking it READY or executing tasks.
- Exact request: {exact-request}
- Initiating Git root: {repo-root}
- Absolute PLAN.md path: {plan-path}
- Absolute numbered brief paths: {brief-paths}
- Read PLAN.md and all numbered briefs. Run a working read-only structural check of the whole current draft; name the capability used or block if none works. Check task ID/title parity, prerequisites/constraints, sole action-labeled fenced `text` Files Affected tree immediately after Objective, ordered tasks and temporally runnable Verify commands. Repair structural errors only within the plan and rerun the structural check.
- Identify this authoring cycle. If one independent completed whole-plan diffpi-plan-reviewer round already exists for the cycle with valid before/after memory-only proof, reuse it; never dispatch a second reviewer on repeated validate or after repairs. Otherwise capture every plan file path/hash plus Git HEAD, porcelain status, diff and untracked inventory in memory, then launch at most ONE independent frontier/high diffpi-plan-reviewer background agent. Fill its prompt with the actual absolute plan/brief paths, hashes and Git evidence before dispatch:

  Reviewer task: Read PLAN.md and every numbered brief at {reviewed-plan-paths-and-hashes} with Git evidence {git-head-status-diff-untracked}. Make no mutations. Review structure, parity, phase prerequisites/constraints, Files Affected tree placement, ordered steps, temporally runnable Verify commands, intent/design consistency, risks and lightweight Worker executability. Return completed verdict and findings; each finding includes file, line, BLOCKING/CONSIDER/NOTE severity, reason and concrete fix. Return an explicit empty findings list for PASS. Do not claim source implementation is verified.

- Require the reviewer's actual completed result, not queued/partial/stopped output or self-reported identity. Compare plan hashes and Git HEAD/status/diff/untracked inventory immediately after review. Invalidate the round on reviewer mutation, incomplete evidence or unexplained change. Use any real available dispatch/completion implementation, not one named tool prerequisite.
- Keep the reviewed snapshot, Git evidence, completed verdict, findings and dispositions in the validation result's response/memory only. Keep proof in memory only; do not write it into PLAN.md, References, revisions, or logs. Repair actionable findings only when explicitly requested by the validation workflow, reread changed files and rerun ONLY the read-only structural check. Preserve the original BLOCKING verdict; never claim reviewer PASS for repaired content. A later user-initiated change starts a new authoring cycle, but repeated validation does not.
- Return validation PASS only when structural checks pass, the one completed review round and memory-only proof are valid, every BLOCKING finding has a resolved disposition, and all post-review changes are explained. Otherwise return precise blockers. Leave DRAFT; no background questions.
```

2. Collect the actual completed result, not only a job ID. Report validation verdict, reviewed and current snapshots, dispositions or blockers. Do not mark READY.
