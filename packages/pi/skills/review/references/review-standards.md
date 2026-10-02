# Review standards

Use these rules for review and address workflows. Local reviews use the packaged `templates/REVIEW.md` file as a starting point and remain human-readable Markdown; remote reviews continue to use forge-backed tools.

## Local Markdown conventions

- Create or select one `.diffpi/review/YYMMDD-{slug}/REVIEW-{n}.md` file after inspecting existing files. Numbering is best effort, not an atomic allocator; ask when the plan or ticket match is ambiguous.
- Keep the plain `Status` field and stable finding IDs (`F-001`, `F-002`, ...). Use `[ ]` for open findings and `[x]` only after focused verification proves the resolution.
- Record pasted review text directly in the file. Preserve existing replies, evidence, IDs, and finding state. Add replies instead of rewriting history.
- Leave blocked or partial findings open and explain the blocker in `Status Notes`. Local publish and complete are unsupported.
- Do not claim that static tests prove agent execution semantics; use a manual temporary-directory exercise when a workflow needs behavioral confirmation.

## Operational workflow rules

- Each workflow parses its own arguments. Do not assume a parent `/review` command stripped `--bg` or selected a backend.
- Call `review_context` first, with `local: true` for `--local` and `local: false` for forge-backed work. Pass the same target and backend to every later lifecycle tool.
- Skill-owned aliases (`open`, `create`, `draft`, `launch`, and `close`) follow their named workflow; they do not bypass argument parsing or safety checks.
- `--bg` runs the complete workflow in a tracked background Orchestrator. Lifecycle ownership and publication/completion/merge safety remain unchanged.

## Intent

Check that the change serves the stated PR intent. Treat a missing required behavior as blocking.

## Correctness

Trace the main path and important failure paths. Check validation, persistence, retries, permissions, and user-visible errors.

## Scope

Reject unrelated churn, duplicate abstractions, speculative follow-ups, and generated code that does not reduce complexity. If a requested change is relevant, apply it in the current workflow. Defer only when the user explicitly defers it or a required decision is blocked.

## Design

Prefer existing package APIs and small public surfaces. Add a dependency when it is a maintained fit for the problem. Do not recreate a general-purpose parser, scheduler, or subagent system without checking installed packages first.

## Responses

Respond to every thread with an explicit outcome and verification evidence. Apply every relevant requested change now; “deferred”, “later”, and “follow-up” are not acceptable unless the user explicitly requested deferral. Mark a thread unresolved only for a concrete external blocker or material user decision, and include attempted fixes and evidence. Keep every thread open for the user to resolve. Address workflows must never resolve or delete threads.
