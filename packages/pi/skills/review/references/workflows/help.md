# help

## Parse arguments

Accept `help` or a request with no recognizable review verb; no positional arguments or flags. Prefer an explicit verb, then safely inferred natural-language intent, then help. Ask only if a material ambiguity prevents routing to a workflow.

## Steps

1. Show the complete subcommand list:

   ```text
   /review new [title] [--intent text] [--base branch] [--local]
   /review auto [target] [--local]
   /review open [target] [--local]
   /review status [target] [--local]
   /review edit [target] [--local]
   /review address [target] [--local]
   /review publish [target] [--local] [--comment|--approve|--request-changes|--close]
   /review complete [target] [--local|--approve|--reject|--abandon]
   /review merge [target]
   /review help
   ```

2. Show aliases: `create`/`draft` → `new`, `launch` → `auto`, `ready` → `publish`, `close` → `complete`, `land` → `merge`.
