import type { ApiCall } from "./types";

/** `method` of the record `api.wait` leaves in a run — a pause, not a
 *  request, so it renders as a wait step instead of a call card. Its `url`
 *  holds the planned pause in ms, which is also the key its analyzer stub
 *  pairs on. */
export const WAIT_METHOD = "WAIT";

export function isWait(call: Pick<ApiCall, "method">): boolean {
  return call.method === WAIT_METHOD;
}

/**
 * The pause a wait record asks for, read back from its `url`. `null` when the
 * analyzer could only keep the argument's source text — `api.wait(delay)`
 * previews as `delay` until a run resolves it.
 */
export function plannedWaitMs(call: Pick<ApiCall, "url">): number | null {
  if (call.url.trim() === "") return null;
  const ms = Number(call.url);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The pause `api.wait(ms)` actually takes — the same clamping the global
 * `sleep` applies: non-numbers become `0`, negatives clamp to `0`.
 */
export function waitMs(ms: unknown): number {
  return Math.max(0, Number(ms) || 0);
}

/**
 * The analyzer's `url` for an `api.wait` argument's source text. A numeric
 * literal (`2000`, `1_000`, `2e3`) or an env value already substituted in
 * (`"1500"`) becomes the millisecond count {@link waitMs} would produce, so a
 * literal wait's stub pairs with its live record on `url`; a missing argument
 * is `0`; any other expression is kept as written, for the preview to show.
 */
export function waitKeyFromSource(text: string): string {
  const src = text.trim();
  if (src === "") return "0";
  const ms = Number(src.replace(/_/g, ""));
  return Number.isFinite(ms) ? String(waitMs(ms)) : src;
}

/** Compact duration for a wait step: `850 ms`, `2 s`, `1.5 s`, `1 m 30 s`. */
export function formatWaitMs(ms: number): string {
  const rounded = Math.max(0, Math.round(ms));
  if (rounded < 1000) return `${rounded} ms`;
  if (rounded < 60_000) {
    const s = rounded / 1000;
    return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
  }
  const m = Math.floor(rounded / 60_000);
  const s = Math.round((rounded % 60_000) / 1000);
  return s === 0 ? `${m} m` : `${m} m ${s} s`;
}
