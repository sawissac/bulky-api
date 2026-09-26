"use client";

import { useDispatch, useSelector } from "react-redux";
import { useState, memo } from "react";
import Link from "next/link";
import {
  CircleUserRound,
  CloudOff,
  Database,
  FileLock,
  FolderDown,
  FolderOpen,
  HardDrive,
  Laptop,
  SlidersHorizontal,
  TableProperties,
} from "lucide-react";
import { useDisplayMode } from "@/hooks/useDisplayMode";
import DisplayModeDialog from "./DisplayModeDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  selectSidebarTab,
  setSidebarTab,
  selectTweaksOpen,
  setTweaksOpen,
  type SidebarTab,
} from "@/store/uiSlice";
import { selectActiveEnv } from "@/store/collectionsSlice";
import { selectRunning, selectPaused } from "@/store/runnerSlice";
import {
  selectAuthStatus,
  selectSupabaseConfigured,
  selectSyncStatus,
  selectUserEmail,
} from "@/store/authSlice";

/**
 * Rail control: 36px square hit area, flat, accent tint when active. The
 * `before` bar is the selected marker — it grows from zero height so switching
 * tabs animates without shifting the icon.
 */
const RAIL_BTN =
  "relative flex size-9 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-app-dim " +
  "transition-colors duration-200 hover:bg-app-hover hover:text-app-accent " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-inset " +
  "data-active:bg-app-selected data-active:text-app-accent " +
  "before:absolute before:left-0 before:top-1/2 before:h-0 before:w-[2px] before:-translate-y-1/2 before:rounded-full " +
  "before:bg-app-accent before:transition-all before:duration-200 data-active:before:h-5";

const TABS: Array<{ id: SidebarTab; label: string; Icon: React.ElementType }> = [
  { id: "collections", label: "Requests", Icon: FolderOpen },
  { id: "env", label: "Envs", Icon: FileLock },
  { id: "vars", label: "Vars", Icon: TableProperties },
  { id: "db", label: "DB", Icon: Database },
  { id: "file", label: "File", Icon: FolderDown },
  { id: "storage", label: "Storage", Icon: HardDrive },
];

/**
 * Fixed 48px vertical rail pinned to the window's left edge: brand mark, active
 * environment, the sidebar section tabs, and the app-level controls (run status,
 * account, fullscreen, tweaks). It replaces the former full-width top bar, so
 * the three resizable panes start at the top of the viewport. Reach for
 * {@link Sidebar} for the pane body the tabs here select.
 *
 * @remarks
 * Status: stable — Type: layout chrome
 *
 * State & behavior: one piece of local state — whether the display-mode picker
 * is open. The selected tab and tweaks-panel flag live in `uiSlice`; run status
 * and pause flag come from `runnerSlice`; the environment badge reads
 * `collectionsSlice`; the account control reads `authSlice`. The laptop control
 * opens {@link DisplayModeDialog}, which changes nothing until the user
 * confirms; the confirmed choice goes to `useDisplayMode`, which enters or
 * leaves fullscreen there and then. The running badge only mounts while a
 * script runs. The account control is a link to `/login` rather than a dialog,
 * because signing in leaves and returns via an emailed link.
 *
 * Variants:
 * - idle — no status dot.
 * - running — pulsing accent dot.
 * - paused — same dot, warn color, animation stopped.
 * - account — person icon signed in or out, struck-through cloud when Supabase
 *   is not configured, plus a red dot when the last sync failed.
 *
 * Composition: renders no children. Pairs with {@link Sidebar}, whose tab panel
 * carries `id="sidebar-pane"` — the target of `aria-controls` here.
 *
 * Accessibility: the rail is a `nav` labelled "Primary". Tabs form a vertical
 * `tablist`; each icon-only control carries an `aria-label`, since no visible
 * text names it. The tweaks button reports `aria-expanded`; the display control
 * reports `aria-haspopup="dialog"` plus `aria-expanded`. Run status is a polite
 * live region.
 *
 * Test ids: root `activity-rail-nav`, env button `activity-rail-env-button`,
 * tabs `activity-rail-tab-<tab-id>`, status `activity-rail-status`,
 * account `activity-rail-account-link`, display mode
 * `activity-rail-display-button`, tweaks `activity-rail-tweaks-button`.
 *
 * CSS classes: none — Tailwind utilities over the `app-*` theme tokens only.
 *
 * Edge cases:
 * - No active environment → the badge shows an em dash and still switches to
 *   the Envs tab.
 * - Long environment names truncate to the 48px rail; the full name stays in
 *   the tooltip.
 * - Every reload comes up in URL view; fullscreen is never restored on its own,
 *   so the laptop control always starts out showing URL view.
 * - The account control stays visible with no Supabase project configured; it
 *   leads to an explanation of local-only mode rather than a dead sign-in form.
 *
 * Dependencies: `lucide-react`, `react-redux`, `next/link`, internal
 * `useDisplayMode` hook, `@/components/ui/tooltip` (Radix `Tooltip` wrapper).
 *
 * @example
 * ```tsx
 * <div className="flex min-h-0 flex-1">
 *   <ActivityRail />
 *   <Sidebar T={T} />
 * </div>
 * ```
 *
 * @see {@link Sidebar}
 * @see {@link DisplayModeDialog}
 */
function ActivityRail() {
  const dispatch = useDispatch();
  const tab = useSelector(selectSidebarTab);
  const tweaksOpen = useSelector(selectTweaksOpen);
  const activeEnv = useSelector(selectActiveEnv);
  const running = useSelector(selectRunning);
  const paused = useSelector(selectPaused);
  const { mode, isFullscreen, apply } = useDisplayMode();
  const [pickerOpen, setPickerOpen] = useState(false);
  const syncConfigured = useSelector(selectSupabaseConfigured);
  const authStatus = useSelector(selectAuthStatus);
  const syncStatus = useSelector(selectSyncStatus);
  const email = useSelector(selectUserEmail);

  const modeLabel = isFullscreen ? "Fullscreen view" : "URL view";

  const signedIn = authStatus === "signed-in";
  const accountLabel = !syncConfigured
    ? "Sync unavailable — running local-only"
    : signedIn
      ? syncStatus === "error"
        ? `Signed in as ${email ?? "your account"} — last sync failed`
        : `Signed in as ${email ?? "your account"}`
      : "Sign in to sync across devices";

  return (
    <nav
      aria-label="Primary"
      data-testid="activity-rail-nav"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-app-border bg-app-sidebar py-2"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <img
            src="/bulky_api.png"
            alt="Bulky API"
            width={24}
            height={24}
            className="shrink-0 rounded-md"
          />
        </TooltipTrigger>
        <TooltipContent side="right">Bulky API</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => dispatch(setSidebarTab("env"))}
            aria-label={`Active environment: ${activeEnv?.name ?? "none"}`}
            data-testid="activity-rail-env-button"
            className="mt-1 w-9 truncate rounded-md border-0 bg-app-hover px-1 py-1 text-center font-title text-[10px] leading-none text-app-dim transition-colors duration-200 hover:bg-app-selected hover:text-app-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-inset"
          >
            {activeEnv?.name ?? "—"}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          Active environment: {activeEnv?.name ?? "none"}
        </TooltipContent>
      </Tooltip>

      <div className="my-1.5 h-px w-6 bg-app-border-mid" aria-hidden="true" />

      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label="Sidebar sections"
        className="flex flex-col items-center gap-1"
      >
        {TABS.map(({ id, label, Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls="sidebar-pane"
                aria-label={label}
                onClick={() => dispatch(setSidebarTab(id))}
                data-active={tab === id || undefined}
                data-testid={`activity-rail-tab-${id}`}
                className={RAIL_BTN}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="flex-1" />

      {running && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role="status"
              aria-live="polite"
              aria-label={paused ? "Paused" : "Running"}
              data-testid="activity-rail-status"
              className="flex size-9 shrink-0 items-center justify-center"
            >
              <span
                aria-hidden="true"
                data-paused={paused || undefined}
                className="size-2 animate-[pulse_0.7s_ease-in-out_infinite] rounded-full bg-app-accent data-paused:animate-none data-paused:bg-app-warn"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">{paused ? "Paused" : "Running"}</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/login"
            aria-label={accountLabel}
            data-active={signedIn || undefined}
            data-testid="activity-rail-account-link"
            className={RAIL_BTN}
          >
            {syncConfigured ? (
              <CircleUserRound size={15} aria-hidden="true" />
            ) : (
              <CloudOff size={15} aria-hidden="true" />
            )}
            {signedIn && syncStatus === "error" && (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-app-error"
              />
            )}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{accountLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label={`Display mode: ${modeLabel}. Choose how the app fills the screen`}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            data-active={pickerOpen || undefined}
            data-testid="activity-rail-display-button"
            className={`mt-1 ${RAIL_BTN}`}
          >
            <Laptop size={15} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Display mode: {modeLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => dispatch(setTweaksOpen(!tweaksOpen))}
            aria-label="Tweaks: theme, layout and call timeout"
            aria-expanded={tweaksOpen}
            data-active={tweaksOpen || undefined}
            data-testid="activity-rail-tweaks-button"
            className={RAIL_BTN}
          >
            <SlidersHorizontal size={15} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Tweaks: theme, layout and call timeout</TooltipContent>
      </Tooltip>

      {pickerOpen && (
        <DisplayModeDialog
          mode={mode}
          onConfirm={(next) => {
            void apply(next);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </nav>
  );
}

/** Memoized so it re-renders only for the selectors it reads, not for every
 *  parent render. It takes no props, so the memo always holds. */
export default memo(ActivityRail);
