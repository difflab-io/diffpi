# worktree

Create or switch a git branch and/or create a git worktree. Branch and worktree are **independent** — request either, both, or neither. This is the shared routine other skills (e.g. spec) call so branch/worktree shell logic lives in one place.

## Variables

Received from the caller (all optional):

- `BRANCH` — branch to create or switch to. If empty and `WANT_BRANCH=false`, no branch action is taken.
- `WANT_BRANCH` — `true` when the caller explicitly asked for a branch (e.g. spec's `--branch`).
- `WANT_WORKTREE` — `true` when the caller explicitly asked for a worktree (e.g. spec's `--worktree`).
- `WORKTREE_PATH` — explicit worktree destination. Empty means "use the default".
- `SLUG` — fallback name source when `WANT_BRANCH=true` but `BRANCH` is empty (e.g. the spec plan slug).
- `BASE_BRANCH` — branch to fork from. Defaults to the current branch.

## Step 0: Confirm git repo

```bash
git rev-parse --git-dir >/dev/null 2>&1 || { echo "✗ Not a git repository — branch/worktree features disabled"; exit 0; }
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
BASE_BRANCH="${BASE_BRANCH:-$CURRENT_BRANCH}"
```

## Step 1: Resolve branch name

If a branch is requested, resolve its name; otherwise leave `TARGET_BRANCH` empty and operate on the current branch.

```bash
TARGET_BRANCH=""
if [ "$WANT_BRANCH" = "true" ] || [ "$WANT_WORKTREE" = "true" ]; then
  if [ -n "$BRANCH" ]; then
    TARGET_BRANCH="$BRANCH"
  else
    # derive from slug: lowercase, spaces→hyphens, alnum+hyphens, squeeze repeated
    # hyphens, trim leading/trailing hyphens, ≤50 chars
    TARGET_BRANCH=$(printf '%s' "$SLUG" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | tr -s '-' | sed 's/^-*//; s/-*$//' | cut -c1-50)
  fi
fi
```

A worktree needs a branch to check out, so `WANT_WORKTREE=true` also resolves a branch name. When only `WANT_BRANCH=true`, no worktree is created (Step 3 is skipped).

## Step 2: Create or switch the branch (only when a branch is wanted)

Skip entirely if `TARGET_BRANCH` is empty (no `--branch` and no `--worktree`) — do NOT touch branches.

When a worktree will be created (Step 3), do NOT switch the current tree's branch here — `git worktree add -b` creates the branch in the new worktree instead. Only switch the current tree when a branch is wanted without a worktree:

```bash
if [ -n "$TARGET_BRANCH" ] && [ "$WANT_WORKTREE" != "true" ]; then
  if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
    # Let git's stderr surface (e.g. "branch already checked out elsewhere") so the cause is visible.
    git switch "$TARGET_BRANCH" && echo "✓ Switched to branch $TARGET_BRANCH" || { echo "✗ Switch to branch $TARGET_BRANCH failed (see git output above)"; exit 1; }
  else
    git switch -c "$TARGET_BRANCH" "$BASE_BRANCH" && echo "✓ Created branch $TARGET_BRANCH from $BASE_BRANCH" || { echo "✗ Branch creation for $TARGET_BRANCH failed (see git output above)"; exit 1; }
  fi
fi
```

## Step 3: Create the worktree (only when a worktree is wanted)

Skip entirely if `WANT_WORKTREE` is not `true`. Resolve the destination: honor `WORKTREE_PATH` when given, else default under `.codevoyant/worktrees/`.

```bash
WORKTREE_RESULT=""
if [ "$WANT_WORKTREE" = "true" ]; then
  if [ -z "$TARGET_BRANCH" ]; then
    echo "✗ Worktree requested but no branch name could be resolved — pass --branch <name> or ensure SLUG is set"; exit 1
  fi
  DEST="${WORKTREE_PATH:-.codevoyant/worktrees/$TARGET_BRANCH}"
  if [ -e "$DEST" ]; then
    echo "✗ Worktree destination already exists: $DEST — remove it or pass a different path"; exit 1
  fi
  mkdir -p "$(dirname "$DEST")"
  if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
    # Let git's stderr surface (e.g. "branch already checked out elsewhere") so the cause is visible.
    git worktree add "$DEST" "$TARGET_BRANCH" || { echo "✗ Worktree creation failed (see git output above)"; exit 1; }
  else
    git worktree add -b "$TARGET_BRANCH" "$DEST" "$BASE_BRANCH" || { echo "✗ Worktree creation failed (see git output above)"; exit 1; }
  fi
  echo "✓ Worktree created at $DEST (branch $TARGET_BRANCH)"
  WORKTREE_RESULT="$DEST"
fi
```

## Step 4: Report results to the caller

Return these values to the caller:

- `TARGET_BRANCH` — the resolved branch name, or empty if none was requested.
- `WORKTREE_RESULT` — the worktree path, or empty if none was created.
- `BASE_BRANCH` — the branch the work was forked from.
