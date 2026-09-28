# Phase {{phase_ordinal}}: {{phase_title}}

- **Phase ID:** {{phase_id}}
- **Prerequisites:** {{phase_prerequisites}}

## Objective

{{phase_objective}}

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

### Libraries and Algorithms

{{phase_libraries}}

### Constraints

{{phase_constraints}}

## Phase File Tree

<!-- This is the only file scope for the phase; do not repeat file scopes inside tasks or PLAN.md. Include exactly one tree. Label every file leaf with [ADD], [MODIFY], [REMOVE], [MOVE from: path], or [VERIFY]. -->

```text
Phase {{phase_ordinal}}/
├── [MODIFY] <!-- exact/path/to/implementation-file -->
└── [VERIFY] <!-- exact/path/to/test-or-check -->
{{phase_file_tree}}
```
