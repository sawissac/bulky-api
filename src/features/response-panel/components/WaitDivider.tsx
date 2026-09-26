"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import type { Theme } from "@/lib/themes";
import type { ApiCall } from "@/lib/types";
import { displayUrl } from "@/lib/callMatch";
import { formatWaitMs, plannedWaitMs } from "@/lib/wait";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** How often a running wait redraws its line and countdown. */
const TICK_MS = 100;

/** Gap between the line's ends and the list card's edges, in px. */
const INSET = 12;

/**
 * One `api.wait(ms)` step in the Call Script list, drawn as a divider between
 * the request cards rather than a card of its own: a hairline across the list
 * with the pause centered on it, and the line filling left to right while the
 * wait runs. Reach for it only for a `WAIT` record (see `isWait` in
 * `@/lib/wait`); every request renders as a {@link CallCard}.
 *
 * @remarks
 * Status: stable — Type: list divider
 *
 * State & behavior: reads everything from `call` — the planned pause from
 * `url`, the start from `timestamp`, the actual pause from `duration`, a
 * `// note:` from `note`. The one piece of local state is a clock, ticking
 * every 100ms only while the wait is `pending`, so the fill and the "… left"
 * countdown move without the runner dispatching anything. Nothing is
 * clickable — a wait has no response to open — and it takes no step number,
 * so the cards on either side number as consecutive requests.
 *
 * Variants:
 * - idle — dashed line, dimmed label "wait 2 s"; flagged `skipped`, it adds
 *   "not reached" (the script stopped before this step).
 * - pending — the line fills with the accent color toward the planned pause,
 *   label "2 s · 1.3 s left" with a pulsing hourglass.
 * - success — solid muted line, "waited 1.5 s" — the pause actually taken.
 * - error — stopped by the user mid-wait: the fill turns the error color and
 *   stays where it stopped, "stopped at 0.8 s".
 *
 * Composition: renders no children. Sits in the `divide-y` list card; it
 * carries `data-wait-step` and drops its own bottom border, and the list
 * drops the border of the row just above it, so this line is the only
 * separator between the two cards it sits between. The label is backed by
 * the card's panel color, so it cuts the line instead of sitting on it.
 *
 * Accessibility: not interactive and not a live region — a 100ms countdown
 * would flood a screen reader. The line is `aria-hidden`; the label's text
 * carries the state, and its tooltip spells out the call and the pause.
 *
 * Test ids: root `wait-divider-<idx>`, label text
 * `wait-divider-status-message-<idx>`.
 *
 * CSS classes: `bg-app-panel` on the label and `border-b-0` on the root, over
 * inline theme values for the colors, matching {@link CallCard}.
 *
 * Edge cases:
 * - A wait whose argument the analyzer couldn't evaluate (`api.wait(delay)`)
 *   shows its expression until a run fills in the number.
 * - `api.wait(0)` or a negative / non-numeric argument is a 0 ms step that
 *   completes at once.
 * - Mounted mid-wait (switching back to the item during a run), the fill
 *   resumes from `timestamp` rather than starting over.
 * - A long note truncates with an ellipsis; the tooltip has it whole.
 *
 * Dependencies: `lucide-react`, `@/lib/wait`, `@/lib/callMatch`,
 * `@/components/ui/tooltip`.
 *
 * @example
 * ```tsx
 * {builtCalls.map((call) =>
 *   isWait(call) ? (
 *     <WaitDivider key={call.idx} T={T} call={call} />
 *   ) : (
 *     <CallCard key={call.idx} T={T} call={call} />
 *   ),
 * )}
 * ```
 *
 * @see {@link CallCard}
 * @see {@link ApiWaterfall}
 */
export default function WaitDivider({ T, call }: WaitDividerProps) {
  const running = call.status === "pending";
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  const planned = plannedWaitMs(call);
  const started = call.timestamp ? Date.parse(call.timestamp) : NaN;
  const elapsed = running
    ? now !== null && Number.isFinite(started)
      ? Math.max(0, now - started)
      : 0
    : call.duration;

  const percent =
    call.status === "idle"
      ? 0
      : call.status === "success" || !planned
        ? 100
        : Math.min(100, (elapsed / planned) * 100);

  const size = planned !== null ? formatWaitMs(planned) : displayUrl(call.url);

  const state =
    call.status === "idle"
      ? `wait ${size}${call.skipped ? " · not reached" : ""}`
      : running
        ? planned !== null
          ? `${size} · ${formatWaitMs(Math.max(0, planned - elapsed))} left`
          : `${size} · waiting…`
        : call.status === "success"
          ? `waited ${formatWaitMs(call.duration)}`
          : `stopped at ${formatWaitMs(call.duration)}`;

  const detail =
    call.status === "success"
      ? `paused ${formatWaitMs(call.duration)}`
      : call.status === "error"
        ? `stopped after ${formatWaitMs(call.duration)}`
        : call.skipped
          ? "the script stopped before reaching this wait"
          : "pauses the script before the next step";

  const fill =
    call.status === "error"
      ? T.error
      : running
        ? T.accent
        : `${T.textDim}80`;

  const labelColor =
    call.status === "error" ? T.error : running ? T.textBright : T.textDim;

  return (
    <div
      data-testid={`wait-divider-${call.idx}`}
      data-wait-step=""
      className="border-b-0"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 24,
        padding: `0 ${INSET}px`,
        opacity: call.status === "idle" ? 0.7 : 1,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: INSET,
          right: INSET,
          top: "50%",
          borderTop: `1px ${call.status === "idle" ? "dashed" : "solid"} ${T.border}`,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: INSET,
          top: "calc(50% - 0.5px)",
          height: 2,
          width: `calc((100% - ${INSET * 2}px) * ${percent / 100})`,
          borderRadius: 1,
          background: fill,
          transition: running ? `width ${TICK_MS}ms linear` : undefined,
        }}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="bg-app-panel"
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 6,
              maxWidth: "85%",
              padding: "0 8px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            <Hourglass
              size={14}
              color={call.status === "error" ? T.error : running ? T.accent : T.textDim}
              aria-hidden="true"
              style={{
                flexShrink: 0,
                animation: running ? "pulse 1s ease-in-out infinite" : undefined,
              }}
            />
            <span
              data-testid={`wait-divider-status-message-${call.idx}`}
              style={{
                flexShrink: 0,
                color: labelColor,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {state}
            </span>
            {call.note && (
              <span
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: T.textDim,
                  fontFamily: "var(--font-description)",
                  fontStyle: "italic",
                }}
              >
                · {call.note}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          api.wait({planned !== null ? planned : size}) — {detail}
          {call.note ? ` · ${call.note}` : ""}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export type WaitDividerProps = {
  /** Active theme; the line, fill and label colors are read from it, as on
   *  {@link CallCard}. */
  T: Theme;
  /** The `WAIT` record to render — planned pause in `url`, start in
   *  `timestamp`, actual pause in `duration`. */
  call: ApiCall;
};
