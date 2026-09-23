# help

Show these commands:

- `/review auto [target] [--local] [--bg]` generates findings.
- `/review new [title] [--intent text] [--base branch] [--local] [--bg]` starts a review.
- `/review edit [target] [--local] [--bg]` opens an existing review.
- `/review address [target] [--local] [--bg]` applies feedback. Local mode dumps one revision and starts the next.
- `/review publish [target] [--comment|--approve|--request-changes|--close] [--bg]` publishes remote review work.
- `/review complete [target] [--local|--approve|--reject|--abandon] [--bg]` finishes without merging.
- `/review merge [target] [--bg]` merges a green remote review.
- `/review help` shows this reference.

`--local` selects the working-tree tuicr flow. Local reviews are immutable revision dumps with no replies, resolution state, or remote promotion. Remote reviews use GitHub or GitLab comments and lifecycle operations directly. `--bg` launches an Orchestrator without changing the foreground mode.
