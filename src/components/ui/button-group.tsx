import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/cn";
import { Separator } from "@/components/ui/separator";

/**
 * Segmented-group geometry. Children keep their own button styling; the group
 * only collapses the seam between them — inner corners squared off and the
 * adjacent border dropped, so two touching buttons share one 1px hairline
 * instead of stacking two.
 */
const buttonGroupVariants = cva(
  "group/button-group flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-slot=button-group]]:gap-2",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

/**
 * Renders adjacent buttons as one connected control, the way a toolbar groups
 * its icon actions. Wrap two or more {@link Button}s (or any bordered,
 * button-shaped children): only the outer corners stay rounded, and touching
 * borders merge into a single hairline.
 *
 * Works because `Button`'s rest state carries a transparent 1px border rather
 * than no border at all — there is always an edge to collapse, so joining
 * buttons never shifts their geometry.
 *
 * Nest a `ButtonGroup` inside another to space clusters apart instead of
 * joining them; the outer group adds a gap when it sees a nested one.
 *
 * @param props.orientation - Seam direction; `"horizontal"` (default) joins
 *   children left-to-right, `"vertical"` stacks them.
 * @param props.className - Extra classes merged onto the group wrapper.
 *
 * @example
 * ```tsx
 * <ButtonGroup>
 *   <Button variant="outline" size="icon-sm" aria-label="Save">
 *     <Download size={15} />
 *   </Button>
 *   <Button variant="outline" size="icon-sm" aria-label="New folder">
 *     <FolderPlus size={15} />
 *   </Button>
 * </ButtonGroup>
 * ```
 */
function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

/**
 * Explicit divider between two group members, for when the merged hairlines
 * alone don't read as a split — most often between same-colored solid buttons,
 * where there is no border contrast to collapse in the first place.
 *
 * @param props.orientation - Rule direction; defaults to `"vertical"`, which is
 *   the one a horizontal group wants.
 * @param props.className - Extra classes merged onto the rule.
 */
function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "relative self-stretch bg-app-accent data-[orientation=horizontal]:mx-px data-[orientation=horizontal]:w-auto data-[orientation=vertical]:my-px data-[orientation=vertical]:h-auto",
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, buttonGroupVariants };
