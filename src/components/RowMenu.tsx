"use client";

import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Trigger recipe: flush inside a `ButtonGroup`, ghost hover in the accent. */
const TRIGGER = "rounded-none hover:bg-app-hover hover:text-app-accent dark:hover:bg-app-hover";

/**
 * The `⋯` overflow menu a list row carries for its low-frequency actions —
 * rename, reorder, edit, delete and the like. Folding them in here keeps the
 * row itself down to one or two always-visible controls, so a hovered row
 * never buries its own name in a strip of icons. For a single always-needed
 * action, put a plain icon `Button` on the row instead.
 *
 * @remarks
 * Status: stable — Type: composite
 *
 * State & behavior: owns the menu's open flag, the trigger tooltip's open
 * flag, and whether the last close came from choosing an item. The tooltip
 * is controlled rather than left to Radix, and focus restore is suppressed
 * after a chosen item, because the trigger wears both a `TooltipTrigger` and
 * a `DropdownMenuTrigger`: opening the menu would otherwise leave the tooltip
 * standing over it, and closing the menu hands focus back to the trigger —
 * which re-opens the tooltip on top of whatever the item just opened, a
 * `ConfirmDialog` included. Escape or a click outside is not a choice, so
 * those keep Radix's normal focus restore and a keyboard user lands back on
 * the button they came from.
 *
 * Variants: per item — default, `"destructive"` (error tint), and disabled.
 * An entry keyed `"sep"` renders a separator; its other fields are ignored.
 *
 * Composition: renders no children. Meant to sit inside the row's
 * `ButtonGroup` next to any always-visible actions; the menu surface is
 * portaled by `DropdownMenuContent`.
 *
 * Accessibility: the trigger is icon-only, so it carries an `aria-label`
 * ("More actions for <label>"); Radix supplies `aria-haspopup`,
 * `aria-expanded`, the `menu`/`menuitem` roles, arrow-key navigation, and
 * typeahead. Disabled items are skipped by the keyboard.
 *
 * Test ids: derived from `testIdPrefix` and `id` — trigger
 * `<prefix>-row-menu-button-<id>`, each item `<prefix>-menu-<key>-<id>`.
 *
 * CSS classes: none — Tailwind utilities over the `app-*` tokens only.
 *
 * Edge cases:
 * - Several `"sep"` entries in one menu are fine; each gets its own key.
 * - A disabled item never fires `onSelect`.
 *
 * Dependencies: `lucide-react`, `@/components/ui/button`,
 * `@/components/ui/dropdown-menu`, `@/components/ui/separator`,
 * `@/components/ui/tooltip`.
 *
 * @example
 * ```tsx
 * <ButtonGroup className="rounded-md overflow-hidden">
 *   <RowMenu
 *     id={env.id}
 *     label={env.name}
 *     testIdPrefix="env-pane"
 *     actions={[
 *       { key: "rename", label: "Rename", icon: <Feather aria-hidden="true" />, onSelect: startRename },
 *       { key: "sep", label: "", icon: null, onSelect: () => {} },
 *       { key: "delete", label: "Delete", icon: <Trash2 aria-hidden="true" />, variant: "destructive", onSelect: askDelete },
 *     ]}
 *   />
 * </ButtonGroup>
 * ```
 *
 * @see {@link DropdownMenu}
 */
export default function RowMenu({ id, label, actions, testIdPrefix, className }: RowMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const actionTakenRef = useRef(false);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <Tooltip open={tipOpen && !menuOpen} onOpenChange={setTipOpen}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`More actions for ${label}`}
              data-testid={`${testIdPrefix}-row-menu-button-${id}`}
              className={className ? `${TRIGGER} ${className}` : TRIGGER}
            >
              <MoreHorizontal size={12} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        onCloseAutoFocus={(e) => {
          if (!actionTakenRef.current) return;
          actionTakenRef.current = false;
          e.preventDefault();
        }}
      >
        {actions.map((a, i) =>
          a.key === "sep" ? (
            <Separator key={`sep-${i}`} className="my-1" />
          ) : (
            <DropdownMenuItem
              key={a.key}
              variant={a.variant}
              disabled={a.disabled}
              onSelect={() => {
                actionTakenRef.current = true;
                a.onSelect();
              }}
              data-testid={`${testIdPrefix}-menu-${a.key}-${id}`}
            >
              {a.icon}
              {a.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One entry in a {@link RowMenu}. */
export type RowMenuAction = {
  /** Stable name for the action, unique within the menu — the React key and
   *  the `<key>` in the item's test id. `"sep"` draws a separator instead. */
  key: string;
  /** Visible item text. */
  label: string;
  /** Leading icon; the menu item sizes it. */
  icon: React.ReactNode;
  /** Fires when the item is chosen by click, Enter or Space; the menu closes
   *  as it does. Never fires for a disabled item. */
  onSelect: () => void;
  /** `"destructive"` tints the item for delete-style actions. */
  variant?: "destructive";
  /** Greys the item out and takes it out of keyboard navigation. */
  disabled?: boolean;
};

export type RowMenuProps = {
  /** Stable id of the row's subject — the tail of every derived test id. */
  id: string;
  /** Name of the row's subject, read out as "More actions for <label>". */
  label: string;
  /** Menu entries, top to bottom. */
  actions: RowMenuAction[];
  /** Caller's test-id prefix, normally its own kebab-case component name:
   *  the trigger gets `<prefix>-row-menu-button-<id>`, each item
   *  `<prefix>-menu-<key>-<id>`. */
  testIdPrefix: string;
  /** Extra classes appended to the trigger button's own. */
  className?: string;
};
