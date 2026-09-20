"use client";

import * as React from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/cn";

/**
 * Container for a row or column of resizable panels.
 *
 * Wraps `react-resizable-panels`' `Group`; `react-resizable-panels` is an
 * optional peer dependency, so installing it is only required if you import
 * this module.
 *
 * **Two things this component cannot forward**, both because the underlying
 * library claims them for its own layout persistence:
 *
 * - `data-testid` and `id` are overwritten with generated values. Target the
 *   group with `[data-slot="resizable-group"]`, or put your test id on a
 *   wrapper element. The same applies to `ResizablePanel`.
 * - `ref` yields the library's imperative panel-group handle, not the DOM
 *   node.
 *
 * `className` does pass through normally.
 *
 * @param props.orientation - `"horizontal"` lays panels side by side,
 *   `"vertical"` stacks them.
 * @param props.className - Extra classes merged onto the group.
 *
 * @example
 * ```tsx
 * <ResizableGroup orientation="horizontal">
 *   <ResizablePanel defaultSize="30%" minSize="180px">…</ResizablePanel>
 *   <ResizableHandle />
 *   <ResizablePanel>…</ResizablePanel>
 * </ResizableGroup>
 * ```
 */
function ResizableGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-group"
      className={cn(
        "flex h-full w-full data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

/** One resizable region. Re-exported from `react-resizable-panels` unchanged. */
const ResizablePanel = Panel;

/**
 * The draggable rule between two panels.
 *
 * Renders as a 1px line but claims a 12px invisible hit area through an
 * `::after` overlay — a literal 1px drag target is unusable with a mouse and
 * impossible with a trackpad. Highlights to the accent on hover, drag and
 * keyboard focus.
 *
 * @param props.className - Extra classes merged onto the handle.
 */
function ResizableHandle({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px shrink-0 items-center justify-center bg-app-border outline-none",
        "transition-colors duration-(--motion-duration-fast)",
        "hover:bg-app-accent/60 focus-visible:bg-app-accent data-[active]:bg-app-accent",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2",
        className,
      )}
      {...props}
    />
  );
}

export { ResizableGroup, ResizableHandle, ResizablePanel };
