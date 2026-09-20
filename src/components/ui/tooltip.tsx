"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Provider that sets the shared open/close timing for the tooltips beneath it.
 *
 * {@link Tooltip} wraps itself in one of these, so a lone tooltip needs no
 * setup. Mount a provider higher up when you want a group of tooltips to share
 * hover state — that is what makes the second tooltip in a toolbar appear
 * instantly instead of waiting out the delay again.
 *
 * @param props.delayDuration - Hover time before the tooltip opens, in ms.
 *   Defaults to 200: long enough not to fire on a pointer passing through,
 *   short enough not to feel withheld.
 */
function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

/**
 * Tooltip root. Compose it with {@link TooltipTrigger} and
 * {@link TooltipContent}.
 *
 * Self-providing: it mounts its own {@link TooltipProvider}, so a single
 * tooltip works standalone. When several tooltips should share hover timing,
 * wrap them in one provider yourself.
 *
 * A tooltip is a hint, never the only place information lives — an icon-only
 * control still needs its own `aria-label`.
 *
 * @example
 * ```tsx
 * <Tooltip>
 *   <TooltipTrigger asChild>
 *     <Button size="icon-sm" aria-label="Refresh"><RotateCw size={14} /></Button>
 *   </TooltipTrigger>
 *   <TooltipContent>Refresh the list</TooltipContent>
 * </Tooltip>
 * ```
 */
function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

/**
 * The element the tooltip describes. Pass `asChild` to keep your own element
 * — a bare trigger renders a `<button>`, which is rarely what you want around
 * an existing control.
 */
function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/**
 * The floating panel: a hairline-bordered `app-panel` surface with an arrow,
 * capped at 16rem so a hint stays a hint. Rises into place rather than scaling,
 * matching every other floating surface in the system.
 *
 * @param props.sideOffset - Gap between trigger and panel, in px. Default 8.
 * @param props.className - Extra classes merged onto the panel; use it to
 *   widen past the default cap when a hint genuinely needs more room.
 */
function TooltipContent({
  className,
  sideOffset = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-200 max-w-64 rounded-md border border-app-border-mid bg-app-panel px-2.5 py-1.5 text-[11px] leading-relaxed text-app-text",
          "data-[state=delayed-open]:animate-[compacto-fade-up_0.15s_ease] data-[state=instant-open]:animate-[compacto-fade-up_0.15s_ease]",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          className="fill-app-panel"
          width={11}
          height={5}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
