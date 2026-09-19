# rebase

Safely rebase the current branch onto an updated base branch (typically main), using a pre-rebase intent snapshot to drive every conflict resolution correctly.

## The core problem this skill solves

During `git rebase main`, conflict marker sides are **counter-intuitive**:

- `<<<<<<< HEAD` (ours) = **main's version** (the base being rebased onto)
- `>>>>>>> {sha}` (theirs) = **your branch's commit** being replayed

Claude (and humans) routinely pick the wrong side, silently discarding the branch's intended changes. This skill prevents that by capturing a full intent snapshot before the rebase starts, then using it as the ground truth for every conflict.

## Usage

```
/git rebase              # rebase current branch onto origin/main (no push)
/git rebase main         # rebase onto a specific base branch (no push)
/git rebase --push       # rebase and push when done
```

When run on `main` (or `master`) itself, the skill fast-forwards main to match `origin/main` via `git pull --rebase` rather than doing a full branch rebase.

## Step 1: Orientation

Run the following and show results:

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_DIR=$(pwd)

# Detect if we're in a worktree
COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null)
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
if [ "$COMMON_DIR" != "$GIT_DIR" ]; then
  IN_WORKTREE=true
  MAIN_REPO_ROOT=$(cd "$COMMON_DIR/.." && pwd)
else
  IN_WORKTREE=false
  MAIN_REPO_ROOT="$CURRENT_DIR"
fi

# Detect if we're on the main/master branch itself
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  ON_MAIN=true
else
  ON_MAIN=false
fi
```

**If ON_MAIN is true:** skip the full rebase flow and do a targeted update instead (see "Rebasing main" section below).

Detect the base branch:

```bash
if [ -n "$BASE_BRANCH" ]; then
  # User provided — use it directly
  REBASE_TARGET="$BASE_BRANCH"
else
  # Auto-detect: prefer remote tracking branch
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    REBASE_TARGET="origin/main"
  elif git rev-parse --verify origin/master >/dev/null 2>&1; then
    REBASE_TARGET="origin/master"
  elif git rev-parse --verify main >/dev/null 2>&1; then
    REBASE_TARGET="main"
  else
    REBASE_TARGET="master"
  fi
fi
```

Report orientation to the user:

```
Branch  : {CURRENT_BRANCH}
Target  : {REBASE_TARGET}
Worktree: {yes — main repo at MAIN_REPO_ROOT | no}
```

## Rebasing main (fast-forward update)

If `ON_MAIN` is true, skip Steps 2–5 and run this shortened flow instead:

```bash
# 1. Abort if uncommitted changes exist
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: Uncommitted changes detected. Stash or commit before rebasing."
  exit 1
fi

# 2. Fetch latest from origin
git fetch origin

# 3. Show what's incoming
git log HEAD..origin/${CURRENT_BRANCH} --oneline
```

Report to user:

```
Fetching origin/${CURRENT_BRANCH}...

Incoming commits:
{list from git log, or "Already up to date."}
```

If already up to date, exit here.

Ask user to confirm before proceeding.

```bash
# 4. Rebase (fast-forward) main onto origin/main
git rebase origin/${CURRENT_BRANCH}
```

If conflicts arise, resolve them using the same intent-based approach from Steps 4a–4e below.

```bash
# 5. If PUSH is true, push (regular push — main has no diverged history)
git push origin ${CURRENT_BRANCH}
```

Then follow `/git ci` to monitor CI.

Exit after this section — do not continue to Step 2.

## Step 2: Capture Pre-Rebase Intent Snapshot

**This snapshot is the source of truth for all conflict resolution. Build it before touching git.**

```bash
# Fetch latest so we're comparing against real upstream
git fetch origin 2>/dev/null || true

# The merge base: where this branch diverged from the target
MERGE_BASE=$(git merge-base HEAD "$REBASE_TARGET")
```

Capture and store:

```bash
# 1. Full diff of everything this branch introduces
INTENT_DIFF=$(git diff "$MERGE_BASE"...HEAD)

# 2. List of every file this branch touches
INTENT_FILES=$(git diff --name-status "$MERGE_BASE"...HEAD)

# 3. Per-file snapshots of this branch's version of every changed file
#    (so we can compare during conflict resolution)
git diff --name-only "$MERGE_BASE"...HEAD | while read file; do
  BRANCH_VERSION=$(git show HEAD:"$file" 2>/dev/null || echo "[deleted on branch]")
  BASE_VERSION=$(git show "$MERGE_BASE":"$file" 2>/dev/null || echo "[did not exist at branch point]")
  # Store both for reference during conflict resolution
done

# 4. Commit log of what this branch is doing
INTENT_LOG=$(git log --oneline "$REBASE_TARGET"..HEAD)
```

Show the intent summary:

```
Branch intent ({N} commits, {M} files changed):
{INTENT_LOG}

Files this branch modifies:
{INTENT_FILES}
```

Ask user to confirm before proceeding:

```
Ready to rebase {CURRENT_BRANCH} onto {REBASE_TARGET}.
Proceed?
```

Wait for confirmation. If declined, exit without changes.

## Step 3: Start the Rebase

```bash
git rebase "$REBASE_TARGET"
```

If rebase exits cleanly (no conflicts) → jump to Step 6.

If rebase stops with conflicts → enter Step 4.

## Step 4: Conflict Resolution Loop

Repeat until `git rebase --continue` succeeds or rebase is complete.

### 4a. Identify all conflicted files

```bash
CONFLICTED=$(git diff --name-only --diff-filter=U)
```

### 4b. For each conflicted file — resolve with intent

For each file in `CONFLICTED`:

**1. Show the conflict in context:**

```bash
cat {file}   # shows conflict markers in full file context
```

**2. Look up this file in the pre-rebase snapshot:**

- What did this branch change in this file? (from INTENT_DIFF, filtered to this file)
- What is the branch's HEAD version of this file?
- What was the file at the merge base?

**3. Understand the conflict sides:**

```
<<<<<<< HEAD         ← THIS IS MAIN'S VERSION (not our branch)
{main's code}
=======
{our branch's code}  ← THIS IS WHAT OUR BRANCH INTENDED
>>>>>>> {sha}
```

**4. Determine the correct resolution:**

The goal is: **start from main's version and apply this branch's intended change on top**.

Do NOT simply pick one side. Instead:

- Read main's version of the surrounding code (HEAD side)
- Read what this branch was trying to do (snapshot + theirs side)
- Produce a merged result that incorporates the branch's intent into main's current context
- If the branch was adding something: add it to main's version
- If the branch was changing something: apply that change to main's current version of the thing
- If the branch was deleting something that main also changed: use judgment — prefer deletion if the branch intent was to remove it entirely

**5. Write the resolved file** — no conflict markers remaining.

**6. Explain the resolution:**

```
Resolved {file}:
  Main had: {brief description of HEAD side}
  Branch intended: {brief description based on intent snapshot}
  Resolution: {what was kept/merged and why}
```

**7. Stage the file:**

Check if the file is gitignored before staging — gitignored files require `-f` or `git add` silently fails, making `--continue` impossible (and tempting a destructive `--skip`):

```bash
if git check-ignore -q {file}; then
  git add -f {file}
else
  git add {file}
fi
```

### 4c. After all conflicts in this commit are resolved

```bash
git rebase --continue
```

If this triggers another conflict set (next commit), loop back to 4a.

### 4d. Don't use `--skip` during conflict resolution

`git rebase --skip` discards the entire commit being replayed — not just the conflicted file. So even if only one irrelevant or gitignored file is conflicted, `--skip` silently throws away all of that commit's intended changes. Always resolve the conflict (accepting one side wholesale if needed), stage with `-f` if required, then `--continue`.

### 4e. If a conflict is genuinely ambiguous

If you cannot determine the correct resolution with confidence:

- Do NOT guess
- Stop the resolution, show both sides clearly, and ask the user:

  ```
  Ambiguous conflict in {file}:

  Main's version:
  {HEAD side}

  Branch intended:
  {theirs side + relevant context from intent snapshot}

  What should the resolved version be?
  ```

- Apply the user's answer, then continue.

## Step 5: Post-Rebase Verification

After the rebase completes, verify the branch's intent survived.

```bash
# New diff of the rebased branch vs target
POST_DIFF=$(git diff "$REBASE_TARGET"..HEAD)

# New file list
POST_FILES=$(git diff --name-only "$REBASE_TARGET"..HEAD)
```

**Check 1 — No files silently dropped:**
Compare `INTENT_FILES` against `POST_FILES`. Report any file that was in the intent but is no longer changed by the branch:

```
⚠️  Warning: {file} was modified by the branch before rebase but is no longer changed.
    This may mean the branch's changes were lost during conflict resolution.
    Review this file before pushing.
```

**Check 2 — Intent diff is structurally preserved:**
For each file this branch modified, compare the pre-rebase branch version against the post-rebase version. Flag large unexplained differences:

```
⚠️  Warning: {file} looks significantly different post-rebase.
    Pre-rebase branch version: {line count / key lines}
    Post-rebase branch version: {line count / key lines}
    Verify the intended changes are still present.
```

**Check 3 — Format and lint:**

Detect the project's task runner by reading `mise.toml`, `justfile`, `Makefile`, or `package.json` scripts. Run formatters first (they auto-fix, so any changes get committed if the user later commits) using the discovered format recipe (e.g. `mise run format`, `just fmt`, `make format`, `pnpm run format`). Skip silently if no formatter recipe exists.

Then run linters — **block push if they fail**. Run the discovered lint recipe (e.g. `mise run lint`, `just lint`, `pnpm run lint`, or `pnpm run check`). Skip silently if no lint recipe exists.

If the formatter modified files: stage and amend them onto the last rebased commit:

```bash
if ! git diff --quiet; then
  git add -A
  git commit --amend --no-edit
fi
```

**Check 4 — Run tests if available:**

Run the discovered test recipe (e.g. `mise run test`, `just test`, `pnpm test`). Skip silently if no test recipe exists.

If tests or linting fail: report errors and stop. Do not proceed to push.

Show verification summary:

```
✓ Rebase complete

  Commits replayed : {N}
  Files changed    : {M}
  Intent check     : {PASS | {N} warnings — review above}
  Format           : {applied | clean | skipped}
  Lint             : {passed | FAILED — fix before pushing | skipped}
  Tests            : {passed | FAILED | skipped}
```

## Step 6: Push

If `PUSH` is false (the default): report the following and exit:

```
✓ Rebase done — push skipped (default)
  When ready: git push --force-with-lease origin {CURRENT_BRANCH}
  Or rerun with: /git rebase --push
```

If `PUSH` is true, push immediately — rebase always requires a force push:

```bash
git push --force-with-lease origin {CURRENT_BRANCH}
```

`--force-with-lease` (not `--force`) — fails safely if the remote was updated since the last fetch.

Then follow the full workflow defined in `/git ci`:

- Detects GitHub vs GitLab automatically
- Monitors all runs in real time
- On failure: shows error logs and offers to fix

**Skip CI monitoring if:**

- Repo has no CI workflows configured
- Neither `gh` nor `glab` CLI is installed (inform but don't block)
