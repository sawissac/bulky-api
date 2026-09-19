'use client';

import { Paperclip } from 'lucide-react';
import type { Theme } from '@/lib/themes';
import type { ApiCall } from '@/lib/types';
import { isBodySummary } from '@/lib/requestBody';
import KVRow from '@/components/KVRow';

type Props = {
  /** Active theme; every color on the tab is read from it, not from tokens. */
  T: Theme;
  /** The call whose outgoing request this tab describes. */
  call: ApiCall;
};

/** Human-readable byte count — matches the size formatting used elsewhere in
 *  the response panel (KB at three figures, otherwise plain bytes). */
function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * `CallCard`'s Payload tab: the request as sent — query params, headers, and
 * body.
 *
 * @remarks
 * Status: stable — Type: tab body
 *
 * State & behavior: pure — every section is read straight from `call` and
 * `useMemo`-free, since the tab only mounts while its card is open. The query
 * params are re-parsed from `call.url` on every render via `URL`.
 *
 * Variants: a `FormData`/`Blob` body (an `api.form()` / `api.file()` upload,
 * see `scriptRunner.ts`) never reaches this tab as the live object — it lands
 * as `@/lib/types`' `RequestBodySummary`, so the body section lists field
 * names and file name/size/type instead of dumping a JSON body. Everything
 * else falls back to a `JSON.stringify`'d block. Each section (query, headers,
 * body) mounts only when it has something to show.
 *
 * Composition: {@link KVRow} for query/header rows; the body section rolls its
 * own rows since a file field needs an icon and a size, not just a value.
 *
 * Accessibility: static text — no interactive controls of its own.
 *
 * Test ids: none.
 *
 * CSS classes: none — inline theme values, matching the rest of `CallCard`'s
 * tabs.
 *
 * Edge cases:
 * - `call.url` failing to parse as a URL (a script error left an unresolved
 *   expression on the card) — the query-params section is silently omitted.
 * - A multipart part's file name doubles as its display value, so a plain
 *   text field and a file field never render identically.
 *
 * Dependencies: `lucide-react`, `@/lib/requestBody`, `@/components/KVRow`.
 *
 * @example
 * ```tsx
 * <PayloadTab T={theme} call={builtCalls[0]} />
 * ```
 */
export default function PayloadTab({ T, call }: Props) {
  const label = (text: string) => (
    <div style={{ fontFamily: 'var(--font-title)', fontSize: 8, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.textDim, marginBottom: 5 }}>
      {text}
    </div>
  );

  /** Grouped, `divide`-style KV list — one bordered card instead of each row
   *  owning its own border/radius/margin. */
  const kvList = (entries: [string, string][], masked?: (k: string) => boolean) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 6,
        border: `1px solid ${T.border}`,
      }}
    >
      {entries.map(([k, v], i) => (
        <div key={k} style={i > 0 ? { borderTop: `1px solid ${T.border}` } : undefined}>
          <KVRow T={T} k={k} v={v} masked={masked?.(k)} />
        </div>
      ))}
    </div>
  );

  const headerEntries = Object.entries(call.requestHeaders || {});
  const bodySummary = isBodySummary(call.requestBody) ? call.requestBody : null;

  const queryEntries = (() => {
    try {
      return Array.from(new URL(call.url).searchParams.entries());
    } catch {
      return [];
    }
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {queryEntries.length > 0 && (
        <div>
          {label('Query Params')}
          {kvList(queryEntries)}
        </div>
      )}
      {headerEntries.length > 0 && (
        <div>
          {label('Request Headers')}
          {kvList(headerEntries, (k) => k.toLowerCase() === 'authorization')}
        </div>
      )}
      {bodySummary ? (
        <div>
          {label(
            bodySummary.kind === 'multipart'
              ? 'Request Body (multipart)'
              : 'Request Body (binary)',
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: 6,
              border: `1px solid ${T.border}`,
            }}
          >
            {(bodySummary.kind === 'multipart'
              ? bodySummary.parts
              : [{ key: null, value: bodySummary.name, file: bodySummary }]
            ).map((part, i) => (
              <div
                key={part.key ?? 'binary'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  ...(i > 0 ? { borderTop: `1px solid ${T.border}` } : {}),
                }}
              >
                {part.key && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: T.accent,
                      flexShrink: 0,
                    }}
                  >
                    {part.key}
                  </span>
                )}
                {part.file ? (
                  <>
                    <Paperclip size={11} color={T.textDim} style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: T.text,
                        minWidth: 0,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {part.file.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: T.textDim,
                        flexShrink: 0,
                      }}
                    >
                      {formatBytes(part.file.size)} · {part.file.type}
                    </span>
                  </>
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: T.text,
                      minWidth: 0,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {part.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        !!call.requestBody && (
          <div>
            {label('Request Body')}
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.text, whiteSpace: 'pre-wrap', background: T.bgHover, border: `1px solid ${T.border}`, borderRadius: 6, padding: 10 }}>
              {JSON.stringify(call.requestBody, null, 2)}
            </pre>
          </div>
        )
      )}
    </div>
  );
}
