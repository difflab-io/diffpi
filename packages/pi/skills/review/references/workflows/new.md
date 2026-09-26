# new

## Arguments

```text
/review new [title] [--intent text] [--base branch] [--local] [--bg]
```

- `title` is the optional first positional argument; quote a title containing spaces.
- `--intent` and `--base` each consume the following value. `--local` is a boolean backend flag; the skill handles `--bg` before this workflow.
- Flags may appear in any order. Reject unknown or duplicate flags, missing flag values, and extra positional arguments. Stating this grammar before the procedure is intentional: an explicit argument contract is the best practice for making workflow behavior predictable and preventing ambiguous execution.

## Workflow

1. Parse the arguments using the grammar above after skill-owned background dispatch. A background child follows these steps directly and must not redispatch. A remote target is the current branch; `new` creates a new review rather than opening an existing one.
2. Call `review_context` first with `local: true` when `--local` is present, otherwise `local: false`.
3. Call `review_new` with the parsed title, intent, base branch, and the same explicit backend selection (`local: true` for `--local`, otherwise `local: false`). With `--local`, it creates and opens a local tuicr working-tree review. Without `--local`, it requires a clean, pushed branch, creates a draft PR/MR, and opens that PR/MR in tuicr.
4. If a local session or remote PR/MR already exists, direct the user to `edit` instead.
5. Report the PR/MR URL and whether tuicr opened in a mux, prepared a Zed task, or returned a command. Do not generate findings, publish, complete, or merge.
