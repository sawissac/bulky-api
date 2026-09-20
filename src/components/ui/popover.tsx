"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Popover root. Compose with {@link PopoverTrigger} and
 * {@link PopoverContent}; {@link PopoverHeader}, {@link PopoverTitle} and
 * {@link PopoverDescription} are optional furniture for the panel's top.
 *
 * Reach for a popover when the content is a small aside anchored to a control
 * — a filter, a colour picker, a short form. Anything that interrupts the task
 * and demands a decision is a dialog instead.
 *
 * @example
 * ```tsx
 * <Popover>
 *   <PopoverTrigger asChild>
 *     <Button variant="outline" size="sm">Filters</Button>
 *   </PopoverTrigger>
 *   <PopoverContent>
 *     <PopoverHeader>
 *       <PopoverTitle>Filter results</PopoverTitle>
 *       <PopoverDescription>Applies to the current view only.</PopoverDescription>
 *     </PopoverHeader>
 *   </PopoverContent>
 * </Popover>
 * ```
 */
function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

/** The control the panel hangs off. Pass `asChild` to keep your own element. */
function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/**
 * The floating panel. A `border-2` `app-panel` surface — one step heavier than
 * a tooltip's hairline, because a popover is a place you work rather than a
 * hint you read.
 *
 * Scrolls internally past 60vh rather than growing off-screen, and keeps 8px
 * clear of the viewport edge.
 *
 * @param props.align - Alignment against the trigger. Default `"center"`.
 * @param props.sideOffset - Gap between trigger and panel, in px. Default 6.
 * @param props.className - Extra classes merged onto the panel; the usual
 *   reason is a different width than the default 18rem.
 */
function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-200 max-h-[60vh] w-72 overflow-y-auto rounded-lg border-2 border-app-border-mid bg-app-panel p-4 text-app-text outline-none",
          "data-[state=open]:animate-[compacto-fade-up_0.15s_ease]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/**
 * Anchor the panel to something other than the trigger — for a popover that
 * follows a text selection or a cell rather than the button that opened it.
 */
function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

/** Stacked title + description block at the top of a panel. */
function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

/** Panel title. Renders a `div`, not a heading — a popover is not a landmark. */
function PopoverTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

/** Secondary line under a {@link PopoverTitle}. */
function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-app-dim", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
