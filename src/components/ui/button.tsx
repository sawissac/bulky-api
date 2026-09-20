import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Flat button geometry. No elevation: the rest state is a transparent 1px
 * border — always present, so hover and focus never shift layout — feedback
 * comes from fill and border color, and the only motion is a 1px settle on
 * press. `aria-expanded` holds the hover fill while a menu the button opens is
 * showing; popup triggers opt out of the press nudge so the panel they anchor
 * doesn't jump.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-app-accent focus-visible:ring-3 focus-visible:ring-app-accent/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-app-error aria-invalid:ring-3 aria-invalid:ring-app-error/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-app-accent text-app-on-solid hover:bg-app-accent/80",
        outline:
          "border-app-border bg-app-bg hover:bg-app-hover hover:text-app-bright aria-expanded:bg-app-hover aria-expanded:text-app-bright",
        secondary:
          "bg-app-sidebar text-app-bright hover:bg-app-sidebar/80 aria-expanded:bg-app-sidebar aria-expanded:text-app-bright",
        ghost:
          "hover:bg-app-hover hover:text-app-bright aria-expanded:bg-app-hover aria-expanded:text-app-bright",
        destructive:
          "bg-app-error/10 text-app-error hover:bg-app-error/20 focus-visible:border-app-error/40 focus-visible:ring-app-error/20",
        link: "text-app-accent underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * The button primitive.
 *
 * Server-safe: no `"use client"` directive, so a Server Component can render a
 * link-style or form-submit button without opening a client boundary. Anything
 * with an `onClick` naturally lives in a client component anyway.
 *
 * Carries `data-variant` and `data-size` alongside `data-slot="button"`, so a
 * container can style or select its buttons by role — {@link ButtonGroup} and
 * `DialogFooter` both lean on that.
 *
 * @param props.variant - Visual role. `default` is the solid accent action,
 *   `outline` the bordered secondary, `ghost` the chrome-less one for toolbars,
 *   `secondary` a filled neutral, `destructive` a tinted danger action (not a
 *   solid red block), `link` inline text.
 * @param props.size - Geometry. `default`/`sm`/`lg`/`xs` are label buttons;
 *   the `icon*` sizes are square hit areas for a lone glyph — pair them with an
 *   `aria-label`, since there is no text to name the control.
 * @param props.asChild - Render the caller's child element instead of a
 *   `<button>`, keeping these styles (for links, menu triggers, ...).
 * @param props.className - Extra classes merged onto the button.
 *
 * @example
 * ```tsx
 * <Button onClick={save}>Save</Button>
 * <Button variant="outline" size="icon-sm" aria-label="Refresh">
 *   <RotateCw size={14} />
 * </Button>
 * <Button asChild variant="link">
 *   <a href="/docs">Read the docs</a>
 * </Button>
 * ```
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
