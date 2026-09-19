# Environment

## Overview

Diffpi detects the terminal multiplexer, IDE, shell, and forge context around a review. It uses that information only to choose how to offer the `tuicr` UI; IDE detection alone does not mean that Diffpi can launch a new IDE tab.

## Requirements

- `zellij`, `tmux`, and `screen` may launch `tuicr` directly in a new tab or window when the multiplexer is active and its executable is available.
- Zed cannot be triggered externally. Diffpi installs two stable global tasks: one local full-branch resolver and one PR/MR resolver. Each resolves the current `$ZED_WORKTREE_ROOT` at task runtime; the configured local keybinding targets the local task.
- VS Code, Cursor, Windsurf, and JetBrains detection does not imply launch integration.
- When neither a supported multiplexer nor Zed task integration applies, Diffpi prints the exact command. If `tuicr` is unavailable, it returns an install instruction followed by the exact command to run.

## Design

`openInNewTab` first checks the active multiplexer. It tries Zellij's new-tab action, then its run fallback; tmux uses a new window; screen creates a named window and changes to the repository before executing the argv. If those paths do not launch, Zed is handled by writing or updating its tasks configuration. Other detected IDEs, and unsupported environments, use the print fallback rather than claiming integration.

Zed task selection is based on the direct command type. The static local task resolves the base of the newest open PR/MR matching the current branch, or the forge default, and runs `tuicr -w -r <base>..HEAD`; the static PR task resolves the newest open PR/MR matching the current branch and runs `tuicr pr <number>`. Tasks use `sh -lc` with cwd `$ZED_WORKTREE_ROOT`, so launching another review never rewrites global `tasks.json`. The `cmd-alt-r` keybinding is maintained for the local task only; PR reviews are selected from the PR task instruction.

## Implementation

- `packages/pi/src/environment.ts` detects IDEs and multiplexers and implements mux, Zed-task, and print launch results.
- `packages/pi/src/extensions/zedx.ts` safely preserves Zed tasks, maintains the separate local and PR task labels, and migrates the local keybinding.
- `packages/pi/src/extensions/tuicrx.ts` checks whether `tuicr` is available and returns an installation/run instruction when it is missing.

## References

- [`src/environment.ts`](../../packages/pi/src/environment.ts)
- [`src/extensions/zedx.ts`](../../packages/pi/src/extensions/zedx.ts)
- [`src/extensions/tuicrx.ts`](../../packages/pi/src/extensions/tuicrx.ts)
- [`environment.test.ts`](../../packages/pi/tests/environment.test.ts)
- [`zedx.test.ts`](../../packages/pi/tests/extensions/zedx.test.ts)
