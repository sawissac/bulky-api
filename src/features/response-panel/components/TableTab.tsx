"use client";

import { useMemo, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type ColumnSizingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Theme } from "@/lib/themes";
import type { ApiCall } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props = { T: Theme; call: ApiCall };

/** One statement's worth of `api.query.pgsql` result — the shape
 *  `scriptRunner.ts` puts on `call.response` (and, for a `;`-separated
 *  batch, on each entry of its `statements` array). `call.response` is typed
 *  `unknown` on {@link ApiCall}, so this is a local, best-effort shape rather
 *  than one imported from the runner. */
type SqlStatementResult = {
  command?: string;
  rowCount?: number | null;
  rows?: Record<string, unknown>[];
  fields?: { name: string; dataTypeID: number }[];
};

type SqlResponse = SqlStatementResult & { statements?: SqlStatementResult[] };

/** Fixed row height the virtualizer measures against — every cell is a
 *  single `nowrap`/ellipsis line, so a fixed height (rather than per-row
 *  `measureElement`) is exact, not just a fast approximation. */
const ROW_HEIGHT = 28;
/** Cap on how tall the scroll frame grows before it starts virtualizing
 *  instead of just showing every row. */
const MAX_BODY_HEIGHT = 420;
const MIN_COL_WIDTH = 80;
const MAX_COL_WIDTH = 320;

/** Cell text plus whether it should render dimmed/italic — `NULL` reads as a
 *  value in its own right, not empty space, the way a real DB client shows it. */
function cellText(value: unknown): { text: string; muted: boolean } {
  if (value === null || value === undefined) return { text: "NULL", muted: true };
  if (typeof value === "object") return { text: JSON.stringify(value), muted: false };
  return { text: String(value), muted: false };
}

/** RFC 4180-ish CSV: a value is quoted only when it contains a comma, quote
 *  or newline, and an embedded quote is doubled — enough for a paste into a
 *  spreadsheet, not a full CSV writer. */
function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const s = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(cell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(","));
  return lines.join("\n");
}

/**
 * Column width from header/content length, sampled rather than measured — the
 * grid-layout table {@link TableTab} renders fixes every column's width up
 * front (so header and virtualized body cells line up), unlike a plain
 * `<table>`'s auto layout, which has nothing to size against until every row
 * exists in the DOM at once.
 */
function estimateColumnWidth(col: string, rows: Record<string, unknown>[]): number {
  let longest = col.length;
  for (let i = 0; i < rows.length && i < 30; i++) {
    const { text } = cellText(rows[i][col]);
    if (text.length > longest) longest = text.length;
  }
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, longest * 7 + 20));
}

/**
 * One data cell: the (possibly ellipsis-truncated) value as a click target
 * that opens a `Popover` with the full text and its own Copy button — the
 * ellipsis in a narrow or resized-down column would otherwise hide a value
 * with no way to read or copy the rest of it. Internal to {@link TableTab}.
 *
 * `copied` resets on close (`onOpenChange`) rather than lingering, so
 * reopening the same cell never shows a stale "COPIED" from a previous visit.
 */
function CellPopover({
  T,
  text,
  muted,
}: {
  T: Theme;
  text: string;
  muted: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — leave the button idle */
    }
  };

  return (
    <Popover onOpenChange={(open) => !open && setCopied(false)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={text}
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            height: "100%",
            padding: "0 8px",
            border: 0,
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "inherit",
            textAlign: "left",
            color: muted ? T.textDim : T.text,
            fontStyle: muted ? "italic" : "normal",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-90 p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <pre
            style={{
              margin: 0,
              maxHeight: 220,
              overflowY: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: muted ? T.textDim : T.text,
              fontStyle: muted ? "italic" : "normal",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {text}
          </pre>
          <button
            type="button"
            onClick={() => void handleCopy()}
            style={{
              display: "flex",
              alignSelf: "flex-start",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 6,
              cursor: "pointer",
              border: `1px solid ${copied ? T.success : T.border}`,
              background: copied ? `${T.success}15` : "transparent",
              color: copied ? T.success : T.textDim,
              fontFamily: "var(--font-display)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.1em",
            }}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Table tab of a call card: `api.query.pgsql`'s result as an actual
 * grid — one resizable column per field, one row per record, row-virtualized
 * and click-to-copy per cell — rather than the nested object
 * `{ rows: [...] }` reads as in the Response tab's JSON tree.
 *
 * @remarks
 * Status: stable — Type: feature
 *
 * State & behavior: `selected` (default the last entry) picks which
 * statement's rows are shown when `call.response.statements` holds more than
 * one — a `;`-separated batch reports every statement there, with the
 * top-level `command`/`rowCount`/`rows`/`fields` already describing the last
 * one, matching `/api/query/pgsql`'s own summary. `columnNames` prefers the
 * active result's `fields` (server-reported order) and falls back to
 * `Object.keys` of the first row for a shape with rows but no field list;
 * `columns` turns those into `@tanstack/react-table` `ColumnDef`s, each
 * starting at the width {@link estimateColumnWidth} guesses from up to 30
 * sampled rows. `columnSizing` (`onColumnSizingChange`, `columnResizeMode:
 * "onChange"`) then overrides that guess per column id (the field name) once
 * a header's resize handle is dragged — it is never reset, on purpose: see
 * the state's own comment above its declaration for why keying off anything
 * derived from `call.response` would wipe a resize mid-run. `table` is
 * otherwise a bare `useReactTable` with only `getCoreRowModel` — no sorting/
 * filtering, so every row model call is O(rows) — and `rowVirtualizer`
 * (`@tanstack/react-virtual`) windows `table.getRowModel().rows` against the
 * scroll frame, rendering only the rows within `overscan` of the viewport
 * regardless of how many thousand a query returned. `copied` is a 1.5s flash
 * on the Copy CSV button, the same pattern {@link RespTab}'s copy button
 * uses — {@link CellPopover} keeps an identical flash of its own, per cell,
 * reset on close rather than left to linger.
 *
 * Variants: no response at all (call hasn't run, or errored before a result
 * came back) renders a plain empty message. A result with columns but zero
 * rows (an empty `SELECT`) renders the header with a "No rows." line under
 * it, skipping the virtualizer entirely rather than windowing an empty list.
 * A result with no columns at all (`INSERT`/`UPDATE`/`DELETE`/DDL —
 * `rowCount` only, no `rows`/`fields`) renders the "no columns" message
 * instead of a grid, since there is nothing to tabulate.
 *
 * Composition: a small info bar (command, row count, the statement picker
 * when there is more than one, Copy CSV) over a `display: grid` `<table>` —
 * `<thead>`/`<tbody>`/`<tr>` all `display: flex`/`grid` rather than table
 * layout, the standard shape for a virtualized table, since an absolutely
 * positioned `<tr>` (`rowVirtualizer`'s `translateY` needs one per row) can't
 * size correctly inside real table layout. The scroll frame itself
 * (`overflow: auto`, capped at `MAX_BODY_HEIGHT`) is what `rowVirtualizer`
 * measures against; the header row sits `position: sticky` above it. Each
 * `<th>` carries a 6px resize handle over its right edge
 * (`header.getResizeHandler()` on both `onMouseDown` and `onTouchStart`,
 * tinted the theme accent while `column.getIsResizing()`; a double-click
 * calls `column.resetSize()`). Each data `<td>` renders a {@link CellPopover}
 * rather than plain text — a click opens a `Popover` (`@/components/ui/
 * popover`) with the full, untruncated value in a scrollable `<pre>` and its
 * own Copy button, so a value the column is too narrow (or resized too
 * small) to show in full is never unreadable, only untruncated one click away.
 *
 * Accessibility: the statement picker and Copy CSV are plain buttons with
 * visible text, needing no `aria-label`. Column headers are still real
 * `<th>` cells despite the grid layout, so the grid reads as a table to
 * assistive tech, not just visually. Every cell is a real `<button>` (via
 * {@link CellPopover}'s `PopoverTrigger`), reachable and activatable by
 * keyboard like any other button, not a `<td>` `onClick` a screen reader or
 * keyboard user could never reach.
 *
 * Test ids: none — the info bar's buttons and each cell's Copy button carry
 * visible text, matching {@link RespTab}'s body.
 *
 * CSS classes: none — inline theme-driven styles, matching the rest of the
 * response body, plus `Popover`'s own Tailwind recipe for {@link CellPopover}'s
 * content.
 *
 * Edge cases:
 * - A `jsonb`/array cell is rendered as compact `JSON.stringify` text rather
 *   than its own tree — a table cell (and its popover) is not the place for
 *   a collapsible {@link JNode}; the Response tab already covers that view
 *   of the same data.
 * - `NULL` is a distinct cell state, styled apart from an empty string, so
 *   the two are never visually confused — in the popover as well as the cell.
 * - `selected` past the current `statements.length` (a stale index the
 *   response replaced) clamps back onto the last statement instead of
 *   rendering nothing.
 * - Column widths are sampled, not measured — a value far down a huge result
 *   that is much wider than the first 30 rows still gets a click-to-read
 *   popover rather than pushing its column wider, since widening for one
 *   outlier would misalign the header with every other row's cells.
 * - Dragging a resize handle past `minSize`/`maxSize` (`MIN_COL_WIDTH`/800)
 *   clamps rather than resizing further; tanstack-table enforces both.
 *
 * Dependencies: `lucide-react`, `@tanstack/react-table`, `@tanstack/react-
 * virtual`, `@/components/ui/popover`.
 *
 * @example
 * ```tsx
 * <TableTab T={theme} call={call} />
 * ```
 *
 * @see {@link RespTab}
 */
export default function TableTab({ T, call }: Props) {
  const response = call.response as SqlResponse | null;
  const statements = response?.statements;
  const [selected, setSelected] = useState(() => (statements?.length ?? 1) - 1);
  const [copied, setCopied] = useState(false);

  const activeIdx =
    statements && statements.length > 0
      ? Math.min(Math.max(selected, 0), statements.length - 1)
      : -1;
  const active: SqlStatementResult | null =
    activeIdx >= 0 ? (statements?.[activeIdx] ?? null) : response;

  // `active?.rows ?? []` would hand `useMemo` a fresh empty-array reference on
  // every render whenever there are no rows, defeating its own point — so the
  // fallback lives inside the memo, keyed on `active` alone.
  const rows = useMemo(() => active?.rows ?? [], [active]);
  const columnNames = useMemo(() => {
    if (active?.fields?.length) return active.fields.map((f) => f.name);
    if (rows.length > 0) return Object.keys(rows[0]);
    return [];
  }, [active, rows]);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columnNames.map((name) => ({
        id: name,
        accessorKey: name,
        header: name,
        size: estimateColumnWidth(name, rows),
        minSize: MIN_COL_WIDTH,
        maxSize: 800,
      })),
    [columnNames, rows],
  );

  // Column widths start at `estimateColumnWidth`'s guess but live here once a
  // column is dragged. Keyed by column id (the field name), so switching to a
  // same-shaped result (another statement, a re-run) keeps a matching resize
  // rather than snapping back — and an unrelated column set just finds no
  // key here and falls through to its own estimated size, deliberately never
  // reset: `call.response` gets a fresh object identity on every run tick
  // (`scriptRunner.ts` clones every call on each `onUpdate`), so resetting
  // off any value derived from it would wipe a resize mid-run.
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
  });
  const tableRows = table.getRowModel().rows;
  const totalWidth = table.getTotalSize();

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const handleCopyCsv = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(columnNames, rows));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — leave the button idle */
    }
  };

  if (!response) {
    return (
      <div
        style={{
          fontFamily: "var(--font-description)",
          fontSize: 11,
          fontStyle: "italic",
          color: T.textDim,
        }}
      >
        No query result to show.
      </div>
    );
  }

  return (
    <div style={{ minWidth: 0, maxWidth: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: T.textDim,
          }}
        >
          {active?.command ?? "—"}
        </span>
        <span
          style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: T.textDim }}
        >
          {active?.rowCount ?? 0} row{active?.rowCount === 1 ? "" : "s"}
        </span>

        {statements && statements.length > 1 && (
          <div style={{ display: "flex", gap: 3 }}>
            {statements.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                style={{
                  padding: "2px 8px",
                  borderRadius: 9999,
                  cursor: i === activeIdx ? "default" : "pointer",
                  border: `1px solid ${i === activeIdx ? T.accent : T.border}`,
                  background: i === activeIdx ? `${T.accent}15` : "transparent",
                  color: i === activeIdx ? T.accent : T.textDim,
                  fontFamily: "var(--font-display)",
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                }}
              >
                #{i + 1} {s.command ?? ""}
              </button>
            ))}
          </div>
        )}

        {columnNames.length > 0 && (
          <button
            onClick={() => void handleCopyCsv()}
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 9999,
              cursor: "pointer",
              border: `1px solid ${copied ? T.success : T.border}`,
              background: copied ? `${T.success}15` : "transparent",
              color: copied ? T.success : T.textDim,
              fontFamily: "var(--font-display)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.1em",
            }}
          >
            {copied ? <Check size={9} /> : <Copy size={9} />}
            {copied ? "COPIED" : "COPY CSV"}
          </button>
        )}
      </div>

      {columnNames.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--font-description)",
            fontSize: 11,
            fontStyle: "italic",
            color: T.textDim,
            background: T.bgHover,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: 10,
          }}
        >
          {rows.length === 0 && (active?.rowCount ?? 0) === 0
            ? "Query returned no rows."
            : "No columns to show for this statement."}
        </div>
      ) : (
        <div
          ref={scrollRef}
          style={{
            overflow: "auto",
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            maxHeight: MAX_BODY_HEIGHT,
          }}
        >
          <table
            style={{
              display: "grid",
              width: Math.max(totalWidth, 1),
              borderCollapse: "collapse",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            <thead style={{ display: "grid", position: "sticky", top: 0, zIndex: 1 }}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} style={{ display: "flex", width: "100%" }}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        width: header.getSize(),
                        flexShrink: 0,
                        textAlign: "left",
                        padding: "5px 8px",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        color: T.textDim,
                        background: T.bgHover,
                        borderBottom: `1px solid ${T.border}`,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {/* Resize handle — drag to resize this column; the
                          drag itself lives entirely in `header.getResizeHandler()`
                          (tanstack-table's own pointer tracking), this is just
                          the hit target and its highlight while active. */}
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          height: "100%",
                          width: 6,
                          marginRight: -3,
                          cursor: "col-resize",
                          touchAction: "none",
                          userSelect: "none",
                          background: header.column.getIsResizing()
                            ? T.accent
                            : "transparent",
                        }}
                      />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            {tableRows.length === 0 ? (
              <tbody style={{ display: "grid" }}>
                <tr style={{ display: "flex", width: "100%" }}>
                  <td
                    style={{
                      padding: 8,
                      fontFamily: "var(--font-description)",
                      fontSize: 11,
                      fontStyle: "italic",
                      color: T.textDim,
                    }}
                  >
                    No rows.
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody
                style={{
                  display: "grid",
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      style={{
                        display: "flex",
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: ROW_HEIGHT,
                        transform: `translateY(${virtualRow.start}px)`,
                        borderTop: `1px solid ${T.border}`,
                      }}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const { text, muted } = cellText(cell.getValue());
                        return (
                          <td
                            key={cell.id}
                            style={{
                              display: "flex",
                              width: cell.column.getSize(),
                              flexShrink: 0,
                              padding: 0,
                            }}
                          >
                            <CellPopover T={T} text={text} muted={muted} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
