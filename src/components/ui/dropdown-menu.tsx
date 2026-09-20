"use client";

import { Check } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Menu root. Compose with {@link DropdownMenuTrigger},
 * {@link DropdownMenuContent} and {@link DropdownMenuItem} (or
 * {@link DropdownMenuCheckboxItem} for a multi-select).
 *
 * @example
 * ```tsx
 * <DropdownMenu>
 *   <DropdownMenuTrigger asChild>
 *     <Button variant="ghost" size="icon-sm" aria-label="More"><MoreVertical size={14} /></Button>
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent>
 *     <DropdownMenuItem onSelect={rename}>Rename</DropdownMenuItem>
 *     <DropdownMenuItem variant="destructive" onSelect={remove}>Delete</DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 */
function DropdownMenu(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

/**
 * The control that opens the menu. Pass `asChild` to keep your own element —
 * `Button` picks up the open state through `aria-expanded` and holds its hover
 * fill while the menu is showing.
 */
function DropdownMenuTrigger(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

/**
 * The floating menu surface.
 *
 * @param props.align - Alignment against the trigger. Defaults to `"end"`,
 *   since a menu button usually sits at the right edge of its row.
 * @param props.sideOffset - Gap between trigger and menu, in px. Default 4.
 * @param props.className - Extra classes merged onto the surface.
 */
function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = "end",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-200 min-w-32 overflow-hidden rounded-lg border border-app-border-mid bg-app-panel p-1 text-app-text",
          "data-[state=open]:animate-[compacto-fade-up_0.15s_ease]",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

/**
 * One menu action.
 *
 * @param props.variant - `"destructive"` tints the row for delete-style
 *   actions. It is a tint, not a solid red block — a menu of ten rows with one
 *   filled red bar reads as an error state rather than an option.
 * @param props.className - Extra classes merged onto the row.
 */
function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors duration-(--motion-duration-fast) outline-none select-none",
        "focus:bg-app-selected focus:text-app-bright",
        "data-[variant=destructive]:text-app-error data-[variant=destructive]:focus:bg-app-error/10",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Toggleable row with a leading check indicator, for multi-select menus.
 *
 * Deliberately stays open after a toggle: the whole reason to use checkbox
 * items is to pick several things in one pass, and a menu that closes on the
 * first click makes the caller reopen it for every option.
 *
 * @param props.checked - Controlled checked state.
 * @param props.onSelect - Runs after the default keep-open behaviour; the
 *   event is already `preventDefault`ed when it reaches you.
 * @param props.className - Extra classes merged onto the row.
 */
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onSelect,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      checked={checked}
      onSelect={(e) => {
        // Keep the menu open while toggling multiple targets.
        e.preventDefault();
        onSelect?.(e);
      }}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 pl-7 text-sm transition-colors duration-(--motion-duration-fast) outline-none select-none",
        "focus:bg-app-selected focus:text-app-bright",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 grid place-items-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3.5" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
};
