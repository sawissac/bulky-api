'use client';

import { useSelector } from 'react-redux';
import type { Theme } from '@/lib/themes';
import { statusColor, methodColor } from '@/lib/themes';
import { selectBuiltCalls, selectRunStartedAt } from '@/store/runnerSlice';
import { displayUrl } from '@/lib/callMatch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Props = {
  /** Active theme. Every color in the chart is read from it — this component
   *  styles inline rather than through Tailwind tokens. */
  T: Theme;
};

/**
 * Timeline view of a run: one bar per `api.*` call, positioned by when it
 * started and sized by how long it took.
 *
 * @remarks
 * Status: stable — Type: chart
 *
 * State & behavior: no local state. Bars are laid out against an origin taken
 * from the earliest call of the current run, so the first bar always begins at
 * the left edge; a call replayed from cache carries a stamp older than the run
 * and clamps to 0 instead of moving that origin. Bar width is a percentage of
 * the run's total span, floored at 1% so a sub-millisecond call stays visible;
 * a pending call instead stretches to the right edge and pulses.
 *
 * Variants: an idle (analyzed, not yet run) call draws in the border color at
 * 0.2 opacity; a completed or pending one in the theme accent; a failed one in
 * the error color. The status-code chip keeps the green/amber/red outcome color.
 *
 * Composition: each row is a `Tooltip` trigger showing the full method, URL,
 * status and duration — the row itself truncates the URL to its last 36
 * characters. A total row follows the chart once any call has a duration.
 *
 * Accessibility: rows are non-interactive; the tooltip carries the detail that
 * truncation drops.
 *
 * Test ids: none.
 *
 * CSS classes: the chart itself is inline styles over the theme object, plus
 * the shared `pulse` keyframes for pending bars; the empty state is the shared
 * `p-4 text-center font-description text-[12px] text-app-dim` recipe used by the
 * call list and docs view. The bordered card is filled with `bgPanel` — the
 * same opaque backing the request-list card uses — so the pane's dot-grid
 * texture does not bleed through the rows.
 *
 * Edge cases: with no calls, renders the "No API calls detected in this
 * script" placeholder — same markup as the call list and {@link ApiDocs}
 * empty states.
 * A run whose calls all lack timestamps falls back to the run's own start,
 * which puts every bar at 0.
 *
 * Dependencies: `react-redux`, `@/store/runnerSlice`, `@/lib/themes`,
 * `@/components/ui/tooltip`.
 *
 * @example
 * ```tsx
 * <ApiWaterfall T={theme} />
 * ```
 */
export default function ApiWaterfall({ T }: Props) {
  const calls = useSelector(selectBuiltCalls);
  const runStartedAt = useSelector(selectRunStartedAt);

  if (calls.length === 0) {
    return (
      <p className="p-4 text-center font-description text-[12px] text-app-dim">
        No API calls detected in this script
      </p>
    );
  }

  const runStart = runStartedAt ?? 0;

  // The timeline starts at the first call, not at the Run click: analyzing and
  // transpiling the script happens in between and is not a request, so anchoring
  // to the click leaves the first bar floating in dead space. Stamps older than
  // the run are replayed from cache — they keep clamping to 0 rather than
  // dragging the origin back to a previous run.
  const stamps = calls
    .map((c) => (c.timestamp ? new Date(c.timestamp).getTime() : null))
    .filter((t): t is number => t !== null && t >= runStart);
  const origin = stamps.length > 0 ? Math.min(...stamps) : runStart;

  // Compute timeline extents
  const rows = calls.map((c) => {
    const startMs = c.timestamp ? Math.max(0, new Date(c.timestamp).getTime() - origin) : 0;
    const endMs = startMs + (c.duration || 0);
    return { call: c, startMs, endMs };
  });

  const totalMs = Math.max(...rows.map((r) => r.endMs), 1);

  return (
    <div style={{ padding: '10px' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 6,
          border: `1px solid ${T.border}`,
          background: T.bgPanel,
        }}
      >
        {/* Time axis header */}
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 52px', gap: 6, padding: '6px 10px', background: T.bg, borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: 'var(--font-title)', fontSize: 7, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.textDim }}>Method / URL</span>
          <span style={{ fontFamily: 'var(--font-title)', fontSize: 7, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.textDim }}>Timeline</span>
          <span style={{ fontFamily: 'var(--font-title)', fontSize: 7, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.textDim, textAlign: 'right' }}>ms</span>
        </div>

        {rows.map(({ call, startMs, endMs }, i) => {
          const barLeft = (startMs / totalMs) * 100;
          const barWidth = Math.max(((endMs - startMs) / totalMs) * 100, call.status === 'pending' ? 100 - barLeft : 1);
          const mc = methodColor(call.method, T);
          const sc = call.status === 'idle' ? T.border : call.status === 'pending' ? T.accent : statusColor(call.statusCode, T);
          // The bar tracks the theme accent, not the HTTP status — only a failed
          // call breaks to the error color so it still stands out. The status
          // code chip below keeps `sc` (green/amber/red) as the outcome signal.
          const barColor = call.status === 'idle' ? T.border : call.status === 'error' ? T.error : T.accent;
          const isPending = call.status === 'pending';

          const url = displayUrl(call.url);
          const urlDisplay = url.length > 38 ? '…' + url.slice(-36) : url;

          return (
            <Tooltip key={call.idx}>
              <TooltipTrigger asChild>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr 52px',
                    gap: 6,
                    padding: '6px 10px',
                    background: T.bgHover,
                    borderTop: i > 0 ? `1px solid ${T.border}` : undefined,
                    alignItems: 'center',
                  }}
                >
                  {/* Method + URL */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: mc }}>{call.method}</span>
                      {call.statusCode && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 7,
                            fontWeight: 700,
                            color: sc,
                            background: T.bgPanel,
                            border: `1px solid ${T.border}`,
                            borderRadius: 3,
                            padding: '1px 4px',
                            lineHeight: 1.4,
                          }}
                        >
                          {call.statusCode}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{urlDisplay}</div>
                  </div>

                  {/* Waterfall bar */}
                  <div style={{ position: 'relative', height: 14, background: T.bg, borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: `${barLeft}%`,
                        width: `${barWidth}%`,
                        height: '100%',
                        background: barColor,
                        borderRadius: 3,
                        opacity: call.status === 'idle' ? 0.2 : 0.75,
                        animation: isPending ? 'pulse 0.8s ease-in-out infinite' : undefined,
                        transition: 'width 0.2s, background 0.3s',
                      }}
                    />
                  </div>

                  {/* Duration */}
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 8, color: call.duration ? T.textDim : 'transparent' }}>
                    {call.duration ? call.duration : '—'}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {call.method} {url}
                {call.statusCode ? ` — ${call.statusCode}` : ''}
                {call.duration ? ` — ${call.duration}ms` : ''}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Total row */}
      {calls.some((c) => c.duration > 0) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 10px 0', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: T.textDim }}>total</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: T.accent, fontWeight: 700 }}>
            {totalMs}ms
          </span>
        </div>
      )}
    </div>
  );
}
