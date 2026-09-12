# TODO

- [ ] skills
  - [ ] flow
  - [ ] loop
  - [ ] btw
  - [ ] docs
  - [ ] spec -> won't this be handled by diffspec
  - [ ] rev -> use tuicr to review | won't this be handled by diffthreads?
  - [ ] poc
  - [ ] explore
  - [ ] log? (devlogs)
  - [ ] adr?
  - [ ] git/gh? tuicr? zellij?
- [ ] agents
  - [ ] copilot -> do together and when asked, not constantly jump ahead
  - [ ] tutor -> teacher, don't volunteer to do things
  - [ ] researcher -> create well sourced research artifacts
  - [ ] spec-planner ->
- [ ] tools?
- [ ] mcp?
  - [ ] project
  - [ ] session
  - [ ] spec
  - [ ] review
  - [ ] bg tasks?
  - [ ] subagents?
- [ ] plugins
  - pi-subagents? (technically, can't you spawn any mux + agent combo...)
  - pi-todo?
  - pi-pizen -> ps:* skills wrapping mcps?

# Questions

- What is the point?
  - To hold us over until pizen is ready... which will allow moving major workflows out of brtille skills and ever-changing harnesses.
  - Or to build a pi based workflow that just fully works...
  - Or to build a "cross-agent" lightweight workflow, which would require an mcp to back it up...
- How would you actually build something cross-harness?
  - MCP backed
  - generic agents, never use harness specific tools etc. Which may make execution finicky...
- More and more it seems, there's little point in building around somebody else's harness... even for pi, not all tools just work together.
- The real options here are:
  - Build your own tools around pi (no time for that, and what would be the point... it exists, and you don't get back any portability of skills?)
  - Build a lightweight set of skills around using existing pi plugins (pi subagents, pi bg, etc.) -> **THIS IS THE THING TO DO WITH PIZEN**
  - build your own harness (and do it in rust while you're at it) -> Not for here
- There's a question here around whether the skills _could_ be made portable via a lightweight mcp aroun planning and orchestration (i.e. just tracking plan state)
