# help

Print the following help text:

```text
Workflows for PRs and local review. Use:

Create a review and generate findings:
  /review auto [pr-or-branch] [--local] [--bg]

Create a local review or remote draft PR/MR:
  /review new [title] [--intent text] [--base branch] [--local] [--bg]

Open an existing review without generating findings:
  /review edit [pr-number|pr-url|branch] [--local] [--bg]

Address review comments:
  /review address [pr-number|pr-url|branch] [--local] [--bg]

Publish comments and a review status:
  /review publish [pr-number|pr-url|branch] [--local] [--comment|--approve|--request-changes|--close] [--bg]

Complete a review without merging:
  /review complete [pr-number|pr-url|branch] [--local|--approve|--reject|--abandon] [--bg]

Merge an approved remote review:
  /review merge [pr-number|pr-url|branch] [--bg]
```

`--local` selects the working-tree tuicr backend. Otherwise, a target is a PR/MR number, URL, or branch; no target means the current branch. `--bg` launches a tracked background Orchestrator and leaves the current chat mode unchanged. `new` creates a review. `edit` only opens an existing local session or remote PR/MR. `auto` creates a review, then delegates findings to the reviewer agent. `open`, `create`, and `draft` alias `new`; `launch` aliases `auto`; `close` aliases `complete`. `publish` publishes remote draft PR/MR review comments and status or promotes local comments. `complete` makes a lifecycle decision without merging, or archives the local overlay and deletes its tuicr session.
