"use client";

import { useEffect, useRef, useState, memo } from "react";
import Highlighter from "react-highlight-words";
import type { Theme } from "@/lib/themes";
import {
  countMatches,
  countTreeMatches,
  treeScalarText,
  TREE_STRING_LIMIT,
} from "@/lib/responseSearch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type JNodeProps = {
  /** Parsed JSON value to render. Any JSON shape — object, array, or scalar. */
  data: unknown;
  /**
   * Nesting level. Drives the initial expand state, not the indent (each level
   * indents by rendering inside its parent).
   * @defaultValue `0`
   */
  depth?: number;
  /** Palette the tree paints itself with, including its light/dark syntax set. */
  T: Theme;
  /**
   * Dotted trail of keys and array indices from the root to this node, used to
   * build a unique test id per key and per value.
   * @defaultValue `"root"`
   */
  path?: string;
  /**
   * Find term marked inside keys and scalar values. Case-insensitive and taken
   * literally, so regex metacharacters match themselves. An empty term renders
   * the tree unmarked.
   * @defaultValue `""`
   */
  query?: string;
  /**
   * Zero-based index — counted across the whole tree in render order — of the
   * match to paint as current. It also carries the
   * `json-tree-viewer__mark--active` class, which is what a caller scrolls to.
   * `-1` while there is no current match.
   * @defaultValue `-1`
   */
  activeIndex?: number;
  /**
   * How many matches precede this node in the tree, so a node's own hits can
   * be numbered globally. Callers rendering a root leave it alone.
   * @defaultValue `0`
   */
  matchOffset?: number;
  /**
   * Forces every node open regardless of its own expand state, so a find term
   * cannot leave matches hidden inside a collapsed branch.
   * @defaultValue `false`
   */
  openAll?: boolean;
};

type CopyTokenProps = {
  /** Exact text written to the clipboard — the untruncated value, not the display form. */
  text: string;
  /** Resting text color; the copied flash overrides it. */
  color: string;
  /** Palette supplying the copied-flash colors. */
  T: Theme;
  /** Test id for this token. */
  testId: string;
  /** Find term marked inside `display`. Empty renders `display` untouched. */
  query: string;
  /** Index of the current match across the whole tree, or `-1` for none. */
  activeIndex: number;
  /** How many matches precede this token, so its own hits number globally. */
  matchOffset: number;
  /** Token text as shown — a string value arrives already elided. */
  display: string;
  /** Rendered around `display`, e.g. a string value's quotes. */
  children?: (marked: React.ReactNode) => React.ReactNode;
};

/**
 * Syntax colors for the tree. The dark set is the original palette; the light
 * set swaps in darker equivalents so keys / strings / numbers clear WCAG AA on
 * a pale panel instead of washing out (the dark values sat near ~1.5:1 there).
 */
const SYNTAX = {
  dark: {
    key: "#67e8f9",
    string: "#fbbf24",
    number: "#34d399",
    boolean: "#a78bfa",
    null: "#64748b",
  },
  light: {
    key: "#0e7490",
    string: "#047857",
    number: "#9a3412",
    boolean: "#6d28d9",
    null: "#57534e",
  },
} as const;

/**
 * One click-to-copy token inside {@link JNode} — a key name or a scalar value.
 *
 * @remarks
 * Status: stable — Type: internal
 *
 * State & behavior: owns a `copied` flag set on a successful clipboard write
 * and cleared 900ms later; the pending timer is cleared on unmount and on a
 * repeat copy. A rejected clipboard write (permission denied, insecure
 * context) leaves the token unflashed and nothing is reported. The tooltip
 * reads "Click to copy" on hover or focus and is pinned open reading "Copied"
 * for the length of the flash, so the confirmation shows even as the pointer
 * leaves.
 *
 * Accessibility: `role="button"`, focusable, Enter and Space copy. The
 * accessible name matches the tooltip — "Click to copy", then "Copied" while
 * the flash is up. The tooltip is the {@link Tooltip} primitive, not a `title`
 * attribute.
 *
 * CSS classes: `json-tree-viewer__mark--active` on the current match's
 * `<mark>`, which is the hook a caller scrolls to.
 *
 * Edge cases:
 * - `text` is the full value, so copying an elided string still yields the
 *   whole string, while `display` — and therefore the marking — covers only
 *   what is on screen.
 * - `activeIndex` outside this token's own match range simply marks nothing
 *   as current here.
 */
function CopyToken({
  text,
  color,
  T,
  testId,
  query,
  activeIndex,
  matchOffset,
  display,
  children,
}: CopyTokenProps) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked — leave the token unflashed */
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 900);
  };

  const marked = query ? (
    <Highlighter
      searchWords={[query]}
      textToHighlight={display}
      autoEscape
      activeIndex={activeIndex - matchOffset}
      activeClassName="json-tree-viewer__mark--active"
      highlightStyle={{
        background: `${T.accent}38`,
        color: T.textBright,
        borderRadius: 2,
      }}
      activeStyle={{
        background: `${T.accent}80`,
        color: T.textBright,
        outline: `1px solid ${T.accent}`,
        borderRadius: 2,
      }}
      unhighlightStyle={{ color: "inherit" }}
    />
  ) : (
    display
  );

  return (
    <Tooltip open={copied || hovered} onOpenChange={setHovered}>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={copied ? "Copied" : "Click to copy"}
          data-testid={testId}
          onClick={copy}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              copy();
            }
          }}
          style={{
            color: copied ? T.success : color,
            background: copied ? T.accentFaint : "transparent",
            borderRadius: 3,
            cursor: "pointer",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
          }}
        >
          {children ? children(marked) : marked}
        </span>
      </TooltipTrigger>
      <TooltipContent
        data-testid={`${testId}-tooltip`}
        style={{ color: copied ? T.success : undefined }}
      >
        {copied ? "Copied" : "Click to copy"}
      </TooltipContent>
    </Tooltip>
  );
}

type ChildSlot = {
  /** Object key, or the array item itself. */
  item: unknown;
  /** Dotted path to this child, e.g. `root.value.0`. */
  childPath: string;
  /** The child's value — the array item, or the object member behind `item`. */
  childValue: unknown;
  /** Global index of the first find-term hit inside the key token. */
  keyOffset: number;
  /** Global index of the first find-term hit inside the value subtree. */
  valueOffset: number;
};

/**
 * Walks one container's children once, handing each the global index its first
 * find-term hit will carry. Numbering follows render order — a key, then that
 * key's whole subtree — which is what lets a caller step through matches in
 * the order they appear on screen. With no `query` the offsets are inert.
 */
function childSlots(
  data: object,
  path: string,
  query: string,
  matchOffset: number,
): ChildSlot[] {
  const isArr = Array.isArray(data);
  const entries = isArr ? (data as unknown[]) : Object.keys(data);
  const slots: ChildSlot[] = [];
  let cursor = matchOffset;

  entries.forEach((item, i) => {
    const childValue = isArr
      ? item
      : (data as Record<string, unknown>)[item as string];
    const keyOffset = cursor;
    if (query && !isArr) cursor += countMatches(item as string, query);
    const valueOffset = cursor;
    if (query) cursor += countTreeMatches(childValue, query);
    slots.push({
      item,
      childPath: isArr ? `${path}.${i}` : `${path}.${item}`,
      childValue,
      keyOffset,
      valueOffset,
    });
  });

  return slots;
}

/**
 * Renders a parsed JSON value as a collapsible, syntax-colored tree. Every key
 * and every scalar value is a click-to-copy token, so a field name or an id
 * can be lifted out of a response without selecting text by hand. Reach for it
 * to display a response body or any parsed JSON; for raw or non-JSON payloads
 * render the text itself instead.
 *
 * @remarks
 * Status: stable — Type: composite
 *
 * State & behavior: each node owns its own expand state, open by default for
 * the first two levels and toggled by clicking the brace, plus a "see more"
 * flag that prints an elided string whole. `openAll` overrides
 * that state so an active find term cannot leave a match hidden. Recurses once
 * per nested value, so an object's children are sibling `JNode`s. Copy state
 * lives in {@link CopyToken}, one flag per token; `query` marks the term
 * inside keys and scalars, numbering hits across the whole tree in render
 * order so `activeIndex` addresses them globally.
 *
 * Variants: scalar (null / boolean / number / string), elided string with its
 * see more / see less toggle, empty container, and expandable object or
 * array.
 *
 * Composition: renders {@link CopyToken} for keys and scalars, and itself for
 * nested values. Requires no provider.
 *
 * Accessibility: keys and scalar values are `role="button"` and reachable by
 * Tab, copying on Enter or Space, as is the see more toggle, which flips on
 * the same keys. The brace toggle is a plain span — it is not keyboard
 * reachable.
 *
 * Test ids: brace toggle `json-tree-viewer-toggle-<path>`, key
 * `json-tree-viewer-key-<path>`, scalar value `json-tree-viewer-value-<path>`,
 * see more toggle `json-tree-viewer-expand-<path>`, each copy token's tooltip
 * `<token id>-tooltip`, where `<path>` is the dotted trail from the root, e.g.
 * `root.items.0.id`.
 *
 * CSS classes: `json-tree-viewer__mark--active` on the current match's
 * `<mark>` — the hook a caller scrolls to.
 *
 * Edge cases:
 * - A string longer than 120 characters renders elided behind a see more
 *   toggle; the copy always carries the whole string either way. A find term
 *   prints every string whole and hides the toggle, so a hit in a tail is
 *   marked and counted like any other.
 * - Objects and arrays have no copy token of their own — clicking a brace
 *   expands or collapses it. While `openAll` is set the brace still toggles
 *   the node's own state, which only takes effect once the term is cleared.
 * - Braces, commas and a string's quotes are chrome: a term matching only
 *   those marks nothing.
 * - An empty object or array renders `{}` / `[]` as plain, uncopyable text.
 *
 * Dependencies: `navigator.clipboard`, `react-highlight-words`, the
 * {@link Tooltip} primitive (`radix-ui`), `countMatches` / `countTreeMatches`
 * from `responseSearch`, internal `Theme` palette.
 *
 * @example
 * ```tsx
 * <JNode data={JSON.parse(body)} T={T} query="userId" activeIndex={2} openAll />
 * ```
 */
function JNodeInner({
  data,
  depth = 0,
  T,
  path = "root",
  query = "",
  activeIndex = -1,
  matchOffset = 0,
  openAll = false,
}: JNodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const [expanded, setExpanded] = useState(false);
  const clr = T.isLight ? SYNTAX.light : SYNTAX.dark;

  const full = expanded || query !== "";

  const scalar = (
    color: string,
    wrap?: (marked: React.ReactNode) => React.ReactNode,
  ) => (
    <CopyToken
      text={typeof data === "string" ? data : treeScalarText(data)}
      color={color}
      T={T}
      testId={`json-tree-viewer-value-${path}`}
      query={query}
      activeIndex={activeIndex}
      matchOffset={matchOffset}
      display={treeScalarText(data, full)}
    >
      {wrap}
    </CopyToken>
  );

  if (data === null) return scalar(clr.null);
  if (typeof data === "boolean") return scalar(clr.boolean);
  if (typeof data === "number") return scalar(clr.number);
  if (typeof data === "string") {
    const elided = data.length > TREE_STRING_LIMIT;
    return (
      <>
        {scalar(clr.string, (marked) => (
          <>&quot;{marked}&quot;</>
        ))}
        {elided && !query && (
          <span
            role="button"
            tabIndex={0}
            data-testid={`json-tree-viewer-expand-${path}`}
            onClick={() => setExpanded(!expanded)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setExpanded(!expanded);
              }
            }}
            style={{
              marginLeft: 6,
              color: T.accent,
              fontSize: 9,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
          >
            {expanded ? "see less" : "see more"}
          </span>
        )}
      </>
    );
  }

  const isArr = Array.isArray(data);
  const keys = isArr ? (data as unknown[]) : Object.keys(data as object);
  const len = keys.length;

  if (len === 0)
    return <span style={{ color: T.textDim }}>{isArr ? "[]" : "{}"}</span>;

  const isOpen = open || openAll;

  const slots = childSlots(data as object, path, query, matchOffset);

  return (
    <span>
      <span
        style={{ color: T.accent, cursor: "pointer", userSelect: "none" }}
        data-testid={`json-tree-viewer-toggle-${path}`}
        onClick={() => setOpen(!open)}
      >
        {isOpen
          ? isArr
            ? "▼ ["
            : "▼ {"
          : `▶ ${isArr ? `[${len}]` : `{${len}}`}`}
      </span>
      {isOpen && (
        <>
          {slots.map(
            ({ item, childPath, childValue, keyOffset, valueOffset }, i) => (
              <div
                key={i}
                style={{
                  paddingLeft: 14,
                  paddingTop: 4,
                  paddingBottom: 4,
                  lineHeight: 2,
                  overflowWrap: "anywhere",
                }}
              >
                {!isArr && (
                  <>
                    <CopyToken
                      text={item as string}
                      color={clr.key}
                      T={T}
                      testId={`json-tree-viewer-key-${childPath}`}
                      query={query}
                      activeIndex={activeIndex}
                      matchOffset={keyOffset}
                      display={item as string}
                    />
                    <span style={{ color: T.textDim }}>: </span>
                  </>
                )}
                <JNode
                  data={childValue}
                  depth={depth + 1}
                  T={T}
                  path={childPath}
                  query={query}
                  activeIndex={activeIndex}
                  matchOffset={valueOffset}
                  openAll={openAll}
                />
                {i < len - 1 && <span style={{ color: T.textDim }}>,</span>}
              </div>
            ),
          )}
          <span style={{ color: T.accent }}>{isArr ? "]" : "}"}</span>
        </>
      )}
    </span>
  );
}

/**
 * Memoized so a parent's unrelated re-render — a copy-button flash, a match
 * step, a keystroke elsewhere in the app — does not walk the whole tree
 * again. Every prop is either a stable reference (`data` subtree, `T`) or a
 * primitive, and recursion goes through this memoized identity rather than
 * the inner function, so an unchanged branch stops the re-render at its root.
 */
const JNode = memo(JNodeInner);

export default JNode;
