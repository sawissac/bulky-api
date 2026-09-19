"use client";

import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export type OptionGridItem = {
  /** Identity of the choice; what `onValueChange` reports and `value` matches. */
  value: string;
  /** Card title, under the swatch. */
  label: string;
  /** Dim line under the label — what qualifies the choice ("dark", "1× scale", a hex). */
  description?: string;
  /** Rendered at the top of the card. Size it yourself — a `block h-11 w-full` box, a row of squares, an icon. */
  swatch: React.ReactNode;
  /**
   * Merged onto the card element. Pass `--app-*` overrides here to paint one
   * card in a palette other than the page's — `themeVars(theme)` from
   * `@/lib/themes` makes the whole card (surface, text, accent, check badge)
   * preview that theme.
   */
  style?: React.CSSProperties;
};

export type OptionGridProps = Omit<React.ComponentProps<"div">, "onChange"> & {
  /** The choices, in order. */
  options: OptionGridItem[];
  /** The selected option's `value`. */
  value: string;
  /**
   * Fires when a card is clicked, including the already-selected one.
   * @param value - The clicked option's `value`.
   */
  onValueChange: (value: string) => void;
  /**
   * Extra classes merged onto the grid container — most often the column
   * count (defaults to 1-up, 2-up from `sm`).
   */
  className?: string;
  /** Base id. Each card derives `${data-testid}-<value>` from it. */
  "data-testid"?: string;
};

/**
 * A grid of standalone choice cards — swatch on top, label under it, an optional
 * dim description below that, each its own bordered tile. The domain-neutral
 * counterpart of a segmented control: reach for it when a choice benefits
 * from a real preview (a palette, a texture, a layout thumbnail) rather than
 * a plain text label.
 *
 * @remarks
 * Status/Type: ported from compacto-ui `option-grid`; presentational.
 *
 * State & behavior: fully controlled — `value` picks the active card,
 * `onValueChange` reports clicks. Holds no state of its own.
 *
 * Composition: the swatch is entirely the caller's, sizing included — this
 * component owns only the card chrome (border, selection ring, the `Check`
 * badge) and the grid. Pass a sized gradient span for a color picker, a
 * CSS-pattern span for a texture picker, or a row of squares for a full
 * palette preview. A card paints itself from the `--app-*` tokens in scope,
 * so an item's {@link OptionGridItem.style} can repaint one card entirely —
 * that is how a palette picker previews many themes on a page rendered in
 * one of them.
 *
 * Accessibility: each card is a `<button type="button">` with `aria-pressed`
 * mirroring selection; the check badge is `aria-hidden`.
 *
 * Test ids: container takes `data-testid` as given; each card gets
 * `${data-testid}-<value>`. Nothing is emitted when the prop is absent.
 *
 * CSS classes: `data-slot` markers `option-grid`, `option-grid-item`,
 * `option-grid-check`, `option-grid-label`, `option-grid-description`.
 *
 * Edge cases: labels and descriptions `truncate` — a long label is clipped,
 * not wrapped. An empty `options` array renders an empty grid.
 *
 * @example
 * ```tsx
 * <OptionGrid
 *   value={texture}
 *   onValueChange={setTexture}
 *   options={[
 *     { value: "none", label: "None", swatch: <span className="block h-11 w-full rounded-md bg-app-sidebar" /> },
 *     { value: "dots", label: "Dots", swatch: <span className="block h-11 w-full rounded-md bg-app-sidebar app-panel-texture--dots" /> },
 *   ]}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // One card previewing a foreign palette, via --app-* overrides.
 * { value: "ocean-dark", label: "ocean-dark", description: "dark",
 *   style: themeVars(THEMES["ocean-dark"]), swatch: ... }
 * ```
 */
function OptionGrid({
  className,
  options,
  value,
  onValueChange,
  "data-testid": testId,
  ...props
}: OptionGridProps) {
  return (
    <div
      data-slot="option-grid"
      data-testid={testId}
      className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-2", className)}
      {...props}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            data-slot="option-grid-item"
            data-testid={testId ? `${testId}-${option.value}` : undefined}
            aria-pressed={active}
            data-active={active || undefined}
            onClick={() => onValueChange(option.value)}
            style={option.style}
            className="relative flex min-w-0 flex-col gap-2 rounded-lg border border-app-border-mid bg-app-panel p-3 text-left transition-colors duration-200 hover:border-app-border-accent focus-visible:border-app-accent focus-visible:ring-2 focus-visible:ring-app-accent/30 focus-visible:outline-none data-active:border-app-accent data-active:ring-2 data-active:ring-app-accent/30"
          >
            {active && (
              <span
                data-slot="option-grid-check"
                aria-hidden
                className="absolute top-2 right-2 z-10 flex size-4 items-center justify-center rounded-full border border-app-border bg-app-accent text-app-on-solid"
              >
                <Check className="size-2.5" strokeWidth={3} />
              </span>
            )}
            {option.swatch}
            <span
              data-slot="option-grid-label"
              className="truncate font-title text-[12px] font-semibold text-app-bright"
            >
              {option.label}
            </span>
            {option.description && (
              <span
                data-slot="option-grid-description"
                className="truncate font-mono text-[10px] text-app-dim"
              >
                {option.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { OptionGrid };
