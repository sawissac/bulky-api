"use client";

import { useState, useMemo, useDeferredValue, useEffect, useRef } from "react";
import {
  Loader2,
  Radio,
  Copy,
  Check,
  Cable,
  ArrowUp,
  ArrowDown,
  Info,
  Search,
} from "lucide-react";
import Highlighter from "react-highlight-words";
import type { Theme } from "@/lib/themes";
import type { ApiCall } from "@/lib/types";
import JNode from "@/components/JsonTreeViewer";
import { jsonToTypeScript } from "@/lib/jsonToTypeScript";
import {
  detectResponseKind,
  formatMarkup,
  type ResponseKind,
} from "@/lib/responseFormat";
import {
  runJsonQuery,
  countMatches,
  countTreeMatches,
  groupJsonQueryMatches,
  type JsonQueryMatchGroup,
} from "@/lib/responseSearch";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** View-toggle container: bordered, clipped so PRETTY/RAW/TS read as one
 *  segmented group instead of three loose pills. */
const VIEW_GROUP =
  "shrink-0 overflow-hidden rounded-md border border-app-border";

/** View-toggle button: ghost hover/active tracks the runtime theme via the
 *  `app-*` tokens instead of Button's default (static) muted/foreground. */
const VIEW_BTN =
  "rounded-none border-0 text-[8px] font-bold uppercase tracking-widest text-app-dim hover:bg-app-hover hover:text-app-accent data-active:bg-app-selected data-active:text-app-accent";

/** Copy button: outlined at rest, fills with the accent color on hover
 *  (rather than a themed border tint) so the affordance reads as an action,
 *  not a passive toggle. Swaps to a success tint once the copy lands. */
const COPY_BTN_IDLE =
  "bg-transparent border-app-border text-app-dim hover:border-app-accent hover:bg-app-accent hover:text-app-on-solid";
const COPY_BTN_COPIED = "border-app-success bg-app-success/10 text-app-success";

type Props = { T: Theme; call: ApiCall };

const SSE_CLR = "#f472b6";

type ParsedSseEvent = { type: string; data: string; id?: string };

function isSseBody(response: unknown): boolean {
  if (typeof response !== "string") return false;
  return /^(data|event|id|retry):/m.test(response);
}

function parseSseBody(text: string): ParsedSseEvent[] {
  const events: ParsedSseEvent[] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let type = "message";
  let data = "";
  let id: string | undefined;
  for (const line of lines) {
    if (line === "") {
      if (data) events.push({ type, data, id });
      type = "message";
      data = "";
      id = undefined;
    } else if (line.startsWith("event:")) {
      type = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data += (data ? "\n" : "") + line.slice(5).trim();
    } else if (line.startsWith("id:")) {
      id = line.slice(3).trim();
    }
  }
  if (data) events.push({ type, data, id });
  return events;
}

function SseBodyEvents({
  T,
  events,
  raw,
  onToggleRaw,
  response,
}: {
  T: Theme;
  events: ParsedSseEvent[];
  raw: boolean;
  onToggleRaw: () => void;
  response: unknown;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <Radio size={10} color={SSE_CLR} />
        <span
          style={{
            fontFamily: "var(--font-title)",
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: SSE_CLR,
          }}
        >
          SSE
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: T.textDim,
          }}
        >
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {(["SSE", "RAW"] as const).map((label) => {
            const active = label === "RAW" ? raw : !raw;
            const wantsRaw = label === "RAW";
            return (
              <button
                key={label}
                onClick={() => {
                  if (wantsRaw !== raw) onToggleRaw();
                }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 9999,
                  cursor: active ? "default" : "pointer",
                  border: `1px solid ${active ? SSE_CLR : T.border}`,
                  background: active ? `${SSE_CLR}15` : "transparent",
                  color: active ? SSE_CLR : T.textDim,
                  fontFamily: "var(--font-display)",
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {raw ? (
        <pre
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: T.text,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: T.bgHover,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: 10,
            margin: 0,
          }}
        >
          {typeof response === "string"
            ? response
            : JSON.stringify(response, null, 2)}
        </pre>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {events.map((ev, i) => {
            let parsed: unknown = ev.data;
            try {
              parsed = JSON.parse(ev.data);
            } catch {
              /* string */
            }
            const isMsg = ev.type === "message";
            return (
              <div
                key={i}
                style={{
                  borderRadius: 5,
                  border: `1px solid ${SSE_CLR}20`,
                  background: `${SSE_CLR}08`,
                  padding: "5px 8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 7,
                      fontWeight: 700,
                      color: T.textDim,
                    }}
                  >
                    #{i + 1}
                  </span>
                  {!isMsg && (
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 7,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: SSE_CLR,
                        background: `${SSE_CLR}18`,
                        border: `1px solid ${SSE_CLR}30`,
                        padding: "1px 5px",
                        borderRadius: 3,
                      }}
                    >
                      {ev.type}
                    </span>
                  )}
                  {ev.id && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 7,
                        color: T.textDim,
                      }}
                    >
                      id: {ev.id}
                    </span>
                  )}
                </div>
                {typeof parsed === "string" ? (
                  <pre
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: T.text,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {parsed}
                  </pre>
                ) : (
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      lineHeight: 1.6,
                    }}
                  >
                    <JNode data={parsed} T={T} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Live view for a call opened with `api.sse`/`api.stream` — one card per
 * parsed SSE frame, appearing as `call.sseEvents` grows during the run.
 *
 * @remarks
 * Variants: an EVENTS / TEXT toggle appears once at least one event has
 * arrived. TEXT concatenates the raw `data:` payloads in arrival order (cheap
 * enough — a join over the call's own events — to compute inline rather than
 * memoize), which reads as running prose for a plain-text token stream from
 * an LLM call; a JSON-per-line format still needs per-event parsing, so
 * EVENTS stays the default.
 */
function SseEvents({ T, call }: Props) {
  const [textMode, setTextMode] = useState(false);
  const events = call.sseEvents ?? [];
  const isStreaming = call.status === "success" || call.status === "pending";
  const streamedText = events.map((e) => e.data).join("");

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <Radio
          size={10}
          color={SSE_CLR}
          style={
            isStreaming && events.length === 0
              ? { animation: "pulse 1s ease-in-out infinite" }
              : undefined
          }
        />
        <span
          style={{
            fontFamily: "var(--font-title)",
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: SSE_CLR,
          }}
        >
          SSE STREAM
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: T.textDim,
          }}
        >
          {events.length} event{events.length !== 1 ? "s" : ""}
          {isStreaming && events.length === 0 ? " — connecting…" : ""}
        </span>
        {events.length > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
            {(["EVENTS", "TEXT"] as const).map((label) => {
              const active = label === "TEXT" ? textMode : !textMode;
              const wantsText = label === "TEXT";
              return (
                <button
                  key={label}
                  onClick={() => setTextMode(wantsText)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 9999,
                    cursor: active ? "default" : "pointer",
                    border: `1px solid ${active ? SSE_CLR : T.border}`,
                    background: active ? `${SSE_CLR}15` : "transparent",
                    color: active ? SSE_CLR : T.textDim,
                    fontFamily: "var(--font-display)",
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {events.length > 0 && textMode ? (
        <pre
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: T.text,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: T.bgHover,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: 10,
            margin: 0,
          }}
        >
          {streamedText}
          {isStreaming && (
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 12,
                marginLeft: 2,
                verticalAlign: "text-bottom",
                background: SSE_CLR,
                animation: "pulse 1s ease-in-out infinite",
              }}
            />
          )}
        </pre>
      ) : events.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: T.textDim,
            padding: "8px 0",
          }}
        >
          {call.status === "pending" && (
            <Loader2
              size={11}
              color={SSE_CLR}
              style={{ animation: "spin 0.7s linear infinite" }}
            />
          )}
          <span
            style={{
              fontFamily: "var(--font-description)",
              fontSize: 11,
              fontStyle: "italic",
            }}
          >
            {call.status === "pending" ? "Connecting…" : "No events received."}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {events.map((ev, i) => {
            let parsed: unknown = ev.data;
            try {
              parsed = JSON.parse(ev.data);
            } catch {
              /* keep as string */
            }
            const isMsg = ev.type === "message";
            return (
              <div
                key={i}
                style={{
                  borderRadius: 5,
                  border: `1px solid ${SSE_CLR}20`,
                  background: `${SSE_CLR}08`,
                  padding: "5px 8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 7,
                      fontWeight: 700,
                      color: T.textDim,
                    }}
                  >
                    #{i + 1}
                  </span>
                  {!isMsg && (
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 7,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: SSE_CLR,
                        background: `${SSE_CLR}18`,
                        border: `1px solid ${SSE_CLR}30`,
                        padding: "1px 5px",
                        borderRadius: 3,
                      }}
                    >
                      {ev.type}
                    </span>
                  )}
                  {ev.id && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 7,
                        color: T.textDim,
                      }}
                    >
                      id: {ev.id}
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontFamily: "var(--font-mono)",
                      fontSize: 7,
                      color: T.textDim,
                    }}
                  >
                    {new Date(ev.ts).toLocaleTimeString()}
                  </span>
                </div>
                {typeof parsed === "string" ? (
                  <pre
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: T.text,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {parsed}
                  </pre>
                ) : (
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      lineHeight: 1.6,
                    }}
                  >
                    <JNode data={parsed} T={T} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const WS_CLR = "#38bdf8";

/**
 * Live view for a call opened with `api.ws`/`api.io` — a flat, timestamped
 * frame log (not the bordered per-event cards `SseEvents` uses), matching a
 * devtools-style WebSocket message log: one row per frame, an up arrow for
 * what the script sent, a down arrow for what came back, and a plain info
 * row for connect/disconnect/error lifecycle events.
 *
 * @remarks
 * Grows as `call.wsEvents` grows during the run — `CallCard`'s stick-to-
 * bottom effect keeps it scrolled to the newest frame the same way it does
 * for `SseEvents`.
 */
function WsEvents({ T, call }: Props) {
  const events = call.wsEvents ?? [];
  const isIo = call.wsKind === "io";
  const isConnecting = call.status === "pending";

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <Cable
          size={10}
          color={WS_CLR}
          style={
            isConnecting
              ? { animation: "pulse 1s ease-in-out infinite" }
              : undefined
          }
        />
        <span
          style={{
            fontFamily: "var(--font-title)",
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: WS_CLR,
          }}
        >
          {isIo ? "SOCKET.IO" : "WEBSOCKET"}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: T.textDim,
          }}
        >
          {events.length} message{events.length !== 1 ? "s" : ""}
          {isConnecting && events.length === 0 ? " — connecting…" : ""}
          {call.wsOpen
            ? " — open"
            : call.status === "success"
              ? " — closed"
              : ""}
        </span>
      </div>

      {events.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: T.textDim,
            padding: "8px 0",
          }}
        >
          {isConnecting && (
            <Loader2
              size={11}
              color={WS_CLR}
              style={{ animation: "spin 0.7s linear infinite" }}
            />
          )}
          <span
            style={{
              fontFamily: "var(--font-description)",
              fontSize: 11,
              fontStyle: "italic",
            }}
          >
            {isConnecting ? "Connecting…" : "No messages yet."}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {events.map((ev, i) => {
            const Icon =
              ev.direction === "out"
                ? ArrowUp
                : ev.direction === "in"
                  ? ArrowDown
                  : Info;
            const color =
              ev.direction === "out"
                ? T.success
                : ev.direction === "in"
                  ? T.warn
                  : T.textDim;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "3px 2px",
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: T.textDim,
                    minWidth: 62,
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {new Date(ev.ts).toLocaleTimeString()}
                </span>
                <Icon
                  size={11}
                  color={color}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                {isIo &&
                  ev.direction !== "system" &&
                  ev.event &&
                  ev.event !== "message" && (
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 7,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color,
                        background: `${color}18`,
                        border: `1px solid ${color}30`,
                        padding: "1px 5px",
                        borderRadius: 3,
                        marginTop: 1,
                        flexShrink: 0,
                      }}
                    >
                      {ev.event}
                    </span>
                  )}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: ev.direction === "system" ? T.textDim : T.text,
                    fontStyle: ev.direction === "system" ? "italic" : "normal",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    flex: 1,
                  }}
                >
                  {ev.data}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Small pill toggle shared by the non-JSON body views. */
function ModePill({
  T,
  label,
  active,
  onClick,
}: {
  T: Theme;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "2px 8px",
        borderRadius: 9999,
        cursor: active ? "default" : "pointer",
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? `${T.accent}15` : "transparent",
        color: active ? T.accent : T.textDim,
        fontFamily: "var(--font-display)",
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.1em",
      }}
    >
      {label}
    </button>
  );
}

const KIND_LABEL: Record<ResponseKind, string> = {
  json: "JSON",
  xml: "XML",
  html: "HTML",
  image: "IMAGE",
  text: "TEXT",
};

/**
 * Renders a body the JSON tree can't — markup, plain text, or an image. Markup
 * gets an indent pass and, for HTML, a sandboxed preview; an image is shown
 * from the call URL. RAW is always available and Copy takes the untouched body.
 */
function NonJsonBody({
  T,
  kind,
  text,
  url,
}: {
  T: Theme;
  kind: ResponseKind;
  text: string;
  url: string;
}) {
  const isMarkup = kind === "xml" || kind === "html";
  const [mode, setMode] = useState<"pretty" | "raw" | "preview">(
    isMarkup ? "pretty" : "raw",
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const preStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: T.text,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: T.bgHover,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    padding: 10,
    margin: 0,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 7,
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
          {KIND_LABEL[kind]}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          <button
            onClick={handleCopy}
            style={{
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
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {copied ? <Check size={9} /> : <Copy size={9} />}
            {copied ? "COPIED" : "COPY"}
          </button>
          {isMarkup && (
            <ModePill
              T={T}
              label="PRETTY"
              active={mode === "pretty"}
              onClick={() => setMode("pretty")}
            />
          )}
          {kind === "html" && (
            <ModePill
              T={T}
              label="PREVIEW"
              active={mode === "preview"}
              onClick={() => setMode("preview")}
            />
          )}
          {kind !== "image" && (
            <ModePill
              T={T}
              label="RAW"
              active={mode === "raw"}
              onClick={() => setMode("raw")}
            />
          )}
        </div>
      </div>

      {kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary upstream URL, no optimization wanted
        <img
          src={url}
          alt="Response body"
          style={{
            maxWidth: "100%",
            borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: T.bgHover,
          }}
        />
      ) : mode === "preview" ? (
        <iframe
          title="Response preview"
          sandbox=""
          srcDoc={text}
          style={{
            width: "100%",
            height: 240,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            background: "#fff",
          }}
        />
      ) : (
        <pre style={preStyle}>
          {mode === "pretty" && isMarkup ? formatMarkup(text) : text}
        </pre>
      )}
    </div>
  );
}

type ViewMode = "pretty" | "raw" | "ts";

/**
 * Whether a PRETTY-view term should be read as a JSONPath rather than as a
 * find term. `$` is the JSONPath root and never plain response text, so it
 * alone decides — one field serves both jobs with nothing to toggle.
 */
function isJsonPath(term: string): boolean {
  return term.trim().startsWith("$");
}

/** Message shown beside the search field: a match count, or a query error. */
type SearchStatus = { kind: "info" | "error"; text: string } | null;

/**
 * Search field above a JSON response body. One field, two jobs: a JSONPath
 * query against the parsed object in `query` mode, a find term in `text`
 * mode. Internal to {@link RespTab} — the caller owns the term and decides
 * which mode it reads as, from the view and from whether the term opens with
 * a `$`.
 *
 * @remarks
 * Status: stable — Type: control
 *
 * State & behavior: fully controlled; holds nothing. The placeholder and
 * accessible name switch with `mode`, so the same field reads as a query box
 * over the tree and a find box over the raw dump. Clearing is handled by
 * {@link Input}'s own clear button, which re-fires `onChange` with an empty
 * value.
 *
 * Variants:
 * - query — JSONPath placeholder, for a PRETTY term that starts with `$` and
 *   for the empty field, whose placeholder advertises both jobs.
 * - text — plain substring placeholder, for any other term.
 *
 * Composition: renders {@link Input} with a leading `Search` icon; `status`
 * renders as a sibling line to its right.
 *
 * Accessibility: the field carries an `aria-label` naming the active mode.
 * The status line is `aria-live="polite"` so a screen reader hears the match
 * count settle instead of every intermediate keystroke.
 *
 * Test ids: field `resp-tab-search-input` (clear button
 * `resp-tab-search-input-clear-button`), status line
 * `resp-tab-search-status`.
 *
 * CSS classes: none — Tailwind utilities over the `app-*` theme tokens.
 *
 * Edge cases: a long JSONPath error message can outgrow the row, so the
 * status line is width-capped and truncated rather than pushing the field
 * to zero width. Ligatures are switched off on both the field and the status
 * line: JetBrains Mono ligates dot runs, which made a typed `$..Id` read back
 * as `$ .Id` and look like the field had eaten a character.
 */
function BodySearchBar({
  T,
  mode,
  value,
  onChange,
  status,
}: BodySearchBarProps) {
  const isQuery = mode === "query";
  const isHighlight = mode === "highlight";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flex: 1,
        minWidth: 0,
      }}
    >
      <Input
        icon={Search}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        placeholder={
          isHighlight
            ? "Highlight in results"
            : isQuery
              ? "$..Id for JSONPath · or find in tree"
              : "Find in text"
        }
        aria-label={
          isHighlight
            ? "Highlight in query results"
            : isQuery
              ? "JSONPath query"
              : "Find in response text"
        }
        data-testid={
          isHighlight ? "resp-tab-highlight-input" : "resp-tab-search-input"
        }
        clearLabel={
          isHighlight
            ? "Clear highlight"
            : isQuery
              ? "Clear query"
              : "Clear search"
        }
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontVariantLigatures: "none",
        }}
        className="py-1"
      />
      {status && (
        <span
          aria-live="polite"
          data-testid={
            isHighlight ? "resp-tab-highlight-status" : "resp-tab-search-status"
          }
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontVariantLigatures: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 190,
            flexShrink: 0,
            color: status.kind === "error" ? T.error : T.textDim,
          }}
        >
          {status.text}
        </span>
      )}
    </div>
  );
}

type BodySearchBarProps = {
  /** Active theme; supplies the status line's info/error colors. */
  T: Theme;
  /** Which job the field is doing — drives placeholder, label, test id and
   *  nothing else. `highlight` is the second field that marks text inside an
   *  active JSONPath query's results. */
  mode: "query" | "text" | "highlight";
  /** Current search term. Controlled — the caller owns it. */
  value: string;
  /**
   * Fires on every keystroke and on the clear button, with the field's full
   * value (empty string when cleared). Not debounced; the caller defers the
   * expensive work instead.
   * @param value - current field value
   */
  onChange: (value: string) => void;
  /** Trailing message. Nothing renders when `null`. */
  status: SearchStatus;
};

/**
 * Result list for an active JSONPath query — one card per *parent*, not per
 * hit, so a multi-field query (`$..Id,Message`) reads as one block per record
 * instead of alternating single-value cards. Internal to {@link RespTab}.
 *
 * @remarks
 * Status: stable — Type: display
 *
 * State & behavior: holds no state of its own, only a ref onto its container
 * so the current highlight can be scrolled into view when `activeIndex`
 * moves. Grouping happens in {@link RespTab} — it owns the highlight
 * numbering, which has to follow render order. Each value is handed to
 * {@link JNode}, which
 * keeps its own expand/collapse state; because a new query produces new
 * elements at new positions, those trees remount and re-open to their default
 * depth rather than holding a stale collapsed state from the previous query.
 *
 * Variants: empty `groups` render the no-hits line instead of the list. A
 * group with several siblings shows the shared parent path as its heading and
 * one labeled row per field, divided by a hairline; a lone hit keeps the old
 * shape — full path above the value, no field label, since the path already
 * names it.
 *
 * Composition: renders {@link JNode} per match, handing it the highlight term
 * and that value's `matchOffset` so one running `activeIndex` addresses a
 * match anywhere in the list.
 *
 * Test ids: list container `resp-tab-query-match-list`, empty line
 * `resp-tab-query-empty-message`. Individual matches carry none — a JSONPath
 * is not a stable domain id, so tests select rows by position inside the
 * container.
 *
 * CSS classes: none — inline theme-driven styles, matching the rest of the
 * response body.
 *
 * Edge cases: a match on the root (`$`) renders the whole document as one
 * card, which is the honest result rather than a special case — it has no
 * parent, so it is always its own group. A query returning array elements
 * (`$.value[*]`) groups every element under the array's own path, labeled by
 * index.
 */
function QueryMatches({
  T,
  groups,
  query,
  activeIndex,
  offsets,
}: QueryMatchesProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!query || activeIndex < 0) return;
    boxRef.current
      ?.querySelector(".json-tree-viewer__mark--active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [query, activeIndex, groups]);

  if (groups.length === 0) {
    return (
      <div
        data-testid="resp-tab-query-empty-message"
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
        No matches for this query.
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      data-testid="resp-tab-query-match-list"
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      {groups.map((g, gi) => (
        <div
          key={`${g.parent}-${gi}`}
          style={{
            background: T.bgHover,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: 10,
            maxWidth: "100%",
            overflowX: "auto",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: T.textDim,
              marginBottom: 5,
              overflowWrap: "anywhere",
            }}
          >
            {g.items.length > 1 ? g.parent : g.items[0].path}
          </div>

          {g.items.length > 1 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {g.items.map((it, ii) => (
                <div
                  key={`${it.path}-${ii}`}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "baseline",
                    paddingTop: ii === 0 ? 0 : 4,
                    borderTop: ii === 0 ? "none" : `1px solid ${T.border}`,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      color: T.accent,
                      flexShrink: 0,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {it.leaf}
                  </span>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      lineHeight: 1.7,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <JNode
                      data={it.value}
                      T={T}
                      query={query}
                      activeIndex={activeIndex}
                      matchOffset={offsets.get(it.path) ?? 0}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                lineHeight: 1.7,
              }}
            >
              <JNode
                data={g.items[0].value}
                T={T}
                query={query}
                activeIndex={activeIndex}
                matchOffset={offsets.get(g.items[0].path) ?? 0}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type QueryMatchesProps = {
  /** Active theme; every color on the cards is read from it. */
  T: Theme;
  /** Already-bucketed query hits — the caller groups, since it also needs the
   *  group order to number the highlight matches. */
  groups: JsonQueryMatchGroup[];
  /** Secondary find term marked inside the matched values. Empty marks
   *  nothing. */
  query: string;
  /** Index of the highlight match to mark as current, across the whole
   *  result list. `-1` marks none as current. */
  activeIndex: number;
  /** Per-item running match count, keyed by the item's JSONPath — how many
   *  highlight matches precede that value in the list, so `activeIndex` lands
   *  on the right one. */
  offsets: Map<string, number>;
};

/**
 * The PRETTY body: a {@link JNode} tree with the current find term marked.
 * Internal to {@link RespTab}.
 *
 * @remarks
 * Status: stable — Type: display
 *
 * State & behavior: holds no state, only a ref onto the scroll container.
 * Whenever the term, the body behind it or `activeIndex` changes, the tree's
 * active `<mark>` is scrolled into view with `block: "nearest"`, so stepping
 * through hits walks the panel down the tree without yanking a match that is
 * already on screen. An active term also forces every node open, since a hit
 * inside a collapsed branch could otherwise be counted but never shown.
 *
 * Composition: renders {@link JNode}.
 *
 * Test ids: none of its own — the caller's `data-testid` lands on the
 * container.
 *
 * CSS classes: none of its own; it scrolls to `JNode`'s
 * `json-tree-viewer__mark--active`.
 *
 * Edge cases: a term with no hits leaves the scroll position alone, and the
 * scroll is instant rather than smooth since the deferred term can land a new
 * match on consecutive frames while typing.
 */
function HighlightedTree({
  T,
  data,
  query,
  activeIndex,
  "data-testid": testId,
}: HighlightedTreeProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!query || activeIndex < 0) return;
    boxRef.current
      ?.querySelector(".json-tree-viewer__mark--active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [query, activeIndex, data]);

  return (
    <div
      ref={boxRef}
      data-testid={testId}
      style={{
        marginTop: 10,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.7,
        background: T.bgHover,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: 10,
        maxWidth: "100%",
        overflowX: "auto",
      }}
    >
      <JNode
        data={data}
        T={T}
        query={query}
        activeIndex={activeIndex}
        openAll={query !== ""}
      />
    </div>
  );
}

type HighlightedTreeProps = {
  /** Active theme; supplies the surface, border and syntax palette. */
  T: Theme;
  /** Parsed response body to render as a tree. */
  data: unknown;
  /** Find term to mark. An empty string renders the tree untouched. */
  query: string;
  /** Zero-based index of the match to treat as current and scroll to, counted
   *  across the whole tree. `-1` while there is no current match. */
  activeIndex: number;
  /** Lands on the scroll container. */
  "data-testid"?: string;
};

/**
 * Monospace body dump with the current find term marked. Internal to
 * {@link RespTab} — used for both the RAW JSON and the generated TS view.
 *
 * @remarks
 * Status: stable — Type: display
 *
 * State & behavior: holds no state, only a ref onto the `<pre>`. With no
 * `query` it renders the text directly, skipping the highlighter's chunking
 * pass entirely; with one it delegates to `react-highlight-words`, which is
 * case-insensitive and (via `autoEscape`) treats the term as a literal, so
 * regex metacharacters typed into the field match themselves instead of
 * throwing. Whenever the term, the body behind it or `activeIndex` changes,
 * the `activeIndex`-th `<mark>` the highlighter emitted is scrolled into view
 * with `block: "nearest"`, so a match far down a long body is brought to the
 * reader without yanking the card around when it already sits on screen —
 * which is also what walks the view from hit to hit as the caller's up/down
 * buttons move the index.
 *
 * Variants: `color` swaps the base text tone — the theme's text color for RAW,
 * its accent for the TS view. The current match is tinted harder than the
 * rest and outlined, so it stays findable among its neighbours.
 *
 * Composition: renders `Highlighter` inside a `<pre>`.
 *
 * Test ids: none of its own — the caller's `data-testid` lands on the `<pre>`.
 *
 * CSS classes: none — inline theme-driven styles.
 *
 * Edge cases: highlighting splits the text into many spans, so a very large
 * body with a one-character term produces a lot of nodes; the caller defers
 * the term to keep typing responsive rather than capping the match count. A
 * term with no hits leaves the scroll position alone — there is no `<mark>`
 * to scroll to — and the scroll is instant rather than smooth, since the
 * deferred term can land a new one on consecutive frames while typing. An
 * `activeIndex` past the last match scrolls nothing: keeping it inside the
 * match count (and wrapping it) is the caller's job.
 */
function HighlightedPre({
  T,
  text,
  query,
  color,
  activeIndex,
  "data-testid": testId,
}: HighlightedPreProps) {
  const preRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!query || activeIndex < 0) return;
    preRef.current
      ?.querySelectorAll("mark")
      [activeIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [query, text, activeIndex]);

  const style: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: T.bgHover,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    padding: 10,
    margin: 0,
  };

  if (!query) {
    return (
      <pre ref={preRef} data-testid={testId} style={style}>
        {text}
      </pre>
    );
  }

  return (
    <pre ref={preRef} data-testid={testId} style={style}>
      <Highlighter
        searchWords={[query]}
        textToHighlight={text}
        autoEscape
        activeIndex={activeIndex}
        highlightStyle={{
          background: `${T.accent}38`,
          color: T.textBright,
          borderRadius: 2,
          padding: "0 1px",
        }}
        activeStyle={{
          background: `${T.accent}80`,
          color: T.textBright,
          outline: `1px solid ${T.accent}`,
          borderRadius: 2,
          padding: "0 1px",
        }}
        unhighlightStyle={{ color }}
      />
    </pre>
  );
}

type HighlightedPreProps = {
  /** Active theme; supplies the surface, border and highlight tint. */
  T: Theme;
  /** Body text to render. */
  text: string;
  /** Term to mark. An empty string renders `text` untouched. */
  query: string;
  /** Base color for unmatched text. */
  color: string;
  /** Zero-based index of the match to treat as current: tinted harder than
   *  the others and scrolled into view whenever it, `query` or `text`
   *  changes. `-1` while there is no current match. */
  activeIndex: number;
  /** Lands on the `<pre>`. */
  "data-testid"?: string;
};

/**
 * The Response tab of a call card: the body, plus the controls for reading it
 * — PRETTY (a collapsible JSON tree), RAW (the re-serialized JSON) and TS
 * (types generated from the body) — with a search field over each. Handles
 * every body shape a call can produce, delegating SSE frames to
 * {@link SseEvents}, socket frames to {@link WsEvents} and non-JSON payloads
 * to {@link NonJsonBody}.
 *
 * @remarks
 * Status: stable — Type: feature
 *
 * State & behavior: `view` selects the body renderer. Search terms are kept
 * per view — the PRETTY term in `jsonQuery`, the RAW / TS term in `textQuery`
 * — so
 * switching PRETTY↔RAW never reinterprets one as the other. A third term,
 * `resultFind`, belongs to the second field that appears under a valid
 * JSONPath: the path picks *which* values to show, this one marks text
 * *inside* them, with its own `resultNav` stepper keyed by both terms. All
 * three are
 * passed through `useDeferredValue`, so a keystroke paints immediately and the
 * query/highlight pass lands on the next frame. `matchNav` holds the current
 * find hit for the RAW / TS views, keyed by `view` plus the term so a new term
 * (or a view switch) restarts at the first hit without an effect; the up/down
 * buttons step it and the stored index is wrapped modulo the match count, so
 * walking past either end rolls around instead of stalling. `tsOutput` is only
 * generated while the TS view is active. A JSONPath that fails to parse leaves the full
 * tree on screen and reports the parser's message in the status line, so the
 * body never blanks out mid-expression.
 *
 * Variants:
 * - SSE / socket calls — the frame log, no view toggle or search.
 * - pending / errored calls — a spinner or the error box.
 * - non-JSON bodies — {@link NonJsonBody}, which brings its own toggles.
 * - JSON bodies — the PRETTY / RAW / TS toggle documented here.
 * - PRETTY with a JSONPath that returned hits — a second search row, the
 *   highlight field and its own up/down stepper.
 *
 * Composition: renders {@link BodySearchBar}, {@link QueryMatches},
 * {@link HighlightedPre} and {@link HighlightedTree}. The control row (search field,
 * match navigation, copy, view toggle) is `position: sticky` at the top of
 * the card's scrolling detail body, so it stays reachable while a long body
 * scrolls under it. It bleeds over that container's 10px padding with
 * matching negative margins and an opaque `T.bgPanel` fill, so nothing shows
 * through the strip above or beside it, and a hairline bottom border marks
 * where the body starts. `top` is the negative of that top bleed rather than
 * `0`: a sticky box is pinned by its margin box, so a `-10px` top margin
 * against `top: 0` would hold the visible row 10px clear of the scrollport
 * and leak scrolled text through the gap.
 *
 * Accessibility: both search fields are labelled per mode; each status line is
 * `aria-live="polite"` and reads `<n>/<total> matches` wherever a find term
 * is active — the tree included — so stepping is announced. The match up/down buttons are icon-only and carry
 * `aria-label`s ("Previous match" / "Next match"), and disable together once
 * the term matches nothing. The view toggle is a plain button group — the
 * active button is marked with `data-active`.
 *
 * Test ids: copy button `resp-tab-copy-button`, view toggles
 * `resp-tab-view-button-<mode>` (pretty, raw, ts), match navigation
 * `resp-tab-match-prev-button` / `resp-tab-match-next-button` (mounted only in
 * RAW / TS with a term entered), highlight navigation
 * `resp-tab-highlight-prev-button` / `resp-tab-highlight-next-button`
 * (mounted only under a JSONPath that returned hits), body root
 * `resp-tab-body`.
 * Search ids are listed on {@link BodySearchBar} and {@link QueryMatches}.
 *
 * CSS classes: `VIEW_GROUP` / `VIEW_BTN` / `COPY_BTN_*` Tailwind recipes over
 * the `app-*` theme tokens; the body itself is inline-styled from `T`.
 *
 * Edge cases:
 * - A term typed over the tree is a JSONPath when it starts with `$` and a
 *   find term otherwise: the first filters the body down to a match list, the
 *   second marks hits in place across keys and scalar values and drives the
 *   up/down buttons. RAW and TS only ever get the find term, since neither is
 *   a JSON document to query. Match navigation follows the
 *   same split — PRETTY already lists every hit as its own card, so the path
 *   itself needs no stepping; the highlight field layered over those results
 *   does get its own.
 * - The highlight row mounts only when the query actually returned something,
 *   and its term is dropped from the count the moment the path stops matching
 *   — nothing is highlighted in a list that is not on screen.
 * - Copy always takes the whole body (or the whole generated TS), never the
 *   filtered subset — the search narrows the view, not the payload.
 *
 * @example
 * ```tsx
 * <RespTab T={theme} call={call} />
 * ```
 *
 * @see {@link runJsonQuery}
 */
export default function RespTab({ T, call }: Props) {
  const [view, setView] = useState<ViewMode>("pretty");
  const [copied, setCopied] = useState(false);
  const [jsonQuery, setJsonQuery] = useState("");
  const [textQuery, setTextQuery] = useState("");
  const [matchNav, setMatchNav] = useState({ key: "", idx: 0 });
  const [resultFind, setResultFind] = useState("");
  const [resultNav, setResultNav] = useState({ key: "", idx: 0 });

  const deferredJsonQuery = useDeferredValue(jsonQuery);
  const deferredTextQuery = useDeferredValue(textQuery);
  const deferredResultFind = useDeferredValue(resultFind);

  const queryResult = useMemo(
    () =>
      runJsonQuery(
        call.response,
        isJsonPath(deferredJsonQuery) ? deferredJsonQuery : "",
      ),
    [call.response, deferredJsonQuery],
  );

  const tsOutput = useMemo(() => {
    if (view !== "ts") return "";
    try {
      return jsonToTypeScript(call.response, "Response");
    } catch {
      return "// Could not generate TypeScript types from response";
    }
  }, [view, call.response]);

  // Both of these walk the whole response, so they are memoized rather than
  // recomputed on every render — a render happens on each keystroke in the
  // search field (and on any parent re-render), while their inputs only
  // change when the response, the view or the *deferred* term does.
  const copyText = useMemo(
    () => (view === "ts" ? tsOutput : JSON.stringify(call.response, null, 2)),
    [view, tsOutput, call.response],
  );

  const isPretty = view === "pretty";
  const activeQuery = (isPretty ? deferredJsonQuery : deferredTextQuery).trim();
  const hasQuery = activeQuery !== "";
  const pathMode = isPretty && isJsonPath(activeQuery);
  const findMode = hasQuery && !pathMode;
  const matchCount = useMemo(
    () =>
      !findMode
        ? 0
        : isPretty
          ? countTreeMatches(call.response, activeQuery)
          : countMatches(copyText, activeQuery),
    [findMode, isPretty, call.response, activeQuery, copyText],
  );

  // Grouping lives here rather than in QueryMatches because the highlight
  // numbering has to follow the order the groups are *rendered* in, not the
  // order jsonpath-plus returned the hits in.
  const queryGroups = useMemo(
    () => groupJsonQueryMatches(queryResult.ok ? queryResult.matches : []),
    [queryResult],
  );

  const resultTerm = pathMode ? deferredResultFind.trim() : "";

  // One walk over the results per term: `total` drives the counter and the
  // nav bounds, `offsets` tells each value how many matches precede it so a
  // single running `activeIndex` can address a match anywhere in the list.
  const resultMatches = useMemo(() => {
    const offsets = new Map<string, number>();
    let total = 0;
    if (resultTerm) {
      for (const g of queryGroups) {
        for (const it of g.items) {
          offsets.set(it.path, total);
          total += countTreeMatches(it.value, resultTerm);
        }
      }
    }
    return { offsets, total };
  }, [queryGroups, resultTerm]);

  const resultNavKey = `${activeQuery}:${resultTerm}`;
  const resultStoredIdx = resultNav.key === resultNavKey ? resultNav.idx : 0;
  const resultActive =
    resultMatches.total > 0
      ? ((resultStoredIdx % resultMatches.total) + resultMatches.total) %
        resultMatches.total
      : -1;
  const stepResult = (delta: number) =>
    setResultNav({ key: resultNavKey, idx: resultActive + delta });

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (call.isSse) return <SseEvents T={T} call={call} />;
  if (call.isWs) return <WsEvents T={T} call={call} />;

  if (call.status === "pending") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: T.textDim,
        }}
      >
        <Loader2
          size={12}
          style={{ animation: "spin 0.7s linear infinite" }}
          color={T.accent}
        />
        <span style={{ fontFamily: "var(--font-description)", fontSize: 12 }}>
          Awaiting response…
        </span>
      </div>
    );
  }

  if (call.error && !call.response) {
    return (
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: T.error,
          background: `${T.error}10`,
          border: `1px solid ${T.error}30`,
          borderRadius: 6,
          padding: 10,
        }}
      >
        {call.error}
      </div>
    );
  }

  if (isSseBody(call.response)) {
    const events = parseSseBody(call.response as string);
    return (
      <SseBodyEvents
        T={T}
        events={events}
        raw={view === "raw"}
        onToggleRaw={() => setView(view === "raw" ? "pretty" : "raw")}
        response={call.response}
      />
    );
  }

  const kind = detectResponseKind(call.response, call.responseHeaders || {});
  const bodyText =
    typeof call.response === "string"
      ? call.response
      : String(call.response ?? "");
  if (kind !== "json" && (kind === "image" || bodyText.trim() !== "")) {
    return <NonJsonBody T={T} kind={kind} text={bodyText} url={call.url} />;
  }

  const viewBtn = (mode: ViewMode, label: string) => (
    <Button
      key={mode}
      type="button"
      variant="ghost"
      size="xs"
      onClick={() => setView(mode)}
      data-active={view === mode || undefined}
      data-testid={`resp-tab-view-button-${mode}`}
      className={VIEW_BTN}
    >
      {label}
    </Button>
  );

  const navKey = `${view}:${activeQuery}`;
  const storedIdx = matchNav.key === navKey ? matchNav.idx : 0;
  const activeMatch =
    matchCount > 0 ? ((storedIdx % matchCount) + matchCount) % matchCount : -1;
  const stepMatch = (delta: number) =>
    setMatchNav({ key: navKey, idx: activeMatch + delta });

  const status: SearchStatus = !hasQuery
    ? null
    : pathMode
      ? queryResult.ok
        ? {
            kind: "info",
            text: `${queryResult.matches.length} match${queryResult.matches.length === 1 ? "" : "es"}`,
          }
        : { kind: "error", text: queryResult.error }
      : {
          kind: "info",
          text:
            matchCount === 0
              ? "No matches"
              : `${activeMatch + 1}/${matchCount} match${matchCount === 1 ? "" : "es"}`,
        };

  return (
    <div style={{ minWidth: 0, maxWidth: "100%" }}>
      <div
        style={{
          position: "sticky",
          top: -10,
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          margin: "-10px -10px 0",
          padding: "10px 10px 7px",
          background: T.bgPanel,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BodySearchBar
            T={T}
            mode={isPretty && !findMode ? "query" : "text"}
            value={isPretty ? jsonQuery : textQuery}
            onChange={isPretty ? setJsonQuery : setTextQuery}
            status={status}
          />
          {findMode && (
            <ButtonGroup className={VIEW_GROUP}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => stepMatch(-1)}
                disabled={matchCount === 0}
                aria-label="Previous match"
                data-testid="resp-tab-match-prev-button"
                className={VIEW_BTN}
              >
                <ArrowUp size={10} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => stepMatch(1)}
                disabled={matchCount === 0}
                aria-label="Next match"
                data-testid="resp-tab-match-next-button"
                className={VIEW_BTN}
              >
                <ArrowDown size={10} />
              </Button>
            </ButtonGroup>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleCopy(copyText)}
                data-testid="resp-tab-copy-button"
                className={cn(
                  "shrink-0 gap-1 text-[8px] font-bold uppercase tracking-widest",
                  copied ? COPY_BTN_COPIED : COPY_BTN_IDLE,
                )}
              >
                {copied ? <Check size={10} /> : <Copy size={10} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Copy {view === "ts" ? "TypeScript" : "JSON"}
            </TooltipContent>
          </Tooltip>
          <ButtonGroup className={VIEW_GROUP}>
            {viewBtn("pretty", "PRETTY")}
            {viewBtn("raw", "RAW")}
            {viewBtn("ts", "TS")}
          </ButtonGroup>
        </div>

        {/* Second field: the JSONPath above says *which* values to show, this
            one marks text inside them. Only a valid query has results worth
            highlighting, so the row appears with them and goes away with
            them. */}
        {pathMode && queryResult.ok && queryResult.matches.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <BodySearchBar
              T={T}
              mode="highlight"
              value={resultFind}
              onChange={setResultFind}
              status={
                resultTerm === ""
                  ? null
                  : {
                      kind: "info",
                      text:
                        resultMatches.total === 0
                          ? "No matches"
                          : `${resultActive + 1}/${resultMatches.total} match${
                              resultMatches.total === 1 ? "" : "es"
                            }`,
                    }
              }
            />
            <ButtonGroup className={VIEW_GROUP}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => stepResult(-1)}
                disabled={resultMatches.total === 0}
                aria-label="Previous highlight"
                data-testid="resp-tab-highlight-prev-button"
                className={VIEW_BTN}
              >
                <ArrowUp size={10} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => stepResult(1)}
                disabled={resultMatches.total === 0}
                aria-label="Next highlight"
                data-testid="resp-tab-highlight-next-button"
                className={VIEW_BTN}
              >
                <ArrowDown size={10} />
              </Button>
            </ButtonGroup>
          </div>
        )}
      </div>
      {view === "raw" ? (
        <HighlightedPre
          T={T}
          text={copyText}
          query={activeQuery}
          color={T.text}
          activeIndex={activeMatch}
          data-testid="resp-tab-body"
        />
      ) : view === "ts" ? (
        <HighlightedPre
          T={T}
          text={tsOutput}
          query={activeQuery}
          color={T.accent}
          activeIndex={activeMatch}
          data-testid="resp-tab-body"
        />
      ) : pathMode && queryResult.ok ? (
        <div data-testid="resp-tab-body">
          <QueryMatches
            T={T}
            groups={queryGroups}
            query={resultTerm}
            activeIndex={resultActive}
            offsets={resultMatches.offsets}
          />
        </div>
      ) : (
        <HighlightedTree
          T={T}
          data={call.response}
          query={findMode ? activeQuery : ""}
          activeIndex={activeMatch}
          data-testid="resp-tab-body"
        />
      )}
    </div>
  );
}
