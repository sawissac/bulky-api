---
name: cui-sync
description: Pull the latest compacto-ui component source into this repo — updates every copied component (or the ones named) from the compacto-ui registry, folds the registry stylesheets into the app's globals.css, adds new registry dependencies, and reports npm packages to install. Use when asked to "update ui components", "sync compacto-ui", or "pull the latest button/dialog/…".
---

# /cui-sync — update copied compacto-ui components from the registry

Write side of `/cui-diff`. Rewrites local copies of registry items with the
current upstream `content`. Run `/cui-diff` first if you want to see what
will change.

TypeScript items land as files. **CSS items do not** — every stylesheet in the
registry is inlined into the app's single `globals.css` (see
[CSS items](#css-items-inlined-into-globalscss)). No `styles/compacto/`
directory is ever created.

## Arguments

`/cui-sync [item ...] [--all] [--force] [--ref <branch|tag|sha>] [--source <path>] [--css <path>]`

- No items and no `--all` → update every registry item that is **already
  installed** locally. Never installs new components unless named.
- `item ...` → update (or install) exactly these, plus any
  `registryDependencies` they need that are missing.
- `--all` → install every item in the registry (rare; for bootstrapping).
- `--force` → overwrite files that have uncommitted local changes (see step 5).
- `--ref` → git ref of compacto-ui (default `main`).
- `--source` → a local checkout of compacto-ui to read `public/r/` from
  instead of the network.
- `--css` → the app's Tailwind entry stylesheet, if step 1b guesses wrong.

## Procedure

1. **Locate the alias root** — `tsconfig.json` → `compilerOptions.paths["@/*"]`
   (usually `./src/*`) → `ROOT`. Fall back to the repo root.

1b. **Locate the CSS entry** → `CSS_ENTRY`. `--css` wins. Otherwise the one
   stylesheet that imports Tailwind itself:

   ```bash
   grep -rl '@import "tailwindcss"' --include='*.css' src app 2>/dev/null
   ```

   If that returns several, prefer `src/app/globals.css`, then
   `app/globals.css`, `src/styles/globals.css`, `src/index.css`. If it returns
   none, ask the user which file to write into — do not create one.

2. **Fetch the index** —
   `https://raw.githubusercontent.com/sawissac/compacto-ui/<ref>/public/r/registry.json`
   (or `<source>/public/r/registry.json`).

3. **Build the work list.**
   - Start with the requested items (or every item with at least one file
     already present under `ROOT`, or all, per the arguments).
   - For each, fetch `public/r/<name>.json`, then add every name in its
     `registryDependencies` that is not installed locally. Repeat until
     closed. Dedupe.
   - `styles` counts as installed when `CSS_ENTRY` contains the compacto
     marker block, **or** when a legacy `ROOT/styles/compacto/tokens.css`
     exists (step 4a migrates it). `compat-shadcn` is opt-in: never add it
     unless named.

4. **Guard against clobbering.** For every target file `ROOT/<files[].path>`
   that exists — and for `CSS_ENTRY` when a CSS item is in the work list —
   run `git diff --quiet -- <file>`. If it has uncommitted changes and
   `--force` was not given, **skip it**, print the diff between the local file
   and upstream, and tell the user to commit/stash and rerun, or rerun with
   `--force`. Committed local edits are fine to overwrite — they are in
   history and `git diff` after the sync shows exactly what was lost, so the
   user can re-apply.

   For `CSS_ENTRY`, uncommitted changes **outside** the marker block are not a
   reason to skip: the block is rewritten in place and the rest of the file is
   untouched. Only skip when the uncommitted hunk overlaps the block itself.

5. **Write.** For each `registry:ui` / `registry:lib` / `registry:component`
   file, write `content` verbatim to `ROOT/<path>`, creating directories. Do
   not reformat, do not rewrite imports — `@/...` is what the consumer's alias
   resolves. CSS items go through step 5b instead.

5b. **CSS items → `CSS_ENTRY`.** See the next section.

6. **Dependencies.** Union every synced item's `dependencies`. Compare against
   `package.json` (`dependencies` + `devDependencies`). Print the install
   command for the missing ones, using the repo's package manager (detect
   from the lockfile: `pnpm-lock.yaml` → `pnpm add`, `package-lock.json` →
   `npm install`, `yarn.lock` → `yarn add`, `bun.lockb` → `bun add`). Run it
   only if the user asked to install, or after confirming.

7. **Verify.** Run the repo's typecheck (`pnpm typecheck` / `npx tsc --noEmit`).
   If it fails on a synced file, report the error verbatim — usually a
   missing npm dependency (step 6) or a missing registry dependency, which
   means step 3 missed something; add it and rerun.

   If a CSS item was synced, also start (or reload) the dev server once and
   confirm the stylesheet compiles — a stray `@import` left below the
   `@theme` block is a Tailwind build error, not a type error.

8. **Report.**

   ```
   updated   src/components/ui/button.tsx        +12 −4
   updated   src/app/globals.css                 compacto block: tokens, theme, texture  +1 −1
   removed   src/styles/compacto/                folded into globals.css (4 files)
   added     src/lib/ui-styles.ts                (registryDependency of input)
   skipped   src/components/ui/dialog.tsx        uncommitted local changes — rerun with --force
   in sync   src/components/ui/tabs.tsx

   npm: pnpm add lucide-react
   typecheck: ok
   ```

   Then `git status --short` so the user sees the footprint.

## CSS items → inlined into `globals.css`

Registry items of type `registry:file` whose paths end in `.css` (`styles`,
`compat-shadcn`) are **never written as files**. Their `content` is
concatenated into one managed block inside `CSS_ENTRY`.

### The marker block

```css
/* >>> compacto-ui — generated by /cui-sync from registry <ref>. Do not edit inside. <<< */
…
/* >>> end compacto-ui <<< */
```

Both markers are matched literally. Everything between them is replaced
wholesale on every sync; everything outside is left byte-for-byte alone. That
is what makes a resync idempotent — never append a second block, never diff
the inside by hand.

### What goes in, in this order

1. `tokens.css` — custom properties first; nothing resolves without them.
2. `theme.css` — the `@theme inline` block that maps them into Tailwind.
3. `texture.css` — plain classes for `Sidebar`'s `texture` prop.
4. `compat-shadcn.css` — **only** when `compat-shadcn` is installed or named.

**`index.css` is dropped.** Its entire body is `@import "./tokens.css"` and
siblings — meaningless once the three are inlined. Do not carry it over, and
do not carry its banner comment.

Keep each source file's own banner comment above its section; they explain why
`@theme inline` is mandatory and why `texture.css` is not utilities. Prefix
each with its filename so a reader can trace it back:

```css
/* ── tokens.css ─────────────────────────────────────────────────────── */
```

### Rules for the write

- **Strip every `@import "./…"` line** that referred to a sibling registry
  stylesheet. Any that survives points at a file this sync did not create.
- **Place the block after the last top-level `@import` / `@charset`** in
  `CSS_ENTRY` and before the first rule. CSS requires `@import` to precede all
  other at-rules; a block above `@import "tailwindcss"` breaks the build. If
  the file has no imports at all, put the block at the top.
- **Do not reformat the content** — no prettier pass over the inlined CSS, no
  re-indenting, no comment rewrapping. Byte-identical to upstream apart from
  the stripped imports and the added section headers, so the next `/cui-diff`
  can still compare.

### Migrating a repo that has `styles/compacto/`

On the first sync after this change:

1. Inline as above.
2. Delete `ROOT/styles/compacto/*.css` and the directory if it is then empty
   (`git rm`, so the removal is staged with the sync).
3. Remove the now-dangling import from `CSS_ENTRY` — typically
   `@import "../styles/index.css";` or a run of
   `@import "./compacto/tokens.css";` lines.
4. Grep for any other referrer before deleting:

   ```bash
   grep -rn 'styles/compacto' --include='*.{css,ts,tsx,js,mjs,json}' . \
     | grep -v node_modules
   ```

   If something outside `CSS_ENTRY` still points there (a Storybook preview, a
   `tailwindStylesheet` setting in `.prettierrc`, a test import), report it and
   fix it to point at `CSS_ENTRY` — do not leave a broken reference behind.

5. Say in the report that the files were folded in, so the user knows the
   deletion was intended and not drift.

## Rules

- Registry items only. Never touch files that are not a `files[].path` of
  some item — the one exception is `CSS_ENTRY`, and there only the marker
  block.
- Never edit `registry.json` or `public/r/` in compacto-ui from here — if a
  local change should go upstream, say so; that is a PR to compacto-ui.
- If the network fetch fails, stop. Do not reconstruct a component from
  memory.
- Do not add `dark:` variants or shadcn semantic tokens to a synced file "to
  make it fit". Switch the palette, or add `compat-shadcn` to the block.
