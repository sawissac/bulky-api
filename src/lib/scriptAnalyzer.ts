import type { ApiCall } from './types';

function extractNoteBeforeIndex(code: string, idx: number): string | undefined {
  const before = code.slice(0, idx);
  // Find start of the line containing the match, then only search lines above it
  const lineStart = before.lastIndexOf('\n') + 1;
  const linesAbove = before.slice(0, lineStart).split('\n');
  for (let i = linesAbove.length - 1; i >= 0; i--) {
    const trimmed = linesAbove[i].trim();
    if (trimmed === '') continue;
    const match = trimmed.match(/^\/\/ note:(.+)$/);
    if (match) return match[1].trim();
    break;
  }
  return undefined;
}

/**
 * Whether position `idx` sits inside a `//` or block comment. Walks
 * `code.slice(0, idx)` tracking string/comment state one character at a time —
 * a plain `lastIndexOf` scan for a block-comment opener (the previous
 * approach) treats any two-char "slash star" substring as a comment opener,
 * including one inside a string literal like `api.file('image/*')`'s accept
 * pattern. With no matching closer afterward, that misreads everything past
 * it as one giant unclosed comment, so every later `api.*` call in the script
 * goes undetected and drops out of the built-call list once the next analyze
 * pass runs.
 */
function isInsideComment(code: string, idx: number): boolean {
  const before = code.slice(0, idx);
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let strCh = '';

  for (let i = 0; i < before.length; i++) {
    const ch = before[i];
    const next = before[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      if (ch === strCh && before[i - 1] !== '\\') inString = false;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') { inString = true; strCh = ch; }
    else if (ch === '/' && next === '/') { inLineComment = true; i++; }
    else if (ch === '/' && next === '*') { inBlockComment = true; i++; }
  }

  return inLineComment || inBlockComment;
}

/**
 * Locals bound once to a plain string — `const people = '/people'`, or a
 * template with no `${}` of its own — so a url that names one, whether as
 * the whole argument (`api.get(url)`) or interpolated (`` `{{baseUrl}}${people}` ``),
 * previews as the string the run will actually build. Any other binding (a
 * `let`, an expression, a template that interpolates) is left for the run.
 */
function literalConsts(code: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])((?:\\.|(?!\2)[^\\\n])*)\2\s*;?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (isInsideComment(code, m.index)) continue;
    if (m[2] === "`" && m[3].includes("${")) continue;
    out[m[1]] = m[3];
  }
  return out;
}

export function analyzeScript(code: string, envVars: Record<string, string> = {}): ApiCall[] {
  const calls: ApiCall[] = [];
  const consts = literalConsts(code);
  // The optional <...> lets a typed call — api.get<User>(url) — still match.
  // `sse`/`stream` must be included here even though the runtime skips this
  // preview's fields (status/response/etc — see the loop body) for them: the
  // count and order of entries this function returns is also what
  // `mergeCalls` (runnerSlice.ts) uses to reconcile a finished run's stored
  // calls back onto the next preview. Leaving a call type out here doesn't
  // just skip its preview stub — it makes `mergeCalls` see one fewer call
  // than actually ran, silently truncating (or, if it was the *only* call,
  // wholly clearing) that stored call the moment the 300ms post-run
  // re-analyze in BulkyApp.tsx fires.
  // `await` is optional: a call inside `api.parallel([...])` — or handed to
  // `Promise.all` — fires without one. The lookbehind keeps `myapi.get(`
  // from matching now that `await ` no longer anchors the start.
  const re = /(?<![\w$.])(?:await\s+)?api\.(?:(server|query)\.)?(get|post|put|patch|delete|options|head|sse|stream|ws|io|pgsql)\s*(?:<[^>()]*>)?\s*\(/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(code)) !== null) {
    // Skip matches inside comments
    if (isInsideComment(code, m.index)) continue;

    // `api.query.*` holds the database drivers and nothing else, so a
    // namespace and a verb from opposite halves — `api.pgsql(...)`,
    // `api.query.get(...)` — isn't a call this runtime has. Building a stub
    // for one would leave `mergeCalls` reconciling against a card no run can
    // ever fill.
    const ns = m[1]?.toLowerCase();
    const isSql = m[2].toLowerCase() === "pgsql";
    if (isSql !== (ns === "query")) continue;

    // `api.sse` never sends a body, so its call record's `method` is always
    // "SSE" (see `makeStreamCall` in `scriptRunner.ts`). `api.stream` sends
    // POST unless `opts.method` overrides it — POST is by far the common
    // case (an LLM chat/completions call), so it's the best static guess;
    // an overridden verb just means this stub's method won't match the
    // finished call's on the next merge, same graceful fallback as any other
    // call whose shape changes between runs.
    const rawMethod = m[2].toUpperCase();
    const method =
      rawMethod === "SSE" ||
      rawMethod === "WS" ||
      rawMethod === "IO" ||
      rawMethod === "PGSQL"
        ? rawMethod
        : rawMethod === "STREAM"
          ? "POST"
          : rawMethod;
    const note = extractNoteBeforeIndex(code, m.index);
    const after = code.slice(m.index + m[0].length);

    let urlExpr = '';
    let depth = 0;
    let inStr = false;
    let strCh = '';

    for (let i = 0; i < after.length; i++) {
      const ch = after[i];
      const prev = after[i - 1];
      if (!inStr && (ch === "'" || ch === '"' || ch === '`')) {
        inStr = true; strCh = ch; urlExpr += ch; continue;
      }
      if (inStr && ch === strCh && prev !== '\\') {
        inStr = false; urlExpr += ch; continue;
      }
      if (inStr) { urlExpr += ch; continue; }
      if (ch === ',' && depth === 0) break;
      if (ch === ')' && depth === 0) break;
      if ('([{'.includes(ch)) depth++;
      if (')]}'.includes(ch)) depth--;
      urlExpr += ch;
    }

    urlExpr = urlExpr.trim();
    let url = urlExpr;
    if (/^['"`]/.test(url) && url.length > 1) url = url.slice(1, -1);
    url = url.replace(/\$\{env\.(\w+)\}/g, (_, k) => envVars[k] || `[${k}]`);
    url = url.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (whole, k) => consts[k] ?? whole);
    if (/^[A-Za-z_$][\w$]*$/.test(url) && url in consts) url = consts[url];
    url = url.replace(/env\.(\w+)/g, (_, k) => envVars[k] || `[${k}]`);
    if (isSql) {
      // A SQL statement is not a URL: the concatenation squashing below would
      // eat an `a + b` in a SELECT list, and stripping quotes would strip the
      // ones around a literal. `collapseSql` in `scriptRunner.ts` normalizes
      // the run's statement the same way, so a literal query's stub and its
      // finished call still pair up on this key.
      url = url.replace(/\s+/g, ' ').trim();
    } else {
      url = url.replace(/[`'"]\s*\+\s*[`'"]/g, '');
      url = url.replace(/\s*\+\s*/g, '');
      url = url.replace(/[`'"]/g, '');
    }

    calls.push({
      idx: calls.length,
      method,
      url,
      urlExpr,
      status: 'idle',
      statusCode: null,
      response: null,
      responseHeaders: {},
      requestBody: null,
      requestHeaders: {},
      authInfo: null,
      duration: 0,
      error: null,
      timestamp: null,
      cache: false,
      note,
    });
  }

  return calls;
}
