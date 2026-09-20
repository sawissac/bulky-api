"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useDispatch } from "react-redux";
import {
  ChevronDown,
  Loader2,
  DatabaseZap,
  TerminalSquare,
  Check,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { Theme } from "@/lib/themes";
import type { ApiCall, Assertion } from "@/lib/types";
import { statusColor } from "@/lib/themes";
import { callToCurl } from "@/lib/toCurl";
import { displayUrl } from "@/lib/callMatch";
import MethodPill from "@/components/MethodPill";
import StatusPill from "@/components/StatusPill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Progress } from "@/components/ui/progress";
import RespTab from "./RespTab";
import TableTab from "./TableTab";
import HeadTab from "./HeadTab";
import AuthTab from "./AuthTab";
import PayloadTab from "./PayloadTab";
import StatusTab from "./StatusTab";
import { toggleCallCache } from "@/store/runnerSlice";

type DetailTab =
  | "table"
  | "response"
  | "headers"
  | "auth"
  | "payload"
  | "status"
  | "tests";

type Props = {
  /** Active theme; every color on the card is read from it, not from tokens. */
  T: Theme;
  /** The call to render — its `status` drives the whole card, `assertions`
   *  adds the pass/fail badge and Tests tab. */
  call: ApiCall;
  /** Whether the detail panel starts expanded. @defaultValue false */
  defaultOpen?: boolean;
  /** Whether this row is the only one shown, filling the pane. Forces the
   *  detail panel open and drops the 500px body cap. @defaultValue false */
  focused?: boolean;
  /** Fires when the focus (expand / collapse) control is clicked — the owner
   *  decides which call, if any, takes over the pane. */
  onToggleFocus?: () => void;
};

/** Detail-tab container: bordered, clipped so the five tabs read as one
 *  segmented group instead of loose buttons in a row. */
const TAB_GROUP =
  "shrink-0 overflow-hidden rounded-md border border-app-border";

/** Detail-tab button: ghost hover/active tracks the runtime theme via the
 *  `app-*` tokens instead of Button's default (static) muted/foreground. */
const TAB_BTN =
  "rounded-none border-0 text-[9px] font-bold uppercase tracking-[0.08em] text-app-dim hover:bg-app-hover hover:text-app-accent data-active:bg-app-selected data-active:text-app-accent";

/** Renders the recorded expectations for a call — one row each, `✓` / `✗`
 *  with the matcher message and, on failure, the mismatch detail. */
function AssertionRows({ T, items }: { T: Theme; items: Assertion[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {items.map((a, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 6,
            padding: "5px 8px",
            borderRadius: 5,
            border: `1px solid ${a.ok ? T.success : T.error}25`,
            background: `${a.ok ? T.success : T.error}0c`,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              color: a.ok ? T.success : T.error,
              flexShrink: 0,
            }}
          >
            {a.ok ? "✓" : "✗"}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              lineHeight: 1.5,
              color: T.text,
              minWidth: 0,
              wordBreak: "break-word",
            }}
          >
            {a.message}
            {a.detail && (
              <span style={{ color: T.textDim }}> — {a.detail}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * One row in the request list: a clickable header (step index, method, URL,
 * progress, status) over a collapsible five-to-seven tab detail panel.
 * Reused verbatim for HTTP and SSE calls — SSE swaps in a live event stream
 * on the Response tab.
 *
 * @remarks
 * Status: stable — Type: list row
 *
 * State & behavior: three pieces of local state — whether the panel is `open`,
 * the active detail `tab` (defaulting to **Table** for a `PGSQL` call, else
 * **Response**), and a 1.5s "copied" flash on the Copy-as-cURL button.
 * Focus is *not* local: the header's focus control only calls
 * `onToggleFocus`, and the owner feeds the answer back as `focused`, so one
 * call at a time can hold the pane.
 * Everything shown is read from the `call` prop; the only dispatch is
 * `toggleCallCache` from the cache pill. The detail panel mounts only once
 * `open` and the call has left `idle`. For an SSE/`api.stream` call, the
 * detail body auto-scrolls to its newest event as `call.sseEvents` grows —
 * "stick to bottom", so it only keeps following while the reader was already
 * at (or within 24px of) the bottom; a ref (not state, since it drives no
 * render) tracks that without re-rendering on every scroll tick.
 *
 * Variants: focused / unfocused changes the card's geometry — focused, the
 * row stretches to its container's full height, the detail panel is forced
 * open (`open` state ignored), its body loses the 500px cap and grows into
 * the leftover space, and the chevron is dropped since collapsing is no
 * longer reachable. idle / pending / success / error drive the left border, progress
 * bar and trailing status glyph — the bar is a `size="sm"` {@link Progress}
 * (`src/components/ui/progress.tsx`): `0` while idle, indeterminate sweep
 * (`value={null}`) while pending, `100` once settled, recoloured to the
 * call's status colour by overriding `--app-accent` inline on its root. A `cache`-flagged call with a stored response
 * shows the cache pill; a call carrying `assertions` shows a pass/fail badge in
 * the header and an extra **Tests** tab. A `PGSQL` call gets an extra
 * **Table** tab too, first in the row (ahead of Response) — the query's
 * `rows` as an actual grid rather than the nested object the Response tab's
 * JSON tree shows.
 *
 * Composition: {@link MethodPill}, {@link StatusPill}, {@link Progress}, and the five-to-seven
 * tab bodies ({@link TableTab} — `PGSQL` calls only, {@link RespTab},
 * {@link HeadTab}, {@link AuthTab}, {@link PayloadTab}, {@link StatusTab},
 * plus an inline Tests list).
 *
 * Accessibility: the header is a click target; the cache, cURL and focus
 * controls stop propagation so they don't also toggle the panel. Icon-only
 * controls carry a tooltip label, and the focus toggle reports its state via
 * `aria-pressed`.
 *
 * Test ids: root `call-card` / `call-card-<idx>`, copy-cURL button
 * `call-card-copy-curl-button`, focus toggle `call-card-focus-button`, tab
 * buttons `call-card-tab-<id>`.
 *
 * CSS classes: none — inline theme values, matching the rest of the pane.
 *
 * Edge cases:
 * - The header URL is passed through {@link displayUrl}, so a multi-line
 *   template-literal argument (newlines + indentation) collapses to one line
 *   in both the row and its tooltip.
 * - cURL copy is offered only once the call has left `idle`, so the URL and
 *   headers are the resolved ones. A `PGSQL` call never offers it — a raw SQL
 *   statement run over a database connection has no `curl` equivalent.
 * - A failed clipboard write leaves the button in its idle state, no error.
 * - Assertions recorded before the first call attach to that first call.
 * - Focusing a still-`idle` call shows the full-height "run the script" note
 *   rather than a detail panel — there is nothing recorded to fill it.
 *
 * Dependencies: `lucide-react`, `react-redux`, `@/lib/toCurl`,
 * `@/lib/callMatch`, `@/store/runnerSlice`, `@/components/ui/progress`
 * ({@link Progress}).
 *
 * @example
 * ```tsx
 * <CallCard T={theme} call={builtCalls[0]} defaultOpen />
 * <CallCard
 *   T={theme}
 *   call={builtCalls[2]}
 *   focused
 *   onToggleFocus={() => setFocusedIdx(null)}
 * />
 * ```
 *
 * @see {@link RespTab}
 */
export default function CallCard({
  T,
  call,
  defaultOpen,
  focused,
  onToggleFocus,
}: Props) {
  const dispatch = useDispatch();
  const [open, setOpen] = useState(defaultOpen ?? false);
  const isOpen = focused === true || open;
  const [tab, setTab] = useState<DetailTab>(
    call.method === "PGSQL" ? "table" : "response",
  );
  const [copiedCurl, setCopiedCurl] = useState(false);
  const hasCachedResponse = call.response !== null;
  const isCached = call.cache;

  // Auto-scroll the detail body as an SSE/`api.stream`/`api.ws`/`api.io`
  // call's events grow — same "stick to bottom" rule a chat log uses: keep
  // following new events only while the reader was already at (or near) the
  // bottom, so scrolling up to reread an earlier event isn't yanked back
  // down by the next one.
  const detailBodyRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const eventCount =
    (call.sseEvents?.length ?? 0) + (call.wsEvents?.length ?? 0);
  useEffect(() => {
    if (!isOpen || tab !== "response" || (!call.isSse && !call.isWs)) return;
    const el = detailBodyRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [isOpen, tab, call.isSse, call.isWs, eventCount]);

  const asserts = call.assertions ?? [];
  const failedCount = asserts.filter((a) => !a.ok).length;
  const passedCount = asserts.length - failedCount;
  const canCopyCurl = call.status !== "idle" && call.method !== "PGSQL";

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(callToCurl(call));
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 1500);
    } catch {
      /* clipboard blocked — leave the button idle */
    }
  };

  const sc = statusColor(call.statusCode, T);

  const borderColor = isOpen
    ? T.accent
    : call.status === "success"
      ? `${T.success}70`
      : call.status === "error"
        ? `${T.error}70`
        : "transparent";

  const tabBtn = (id: DetailTab, label: string) => (
    <Button
      key={id}
      type="button"
      variant="ghost"
      size="xs"
      onClick={(e) => {
        e.stopPropagation();
        setTab(id);
      }}
      data-active={tab === id || undefined}
      data-testid={`call-card-tab-${id}`}
      className={TAB_BTN}
    >
      {label}
    </Button>
  );

  return (
    <div
      data-testid={`call-card-${call.idx}`}
      style={{
        animation: "fadeUp 0.2s ease both",
        transition: "all 0.15s",
        ...(focused
          ? {
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
            }
          : null),
      }}
    >
      {/* Note block */}
      {call.note && (
        <div
          style={{
            padding: "5px 12px 5px 15px",
            borderLeft: `3px solid ${T.borderAccent}`,
            background: T.accentFaint,
            borderBottom: `1px solid ${T.borderAccent}`,
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                style={{
                  fontFamily: "var(--font-description)",
                  fontSize: 11,
                  fontWeight: 500,
                  color: T.accent,
                  display: "block",
                  whiteSpace: "wrap",
                  overflow: "hidden",
                }}
              >
                {call.note}
              </span>
            </TooltipTrigger>
            <TooltipContent>{call.note}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Header row */}
      <div
        onClick={() => setOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          flexShrink: 0,
          padding: "8px 12px",
          cursor: "pointer",
          borderLeft: `3px solid ${borderColor}`,
          background: isOpen ? T.bgSelected : "transparent",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.background = T.bgHover;
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Step badge */}
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            background: isOpen ? T.accentFaint : T.bgHover,
            border: `1px solid ${isOpen ? T.borderAccent : T.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              color: isOpen ? T.accent : T.textDim,
            }}
          >
            {call.idx + 1}
          </span>
        </div>

        <MethodPill method={call.method} sm />

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: isOpen ? T.textBright : T.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayUrl(call.url)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{displayUrl(call.url)}</TooltipContent>
        </Tooltip>

        {/* Progress bar */}
        <Progress
          size="sm"
          aria-label="Call progress"
          className="w-9 shrink-0"
          style={{ "--app-accent": sc } as CSSProperties}
          value={
            call.status === "idle" ? 0 : call.status === "pending" ? null : 100
          }
        />

        {call.duration > 0 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: T.textDim,
              flexShrink: 0,
            }}
          >
            {call.duration}ms
          </span>
        )}

        {/* Assertion tally — green pass count, red fail count */}
        {asserts.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "1px 5px",
                  borderRadius: 4,
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  background:
                    failedCount > 0 ? `${T.error}15` : `${T.success}15`,
                  border: `1px solid ${failedCount > 0 ? T.error : T.success}40`,
                  color: failedCount > 0 ? T.error : T.success,
                }}
              >
                {failedCount > 0 ? `✗${failedCount}` : `✓${passedCount}`}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {passedCount} passed
              {failedCount > 0 ? `, ${failedCount} failed` : ""}
            </TooltipContent>
          </Tooltip>
        )}

        {call.status === "idle" && (
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              border: `1.5px dashed ${T.textDim}`,
              flexShrink: 0,
            }}
          />
        )}
        {call.status === "pending" && (
          <Loader2
            size={10}
            color={T.accent}
            style={{ animation: "spin 0.7s linear infinite", flexShrink: 0 }}
          />
        )}
        {call.status === "success" && <StatusPill code={call.statusCode} />}
        {call.status === "error" &&
          (call.statusCode ? (
            <StatusPill code={call.statusCode} />
          ) : (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: T.error,
                flexShrink: 0,
              }}
            >
              ERR
            </span>
          ))}

        {/* Copy as cURL — resolved URL + headers actually sent */}
        {canCopyCurl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void copyCurl();
                }}
                data-testid="call-card-copy-curl-button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "2px 4px",
                  borderRadius: 4,
                  flexShrink: 0,
                  background: copiedCurl ? `${T.success}20` : "transparent",
                  border: `1px solid ${copiedCurl ? T.success : T.border}`,
                  color: copiedCurl ? T.success : T.textDim,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {copiedCurl ? (
                  <Check size={10} />
                ) : (
                  <TerminalSquare size={10} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {copiedCurl ? "Copied cURL" : "Copy as cURL"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Per-call cache toggle — only visible when a cached response exists */}
        {hasCachedResponse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(toggleCallCache(call.idx));
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "2px 4px",
                  borderRadius: 4,
                  flexShrink: 0,
                  background: isCached ? `${T.accent}20` : "transparent",
                  border: `1px solid ${isCached ? T.accent : T.border}`,
                  color: isCached ? T.accent : T.textDim,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <DatabaseZap size={10} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isCached
                ? "Using cached response – click to disable"
                : "Cache available – click to enable"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Focus toggle — hands the whole pane to this one call */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFocus?.();
              }}
              aria-pressed={focused === true}
              aria-label={focused ? "Exit focused view" : "Focus this request"}
              data-testid="call-card-focus-button"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "2px 4px",
                borderRadius: 4,
                flexShrink: 0,
                background: focused ? `${T.accent}20` : "transparent",
                border: `1px solid ${focused ? T.accent : T.border}`,
                color: focused ? T.accent : T.textDim,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {focused ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {focused ? "Exit focused view" : "Focus this request"}
          </TooltipContent>
        </Tooltip>

        {!focused && (
          <ChevronDown
            size={10}
            color={T.textDim}
            style={{
              flexShrink: 0,
              transform: isOpen ? "rotate(180deg)" : "rotate(0)",
              transition: "transform 0.2s",
            }}
          />
        )}
      </div>

      {/* Expanded detail */}
      {isOpen && call.status !== "idle" && (
        <div
          style={{
            borderTop: `1px solid ${T.border}`,
            background: T.bgPanel,
            ...(focused
              ? {
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minHeight: 0,
                }
              : null),
          }}
        >
          <div
            style={{
              display: "flex",
              flexShrink: 0,
              padding: "5px 10px",
              borderBottom: `1px solid ${T.border}`,
              overflowX: "auto",
            }}
          >
            <ButtonGroup className={TAB_GROUP}>
              {call.method === "PGSQL" && tabBtn("table", "Table")}
              {tabBtn("response", "Response")}
              {tabBtn("headers", "Headers")}
              {tabBtn("auth", "Auth")}
              {tabBtn("payload", "Payload")}
              {tabBtn("status", "Status")}
              {asserts.length > 0 && tabBtn("tests", "Tests")}
            </ButtonGroup>
          </div>
          <div
            ref={detailBodyRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottomRef.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }}
            style={{
              padding: 10,
              maxHeight: focused ? "none" : 500,
              flex: focused ? 1 : undefined,
              minHeight: focused ? 0 : undefined,
              overflowY: "auto",
              overflowX: "hidden",
              minWidth: 0,
            }}
          >
            {tab === "table" && <TableTab T={T} call={call} />}
            {tab === "response" && <RespTab T={T} call={call} />}
            {tab === "headers" && (
              <HeadTab T={T} headers={call.responseHeaders || {}} />
            )}
            {tab === "auth" && <AuthTab T={T} call={call} />}
            {tab === "payload" && <PayloadTab T={T} call={call} />}
            {tab === "status" && <StatusTab T={T} call={call} />}
            {tab === "tests" && <AssertionRows T={T} items={asserts} />}
          </div>
        </div>
      )}

      {isOpen && call.status === "idle" && (
        <div
          style={{
            padding: "10px 12px",
            background: T.bgPanel,
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-description)",
              fontSize: 11,
              color: T.textDim,
              fontStyle: "italic",
            }}
          >
            Run the script to see response data.
          </span>
        </div>
      )}
    </div>
  );
}
