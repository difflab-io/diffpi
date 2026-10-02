# help

Show:

```text
/review new [title] [--intent text] [--base branch] [--local]
/review auto [target] [--local]
/review edit [target] [--local]
/review address [target] [--local]
/review publish [target] [--comment|--approve|--request-changes|--close]
/review complete [target] [--approve|--reject|--close]
/review merge [target]
/review help
```

Local `publish` and `complete` are unsupported. Local workflows use direct Markdown files; remote workflows use forge-backed tools. Aliases: `create`/`draft` → `new`, `launch` → `auto`, `ready` → `publish`, `close` → `complete`, `land` → `merge`.
