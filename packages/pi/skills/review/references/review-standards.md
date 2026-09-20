# Review standards

Use these rules for review and address workflows.

## Intent

Check that the change serves the stated PR intent. Treat a missing required behavior as blocking.

## Correctness

Trace the main path and important failure paths. Check validation, persistence, retries, permissions, and user-visible errors.

## Scope

Reject unrelated churn, duplicate abstractions, speculative follow-ups, and generated code that does not reduce complexity. If a requested change is relevant, apply it in the current workflow. Defer only when the user explicitly defers it or a required decision is blocked.

## Design

Prefer existing package APIs and small public surfaces. Add a dependency when it is a maintained fit for the problem. Do not recreate a general-purpose parser, scheduler, or subagent system without checking installed packages first.

## Responses

Respond to every addressed thread. State what changed and include verification evidence. Keep every thread open for the user to resolve. Address workflows must never resolve or delete threads.
