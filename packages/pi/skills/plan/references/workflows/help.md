# `/plan help`

## Parse arguments

Syntax: `help` (no flags or positional arguments required).

1. Match `help`, a missing/unrecognizable verb, or genuinely insufficient intent. Fuzzy-match recognizable natural-language plan requests to their verb before showing help. Do not treat an inferable missing positional argument as insufficient; give explicit arguments/flags precedence over request/repository inference, then safe defaults.

## Steps

1. Show the complete usage below for explicit help or truly unrecognizable/insufficient intent. Identify any invalid argument in the error context without losing the original request.

```text
/plan init <slug> [--branch <branch>]
/plan new <slug> <request>
/plan update <slug> <request>
/plan annotate <plan-path>
/plan validate <slug> [--plan <plan-path>]
/plan finalize <slug>
/plan go <slug> [--mode no-commit|commit|push]
/plan help
```

2. Describe these argument shapes as guidance rather than rigid gates; send a recognizable request to its verb for inference. Make no plan changes.
