"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type {
  editor as MonacoEditorNS,
  IDisposable,
  languages,
  Position,
} from "monaco-editor";
import type { Theme } from "@/lib/themes";
import { registerTranspiler } from "@/lib/transpile";
import {
  odataCompletions,
  odataWordLength,
  stringLiteralAt,
  type OdataItemKind,
} from "@/lib/odataCompletion";
import {
  findSqlLiteralRanges,
  pgsqlStringStart,
  sqlCompletions,
  sqlWordLength,
  tokenizeSql,
  type SqlItemKind,
  type SqlTokenType,
} from "@/lib/sqlCompletion";

export type EditorInstance = MonacoEditorNS.IStandaloneCodeEditor;

/** Scratch file the TypeScript worker emits from. Created per transpile and
 *  disposed straight after; the appended `export {}` makes it a module, so the
 *  script's declarations live in their own scope instead of colliding with the
 *  editor's own model in the shared global one. */
const TRANSPILE_URI = "file:///bulky-transpile.ts";
const MODULE_MARKER = "\nexport {};\n";

/** Ambient declarations for the runtime globals the script runner injects
 *  (`api`, `env`) — see `runScript` in `@/lib/scriptRunner`. Registered as an
 *  extra lib so the TypeScript worker types `api.*` calls, their options and
 *  their responses instead of falling back to a hand-rolled completion list. */
const API_LIB = `
interface BulkyAuth {
  type: 'bearer' | 'basic' | 'apikey';
  token?: string;
  username?: string;
  password?: string;
  /** Header name for \`apikey\` auth. @defaultValue "X-API-Key" */
  header?: string;
  key?: string;
}

interface BulkyCallOpts {
  auth?: BulkyAuth;
  headers?: Record<string, string>;
}

interface BulkyResponse<T = any> {
  /** Parsed JSON body, or the raw text when the body is not JSON. */
  data: T;
  status: number;
  headers: Record<string, string>;
  /** True for a 2xx status. */
  ok: boolean;
}

interface BulkySseEvent {
  type: string;
  data: string;
  id?: string;
}

interface BulkyStreamOpts extends BulkyCallOpts {
  /** Verb used to open the stream. @defaultValue \`'GET'\` for \`sse\`, \`'POST'\` for \`stream\` */
  method?: string;
  /** JSON body sent with the request that opens the stream — an LLM
   *  chat/completions payload, typically. */
  body?: unknown;
}

interface BulkyStreamResult {
  /** Aborts the stream early — same effect as the run itself being stopped. */
  close(): void;
  /** Resolves once the stream ends (or fails), with everything received. */
  done: Promise<{ events: BulkySseEvent[]; text: string; status: number | null }>;
}

interface BulkyStream {
  /** Streams an SSE endpoint, calling \`onEvent\` per event until closed. Each
   *  event also renders live on the call's Response tab as it arrives. */
  sse(
    url: string,
    opts?: BulkyStreamOpts,
    onEvent?: (event: BulkySseEvent) => void,
  ): Promise<BulkyStreamResult>;
  /** POSTs (by default) \`body\` and streams the \`event-stream\` reply live — an
   *  LLM chat/completions call, typically. \`api.sse\` is GET-only with no
   *  body; this is its POST counterpart. Pass \`opts.method\` to override the
   *  verb. */
  stream(
    url: string,
    body?: unknown,
    opts?: BulkyCallOpts,
    onEvent?: (event: BulkySseEvent) => void,
  ): Promise<BulkyStreamResult>;
}

interface BulkyWsOpts {
  /** Sub-protocol(s) for the WS handshake. A browser socket can't set custom
   *  headers on the upgrade request, so this is the only connection option. */
  protocols?: string | string[];
}

interface BulkyIoOpts {
  path?: string;
  query?: Record<string, string>;
  auth?: Record<string, unknown>;
  transports?: string[];
  [key: string]: unknown;
}

/** One sent/received frame, or an \`open\`/\`close\`/\`error\` lifecycle row —
 *  also what streams live onto the call's Response tab as it happens. */
interface BulkyWsEvent {
  direction: 'in' | 'out' | 'system';
  /** Socket.IO event name; \`"message"\` for a raw WS text frame; \`"open"\` /
   *  \`"close"\` / \`"error"\` for a lifecycle row. */
  event?: string;
  data: string;
  ts: number;
}

interface BulkySocketHandle {
  /** Sends over the open connection — an object is JSON-stringified first. */
  send(data: string | object): void;
  /** Closes the connection early — same effect as the run being stopped. */
  close(code?: number, reason?: string): void;
}

interface BulkyIoHandle extends BulkySocketHandle {
  /** Sends a named Socket.IO event. \`send(data)\` is sugar for
   *  \`emit('message', data)\`. */
  emit(event: string, ...args: unknown[]): void;
}

interface BulkySocket {
  /** Opens a native WebSocket, resolving once connected with \`{ send, close
   *  }\` to keep using for the rest of the run — reject if it never opens.
   *  Every sent/received frame and connection event also renders live on the
   *  call's Response tab. No \`api.server.ws\` — a browser WebSocket doesn't
   *  hit CORS the way \`fetch\` does, so there's nothing to route around. */
  ws(url: string, opts?: BulkyWsOpts): Promise<BulkySocketHandle>;
  /** Same as \`ws\`, over Socket.IO — \`onEvent\` fires for every event
   *  received, any name. The returned handle adds \`emit\` for named events. */
  io(
    url: string,
    opts?: BulkyIoOpts,
    onEvent?: (event: { event: string; data: unknown }) => void,
  ): Promise<BulkyIoHandle>;
}

/** \`body\` may be a \`FormData\` (from {@link BulkyApi.form}) or a raw \`File\` /
 *  \`Blob\` (from {@link BulkyApi.file}) — either is sent as-is, never
 *  JSON-encoded, and \`Content-Type\` is left for the browser to set. */
interface BulkyHttp {
  /** GET \`url\`. \`{{var}}\` in the URL is resolved from the active environment. */
  get<T = any>(url: string, opts?: BulkyCallOpts): Promise<BulkyResponse<T>>;
  post<T = any>(url: string, body: unknown, opts?: BulkyCallOpts): Promise<BulkyResponse<T>>;
  put<T = any>(url: string, body: unknown, opts?: BulkyCallOpts): Promise<BulkyResponse<T>>;
  patch<T = any>(url: string, body: unknown, opts?: BulkyCallOpts): Promise<BulkyResponse<T>>;
  delete<T = any>(url: string, opts?: BulkyCallOpts): Promise<BulkyResponse<T>>;
  /** Asks which methods/headers the resource allows. No request body; the
   *  response body is usually empty — read \`headers\` / \`status\`. */
  options<T = any>(url: string, opts?: BulkyCallOpts): Promise<BulkyResponse<T>>;
  /** Like GET but headers only — no request or response body. Read
   *  \`headers\` / \`status\` off the result. */
  head<T = any>(url: string, opts?: BulkyCallOpts): Promise<BulkyResponse<T>>;
}

interface BulkySqlOpts {
  /** Name of a connection saved in the sidebar's DB pane. Omit to use the one
   *  marked active there; a name matching none fails the call rather than
   *  quietly running against a different database. */
  db?: string;
  /** Raw connection string, bypassing the saved connections entirely — takes
   *  precedence over \`db\`. With neither, and no connection configured, the
   *  environment's \`DATABASE_URL\` is the last resort (\`PG_URL\` /
   *  \`PGSQL_URL\` / \`POSTGRES_URL\` also accepted). \`{{var}}\` resolves. */
  url?: string;
  /** \`true\` verifies the server certificate; \`'no-verify'\` encrypts without
   *  verifying it — what a managed Postgres behind a self-signed pooler
   *  certificate needs. Omit to let \`sslmode\` in the connection string decide. */
  ssl?: boolean | 'no-verify';
  /** Postgres \`statement_timeout\` for this query, in ms. @defaultValue \`30000\` */
  timeout?: number;
}

interface BulkySqlField {
  name: string;
  /** Postgres type OID of the column. */
  dataTypeID: number;
}

interface BulkySqlResult<T = any> {
  rows: T[];
  /** \`null\` for a statement that reports no row count — DDL, mostly. */
  rowCount: number | null;
  /** The statement's command tag — \`'SELECT'\`, \`'INSERT'\`, ... */
  command: string;
  fields: BulkySqlField[];
  duration: number;
  /** Present only for a multi-statement batch, one entry per statement — the
   *  top-level fields then describe the last one. */
  statements?: Array<Omit<BulkySqlResult<T>, 'duration' | 'statements'>>;
}

interface BulkyQuery {
  /** Runs raw SQL against Postgres through the app's own database route — a
   *  browser can't speak the Postgres wire protocol, so unlike an HTTP call
   *  there is no direct option. The connection comes from the sidebar's DB
   *  pane: the active one, or the one \`opts.db\` names.
   *  Values belong in \`params\` as \`$1\`, \`$2\`, ...;
   *  the statement itself is never interpolated, and \`{{var}}\` resolves in the
   *  connection string only. Omitting \`params\` runs the text as a batch, so
   *  several \`;\`-separated statements work — the extra results land in
   *  \`statements\`. A failed query throws, the way any Postgres client does. */
  pgsql<T = any>(
    sql: string,
    params?: unknown[],
    opts?: BulkySqlOpts,
  ): Promise<BulkySqlResult<T>>;
}

/** One entry of an \`api.parallel\` batch: a call already in flight, or a
 *  thunk that starts one when a worker picks it up. */
type BulkyParallelTask<T> = Promise<T> | (() => Promise<T>);

interface BulkyParallelOpts {
  /** Most tasks in flight at once. Unset runs the whole batch together. Only
   *  thunks can be throttled — a promise is already running when passed. */
  limit?: number;
}

type BulkyParallelResults<T extends readonly BulkyParallelTask<unknown>[]> = {
  -readonly [K in keyof T]: T[K] extends () => Promise<infer R>
    ? R
    : T[K] extends Promise<infer R>
      ? R
      : never;
};

interface BulkyServer extends BulkyHttp, BulkyStream {}

interface BulkyApi extends BulkyHttp, BulkyStream, BulkySocket {
  /** Same verbs (plus \`sse\`/\`stream\`), routed through \`/api/proxy\` — use when
   *  CORS blocks the browser from calling the host directly (most hosted LLM
   *  APIs do). Files upload through it too: the proxy streams the body
   *  straight to the target instead of JSON-encoding it. */
  server: BulkyServer;
  /** Raw database queries, one property per driver. */
  query: BulkyQuery;
  /** Runs a batch of calls at once and resolves with their results in input
   *  order, like \`Promise.all\`. Pass promises to start everything together,
   *  or thunks (\`() => api.get(...)\`) with \`limit\` to cap how many run at
   *  a time — the way to fan out over a list without hammering the host. Each
   *  call gets its own card as it starts; a rejection rejects the batch. */
  parallel<T extends readonly BulkyParallelTask<unknown>[] | []>(
    tasks: T,
    opts?: BulkyParallelOpts,
  ): Promise<BulkyParallelResults<T>>;
  /** Records a pass/fail check against the run. Never throws — a falsy
   *  \`condition\` is collected and shown on the call card and run summary. */
  assert(condition: unknown, message?: string): void;
  /** Opens a native file picker and resolves with the chosen file. \`accept\`
   *  is a standard file-input accept string, e.g. \`'image/*'\`. Rejects if the
   *  picker is dismissed with nothing chosen. */
  file(accept?: string): Promise<File>;
  /** Builds a multipart \`FormData\` body. A \`File\`/\`Blob\` value becomes a file
   *  field; anything else is coerced to a string field. */
  form(fields: Record<string, unknown>): FormData;
}

/** HTTP client injected by the Bulky runtime. */
declare const api: BulkyApi;

/** Chainable expectations. Every matcher records a pass/fail and returns \`this\`
 *  so \`.not\` and further matchers chain. Nothing here throws. */
interface BulkyMatchers {
  toBe(expected: unknown): BulkyMatchers;
  toEqual(expected: unknown): BulkyMatchers;
  toBeTruthy(): BulkyMatchers;
  toBeFalsy(): BulkyMatchers;
  toBeDefined(): BulkyMatchers;
  toBeNull(): BulkyMatchers;
  toContain(sub: unknown): BulkyMatchers;
  toMatch(pattern: RegExp | string): BulkyMatchers;
  toBeGreaterThan(n: number): BulkyMatchers;
  toBeLessThan(n: number): BulkyMatchers;
  toHaveProperty(key: string): BulkyMatchers;
  /** Passes when \`actual\` (or \`actual.status\`) equals \`code\`. */
  toHaveStatus(code: number): BulkyMatchers;
  /** Passes when \`actual.ok\` is true, or \`actual\` itself is truthy. */
  toBeOk(): BulkyMatchers;
  readonly not: BulkyMatchers;
}

/** Opens a chain of expectations over \`actual\`. */
declare function expect(actual: unknown): BulkyMatchers;

/** Resolves after \`ms\` milliseconds. Rejects at once if the run is stopped. */
declare function sleep(ms: number): Promise<void>;
`;

/** Diagnostics that only make sense for a real module and would light up every
 *  script: a Bulky script is a bare statement list executed inside an async
 *  function, so its top-level \`await\` is legal even though the worker sees a
 *  non-module file. */
const IGNORED_DIAGNOSTICS = [1375, 1378, 1308];

/** CSS class per {@link SqlTokenType}, applied as a decoration
 *  `inlineClassName` over the SQL sub-ranges `tokenizeSql` finds — Monaco's
 *  TypeScript tokenizer colors a whole string uniformly and has no notion of
 *  the SQL grammar inside it. Colors live in `SQL_HIGHLIGHT_COLORS` below,
 *  written to a shared stylesheet by the syntax-highlight effect. */
const SQL_TOKEN_CLASS: Record<SqlTokenType, string> = {
  keyword: "bulky-sql-keyword",
  function: "bulky-sql-function",
  type: "bulky-sql-type",
  string: "bulky-sql-string",
  number: "bulky-sql-number",
  placeholder: "bulky-sql-placeholder",
  comment: "bulky-sql-comment",
};

/** Light/dark colors for `SQL_TOKEN_CLASS`. `keyword`/`string`/`number`/
 *  `type` reuse the exact pairs the `bulky` Monaco theme already assigns
 *  those classic token names (see the theme effect below), so SQL text
 *  matches the surrounding script's palette; `function` and `placeholder`
 *  are new since the base TypeScript grammar has no token for either. */
const SQL_HIGHLIGHT_COLORS: Record<SqlTokenType, { light: string; dark: string }> = {
  keyword: { light: "#7c2d12", dark: "#67e8f9" },
  string: { light: "#3f6212", dark: "#86efac" },
  number: { light: "#9a3412", dark: "#fdba74" },
  type: { light: "#6d28d9", dark: "#c4b5fd" },
  comment: { light: "#8f7d68", dark: "#4a5568" },
  function: { light: "#b45309", dark: "#fcd34d" },
  placeholder: { light: "#be185d", dark: "#f9a8d4" },
};

/** Id of the shared `<style>` element the syntax-highlight effect writes to.
 *  Fixed and looked up rather than created fresh per mount, so several
 *  editor instances on one page (the mock gallery renders more than one)
 *  share a single stylesheet instead of racing to append their own. */
const SQL_HIGHLIGHT_STYLE_ID = "bulky-sql-highlight-style";

function envLib(envVars: Record<string, string>): string {
  const keys = Object.entries(envVars).map(([k, v]) => {
    const safe = String(v ?? "").replace(/\*\//g, "*\\/");
    const doc = safe ? `  /** \`"${safe}"\` */\n` : "  /** (empty) */\n";
    const prop = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `'${k}'`;
    return `${doc}  readonly ${prop}: string;`;
  });
  return [
    "/** Variables of the active environment. Also usable as `{{name}}` inside a URL. */",
    "declare const env: {",
    ...keys,
    "  readonly [key: string]: string;",
    "} & {",
    "  /** Set a variable for the rest of this run; offered in the Extracted panel afterwards. */",
    "  set(key: string, value: unknown): void;",
    "  /** Read a variable of the active environment. */",
    "  get(key: string): string | undefined;",
    "};",
  ].join("\n");
}

function diagnosticText(messageText: unknown): string {
  if (typeof messageText === "string") return messageText;
  const chain = messageText as { messageText?: unknown } | null;
  return chain?.messageText ? diagnosticText(chain.messageText) : "Syntax error";
}

/**
 * Coerces a theme color to the `#rrggbb(aa)` form Monaco's `defineTheme`
 * requires. Monaco silently ignores `rgb()/rgba()` values and the affected keys
 * fall back to the base VS theme — which is why the suggest widget kept the
 * stock selection colors instead of the Bulky palette. Already-hex values pass
 * through untouched.
 */
function hex(color: string): string {
  const m = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!m) return color;
  const parts = m[1].split(",").map((p) => p.trim());
  const chan = (p: string) =>
    Math.max(0, Math.min(255, Math.round(parseFloat(p))))
      .toString(16)
      .padStart(2, "0");
  const alpha =
    parts[3] === undefined
      ? ""
      : Math.max(0, Math.min(255, Math.round(parseFloat(parts[3]) * 255)))
          .toString(16)
          .padStart(2, "0");
  return `#${chan(parts[0])}${chan(parts[1])}${chan(parts[2])}${alpha}`;
}

type Props = {
  /** Current script source. Controlled — the parent owns the buffer. */
  value: string;
  /** Fires on every keystroke with the full buffer, never with `undefined`. */
  onChange: (v: string) => void;
  /** Active environment's variables, surfaced as `env.*` types and as `{{name}}`
   *  completions inside strings. Re-read on every completion, so a change mid
   *  session needs no remount. */
  envVars: Record<string, string>;
  /** Active theme; its colors are compiled into Monaco's `bulky` theme. */
  T: Theme;
  /** Fires on ⌘↵ / Ctrl+↵ inside the editor, on ⌘⇧↵ / Ctrl+Shift+↵, and on
   *  the `Run Selection` context-menu action. Receives the selected text
   *  whenever the run should cover only that selection, and nothing when the
   *  whole buffer should run.
   *  @param selection - Selected source, or `undefined` for the whole buffer. */
  onRun: (selection?: string) => void;
  /** Fires on every selection change with the selected text — the empty
   *  string once the selection collapses back to a caret. */
  onSelectionChange?: (selection: string) => void;
  /** Fires once with the editor instance, for imperative actions (format). */
  onMount?: (editor: EditorInstance) => void;
};

/**
 * The Monaco instance behind the editor panel, wired for the Bulky script
 * runtime: TypeScript language services, typed `api`/`env` globals, and the
 * TypeScript → JavaScript transpiler the runner executes.
 *
 * @remarks
 * Status: stable — Type: editor
 *
 * State & behavior: `monaco` holds the instance captured in `beforeMount`;
 * every effect no-ops until it lands. The theme effect compiles `T` into a
 * Monaco theme named `bulky` and re-defines it whenever the colors change;
 * every value is pushed through {@link hex} first because `defineTheme` drops
 * `rgba()` colors silently (which left the suggest widget on the stock VS
 * selection colors).
 * The language effect sets the TypeScript compiler options once and registers
 * the transpiler with `@/lib/transpile`, which the runner calls before
 * executing — the emit runs on a scratch model that is disposed straight
 * after, so it never collides with the editor's own model, and syntactic
 * diagnostics are raised as an `Error` carrying the compiler's message and
 * line. The globals effect re-publishes the `env` declarations as an extra lib
 * on every `envVars` change; the `api` lib — which also declares the `expect`
 * and `sleep` runtime helpers — is static, as is the `lodash` lib
 * ({@link "@/lib/lodashEditorLib"}, bundled from `@types/lodash` and loaded as
 * its own chunk) that types the `lodash` global the runner injects.
 * On mount the editor registers three run actions — `Run Script` (⌘↵, passing
 * the selected text when the selection holds non-blank source, so only those
 * lines execute), `Run Selection` (context menu, gated on
 * `editorHasSelection`) and `Run Whole Script` (⌘⇧↵, which ignores the
 * selection) — and subscribes to selection changes, reporting the selected
 * text through `onSelectionChange` so the panel can label its own Run button.
 * Both callbacks are read through refs because the actions and the listener
 * are registered once, on mount; the listener is disposed on unmount. Mount
 * also runs the first SQL decoration pass and subscribes it to
 * `onDidChangeModelContent`, both disposed the same way.
 * A separate effect keeps a shared `<style>` tag (`SQL_HIGHLIGHT_STYLE_ID`)
 * in sync with `T.isLight`, since the decorations below are colored by CSS
 * class rather than by Monaco's own theme `rules`.
 *
 * Variants: none.
 *
 * Composition: renders `@monaco-editor/react`'s `Editor` in `typescript` mode.
 * Type annotations are stripped at run time, so plain JavaScript scripts keep
 * working unchanged.
 *
 * Accessibility: Monaco owns its own focus, ARIA and keyboard model. ⌘↵ /
 * Ctrl+↵ runs — the selection alone when there is one — and ⌘⇧↵ /
 * Ctrl+Shift+↵ always runs the whole buffer, both in addition to the panel's
 * own Run button and both listed in the editor's context menu next to `Run
 * Selection`. ⌘C /
 * Ctrl+C triggers the completion widget when the selection is empty, and
 * still copies whenever text is selected — so the standard copy path is only
 * shadowed on an empty caret, where it was a no-op anyway.
 *
 * Test ids: none — Monaco renders its own DOM.
 *
 * CSS classes: `bulky-sql-keyword` / `-function` / `-type` / `-string` /
 * `-number` / `-placeholder` / `-comment`, written to the shared
 * `SQL_HIGHLIGHT_STYLE_ID` stylesheet and applied as decoration
 * `inlineClassName`s over SQL sub-ranges — the one exception to the editor
 * otherwise being themed through Monaco, not Tailwind, since Monaco's own
 * theme `rules` color classic TypeScript tokens and have no notion of SQL
 * living inside one of its string literals.
 *
 * Edge cases: a run fired before this component mounts finds no registered
 * transpiler and executes the buffer as-is — fine for JavaScript, a syntax
 * error for type syntax. `{{name}}` completions live in a manual provider
 * because they sit inside string literals, where the language service offers
 * nothing; OData completions share that constraint and ride a second manual
 * provider. That one covers quoted strings and template literals alike —
 * {@link stringLiteralAt} lexes the buffer rather than the caret's line, so a
 * URL split across lines of a template still resolves — and stays silent
 * unless the word being typed starts with `$` or the caret sits past a `?`,
 * which keeps ordinary strings and JSON bodies free of the widget. A third
 * manual provider covers Postgres: {@link pgsqlStringStart} reuses
 * {@link stringLiteralAt}'s lexer, then qualifies a string either of two
 * ways — the text right before its opening quote reads like
 * `api.query.pgsql(` (or `api.pgsql(`), which qualifies it at any length, or
 * (so a `const sql = "..."` built up before the call also completes) its own
 * content starts with a SQL statement keyword. Either way it stays out of an
 * ordinary quoted string, a URL, or `params`/`opts`. Syntax highlighting for
 * that same SQL rides decorations rather than a fourth completion provider:
 * {@link findSqlLiteralRanges} re-derives every qualifying string in the
 * whole buffer on each edit (not just the one under the caret, since more
 * than one may be visible at once) and {@link tokenizeSql} classifies the
 * words inside each — Monaco's own tokenizer already colors the string
 * uniformly, so only keywords, functions, types, nested SQL string literals,
 * `$1`-style placeholders and line/block comments get a decoration;
 * punctuation, operators and identifiers (table/column names) keep the
 * color they already had.
 *
 * Dependencies: `@monaco-editor/react`, `monaco-editor` (types only),
 * `@/lib/transpile`, `@/lib/themes`, `@/lib/odataCompletion`,
 * `@/lib/sqlCompletion`, `@/lib/lodashEditorLib` (dynamic import).
 *
 * @example
 * ```tsx
 * <MonacoCodeEditor
 *   value={code}
 *   onChange={setCode}
 *   envVars={envVars}
 *   T={theme}
 *   onRun={onRun}
 * />
 * ```
 *
 * @see {@link registerTranspiler}
 * @see {@link odataCompletions}
 * @see {@link sqlCompletions}
 * @see {@link tokenizeSql}
 */
export default function MonacoCodeEditor({
  value,
  onChange,
  envVars,
  T,
  onRun,
  onSelectionChange,
  onMount,
}: Props) {
  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const envVarsRef = useRef(envVars);
  const onRunRef = useRef(onRun);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const selectionDisposableRef = useRef<IDisposable | null>(null);
  const sqlContentDisposableRef = useRef<IDisposable | null>(null);
  const sqlDecorationsRef = useRef<ReturnType<
    EditorInstance["createDecorationsCollection"]
  > | null>(null);

  useEffect(() => {
    envVarsRef.current = envVars;
  }, [envVars]);

  useEffect(() => {
    onRunRef.current = onRun;
    onSelectionChangeRef.current = onSelectionChange;
  }, [onRun, onSelectionChange]);

  useEffect(
    () => () => {
      selectionDisposableRef.current?.dispose();
      sqlContentDisposableRef.current?.dispose();
    },
    [],
  );

  // SQL syntax highlighting — writes light/dark colors for `SQL_TOKEN_CLASS`
  // to a shared stylesheet. A `<style>` tag rather than Monaco's own theme
  // `rules` because those color classic tokens ("string", "keyword", ...)
  // the TypeScript grammar assigns; there is no classic token for the SQL
  // grammar living inside one of its string literals; decorations layer a
  // second CSS class on top instead, so this is the color source for it.
  useEffect(() => {
    const style =
      (document.getElementById(
        SQL_HIGHLIGHT_STYLE_ID,
      ) as HTMLStyleElement | null) ?? document.createElement("style");
    style.id = SQL_HIGHLIGHT_STYLE_ID;
    if (!style.isConnected) document.head.appendChild(style);

    const mode = T.isLight ? "light" : "dark";
    style.textContent = (
      Object.keys(SQL_HIGHLIGHT_COLORS) as SqlTokenType[]
    )
      .map((type) => {
        const extra =
          type === "comment"
            ? "font-style: italic;"
            : type === "placeholder"
              ? "font-weight: 600;"
              : "";
        return `.${SQL_TOKEN_CLASS[type]} { color: ${SQL_HIGHLIGHT_COLORS[type][mode]} !important; ${extra} }`;
      })
      .join("\n");
  }, [T.isLight]);

  // SQL syntax highlighting — decorations. Re-scans the whole buffer on every
  // edit for {@link findSqlLiteralRanges}'s qualifying strings and lays a
  // `SQL_TOKEN_CLASS` decoration over each {@link tokenizeSql} token inside
  // them; punctuation, operators and identifiers are left undecorated; they
  // keep the string color the TypeScript grammar already gave them.
  const updateSqlDecorations = useCallback(
    (monacoInstance: Monaco, editorInstance: EditorInstance) => {
      const model = editorInstance.getModel();
      if (!model) return;
      const text = model.getValue();

      const decorations: MonacoEditorNS.IModelDeltaDecoration[] = [];
      for (const literal of findSqlLiteralRanges(text)) {
        const sql = text.slice(literal.start, literal.end);
        for (const token of tokenizeSql(sql)) {
          const from = model.getPositionAt(literal.start + token.start);
          const to = model.getPositionAt(literal.start + token.end);
          decorations.push({
            range: new monacoInstance.Range(
              from.lineNumber,
              from.column,
              to.lineNumber,
              to.column,
            ),
            options: {
              inlineClassName: SQL_TOKEN_CLASS[token.type],
            },
          });
        }
      }

      if (sqlDecorationsRef.current) {
        sqlDecorationsRef.current.set(decorations);
      } else {
        sqlDecorationsRef.current =
          editorInstance.createDecorationsCollection(decorations);
      }
    },
    [],
  );

  // Coalesces the rescan to one animation frame. `onDidChangeModelContent`
  // fires per keystroke (and per character of a paste), and the scan walks the
  // whole buffer, so a fast typist would otherwise pay for a full re-tokenize
  // between every two characters. Decorations only need to be right by the
  // next paint.
  const sqlFrameRef = useRef<number | null>(null);
  const scheduleSqlDecorations = useCallback(
    (monacoInstance: Monaco, editorInstance: EditorInstance) => {
      if (sqlFrameRef.current !== null) return;
      sqlFrameRef.current = requestAnimationFrame(() => {
        sqlFrameRef.current = null;
        updateSqlDecorations(monacoInstance, editorInstance);
      });
    },
    [updateSqlDecorations],
  );

  useEffect(
    () => () => {
      if (sqlFrameRef.current !== null)
        cancelAnimationFrame(sqlFrameRef.current);
    },
    [],
  );

  const transpile = useCallback(
    async (m: Monaco, code: string): Promise<string> => {
      const uri = m.Uri.parse(TRANSPILE_URI);
      const source = code + MODULE_MARKER;
      const model =
        m.editor.getModel(uri) ??
        m.editor.createModel(source, "typescript", uri);
      model.setValue(source);
      try {
        const getWorker = await m.languages.typescript.getTypeScriptWorker();
        const client = await getWorker(uri);
        const fileName = uri.toString();

        const syntactic = await client.getSyntacticDiagnostics(fileName);
        if (syntactic.length > 0) {
          const d = syntactic[0];
          const pos = model.getPositionAt(d.start ?? 0);
          throw new Error(
            `${diagnosticText(d.messageText)} (line ${pos.lineNumber})`,
          );
        }

        const out = (await client.getEmitOutput(fileName)) as {
          outputFiles: { name: string; text: string }[];
        };
        const js = out.outputFiles.find((f) => f.name.endsWith(".js"))?.text;
        return js === undefined
          ? code
          : js.replace(/export\s*\{\s*\};?\s*$/, "");
      } finally {
        model.dispose();
      }
    },
    [],
  );

  // Define theme once Monaco is ready, re-define when theme colors change
  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme("bulky", {
      base: T.isLight ? "vs" : "vs-dark",
      inherit: true,
      rules: T.isLight
        ? [
            { token: "comment", foreground: "8f7d68", fontStyle: "italic" },
            { token: "keyword", foreground: "7c2d12" },
            { token: "string", foreground: "3f6212" },
            { token: "number", foreground: "9a3412" },
            { token: "regexp", foreground: "b91c1c" },
            { token: "type", foreground: "6d28d9" },
            { token: "variable", foreground: "1c110b" },
            { token: "identifier", foreground: "1c110b" },
            { token: "delimiter", foreground: "6b5442" },
          ]
        : [
            { token: "comment", foreground: "4a5568", fontStyle: "italic" },
            { token: "keyword", foreground: "67e8f9" },
            { token: "string", foreground: "86efac" },
            { token: "number", foreground: "fdba74" },
            { token: "regexp", foreground: "fca5a5" },
            { token: "type", foreground: "c4b5fd" },
            { token: "variable", foreground: "e2e8f0" },
            { token: "identifier", foreground: "e2e8f0" },
            { token: "delimiter", foreground: "64748b" },
          ],
      colors: Object.fromEntries(
        Object.entries({
          "editor.background": T.editorBg,
          "editor.foreground": T.textBright,
          "editorLineNumber.foreground": T.lineNum,
          "editorLineNumber.activeForeground": T.accent,
          "editor.selectionBackground": `${T.accent}22`,
          "editor.inactiveSelectionBackground": `${T.accent}11`,
          "editor.lineHighlightBackground": T.isLight ? "#00000008" : "#ffffff05",
          "editor.lineHighlightBorder": "#00000000",
          "editorCursor.foreground": T.accent,
          "editorGutter.background": T.gutterBg,
          "editorIndentGuide.background1": T.border,
          "editorIndentGuide.activeBackground1": T.borderMid,

          "editorWidget.background": T.bgPanel,
          "editorWidget.foreground": T.text,
          "editorWidget.border": T.borderMid,

          "editorSuggestWidget.background": T.bgPanel,
          "editorSuggestWidget.foreground": T.text,
          "editorSuggestWidget.border": T.borderMid,
          "editorSuggestWidget.selectedBackground": T.bgSelected,
          "editorSuggestWidget.selectedForeground": T.textBright,
          "editorSuggestWidget.selectedIconForeground": T.accent,
          "editorSuggestWidget.highlightForeground": T.accent,
          "editorSuggestWidget.focusHighlightForeground": T.accent,
          "editorSuggestWidgetStatus.foreground": T.textDim,

          "editorHoverWidget.background": T.bgPanel,
          "editorHoverWidget.foreground": T.text,
          "editorHoverWidget.border": T.borderMid,

          "editorError.foreground": T.error,
          "editorWarning.foreground": T.warn,

          focusBorder: T.borderAccent,
          "list.hoverBackground": T.bgHover,
          "list.hoverForeground": T.textBright,
          "list.focusBackground": T.bgSelected,
          "list.focusForeground": T.textBright,
          "list.focusOutline": T.borderAccent,
          "list.activeSelectionBackground": T.bgSelected,
          "list.activeSelectionForeground": T.textBright,
          "list.inactiveSelectionBackground": T.bgSelected,

          "scrollbarSlider.background": `${T.accent}18`,
          "scrollbarSlider.hoverBackground": `${T.accent}30`,
          "editor.findMatchBackground": `${T.accent}30`,
          "editor.findMatchHighlightBackground": `${T.accent}18`,
        }).map(([k, v]) => [k, hex(v)]),
      ),
    });
    monaco.editor.setTheme("bulky");
  }, [monaco, T]);

  // TypeScript services + the transpiler the runner executes through
  useEffect(() => {
    if (!monaco) return;
    const ts = monaco.languages.typescript;

    ts.typescriptDefaults.setCompilerOptions({
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      lib: ["esnext", "dom"],
      allowNonTsExtensions: true,
      allowJs: true,
      skipLibCheck: true,
      strict: false,
      noImplicitAny: false,
      noEmit: false,
    });
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: IGNORED_DIAGNOSTICS,
    });
    ts.typescriptDefaults.addExtraLib(API_LIB, "file:///bulky-api.d.ts");

    // `lodash` global — types bundled from `@types/lodash` (~450 kB), so pulled
    // as its own chunk instead of riding in the editor bundle. Registering it
    // after mount is fine: the worker re-checks open models when a lib lands.
    let cancelled = false;
    void import("@/lib/lodashEditorLib").then(({ LODASH_EDITOR_LIB }) => {
      if (!cancelled) {
        ts.typescriptDefaults.addExtraLib(
          LODASH_EDITOR_LIB,
          "file:///bulky-lodash.d.ts",
        );
      }
    });

    registerTranspiler((code) => transpile(monaco, code));

    return () => {
      cancelled = true;
    };
  }, [monaco, transpile]);

  // Environment variables as typed `env` members, refreshed as they change
  useEffect(() => {
    if (!monaco) return;
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      envLib(envVars),
      "file:///bulky-env.d.ts",
    );
  }, [monaco, envVars]);

  // `{{var}}` completions — they sit inside string literals, where the
  // language service offers nothing.
  useEffect(() => {
    if (!monaco) return;

    const disp = monaco.languages.registerCompletionItemProvider("typescript", {
      triggerCharacters: ["{"],
      provideCompletionItems(
        model: MonacoEditorNS.ITextModel,
        position: Position,
      ) {
        const line = model.getLineContent(position.lineNumber);
        const before = line.substring(0, position.column - 1);
        if (!before.endsWith("{{")) return { suggestions: [] };

        // Typing `{{` auto-closes to `{{}}` (bracket-matching, on by default)
        // with the caret left in the middle, so the `}}` this completion
        // would otherwise append already sits right after the caret — the
        // bug this guards against inserted a second one on top of it,
        // leaving `{{name}}}}`. The replace range swallows that existing
        // pair instead of appending past it; a caret with no `}}` there
        // (auto-close off, or one already deleted) still gets one inserted.
        const after = line.substring(position.column - 1, position.column + 1);
        const alreadyClosed = after === "}}";

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: alreadyClosed ? position.column + 2 : position.column,
        };

        const suggestions: languages.CompletionItem[] = Object.entries(
          envVarsRef.current,
        ).map(
          ([k, v]) =>
            ({
              label: k,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: v ? `"${v}"` : "(empty)",
              insertText: `${k}}}`,
              range,
            }) as languages.CompletionItem,
        );

        return { suggestions };
      },
    });

    return () => disp.dispose();
  }, [monaco]);

  useEffect(() => {
    if (!monaco) return;

    const K = monaco.languages.CompletionItemKind;
    const kinds: Record<OdataItemKind, languages.CompletionItemKind> = {
      keyword: K.Keyword,
      operator: K.Operator,
      function: K.Function,
      value: K.Value,
      snippet: K.Snippet,
    };

    const disp = monaco.languages.registerCompletionItemProvider("typescript", {
      triggerCharacters: ["$", "?", "&", "(", ",", ";", "=", "/", " "],
      provideCompletionItems(
        model: MonacoEditorNS.ITextModel,
        position: Position,
      ) {
        const offset = model.getOffsetAt(position);
        const frame = stringLiteralAt(model.getValue(), offset);
        if (!frame) return { suggestions: [] };

        const before = model.getValue().slice(frame.start, offset);
        const items = odataCompletions(before);
        if (items.length === 0) return { suggestions: [] };

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - odataWordLength(before),
          endColumn: position.column,
        };

        return {
          suggestions: items.map(
            (item) =>
              ({
                label: item.label,
                kind: kinds[item.kind],
                detail: item.detail,
                documentation: item.documentation
                  ? { value: item.documentation }
                  : undefined,
                insertText: item.insertText,
                insertTextRules: item.snippet
                  ? monaco.languages.CompletionItemInsertTextRule
                      .InsertAsSnippet
                  : undefined,
                filterText: item.label,
                commitCharacters: [],
                sortText: `0${item.label}`,
                range,
              }) as languages.CompletionItem,
          ),
        };
      },
    });

    return () => disp.dispose();
  }, [monaco]);

  // Postgres completions for `api.query.pgsql("...")` — also string-only, and
  // further scoped to the string a `pgsql(` call actually opened, so a plain
  // URL or header value never sprouts SQL keywords.
  useEffect(() => {
    if (!monaco) return;

    const K = monaco.languages.CompletionItemKind;
    const kinds: Record<SqlItemKind, languages.CompletionItemKind> = {
      keyword: K.Keyword,
      function: K.Function,
      type: K.Class,
      value: K.Value,
    };

    const disp = monaco.languages.registerCompletionItemProvider("typescript", {
      triggerCharacters: [" ", "(", ",", ".", "="],
      provideCompletionItems(
        model: MonacoEditorNS.ITextModel,
        position: Position,
      ) {
        const offset = model.getOffsetAt(position);
        const text = model.getValue();
        const start = pgsqlStringStart(text, offset);
        if (start === null) return { suggestions: [] };

        const before = text.slice(start, offset);
        const items = sqlCompletions(before);
        if (items.length === 0) return { suggestions: [] };

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - sqlWordLength(before),
          endColumn: position.column,
        };

        return {
          suggestions: items.map(
            (item) =>
              ({
                label: item.label,
                kind: kinds[item.kind],
                detail: item.detail,
                documentation: item.documentation
                  ? { value: item.documentation }
                  : undefined,
                insertText: item.insertText,
                insertTextRules: item.snippet
                  ? monaco.languages.CompletionItemInsertTextRule
                      .InsertAsSnippet
                  : undefined,
                filterText: item.label,
                commitCharacters: [],
                sortText: `0${item.label}`,
                range,
              }) as languages.CompletionItem,
          ),
        };
      },
    });

    return () => disp.dispose();
  }, [monaco]);

  return (
    <Editor
      height="100%"
      language="typescript"
      path="file:///bulky-script.ts"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      theme="bulky"
      options={{
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        lineHeight: 20,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: "off",
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "line",
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        formatOnPaste: true,
        tabSize: 2,
        insertSpaces: true,
        snippetSuggestions: "top",
        suggest: { snippetsPreventQuickSuggestions: false },
        quickSuggestions: { other: true, comments: false, strings: true },
        fixedOverflowWidgets: true,
      }}
      beforeMount={(m) => setMonaco(m)}
      onMount={(editor, monacoInstance) => {
        const selectedText = (): string => {
          const sel = editor.getSelection();
          if (!sel || sel.isEmpty()) return "";
          return editor.getModel()?.getValueInRange(sel) ?? "";
        };
        // A selection of nothing but whitespace is no selection at all — run
        // the whole buffer rather than an empty script.
        const runTarget = (): string | undefined => {
          const text = selectedText();
          return text.trim() ? text : undefined;
        };

        const KM = monacoInstance.KeyMod;
        editor.addAction({
          id: "bulky.run",
          label: "Run Script",
          keybindings: [KM.CtrlCmd | monacoInstance.KeyCode.Enter],
          contextMenuGroupId: "navigation",
          contextMenuOrder: 0,
          run: () => onRunRef.current(runTarget()),
        });
        editor.addAction({
          id: "bulky.runSelection",
          label: "Run Selection",
          precondition: "editorHasSelection",
          contextMenuGroupId: "navigation",
          contextMenuOrder: 1,
          run: () => onRunRef.current(runTarget()),
        });
        editor.addAction({
          id: "bulky.runWhole",
          label: "Run Whole Script",
          keybindings: [
            KM.CtrlCmd | KM.Shift | monacoInstance.KeyCode.Enter,
          ],
          contextMenuGroupId: "navigation",
          contextMenuOrder: 2,
          run: () => onRunRef.current(),
        });

        selectionDisposableRef.current = editor.onDidChangeCursorSelection(
          () => onSelectionChangeRef.current?.(selectedText()),
        );

        updateSqlDecorations(monacoInstance, editor);
        sqlContentDisposableRef.current = editor.onDidChangeModelContent(() =>
          scheduleSqlDecorations(monacoInstance, editor),
        );

        editor.addCommand(
          monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyC,
          () => {
            const sel = editor.getSelection();
            editor.trigger(
              "keyboard",
              sel && !sel.isEmpty()
                ? "editor.action.clipboardCopyAction"
                : "editor.action.triggerSuggest",
              {},
            );
          },
        );
        onMount?.(editor);
      }}
    />
  );
}
