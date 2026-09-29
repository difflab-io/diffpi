# `/plan init`

## Parse arguments

Syntax: `init <slug> [--branch <branch>]` (optional target/issue inferred from request).

1. Infer scaffold intent, slug, branch and issue from explicit args/flags first, then natural language and the initiating Git root, then safe defaults. A positional slug is not required when inferable. Ask `ask_user_question` in the caller only for material ambiguity; send insufficient intent to [help](help.md).

## Steps

If no native subagents are available, ask for explicit confirmation in the caller and follow [the inline exception](inline-fallback.md); otherwise stop with a blocker. Do not silently scaffold inline.

1. Resolve the unique initiating Git root and absolute PLAN.md target. Replace every placeholder below with actual values (use `none` for absent issue/branch); never pass literal placeholders. Launch a low `diffpi-worker` background agent with this bounded prompt and ambient capabilities:

```text
Scaffold an incomplete live plan, and do nothing else.
- Exact request: {exact-request}
- Initiating Git root: {repo-root}
- Absolute PLAN.md target: {plan-path}
- Branch and issue: {branch-and-issue}
- Check collisions before writing. Use one flat `.diffpi/plan/<YYMMDD[-ticket]-short-slug>/` directory, never `date/slug`.
- Create PLAN.md and phase scaffolds with ordinary writes, DRAFT and a visible INCOMPLETE marker (not a status). This init-only exception permits plan-file creation, but not status transitions beyond the initial DRAFT scaffold, source edits, execution or review.
- Reread created files. Do not validate or launch a reviewer for the incomplete scaffold.
- Return created paths or the exact failed operation/path/error; return unresolved decisions as blockers without interactive questions.
```

2. Report the job ID and actual completed result or precise background-capability blocker. Do not scaffold in the caller.
