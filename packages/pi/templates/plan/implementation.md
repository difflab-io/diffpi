# Phase {{phase_ordinal}}: {{phase_title}}

- **Phase ID:** {{phase_id}}
- **Prerequisites:** {{phase_prerequisites}}

## Objective

{{phase_objective}}

## Files Affected

<!-- This is the sole file scope for this phase. Use one fenced text tree; label each file leaf [ADD], [MODIFY], [REMOVE], [MOVE from: path], or [VERIFY]. Do not repeat file scopes in tasks or PLAN.md. -->

```text
Phase {{phase_ordinal}}/
├── [MODIFY] <!-- exact/path/to/implementation-file -->
└── [VERIFY] <!-- exact/path/to/test-or-check -->
{{phase_files_affected}}
```

## Tasks

<!-- Keep tasks flat and in phase order. Repeat this shape for each task. -->

### 1. <!-- task title -->

- **Task ID:** <!-- stable task ID -->
- **Steps:**
  1. <!-- ordered implementation action -->
  2. <!-- ordered implementation action -->
- **Verify:**
  - <!-- command or inspection that proves this task -->
- **Acceptance:** <!-- observable result -->

{{phase_tasks}}

## Implementation Constraints

<!-- Free-form implementation details, not a restatement of PLAN.md phase constraints. Add only useful optional headings: Required Libraries & Technology Choices, Key Algorithm Specifications, Core Invariants. Refer to the PLAN.md phase ID instead of repeating a phase guardrail. -->

{{phase_implementation_constraints}}
