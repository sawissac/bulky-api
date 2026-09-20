"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";

/**
 * Size recipe. Same three custom properties as `progress` — track height, the
 * gap on each side of the split, the trailing pip — plus `--slider-thumb`, the
 * capsule's width, which the geometry has to know to keep it centred.
 */
const sliderVariants = cva("flex w-full flex-col", {
  variants: {
    size: {
      sm: "gap-1 [--slider-bar:0.375rem] [--slider-gap:0.5rem] [--slider-pip:0.375rem] [--slider-thumb:0.375rem]",
      default:
        "gap-1.5 [--slider-bar:0.5rem] [--slider-gap:0.625rem] [--slider-pip:0.5rem] [--slider-thumb:0.625rem]",
      lg: "gap-2 [--slider-bar:0.75rem] [--slider-gap:0.875rem] [--slider-pip:0.75rem] [--slider-thumb:0.875rem]",
    },
  },
  defaultVariants: { size: "default" },
});

const sliderThumbVariants = cva(
  "block w-[var(--slider-thumb)] shrink-0 rounded-full bg-app-accent transition-colors duration-(--motion-duration-fast) " +
    "focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-panel focus-visible:outline-none " +
    "data-disabled:pointer-events-none",
  {
    variants: {
      size: { sm: "h-4", default: "h-5", lg: "h-7" },
    },
    defaultVariants: { size: "default" },
  },
);

/**
 * Single-value slider drawn on the same anatomy as {@link Progress}: a filled
 * run, a gap, the remainder, and a trailing pip that fills in at `max`. The
 * capsule thumb sits in the gap, which is what keeps it legible against a fill
 * painted in the same accent — there is no ring in the surface colour to go
 * wrong on a panel, a sidebar or a textured pane.
 *
 * The capsule is always dead centre in that gap, at every value. Radix nudges
 * a thumb inward as it approaches either end (`getThumbInBoundsOffset`, up to
 * half a thumb) so a thumb styled the usual way never overflows its track —
 * here that nudge would slide the capsule off the split and squash the gap on
 * one side, so it is cancelled with an equal and opposite `translateX`. What
 * keeps everything inside the box instead is the track, inset by one gap plus
 * one pip at each end: at `min` the fill has collapsed to its leading pip and
 * the capsule sits one gap after it, at `max` the remainder is a trailing pip
 * one gap past the capsule, and the two gaps are equal at every value between.
 *
 * Deliberately scalar, unlike the Radix primitive underneath: `value` is a
 * number and `onValueChange` hands you a number. The split geometry is
 * positioned from one percentage, so a second thumb would have nowhere to put
 * its own gap. For a two-handle range, compose `radix-ui`'s `Slider` directly.
 *
 * Works controlled (`value` + `onValueChange`) or uncontrolled
 * (`defaultValue`); either way the component tracks the current value itself,
 * because the fill and the remainder are placed from it.
 *
 * @param props.value - Current value, for the controlled form.
 * @param props.defaultValue - Starting value for the uncontrolled form.
 *   Defaults to `min`.
 * @param props.onValueChange - Called with the new value on every step while
 *   dragging. Wire the cheap updates here.
 * @param props.onValueCommit - Called once when the drag or key repeat ends.
 *   Wire the expensive commit here.
 * @param props.min - Lower bound. Default `0`.
 * @param props.max - Upper bound. Default `100`.
 * @param props.step - Increment per arrow key or drag tick. Default `1`.
 * @param props.disabled - Dims the control and drops pointer events.
 * @param props.name - Name for the hidden input Radix renders inside a form.
 * @param props.label - Copy on the left of the header row; also names the thumb
 *   for assistive tech. Supply a translated string.
 * @param props.showValue - Render the formatted value on the right of the
 *   header row. Defaults to on whenever a `label` is given.
 * @param props.formatValue - Turns value and max into the readout string.
 *   Defaults to a rounded percentage of `max`.
 * @param props.size - `"sm"`, `"default"` or `"lg"`.
 * @param props.className - Extra classes merged onto the outer block — where
 *   the slider's width lives.
 * @param props.data-testid - Base id. The thumb, which a caller has no other
 *   way to reach, derives `${data-testid}-thumb`.
 *
 * @example
 * ```tsx
 * const [temperature, setTemperature] = React.useState(0.7);
 *
 * <Slider
 *   label={t("model.temperature")}
 *   min={0}
 *   max={2}
 *   step={0.1}
 *   value={temperature}
 *   onValueChange={setTemperature}
 *   formatValue={(v) => v.toFixed(1)}
 * />
 * ```
 */
function Slider({
  className,
  size,
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue = min,
  onValueChange,
  onValueCommit,
  disabled,
  name,
  label,
  showValue = label !== undefined,
  formatValue = (current, total) => `${Math.round((current / total) * 100)}%`,
  "aria-label": ariaLabel,
  "data-testid": testId,
  ...props
}: Omit<
  React.ComponentProps<"div">,
  "children" | "value" | "defaultValue" | "onChange"
> &
  VariantProps<typeof sliderVariants> & {
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    defaultValue?: number;
    onValueChange?: (value: number) => void;
    onValueCommit?: (value: number) => void;
    disabled?: boolean;
    name?: string;
    label?: React.ReactNode;
    showValue?: boolean;
    formatValue?: (value: number, max: number) => string;
    /** Base id. The thumb derives `${data-testid}-thumb` from it. */
    "data-testid"?: string;
  }) {
  const labelId = React.useId();
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const current = value ?? uncontrolled;
  const percent =
    max > min
      ? ((Math.min(Math.max(current, min), max) - min) / (max - min)) * 100
      : 0;

  function handleValueChange(next: number[]) {
    setUncontrolled(next[0]);
    onValueChange?.(next[0]);
  }

  return (
    <div
      data-slot="slider"
      data-size={size ?? "default"}
      data-testid={testId}
      className={cn(sliderVariants({ size }), className)}
      {...props}
    >
      {(label !== undefined || showValue) && (
        <div
          data-slot="slider-header"
          className="flex items-center justify-between gap-3"
        >
          {label !== undefined && (
            <span
              id={labelId}
              data-slot="slider-label"
              className={ui.fieldLabel}
            >
              {label}
            </span>
          )}
          {showValue && (
            <span
              data-slot="slider-value"
              className="font-mono text-[11px] leading-none font-semibold text-app-bright tabular-nums"
            >
              {formatValue(current, max)}
            </span>
          )}
        </div>
      )}

      <SliderPrimitive.Root
        data-slot="slider-root"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        name={name}
        value={value === undefined ? undefined : [value]}
        defaultValue={value === undefined ? [defaultValue] : undefined}
        onValueChange={handleValueChange}
        onValueCommit={(next) => onValueCommit?.(next[0])}
        className="relative mx-[calc(var(--slider-gap)+var(--slider-pip))] flex w-[calc(100%-2*(var(--slider-gap)+var(--slider-pip)))] touch-none items-center py-1.5 select-none data-disabled:pointer-events-none data-disabled:opacity-50"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-[var(--slider-bar)] w-full"
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className="absolute inset-y-0 mr-[var(--slider-gap)] -ml-[calc(var(--slider-gap)+var(--slider-pip))] rounded-full bg-app-accent"
          />
          <span
            data-slot="slider-remainder"
            data-complete={percent >= 100 || undefined}
            style={{ left: `calc(${percent}% + var(--slider-gap))` }}
            className="absolute inset-y-0 -right-[calc(var(--slider-gap)+var(--slider-pip))] rounded-full bg-app-border data-complete:bg-app-accent"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          data-testid={testId ? `${testId}-thumb` : undefined}
          aria-label={ariaLabel}
          aria-labelledby={
            ariaLabel === undefined && label !== undefined ? labelId : undefined
          }
          style={{
            transform: `translateX(calc(var(--slider-thumb) * ${percent / 100 - 0.5}))`,
          }}
          className={sliderThumbVariants({ size })}
        />
      </SliderPrimitive.Root>
    </div>
  );
}

export { Slider, sliderThumbVariants, sliderVariants };
