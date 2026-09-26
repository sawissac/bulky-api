"use client";

import { memo } from "react";
import { useSelector } from "react-redux";
import type { Theme } from "@/lib/themes";
import { selectSidebarTab, selectPatternStyle, type SidebarTab } from "@/store/uiSlice";
import CollPane from "./CollPane";
import EnvPane from "./EnvPane";
import VarsPane from "./VarsPane";
import DbPane from "./DbPane";
import FilePane from "./FilePane";
import StoragePane from "./StoragePane";

const PANE_LABELS: Record<SidebarTab, string> = {
  collections: "Requests",
  env: "Envs",
  vars: "Vars",
  db: "DB",
  file: "File",
  storage: "Storage",
};

/**
 * Body of the left pane: renders the pane the active section owns — collections,
 * environments, extracted variables, database connections, file
 * import/export, or browser storage. Section switching
 * lives in {@link ActivityRail}, not here, so this component only reads which
 * tab is selected; each pane supplies its own header.
 *
 * @remarks
 * Status: stable — Type: layout container
 *
 * State & behavior: holds no local state; the active tab comes from `uiSlice`.
 * Exactly one pane is mounted at a time, so a pane's own local state resets
 * when the user leaves and returns to it.
 *
 * Variants: one per `SidebarTab` — `collections`, `env`, `vars`, `db`, `file`,
 * `storage`.
 *
 * Composition: renders {@link CollPane}, {@link EnvPane}, {@link VarsPane},
 * {@link DbPane}, {@link FilePane} or {@link StoragePane}, each handed the
 * active theme. Sits inside
 * the resizable pane group and fills it edge to edge — no title strip of its
 * own.
 *
 * Accessibility: the pane body is the `tabpanel` for the rail's tablist and
 * carries `id="sidebar-pane"`, the target of each tab's `aria-controls`. Its
 * `aria-label` names the active section since no visible title does.
 *
 * Test ids: pane body `sidebar-pane`.
 *
 * CSS classes: `app-panel-texture--<patternStyle>` (`src/app/globals.css`) —
 * plain shared classes, not `@utility`s or a one-off Tailwind arbitrary
 * value, since each needs a real selector to hang a `::before` off (see the
 * class's own comment in `globals.css`), and each pattern is several offset
 * gradient layers besides — more than an arbitrary-value string can hold
 * cleanly. `patternStyle` (`uiSlice`, chosen in TweaksPanel's "Background
 * Pattern" section) picks which one washes the root; `'none'` renders no
 * class at all, leaving the panel flat. The gradient itself, on the
 * `::before`, is colored from `var(--app-accent)` via `color-mix` rather
 * than a literal hex, so it holds up across every theme and light/dark;
 * `--app-pattern-alpha` (`patternOpacity` ÷ 100, also Settings-driven) scales
 * that pseudo-element's `opacity` as one unit rather than each gradient
 * stop's own color, to read as
 * a distinct surface from the editor pane, which stays flat for code
 * legibility. {@link ResponsePanel} carries the same class, by design.
 *
 * Edge cases: an unknown tab value cannot render a pane; the `aria-label` falls
 * back to the collections label so the tabpanel is never unnamed.
 *
 * Dependencies: `react-redux`.
 *
 * @example
 * ```tsx
 * <ResizablePanel defaultSize="18%" minSize="15%">
 *   <Sidebar T={T} />
 * </ResizablePanel>
 * ```
 *
 * @see {@link ActivityRail}
 */
function Sidebar({ T }: SidebarProps) {
  const tab = useSelector(selectSidebarTab);
  const patternStyle = useSelector(selectPatternStyle);
  const label = PANE_LABELS[tab] ?? PANE_LABELS.collections;
  const textureClass =
    patternStyle === "none" ? "" : `app-panel-texture--${patternStyle}`;

  return (
    <div
      className={`${textureClass} flex h-full w-full flex-col overflow-hidden bg-app-sidebar/5`}
    >
      <div
        id="sidebar-pane"
        role="tabpanel"
        aria-label={label}
        data-testid="sidebar-pane"
        className="flex-1 overflow-y-auto"
      >
        {tab === "collections" && <CollPane T={T} />}
        {tab === "env" && <EnvPane T={T} />}
        {tab === "vars" && <VarsPane T={T} />}
        {tab === "db" && <DbPane T={T} />}
        {tab === "file" && <FilePane T={T} />}
        {tab === "storage" && <StoragePane T={T} />}
      </div>
    </div>
  );
}

export type SidebarProps = {
  /** Active theme, forwarded to whichever pane is mounted. */
  T: Theme;
};

/** Memoized so unrelated store churn — a keystroke in the code editor, a
 *  response landing — does not re-render the pane tree. `T` is a stable
 *  `THEMES` entry, so the memo actually holds. */
export default memo(Sidebar);
