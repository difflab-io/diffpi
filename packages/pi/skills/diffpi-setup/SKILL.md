---
name: diffpi-setup
description: Set up or inspect the local @difflab/pi environment. Use when required tools, pi packages, skills, or MCP servers are missing.
allowed-tools: ask_user_question diffpi_reload diffpi_setup diffpi_validate
---

# diffpi Setup

Use `diffpi_validate` when the user asks only to inspect the environment.

Before `diffpi_setup`, use `ask_user_question` for choices the user has not already supplied. Include only unanswered questions from the template below. Do not ask these questions as plain chat text.

```typescript
ask_user_question({
  questions: [
    {
      question: 'Which issue tracker MCP server should diffpi configure?',
      header: 'Issue tracker',
      options: [
        { label: 'None', description: 'Do not configure Linear or Jira.' },
        { label: 'Linear', description: 'Configure the Linear MCP server with OAuth.' },
        { label: 'Jira', description: 'Configure the Atlassian MCP server with OAuth.' },
      ],
      multiSelect: false,
    },
    {
      question: 'Which forge should diffpi configure for /review?',
      header: 'Forge',
      options: [
        { label: 'None', description: 'Use local tuicr review without a forge CLI or MCP server.' },
        { label: 'GitHub', description: 'Install gh and register the GitHub MCP server with OAuth.' },
        { label: 'GitLab', description: 'Install glab and register the GitLab MCP server with OAuth.' },
      ],
      multiSelect: false,
    },
    {
      question:
        'Allow diffpi to install mise, add its activation hook to your shell configuration, and install required development tools if they are missing?',
      header: 'Tooling',
      options: [
        {
          label: 'Allow',
          description: 'Install mise, Node.js, Zellij, Helix, tuicr, and Context Mode when missing.',
        },
        {
          label: 'Skip',
          description: 'I will install and configure the required tooling myself.',
        },
      ],
      multiSelect: false,
    },
  ],
});
```

Map `None`, `Linear`, and `Jira` to `none`, `linear`, and `jira`. Map the forge answer `None`, `GitHub`, or `GitLab` to `forge: none`, `github`, or `gitlab`. Keep the forge at `none` unless the user selects one. If the user selects `Skip` or declines the questionnaire, stop without calling `diffpi_setup`. After successful setup, call `diffpi_reload` when the setup result says pi must restart.

When the user is using Zed, ask separately whether to bind `cmd-alt-r` to the `diffpi: tuicr review` task. Only pass `bindZedKey: true` when the user opts in; otherwise pass `false`.

Setup installs Diffpi's bundled agent Markdown into Pi's standard global agent directory. Explain that each default can run through the subagent plugin or as the current inline prompt. `/skill:mode` opens the structured picker. It also accepts `--include-skills`, one agent id, a qualified `skill:agent` id, or `clear`.
