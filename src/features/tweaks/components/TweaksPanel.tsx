"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Check,
  Clock,
  Form,
  Grid2x2,
  LayoutTemplate,
  Palette,
  PanelLeftRightDashed,
  Rows2,
  SlidersHorizontal,
  TvMinimal,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { OptionGrid } from "@/components/ui/option-grid";
import { Slider } from "@/components/ui/slider";
import { THEMES, themeVars, type Theme, type ThemeKey } from "@/lib/themes";
import type { LayoutKey, PatternStyle } from "@/store/uiSlice";
import {
  selectTheme,
  selectLayout,
  setTheme,
  setLayout,
  setTweaksOpen,
  selectCallTimeout,
  setCallTimeout,
  selectPatternStyle,
  selectPatternOpacity,
  setPatternStyle,
  setPatternOpacity,
} from "@/store/uiSlice";
import * as ui from "@/lib/ui";

/** Every theme grouped under the hue it belongs to, so a palette sits beside
 *  its light counterpart instead of somewhere else in one long strip. A pair
 *  may be missing a half — Chocolate ships light-only. */
const THEME_PAIRS: Array<{ label: string; dark?: ThemeKey; light?: ThemeKey }> =
  [
    { label: "Midnight", dark: "midnight", light: "midnight-light" },
    { label: "Ocean", dark: "ocean", light: "ocean-light" },
    { label: "Chocolate", light: "light" },
    { label: "Amethyst", dark: "purple", light: "purple-light" },
    { label: "Nature", dark: "green", light: "green-light" },
    { label: "Rose", dark: "rose", light: "rose-light" },
    { label: "Amber", dark: "amber", light: "amber-light" },
    { label: "Slate", dark: "slate", light: "slate-light" },
    { label: "Sunset", dark: "flat", light: "flat-light" },
    { label: "Coffee", dark: "coffee", light: "coffee-light" },
    { label: "Cyberpunk", dark: "cyberpunk", light: "cyberpunk-light" },
    { label: "Retro", dark: "retro", light: "retro-light" },
  ];

/** The four tones that read as a whole palette at a glance — page, sidebar,
 *  accent, bright text — rather than the accent alone. */
const SWATCH_TONES = [
  "bg",
  "bgSidebar",
  "accent",
  "textBright",
] as const satisfies ReadonlyArray<keyof Theme>;

const LAYOUT_OPTIONS: Array<{
  id: LayoutKey;
  label: string;
  detail: string;
  Icon: React.ElementType;
}> = [
  {
    id: "balanced",
    label: "Balanced",
    detail: "Sidebar, editor and response split evenly.",
    Icon: PanelLeftRightDashed,
  },
  {
    id: "editor-focus",
    label: "Editor Focus",
    detail: "Editor takes most of the width; sidebar and response narrow.",
    Icon: TvMinimal,
  },
  {
    id: "response-focus",
    label: "Response Focus",
    detail: "Response panel expands; editor narrows, sidebar stays slim.",
    Icon: Form,
  },
  {
    id: "stacked",
    label: "Stacked",
    detail: "Editor and response stack vertically beside the sidebar.",
    Icon: Rows2,
  },
];

/** Sidebar/response-panel background choices — each `id` names one of the
 *  `app-panel-texture--*` utilities in `globals.css` (`'none'` renders none
 *  of them). Swatches preview at a fixed full strength (see
 *  `PATTERN_SWATCH_STYLE`) regardless of the live `patternOpacity`, so a
 *  faint live setting never makes the choices themselves hard to tell apart. */
const PATTERN_OPTIONS: Array<{ id: PatternStyle; label: string }> = [
  { id: "none", label: "None" },
  { id: "checker", label: "Checker" },
  { id: "dots", label: "Dots" },
  { id: "graph", label: "Graph" },
];

/** Forces every swatch to render at full strength, independent of the app's
 *  actual `--app-pattern-alpha` — a live setting turned down low would
 *  otherwise make the options themselves nearly indistinguishable. */
const PATTERN_SWATCH_STYLE = {
  "--app-pattern-alpha": "1",
} as React.CSSProperties;

/**
 * Card for one palette in a {@link THEME_PAIRS} group. It carries no fill
 * of its own beyond `bg-app-panel`,
 * because each card is rendered with its own theme's `--app-*` variables
 * inline — so `bg-app-panel`, `text-app-bright`, `border-app-border` and the
 * accent ring all resolve to the palette that card selects, and the card
 * previews the theme rather than describing it. Selection is an accent
 * border plus a soft accent ring, both in the card's own accent.
 */
const PALETTE_CARD =
  "relative flex min-w-0 flex-col gap-2 rounded-lg border border-app-border-mid bg-app-panel p-2.5 text-left " +
  "transition-colors duration-200 hover:border-app-border-accent " +
  "focus-visible:border-app-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/30 " +
  "data-active:border-app-accent data-active:ring-2 data-active:ring-app-accent/30";

/**
 * Segmented-group row for a layout choice — icon, name, detail, check.
 * Rounds only `first:rounded-t-md last:rounded-b-md`, matching whichever
 * corners the group container itself rounds. An interior row stays square.
 * Sits in a `divide-y` stack whose divider lines stand in for individual
 * borders, so adjacent rows still read as one control — unlike the
 * standalone {@link OptionGrid} cards of the pattern picker, which sit apart
 * in a gapped grid instead of a shared segmented frame.
 */
const ROW_BTN =
  "group relative flex w-full items-center gap-3 bg-app-hover px-3 py-2.5 text-left first:rounded-t-md last:rounded-b-md " +
  "transition-colors duration-200 hover:bg-app-selected " +
  "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-0 " +
  "data-active:bg-app-accent-faint data-active:shadow-[inset_0_0_0_1.5px_var(--app-accent)]";

/** The one-per-category entries of the left nav rail, in display order. Each
 *  `key` gates one content section; `theme` is the section shown on open. */
type SectionKey = "theme" | "layout" | "background" | "network";

const SECTIONS: Array<{
  key: SectionKey;
  label: string;
  Icon: React.ElementType;
}> = [
  { key: "theme", label: "Theme", Icon: Palette },
  { key: "layout", label: "Layout", Icon: LayoutTemplate },
  { key: "background", label: "Background", Icon: Grid2x2 },
  { key: "network", label: "Network", Icon: SlidersHorizontal },
];

/**
 * One nav-rail entry — icon plus label. No border of its own; the active entry
 * takes the accent-faint fill and accent text, matching the segmented groups in
 * the content pane. `ring-inset` keeps its focus ring from spilling over the
 * rail's `border-r`.
 */
const NAV_BTN =
  "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-title text-[11px] font-semibold uppercase tracking-[0.08em] text-app-dim " +
  "transition-colors duration-200 hover:bg-app-hover hover:text-app-bright " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent " +
  "data-active:bg-app-accent-faint data-active:text-app-accent";

/**
 * Modal for the settings that reshape the whole app rather than one call:
 * color theme, layout preset, background pattern, and the per-call timeout.
 * Each category is a {@link SECTIONS} entry in a left nav rail; picking one
 * swaps the right-hand content pane, only that section mounts at a time. Every
 * change applies immediately — there is no draft or Cancel, unlike
 * {@link DisplayModeDialog} — so the pill grid doubles as a live preview of
 * whatever the user is pointing at. Rendered by {@link ActivityRail} when the
 * tweaks control is pressed.
 *
 * @remarks
 * Status: stable — Type: overlay
 *
 * State & behavior: local state is the active nav section (`section`, seeded
 * `'theme'`) and the call-timeout text field. `section` is not persisted —
 * the panel unmounts on close, so it always reopens on Theme. The timeout
 * field is kept separate from the store so typing does not stutter waiting on
 * the 400ms debounce before `setCallTimeout` dispatches. Theme, layout and background-
 * pattern-style pills dispatch on click with no debounce; the pattern
 * intensity slider dispatches `setPatternOpacity` on every `onValueChange` —
 * cheap enough (one CSS custom property write) that it needs no debounce
 * either, unlike the timeout field's every-keystroke risk of a malformed
 * number mid-type. Escape and a click on the scrim close the dialog by
 * dispatching `setTweaksOpen(false)`; so does the footer's Done button.
 * Focus moves to the close button on mount.
 *
 * Variants: none of its own. The left nav rail lists one {@link NAV_BTN} per
 * {@link SECTIONS} entry (Theme / Layout / Background / Network), icon plus
 * label; the active one takes `data-active` and `aria-current="page"` and the
 * accent-faint fill. Its four content sections each mount only when selected,
 * so they no longer stack behind `border-t` dividers — each owns just its
 * `ui.label` heading and its control. The theme grid, layout list and pattern
 * grid each render one selected option among their choices, marked by
 * `data-active` and `aria-pressed`. Theme is a set of {@link THEME_PAIRS}
 * groups — one bordered box per hue, holding that hue's dark and light
 * palettes side by side (Chocolate ships light-only, so its box holds one
 * card). Each card is rendered with its own palette's `--app-*` variables
 * inline via `themeVars`, so its surface, label, accent border and `Check`
 * badge all paint in the theme it selects: the card previews the palette on
 * a panel drawn in a different one. Its swatch is the four tones that read
 * as a palette at a glance ({@link SWATCH_TONES} — page, sidebar, accent,
 * bright text) rather than the accent alone, so two themes sharing an accent
 * are still told apart. Layout
 * is a stacked list of full-width rows, each carrying a lucide icon
 * (`PanelLeftRightDashed`/`TvMinimal`/`Form`/`Rows2`), a name, and a one-line
 * description of the resulting pane split; the selected row gets a trailing
 * `Check`. Background Pattern is a single-row, 4-column grid of tiles shaped
 * like the theme grid's — a swatch over a label, `Check` badge on the
 * selected one — except each swatch renders the real
 * `app-panel-texture--<id>` class (`'none'` gets a flat `bg-app-sidebar`
 * swatch instead) pinned to
 * `PATTERN_SWATCH_STYLE`'s `--app-pattern-alpha: 1` so the four choices stay
 * visually distinct even when the live setting is dialed faint; the
 * Intensity slider beneath it — a `size="sm"` {@link Slider}
 * (`src/components/ui/slider.tsx`) with its built-in label/readout header row,
 * `formatValue` rendering the raw `<n>%` — drives that live
 * setting (`patternOpacity`) and is hidden outright while `patternStyle` is
 * `'none'`, since there is nothing for it to scale. Pattern tiles are an
 * {@link OptionGrid} (`src/components/ui/option-grid.tsx`) forced to four
 * columns, each card owning its own chrome — the active one gets an accent
 * border, soft accent ring and the corner `Check` badge. Theme cards
 * ({@link PALETTE_CARD}) follow the same standalone-card shape but carry no
 * fill of their own, since each is painted in the palette it selects. Layout rows are the one remaining segmented group — a `divide-y`
 * stack rounding only `first:rounded-t-md last:rounded-b-md` — since a
 * vertical list of full-width rows reads better flush than gapped. Call
 * Timeout is a plain labelled field — a single control, not a group —
 * filling the Network section on its own.
 *
 * Composition: renders no children. Two-pane body — a fixed-width `<nav>` rail
 * (`w-40`, its own `border-r`) beside a `flex-1` scrollable content pane that
 * shows the active section only. Reads `T` as an accepted prop only to keep
 * its signature consistent with the other panels {@link ActivityRail} composes
 * ({@link Sidebar}, {@link CollPane}); styling comes entirely from the `app-*`
 * theme tokens already mirrored onto `<html>`, not from `T` directly.
 *
 * Accessibility: `role="dialog"` with `aria-modal` and a label. The nav rail
 * is a `<nav aria-label="Settings sections">`; its entries are plain buttons
 * carrying `aria-current="page"` on the active section. Pills carry
 * `aria-pressed` for their selected state. The timeout field is labelled by
 * the visible "Call Timeout" heading via `aria-labelledby`; the intensity
 * slider's thumb is named by the Slider's own `label` ("Intensity") through
 * the `aria-labelledby` the component wires internally.
 *
 * Test ids: root `tweaks-panel-root`, close `tweaks-panel-close-button`, nav
 * entries `tweaks-panel-nav-<section>` (`theme`/`layout`/`background`/`network`),
 * theme pills `tweaks-panel-theme-button-<theme-id>`, theme swatch dots
 * `tweaks-panel-theme-swatch-<theme-id>`, layout pills
 * `tweaks-panel-layout-button-<layout-id>`, pattern pills
 * `tweaks-panel-pattern-button-<pattern-id>`, pattern swatches
 * `tweaks-panel-pattern-swatch-<pattern-id>`, intensity slider
 * `tweaks-panel-pattern-opacity-input` (thumb
 * `tweaks-panel-pattern-opacity-input-thumb`), timeout input
 * `tweaks-panel-timeout-input`, timeout clear
 * `tweaks-panel-timeout-input-clear-button`, footer `tweaks-panel-done-button`.
 *
 * CSS classes: `app-panel-texture--<id>` (`src/app/globals.css`) on each
 * non-`'none'` pattern swatch — otherwise Tailwind utilities over the
 * `app-*` theme tokens only.
 *
 * Edge cases:
 * - The nav section is local state on an unmounting panel, so it always
 *   reopens on Theme regardless of which section was last viewed.
 * - Clearing the timeout field or pressing "clear" both resolve to `0`
 *   (no limit), not `undefined`.
 * - A non-numeric paste is coerced to `0` on the trailing dispatch, though the
 *   field itself keeps whatever text was typed until then.
 * - Switching `patternStyle` to `'none'` leaves `patternOpacity` in the store
 *   untouched — the slider just stops rendering — so picking a pattern again
 *   later resumes at whatever intensity was last set instead of a reset default.
 *
 * Dependencies: `lucide-react`, `react-redux`, shared recipes from `@/lib/ui`,
 * `@/components/ui/input` ({@link Input}), `@/components/ui/option-grid`
 * ({@link OptionGrid}), `@/components/ui/slider` ({@link Slider}).
 *
 * @example
 * ```tsx
 * {tweaksOpen && <TweaksPanel T={T} />}
 * ```
 *
 * @see {@link ActivityRail}
 * @see {@link DisplayModeDialog}
 */
export default function TweaksPanel({}: TweaksPanelProps) {
  const dispatch = useDispatch();
  const theme = useSelector(selectTheme);
  const layout = useSelector(selectLayout);
  const patternStyle = useSelector(selectPatternStyle);
  const patternOpacity = useSelector(selectPatternOpacity);
  const callTimeout = useSelector(selectCallTimeout);

  const [localTimeout, setLocalTimeout] = useState(
    callTimeout > 0 ? String(callTimeout) : "",
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [section, setSection] = useState<SectionKey>("theme");

  const close = () => dispatch(setTweaksOpen(false));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const handleTimeoutChange = (val: string) => {
    setLocalTimeout(val);
    clearTimeout(timeoutRef.current ?? undefined);
    timeoutRef.current = setTimeout(() => {
      dispatch(setCallTimeout(Math.max(0, val === "" ? 0 : Number(val))));
    }, 400);
  };

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/65 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        data-testid="tweaks-panel-root"
        className="flex h-[min(560px,88vh)] w-[min(680px,94vw)] animate-[fadeUp_0.18s_ease] flex-col overflow-hidden rounded-lg border-2 border-app-border-mid bg-app-panel"
      >
        <div className="flex shrink-0 items-center gap-2 border-b-2 border-app-border-mid px-4 py-1.5">
          <span className="flex-1 font-title text-[13px] font-semibold uppercase tracking-[0.04em] text-app-bright">
            Settings
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close settings"
            data-testid="tweaks-panel-close-button"
            className={ui.iconBtn}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Settings sections"
            className="flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r-2 border-app-border-mid p-2"
          >
            {SECTIONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                aria-current={section === key ? "page" : undefined}
                data-active={section === key || undefined}
                data-testid={`tweaks-panel-nav-${key}`}
                className={NAV_BTN}
              >
                <Icon
                  size={14}
                  aria-hidden="true"
                  className="shrink-0 text-app-dim group-data-active:text-app-accent"
                />
                {label}
              </button>
            ))}
          </nav>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
            {section === "theme" && (
              <div>
                <div className={`${ui.label} mb-2`}>Color Theme</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {THEME_PAIRS.map(({ label, dark, light }) => (
                    <div
                      key={label}
                      className="flex flex-col gap-2 rounded-xl border border-app-border p-2"
                    >
                      <span className="px-1 font-title text-[10px] font-semibold uppercase tracking-[0.06em] text-app-dim">
                        {label}
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { variant: "Dark", id: dark },
                          { variant: "Light", id: light },
                        ].flatMap(({ variant, id }) =>
                          !id
                            ? []
                            : [
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => dispatch(setTheme(id))}
                                  aria-pressed={theme === id}
                                  aria-label={`${label} ${variant}`}
                                  data-active={theme === id || undefined}
                                  data-testid={`tweaks-panel-theme-button-${id}`}
                                  style={
                                    themeVars(THEMES[id]) as React.CSSProperties
                                  }
                                  className={PALETTE_CARD}
                                >
                                  {theme === id && (
                                    <span
                                      aria-hidden="true"
                                      className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full border border-app-border bg-app-accent text-app-on-solid"
                                    >
                                      <Check
                                        className="size-2.5"
                                        strokeWidth={3}
                                      />
                                    </span>
                                  )}
                                  <span
                                    aria-hidden="true"
                                    data-testid={`tweaks-panel-theme-swatch-${id}`}
                                    className="flex gap-1"
                                  >
                                    {SWATCH_TONES.map((tone) => (
                                      <span
                                        key={tone}
                                        className="size-4 rounded-sm border border-app-border"
                                        style={{ background: THEMES[id][tone] }}
                                      />
                                    ))}
                                  </span>
                                  <span className="truncate font-title text-[11px] font-semibold text-app-bright">
                                    {variant}
                                  </span>
                                </button>,
                              ],
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section === "layout" && (
              <div>
                <div className={`${ui.label} mb-2`}>Layout</div>
                <div className="flex flex-col divide-y divide-app-border overflow-hidden rounded-lg border border-app-border">
                  {LAYOUT_OPTIONS.map(({ id, label, detail, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => dispatch(setLayout(id))}
                      aria-pressed={layout === id}
                      data-active={layout === id || undefined}
                      data-testid={`tweaks-panel-layout-button-${id}`}
                      className={ROW_BTN}
                    >
                      <Icon
                        size={16}
                        aria-hidden="true"
                        className="shrink-0 text-app-dim group-data-active:text-app-accent"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-title text-[11px] font-semibold uppercase tracking-[0.06em] text-app-bright">
                          {label}
                        </span>
                        <span className="mt-0.5 block font-description text-[11px] leading-snug text-app-dim">
                          {detail}
                        </span>
                      </span>
                      {layout === id && (
                        <Check
                          size={14}
                          aria-hidden="true"
                          className="shrink-0 text-app-accent"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {section === "background" && (
              <div>
                <div className={`${ui.label} mb-2`}>Background Pattern</div>
                <OptionGrid
                  className="grid-cols-4 sm:grid-cols-4"
                  data-testid="tweaks-panel-pattern-button"
                  value={patternStyle}
                  onValueChange={(v) => dispatch(setPatternStyle(v as PatternStyle))}
                  options={PATTERN_OPTIONS.map(({ id, label }) => ({
                    value: id,
                    label,
                    swatch: (
                      <span
                        aria-hidden="true"
                        data-testid={`tweaks-panel-pattern-swatch-${id}`}
                        className={`relative block h-11 w-full shrink-0 overflow-hidden rounded-md border border-app-border bg-app-sidebar ${
                          id === "none" ? "" : `app-panel-texture--${id}`
                        }`}
                        style={id === "none" ? undefined : PATTERN_SWATCH_STYLE}
                      />
                    ),
                  }))}
                />
                {patternStyle !== "none" && (
                  <Slider
                    className="mt-3"
                    size="sm"
                    label="Intensity"
                    min={0}
                    max={100}
                    step={5}
                    value={patternOpacity}
                    onValueChange={(v) => dispatch(setPatternOpacity(v))}
                    formatValue={(v) => `${v}%`}
                    data-testid="tweaks-panel-pattern-opacity-input"
                  />
                )}
              </div>
            )}

            {section === "network" && (
              <div>
                <div
                  id="tweaks-panel-timeout-label"
                  className={`${ui.label} mb-2.5`}
                >
                  Call Timeout
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    icon={Clock}
                    type="number"
                    min={0}
                    step={500}
                    value={localTimeout}
                    onChange={(e) => handleTimeoutChange(e.target.value)}
                    onClear={() => {
                      setLocalTimeout("");
                      dispatch(setCallTimeout(0));
                    }}
                    placeholder="Enter timeout in ms…"
                    aria-labelledby="tweaks-panel-timeout-label"
                    data-testid="tweaks-panel-timeout-input"
                    className="font-mono"
                  />
                  <span className={ui.meta}>ms</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end border-t-2 border-app-border-mid px-4 py-1.5">
          <button
            type="button"
            onClick={close}
            data-testid="tweaks-panel-done-button"
            className={ui.solidBtn}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export type TweaksPanelProps = {
  /** Active theme. Accepted only for signature parity with sibling panels; the
   *  dialog styles itself from the `app-*` tokens `T` already publishes. */
  T: Theme;
};
