---
name: diffpi-setup
description: Set up or inspect the local @difflab/pi environment. Use when required tools, pi packages, skills, or MCP servers are missing.
allowed-tools: ask_user_question diffpi_setup diffpi_validate
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
      question: 'Should diffpi add the mise activation hook to your shell configuration?',
      header: 'Mise hook',
      options: [
        { label: 'Add hook', description: 'Activate mise automatically in new shell sessions.' },
        { label: 'Skip hook', description: 'Leave the shell configuration unchanged.' },
      ],
      multiSelect: false,
    },
  ],
});
```

Map `None`, `Linear`, and `Jira` to `none`, `linear`, and `jira`. Map `Add hook` and `Skip hook` to `true` and `false`. If the user declines the questionnaire, stop without calling `diffpi_setup`.
