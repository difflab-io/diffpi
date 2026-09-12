# Architecture

> Placeholder — describe how `pizen` is designed and why. Replace this file as the project takes shape.

## Overview

<!-- TODO: one or two paragraphs on what pizen is and the problem it solves. -->

## Questions

- How can pizen be OSS? Should local mode be dekstop or web ui? The reason I can think for desktop is to be able to utilize more performant rust based background processes and gui.
- should diffwiki, diffspec, diffcode etc. be standalone CLIs as well? Or desktop apps that support cloud sync via pizen?
- Database? Postgres OR turso?
- Nexus of decisions:
  - A lot of it comes down to if web tech can do what I want well: diff viewing, etc.

## Derisk

- Web UI for code editing and diffs

## Design

### Option 1: Hub for desktop apps

- pizen will be a web application for streamlining development through unified project documentation, project management, team wikis, shared agentic workflows and remote agent execution.
- pizen-desktop will be a desktop version for local only execution without cloud databases etc.
- diffctl will be the CLI used to interact with pizen remotely or locally
- diffwiki

```bash

# spec and code
diffspec init/new/review/go
diffcode
# /loop /btw /flow
# /spec /plan

# wiki

```

### Option 2: Hub for web apps

### Option 3: Single desktop+web app

```bash
diffctl init/plan/spec # inside a local repo
diffctl setup/login
diffctl workspace ls/new/rm # default workspace is user/org, but you can set it different teams
diffctl mcp

```

## Implementation

<!-- TODO: notable implementation details, trade-offs, and decisions. -->
