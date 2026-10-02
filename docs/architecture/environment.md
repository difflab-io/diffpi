# Environment

## Overview

Diffpi detects the repository, forge, shell, terminal multiplexer, and editor. Detection supplies context for workflows. It does not install editor tasks or keybindings.

## Review selection

Remote review tools inspect the repository and its configured GitHub or GitLab remote. Local review workflows use Markdown files in the shared `.diffpi` store and do not call an editor launch tool. An unsupported remote does not silently become a local review.

## Optional file opening

The exported `openFileAdjacent` helper can open a file in a terminal multiplexer when a caller invokes it directly. It uses Zellij, tmux, or screen when available, or returns a printable fallback. The helper respects `EDITOR`, then `VISUAL`, and passes editor and file paths as separate arguments. The review and plan skills do not use this helper to install or run managed editor tasks.

## Implementation

- [`src/environment.ts`](../../packages/pi/src/environment.ts) detects the environment and provides the optional file-opening helper.
- [`environment.test.ts`](../../packages/pi/tests/environment.test.ts) covers detection and helper behavior.
