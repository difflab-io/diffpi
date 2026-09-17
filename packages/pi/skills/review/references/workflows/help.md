# help

```text
/review open [--local] [--base branch]
/review new [target] [--local] [--working-tree]
/review edit [target] [--working-tree]
/review address [target] [--local]
/review publish [target] [--local] [--comment|--approve|--request-changes|--close]
/review merge [target]
```

`--local` selects tuicr as the review backend. `new` generates findings; `edit` only opens an existing target. Local records and reply overlays are stored under `.diffpi/reviews/`. Publish makes pending work public with a status but never merges. Merge remains a separate GitHub-only workflow.
