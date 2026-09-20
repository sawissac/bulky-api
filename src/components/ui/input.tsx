"use client";

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";

export type InputProps = Omit<React.ComponentProps<"input">, "onChange"> & {
  /**
   * Fires on every native change, receiving the native React `ChangeEvent`.
   * Also invoked by the clear button (with an empty-value event) whenever
   * `onClear` is not supplied.
   */
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * Leading decorative icon rendered inside the field, left of the text.
   * Purely visual — `aria-hidden`.
   */
  icon?: LucideIcon;
  /**
   * Explicit stroke color for `icon`, passed straight through as the icon's
   * `color` prop. Unset falls back to the `text-app-dim` theme token; set it
   * only when a fixed, non-themed color is intentional.
   */
  iconColor?: string;
  /**
   * Overrides the clear button's default behavior (clearing the DOM node and
   * re-firing `onChange`). Use when clearing must also reset state that
   * `onChange` alone can't reach.
   */
  onClear?: () => void;
  /**
   * Accessible name for the clear button. English by default — a published
   * library cannot reach an app's translation function, so localized copy
   * arrives from the call site.
   * @defaultValue `"Clear"`
   */
  clearLabel?: string;
  /**
   * Lands on the `<input>`. The clear button derives
   * `${testId}-clear-button` from it. Declared explicitly because React's
   * `ComponentProps` does not admit `data-*` keys even though JSX does.
   */
  "data-testid"?: string;
};

/**
 * Bordered single-line text field with an optional leading icon and a trailing
 * clear button that appears once there is a value. The drop-in replacement for
 * a raw `<input>` styled with the `input` recipe in `../styles/ui.styles.js`;
 * reach for it for any free-text or numeric field.
 *
 * Fully controlled: `value`/`onChange` belong to the caller, the component
 * holds no value state of its own. The clear button renders only when `value`
 * is a non-empty string/number, the field is not `disabled`, and either
 * `onClear` or `onChange` is supplied. Clicking it calls `onClear` when given;
 * otherwise it clears the underlying DOM node directly and re-fires `onChange`
 * with that node as `event.target`, then returns focus to the field.
 *
 * Renders a native `<input>`, so labeling is the caller's responsibility
 * (`aria-label` / `aria-labelledby`). The clear button carries its own
 * `clearLabel` and is only tabbable while visible.
 *
 * A caller's `data-testid` lands on the input. The clear button derives
 * `${testid}-clear-button` from it, and gets no id at all when the caller
 * supplied none.
 *
 * @param props.icon - Leading decorative `lucide-react` icon.
 * @param props.iconColor - Fixed color for `icon`, else the themed dim tone.
 * @param props.onClear - Replaces the default clear behavior.
 * @param props.clearLabel - Accessible name for the clear button.
 * @param props.ref - Forwarded to the `<input>`. Composed with the internal
 *   ref the clear behaviour needs, so both work at once.
 * @param props.className - Extra classes merged onto the `<input>`; can
 *   override the icon/clear padding, so mind the crowding if you do.
 *
 * @example
 * ```tsx
 * <Input
 *   icon={Search}
 *   value={search}
 *   onChange={(e) => setSearch(e.target.value)}
 *   aria-label="Search tools"
 * />
 * ```
 */
function Input({
  icon: Icon,
  iconColor,
  onClear,
  clearLabel = "Clear",
  className,
  value,
  onChange,
  disabled,
  ref,
  "data-testid": testId,
  ...props
}: InputProps) {
  const innerRef = React.useRef<HTMLInputElement>(null);

  // React 19 hands `ref` over as an ordinary prop, so composing it with the
  // ref the clear button needs is a plain callback rather than the
  // forwardRef + useImperativeHandle dance this component used to carry.
  const setRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  const hasValue =
    value !== undefined && value !== null && String(value).length > 0;
  const showClear = hasValue && !disabled && Boolean(onClear || onChange);

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onChange && innerRef.current) {
      innerRef.current.value = "";
      onChange({
        target: innerRef.current,
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
    innerRef.current?.focus();
  };

  return (
    <div
      data-slot="input-wrapper"
      className="relative flex w-full min-w-0 items-center"
    >
      {Icon && (
        <Icon
          size={13}
          color={iconColor}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2",
            !iconColor && "text-app-dim",
          )}
        />
      )}
      <input
        ref={setRef}
        data-slot="input"
        data-testid={testId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={cn(ui.input, Icon && "pl-7", showClear && "pr-7", className)}
        {...props}
      />
      {showClear && (
        // preventDefault on mousedown so clicking clear never blurs the field
        // first — callers that commit on blur would otherwise commit the stale
        // value instead of clearing it.
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClear}
          aria-label={clearLabel}
          data-slot="input-clear-button"
          data-testid={testId ? `${testId}-clear-button` : undefined}
          className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm border-0 bg-transparent text-app-dim transition-colors duration-200 hover:text-app-accent focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:outline-none"
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export { Input };
