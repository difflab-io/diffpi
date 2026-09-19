# help

## git — Git Workflows

| Command                                               | Description                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/git commit [flags]`                                 | Create a conventional commit with CI monitoring                                |
| `/git exclude <path>\|--list\|--undo <path>`          | Hide files/dirs from git without editing `.gitignore`                          |
| `/git hooks [install\|status\|uninstall]`             | Manage the commit-msg hook that strips agent self-attribution                  |
| `/git rebase`                                         | Interactive rebase helper                                                      |
| `/git worktree [--branch [name]] [--worktree [path]]` | Create/switch a branch and/or create a worktree under `.codevoyant/worktrees/` |
| `/git help`                                           | Show this reference                                                            |

### commit flags

- `--yes` / `-y` — skip commit message confirmation
- `--no-push` — commit only, do not push
- `--breaking-change` — mark the commit as breaking (authorizes `feat!`/`fix!` or a `BREAKING CHANGE:` footer, major version bump). Breaking labels are forbidden without this flag or an explicit verbal request.
- `--fix` (alias `--autofix`) — after push, auto-loop fix and re-push until CI is green (bounded retries). Without it, the default is to watch CI and ask before fixing on failure.
- `--atomic` — create one commit per logical change group

### Commit messages never self-attribute

Every commit (including `--fix`/`--autofix` follow-ups) omits agent self-attribution — no `Co-Authored-By: Claude`, no "Generated with Claude Code", no 🤖. Run `/git hooks install` once per clone for a git-level backstop that strips these from any commit, even ones made outside `/git commit`.

## Migrating from `git ci`

`/git ci` has been replaced by platform-specific skills:

- GitHub: `/gh ci`
- GitLab: `/glab ci`
