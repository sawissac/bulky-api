"use client";

import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/cn";

export type OptionGridItem = {
  value: string;
  label: string;
  /** Dim line under the label — what qualifies the choice ("dark", "1× scale", a hex). */
  description?: string;
  /** Rendered at the top of the card. Size it yourself — a `block h-11 w-full` box, a row of squares, an icon. */
  swatch: React.ReactNode;
  /**
   * Merged onto the card element. Pass `--app-*` overrides here to paint one
   * card in a palette other than the page's — `appThemeCssVars(theme)` from
   * `@/lib/color-themes` makes the whole card (surface, text, accent, check
   * badge) preview that theme.
   */
  style?: React.CSSProperties;
};

/**
 * A grid of standalone choice cards — swatch on top, label under it, an optional
 * dim description below that, each its own bordered tile. The domain-neutral
 * counterpart of a segmented control: reach for it when a choice benefits
 * from a real preview (a palette, a texture, a layout thumbnail) rather than
 * a plain text label.
 *
 * The swatch is entirely the caller's, sizing included — this component owns
 * only the card chrome (border, selection ring, the `Check` badge) and the
 * grid. Pass a sized gradient span for a color picker, a CSS-pattern span for
 * a texture picker, or a row of squares for a full palette preview.
 *
 * A card paints itself from the `--app-*` tokens in scope, so an item's
 * {@link OptionGridItem.style} can repaint one card entirely — that is how a
 * palette picker previews twenty-three themes on a page rendered in one of them.
 *
 * @param props.options - The choices, in order.
 * @param props.value - The selected option's `value`.
 * @param props.onValueChange - Called with a `value` when its card is clicked.
 * @param props.className - Extra classes merged onto the grid container —
 *   most often the column count (defaults to 1-up, 2-up from `sm`).
 *
 * @example
 * ```tsx
 * <OptionGrid
 *   value={texture}
 *   onValueChange={setTexture}
 *   options={[
 *     { value: "none", label: "None", swatch: <span className="block h-11 w-full rounded-md bg-app-sidebar" /> },
 *     { value: "dots", label: "Dots", swatch: <span className="block h-11 w-full rounded-md bg-app-sidebar compacto-texture--dots" /> },
 *   ]}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // One card previewing a foreign palette, via --app-* overrides.
 * { value: "ocean-dark", label: "ocean-dark", description: "dark",
 *   style: appThemeCssVars(COLOR_THEMES["ocean-dark"]), swatch: ... }
 * ```
 */
function OptionGrid({
  className,
  options,
  value,
  onValueChange,
  "data-testid": testId,
  ...props
}: Omit<React.ComponentProps<"div">, "onChange"> & {
  options: OptionGridItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Base id. Each card derives `${data-testid}-<value>` from it. */
  "data-testid"?: string;
}) {
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
            className="relative flex min-w-0 flex-col gap-2 rounded-lg border border-app-border-mid bg-app-panel p-3 text-left transition-colors duration-(--motion-duration-fast) hover:border-app-border-accent focus-visible:border-app-accent focus-visible:ring-2 focus-visible:ring-app-accent/30 focus-visible:outline-none data-active:border-app-accent data-active:ring-2 data-active:ring-app-accent/30"
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
