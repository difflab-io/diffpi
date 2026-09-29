---
name: diffpi-doctor
description: Check and repair stale global Diffpi agent profiles after a Pi package update. Use when plan or review agents request removed diffpi_modes_* tools or their installed profiles differ from @difflab/pi.
---

# Diffpi Doctor

1. Call `diffpi_doctor` with `apply: false` to inspect the bundled agent profiles against Pi's global agent directory. This check does not install packages, run full setup, or change settings.
2. If any profile needs repair, call `diffpi_doctor` with `apply: true`. It updates only bundled `diffpi-*.md` agent profiles from the installed @difflab/pi package and backs up each replaced file. If the package or target cannot be read safely, stop and report the blocker.
3. Report changed paths and backup location. In each affected Pi session, reload resources or start a new conversation if an old inline system prompt persists. Do not claim this repair validates, marks READY, or executes any plan.
