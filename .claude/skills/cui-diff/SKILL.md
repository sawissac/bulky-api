---
name: cui-diff
description: Report which compacto-ui components copied into this repo are out of sync with the compacto-ui registry. Read-only — never writes. Use when asked "are our ui components up to date", "what changed upstream", or before running /cui-sync.
---

# /cui-diff — compare this repo's copied components against compacto-ui

Read-only. Produces a report; changes nothing. `/cui-sync` is the write side.

## Arguments

`/cui-diff [item ...] [--ref <branch|tag|sha>] [--source <path>]`

- No items → check every registry item that exists locally.
- `--ref` → git ref of compacto-ui to compare against (default `main`).
- `--source` → a local checkout of compacto-ui to read `public/r/` from
  instead of the network.

## Procedure

1. **Locate the alias root.** Read `tsconfig.json` → `compilerOptions.paths["@/*"]`
   (usually `./src/*`). Call that directory `ROOT`. If absent, `ROOT` is the
   repo root.

2. **Fetch the index.**

   ```bash
   curl -sf https://raw.githubusercontent.com/sawissac/compacto-ui/<ref>/public/r/registry.json
   ```

   (or read `<source>/public/r/registry.json`). It lists every item's `name`
   and `type`.

3. **For each item** (all, or the ones named), fetch
   `public/r/<name>.json`. Each has `files[]` with `path` and `content`.
   Resolve the local file as `ROOT/<path>`.

4. **Classify** each file:
   - **missing** — local file does not exist. The item is not installed.
     (Report, but only as "not installed"; it is not drift.)
   - **in sync** — local content is byte-identical to `content`.
   - **outdated** — differs. Produce a unified diff (`diff -u local upstream`)
     and count added/removed lines. Note whether the local file also has
     uncommitted changes (`git diff --quiet -- <file>`), since that means
     someone edited it here and a sync will need a merge, not an overwrite.

5. **Also report:**
   - Files under `ROOT/components/ui/` that match no registry item —
     local-only components. Not drift, but worth knowing; if one is generic,
     it belongs upstream.
   - npm `dependencies` any outdated item lists that are absent from this
     repo's `package.json`.
   - `registryDependencies` of outdated items that are not installed locally
     (a sync will need to add them).

6. **Print** one table, then the diffs for outdated files:

   ```
   item              file                               status      Δ
   button            src/components/ui/button.tsx       in sync
   dialog            src/components/ui/dialog.tsx       OUTDATED    +12 −4   (local edits: yes)
   styles            src/styles/compacto/tokens.css     OUTDATED    +1 −1
   data-table        —                                  not installed
   ```

   Finish with: how many outdated, whether any have local edits, which npm
   packages are missing, and the exact `/cui-sync ...` invocation that would
   bring the outdated ones up to date.

## Rules

- Never modify files. Never run installs.
- Compare bytes, not semantics. A formatting-only difference is still
  "outdated" — say so if the diff is whitespace-only.
- If the network fetch fails, say so and stop; do not guess from memory what
  upstream looks like.
