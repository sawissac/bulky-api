"use client";

import { Separator as SeparatorPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Thin rule that divides content, either horizontally or vertically.
 *
 * Sits on `app-border` — the hairline tone, not the text color — so a divider
 * never competes with the content on either side of it.
 *
 * @param props.orientation - Rule direction; `"horizontal"` (default) spans the
 *   full width, `"vertical"` stretches to the parent's height.
 * @param props.decorative - When true (default) the rule is hidden from
 *   assistive tech; set false when it carries real structural meaning.
 * @param props.className - Extra classes merged onto the rule.
 */
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        // Radix marks the rule with data-orientation="…", so the variants must
        // read that attribute's value. A bare `data-horizontal:` looks for an
        // attribute of that name, which never exists, and the rule renders at
        // zero size.
        "shrink-0 bg-app-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
