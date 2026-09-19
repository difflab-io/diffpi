# exclude

Hide files or directories from git without editing `.gitignore`. Entries go to `.git/info/exclude`, a per-repository file that is never committed. Use it for non-shared IDE config, local secrets, and agent scratch dirs — anything you want git to ignore on this machine only.

## Usage

```
/git exclude <path>        # start ignoring a file or directory
/git exclude --list        # show all excluded paths
/git exclude --undo <path> # stop ignoring a path
```

## Step 0: Parse args

```bash
MODE="add"
TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --list)                 MODE="list"; shift ;;
    --undo|--remove)        MODE="undo"; TARGET="$2"; shift 2 ;;
    *)                      [ -z "$TARGET" ] && TARGET="$1"; shift ;;
  esac
done

if [ "$MODE" != "list" ] && [ -z "$TARGET" ]; then
  echo "Usage: /git exclude <path> | --list | --undo <path>"
  exit 1
fi
```

## Step 1: Resolve the exclude file

```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
EXCLUDE_FILE="$ROOT/.git/info/exclude"
[ -f "$EXCLUDE_FILE" ] || touch "$EXCLUDE_FILE"
```

## Step 2: Add / list / undo

**Add** — append the path unless it is already present:

```bash
if [ "$MODE" = "add" ]; then
  if grep -qxF -- "$TARGET" "$EXCLUDE_FILE"; then
    echo "Already excluded: $TARGET"
  else
    printf '%s\n' "$TARGET" >> "$EXCLUDE_FILE"
    echo "✓ Excluding $TARGET (git will ignore it; .gitignore unchanged)"
  fi
fi
```

**List** — print every entry:

```bash
if [ "$MODE" = "list" ]; then
  echo "Excluded paths (.git/info/exclude):"
  cat "$EXCLUDE_FILE"
fi
```

**Undo** — remove the matching line:

```bash
if [ "$MODE" = "undo" ]; then
  if grep -qxF -- "$TARGET" "$EXCLUDE_FILE"; then
    grep -vxF -- "$TARGET" "$EXCLUDE_FILE" > "$EXCLUDE_FILE.tmp" && mv "$EXCLUDE_FILE.tmp" "$EXCLUDE_FILE"
    echo "✓ Stopped excluding $TARGET"
  else
    echo "Not excluded: $TARGET"
  fi
fi
```

## Step 3: Report

Best-effort confirmation that git no longer shows the path:

```bash
git status --short -- "$TARGET" 2>/dev/null || true
```

The path remains on disk — only git's view of it changes.
