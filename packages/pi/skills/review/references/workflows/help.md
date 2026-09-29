# help

```text
/review auto [target] [--local] [--bg]
/review new [title] [--intent text] [--base branch] [--local] [--bg]
/review open [target] [--local]
/review status [target] [--local]
/review edit [target] [--local] [--bg]
/review address [target] [--local] [--bg]
/review publish [target] [--local] [--comment|--approve|--request-changes|--close] [--bg]
/review complete [target] [--local|--approve|--reject|--abandon] [--bg]
/review merge [target] [--bg]
```

Every target-bearing workflow calls `review_context` first; help is informational and may run without a target or repository. `--local` selects working-tree tuicr state and is preserved; otherwise use the forge. Substantive verbs run in attached background Agents by default (no `--bg` required), with nested delegation when useful and no resource filters. The main thread may answer help/status, open an existing target or UI, gather a user decision, or perform a short approved lifecycle action. Missing callable `Agent` or `get_subagent_result` blocks substantive work before edits; return job ID and completed result to the initiating conversation. `auto` reviews and stages grounded findings; `new` creates a draft; `open` opens an existing target; `status` is read-only; `edit` opens without findings; `address` fixes and replies without resolving; `publish` publishes/promotes pending work; `complete` approves/rejects/abandons or archives local state without merging; `merge` is GitHub-only and requires clean settled readiness. Aliases: create/draft=new, launch=auto, ready=publish, close=complete, land=merge. Unknown verbs show this help.
