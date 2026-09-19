# hooks

Install, check, or remove the git skill's `commit-msg` hook — the robust, agent-agnostic backstop that strips self-attribution from **every** commit in this repo (not just commits made through `/git commit`).

Use this when agents keep adding `Co-Authored-By: Claude`, "Generated with Claude Code", or 🤖 lines — especially on ad-hoc follow-up commits (e.g. CI-green fix loops) that bypass the `/git commit` workflow.

## Arguments

```
ACTION = first positional: install | status | uninstall   (default: install)
```

## Step 0: Locate the hook source and repo hooks dir

```bash
HOOK_SRC="{git skill path}/references/hooks/commit-msg"     # shipped with this skill
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || { echo "✗ Not a git repository."; exit 1; }
HOOK_DST="$GIT_DIR/hooks/commit-msg"
```

## install

1. If `$HOOK_DST` already exists **and** was not installed by this skill (grep it for the marker `codevoyant git skill — commit-msg hook`):
   - Back it up: `cp "$HOOK_DST" "$HOOK_DST.pre-codevoyant.bak"` and report the backup path.
   - If the existing hook is meaningful, prefer chaining: append a call to our hook from the existing one instead of overwriting. Otherwise overwrite.
2. Copy and enable:

   ```bash
   mkdir -p "$GIT_DIR/hooks"
   cp "$HOOK_SRC" "$HOOK_DST"
   chmod +x "$HOOK_DST"
   ```

3. Verify it runs by piping a test message through it:

   ```bash
   printf 'test: subject\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n' > /tmp/cv-hookcheck
   "$HOOK_DST" /tmp/cv-hookcheck && ! grep -qi 'claude' /tmp/cv-hookcheck && echo "✓ hook strips attribution" || echo "✗ hook did not strip — check bash availability"
   rm -f /tmp/cv-hookcheck
   ```

4. Report:

   ```
   ✓ commit-msg hook installed at {HOOK_DST}
     Every commit in this repo now has agent self-attribution stripped automatically.
   ```

## status

Report whether the hook is present and ours:

```bash
if [ -x "$HOOK_DST" ] && grep -q "codevoyant git skill — commit-msg hook" "$HOOK_DST"; then
  echo "✓ Installed: $HOOK_DST"
else
  echo "✗ Not installed. Run /git hooks install"
fi
```

## uninstall

1. If `$HOOK_DST` contains our marker, remove it: `rm -f "$HOOK_DST"`.
2. If a `$HOOK_DST.pre-codevoyant.bak` exists, restore it: `mv "$HOOK_DST.pre-codevoyant.bak" "$HOOK_DST"`.
3. Report what was removed/restored.

## Notes

- `.git/hooks/` is **not** tracked by git, so installing the hook is a local, per-clone action. Re-run `/git hooks install` after a fresh clone. For a team-wide, tracked hook, point `core.hooksPath` at a committed directory containing this script.
- The hook only removes lines that name a coding **agent** (Claude, Anthropic, GPT/ChatGPT/OpenAI, Copilot, Codex, Cursor, Devin, …). Human `Co-Authored-By:` trailers are preserved.
