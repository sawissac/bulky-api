"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Progress as ProgressPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";

/**
 * Size recipe shared by {@link Progress} and the slider built on the same
 * anatomy. Everything downstream is derived from three custom properties, so
 * a size is one row here rather than four class strings scattered about:
 *
 * - `--progress-bar` — track height, and therefore the pip's diameter.
 * - `--progress-gap` — clear space on each side of the split.
 * - `--progress-pip` — width of the trailing pip the remainder collapses to.
 */
const progressVariants = cva("flex w-full flex-col", {
  variants: {
    size: {
      sm: "gap-1 [--progress-bar:0.375rem] [--progress-gap:0.125rem] [--progress-pip:0.375rem]",
      default:
        "gap-1.5 [--progress-bar:0.5rem] [--progress-gap:0.1875rem] [--progress-pip:0.5rem]",
      lg: "gap-2 [--progress-bar:0.75rem] [--progress-gap:0.25rem] [--progress-pip:0.75rem]",
    },
  },
  defaultVariants: { size: "default" },
});

/**
 * Determinate progress bar: an optional label row, then a track split into a
 * filled run and the remainder, with a gap between the two.
 *
 * The split is the whole idea. The filled run stops one `--progress-gap` short
 * of the value, the remainder picks up one gap after it, and both ends are
 * round — so the bar reads as two objects meeting rather than one bar with a
 * seam. Neither segment is ever allowed to disappear: each is sized so that at
 * its own extreme it has collapsed to exactly one pip, a circle the height of
 * the track. At `max` the remainder is a trailing pip, and it flips to the
 * accent colour as the bar's "done" mark; at `0` the fill is a leading pip, so
 * an empty bar still shows where it starts from instead of going blank.
 *
 * Both pips have to live inside the caller's width rather than past it, which
 * is why the track is laid out `calc(100% - 2 * (gap + pip))` wide, centred,
 * and each segment overhangs its own end of it.
 *
 * Pass `value={null}` for the indeterminate state: the split geometry makes no
 * sense without a value, so the track becomes a solid channel with a segment
 * sweeping across it. The keyframe (`compacto-progress-sweep`) ships in this
 * library's own stylesheet — it is not a `tw-animate-css` class.
 *
 * @param props.value - Current value, `0`–`max`. `null` is the indeterminate
 *   state. Values outside the range are clamped.
 * @param props.max - Value that counts as complete. Default `100`.
 * @param props.label - Copy on the left of the header row. Supply a translated
 *   string; there is no default, and no header renders without one unless
 *   `showValue` is set.
 * @param props.showValue - Render the formatted value on the right of the
 *   header row. Defaults to on whenever a `label` is given, since a label with
 *   no readout is the rarer thing to want.
 * @param props.formatValue - Turns value and max into the readout string, and
 *   into the bar's `aria-valuetext`, so the two never disagree. Defaults to a
 *   rounded percentage.
 * @param props.size - `"sm"`, `"default"` or `"lg"` — track height and the gap
 *   and pip derived from it.
 * @param props.className - Extra classes merged onto the outer block. This is
 *   where the bar's width lives; it fills its parent by default.
 *
 * @example
 * ```tsx
 * <Progress value={75} label={t("upload.progress")} />
 * <Progress value={null} size="sm" />
 * ```
 */
function Progress({
  className,
  size,
  value = null,
  max = 100,
  label,
  showValue = label !== undefined,
  formatValue = (current, total) => `${Math.round((current / total) * 100)}%`,
  ...props
}: Omit<React.ComponentProps<"div">, "children" | "value"> &
  VariantProps<typeof progressVariants> & {
    value?: number | null;
    max?: number;
    label?: React.ReactNode;
    showValue?: boolean;
    formatValue?: (value: number, max: number) => string;
  }) {
  const labelId = React.useId();
  const indeterminate = value === null;
  const clamped = indeterminate ? 0 : Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (clamped / max) * 100 : 0;

  return (
    <div
      data-slot="progress"
      data-size={size ?? "default"}
      className={cn(progressVariants({ size }), className)}
      {...props}
    >
      {(label !== undefined || showValue) && (
        <div
          data-slot="progress-header"
          className="flex items-center justify-between gap-3"
        >
          {label !== undefined && (
            <span
              id={labelId}
              data-slot="progress-label"
              className={ui.fieldLabel}
            >
              {label}
            </span>
          )}
          {showValue && !indeterminate && (
            <span
              data-slot="progress-value"
              className="font-mono text-[11px] leading-none font-semibold text-app-bright tabular-nums"
            >
              {formatValue(clamped, max)}
            </span>
          )}
        </div>
      )}

      <ProgressPrimitive.Root
        data-slot="progress-track"
        aria-labelledby={label !== undefined ? labelId : undefined}
        value={indeterminate ? null : clamped}
        max={max}
        getValueLabel={formatValue}
        className={cn(
          "relative h-[var(--progress-bar)]",
          indeterminate
            ? "w-full overflow-hidden rounded-full bg-app-border"
            : "mx-[calc(var(--progress-gap)+var(--progress-pip))] w-[calc(100%-2*(var(--progress-gap)+var(--progress-pip)))]",
        )}
      >
        {indeterminate ? (
          <ProgressPrimitive.Indicator
            data-slot="progress-indicator"
            className="absolute inset-y-0 left-0 w-2/5 animate-[compacto-progress-sweep_1.4s_var(--motion-ease-standard)_infinite] rounded-full bg-app-accent"
          />
        ) : (
          <>
            <ProgressPrimitive.Indicator
              data-slot="progress-indicator"
              style={{ right: `calc(${100 - percent}% + var(--progress-gap))` }}
              className="absolute inset-y-0 -left-[calc(var(--progress-gap)+var(--progress-pip))] rounded-full bg-app-accent transition-[right] duration-(--motion-duration-base) ease-(--motion-ease-standard)"
            />
            <span
              data-slot="progress-remainder"
              data-complete={percent >= 100 || undefined}
              style={{ left: `calc(${percent}% + var(--progress-gap))` }}
              className="absolute inset-y-0 -right-[calc(var(--progress-gap)+var(--progress-pip))] rounded-full bg-app-border transition-[left] duration-(--motion-duration-base) ease-(--motion-ease-standard) data-complete:bg-app-accent"
            />
          </>
        )}
      </ProgressPrimitive.Root>
    </div>
  );
}

export { Progress, progressVariants };
