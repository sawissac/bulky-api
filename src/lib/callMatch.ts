import type { ApiCall } from "./types";

/**
 * Strips the quoting and whitespace that separate the analyzer's raw source
 * expression (`` `\n  {{baseUrl}}/v1/Users\n` ``) from the runtime's evaluated
 * template string (`"\n  {{baseUrl}}/v1/Users\n"`), so the two forms of the
 * same URL argument compare equal.
 */
export function normalizeUrlExpr(expr: string | undefined): string {
  if (!expr) return "";
  return expr.replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, "");
}

/**
 * One-line, quote-free form of a URL for display. Strips a wrapping
 * `` ` ``/`'`/`"` pair, then removes the whitespace a multi-line template
 * literal leaves behind — the newlines and their indentation, and any space
 * hugging a `?`, `&`, `=` or `#` delimiter — while keeping spaces that sit
 * between value tokens (an OData `$filter=name eq 'bob'` stays intact). Unlike
 * {@link normalizeUrlExpr}, which welds the whole string shut for matching.
 */
export function displayUrl(expr: string | undefined): string {
  if (!expr) return "";
  return expr
    .replace(/^\s*["'`]|["'`]\s*$/g, "")
    .replace(/\s*[\r\n]+\s*/g, "")
    .replace(/\s+([?&#])/g, "$1")
    .replace(/([?&=])\s+/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * The forms a call's url takes that another record of the same call could
 * carry: its `url` and its normalized `urlExpr`. A stub's `url` is the
 * analyzer's best static expansion (`{{baseUrl}}/people`, a `${local}`
 * substituted) while a live call's `urlExpr` is the string the run built
 * before `{{var}}` resolution — the same text, so the keys must cross.
 */
function urlKeys(call: ApiCall): string[] {
  const keys = [call.url, normalizeUrlExpr(call.urlExpr)];
  return keys.filter((k) => k !== "");
}

/**
 * Index of the first entry in `pool` that is the same call as `call` — same
 * method, and any of one's url forms equal to any of the other's (see
 * {@link urlKeys}). A `{{var}}` the analyzer can't expand never matches on
 * the resolved url, since the run resolved it and the stub did not.
 *
 * `used` excludes indices already claimed, so a script that fires the same
 * request twice pairs them up in order instead of both landing on the first.
 * Returns -1 when nothing matches.
 */
export function findCallIndex(
  call: ApiCall,
  pool: ApiCall[],
  used: ReadonlySet<number>,
): number {
  const keys = new Set(urlKeys(call));
  return pool.findIndex(
    (c, i) =>
      !used.has(i) &&
      c.method === call.method &&
      urlKeys(c).some((k) => keys.has(k)),
  );
}
