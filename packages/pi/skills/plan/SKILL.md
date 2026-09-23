---
name: plan
description: Route natural-language planning requests to Diffpi's /plan commands. Use when a user wants to create, revise, annotate, finalize, or execute a durable plan, or asks which /plan command to run.
allowed-tools: ask_user_question
---

# Plan Command Guide

Use `/plan` commands as the execution boundary. Do not reproduce their workflows, call `plan_*` tools directly, or edit managed plan files.

## Natural-language routing

Map the user's intent to one command:

- Create an empty plan shell: `/plan init <short-slug> [--branch <name>]`
- Research and author a complete plan: `/plan new <short-slug> [--branch <name>] [--bg] [prompt...]`
- Revise a plan from chat instructions or its current plan review: `/plan update [short-slug] [--branch <name>] [--bg] [instructions...]`
- Review a plan in tuicr and save the result: `/plan annotate [short-slug]`
- Validate and mark a plan ready: `/plan finalize [short-slug]`
- Execute a plan: `/plan go <short-slug> [--mode <no-commit|commit|push>] [--bg]`
- Show command help: `/plan help`

Infer the command, slug, branch, and free-text arguments from recent conversation when they are clear. If a required value cannot be inferred, use `ask_user_question`; do not ask in plain chat. Then give the user one exact, copyable `/plan` command. Explain defaults only when relevant: `go` uses `--mode no-commit` when `--mode` is omitted.
