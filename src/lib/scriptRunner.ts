import type {
  ApiCall,
  LogEntry,
  AuthInfo,
  SseEvent,
  WsEvent,
  Assertion,
} from "./types";
// Type-only — erased at compile time, so this doesn't pull socket.io-client
// into the bundle for scripts that never call `api.io`. The runtime import
// is a dynamic `await import(...)` inside `makeIoCall` instead.
import type { ManagerOptions, SocketOptions } from "socket.io-client";
import type { DbConnection } from "./sampleData";
import {
  connectionUrl,
  isConnectionUsable,
  sslOption,
} from "./dbConnection";
import { toRunnableJs } from "./transpile";
import { makeExpect } from "./assertions";
import { WAIT_METHOD, isWait, waitMs } from "./wait";
import { isRawBody, summarizeBody } from "./requestBody";

type OnUpdate = (calls: ApiCall[], logs: LogEntry[]) => void;

type CachedEntry = {
  statusCode: number | null;
  response: unknown;
  responseHeaders: Record<string, string>;
  duration: number;
  timestamp: string | null;
};

type CallOpts = {
  auth?: {
    type: string;
    token?: string;
    username?: string;
    password?: string;
    header?: string;
    key?: string;
  };
  headers?: Record<string, string>;
  /** Stream calls only (`api.sse`/`api.stream`/`api.server.*`) — the verb
   *  used to open the stream. Defaults to GET for `sse`, POST for `stream`. */
  method?: string;
  /** Stream calls only — JSON body sent with the request that opens the
   *  stream (an LLM chat/completions payload, typically). */
  body?: unknown;
};

/** Connection options for `api.query.pgsql`. Everything is optional — a script
 *  that keeps its connection string in the environment passes nothing. */
/** One entry of an `api.parallel` batch: a call already in flight, or a
 *  thunk that starts one when a worker picks it up. Only the thunk form can
 *  be throttled — a promise is already running by the time it is passed. */
type ParallelTask<T> = Promise<T> | (() => Promise<T>);

type ParallelOpts = {
  /** Most tasks in flight at once. Unset runs the whole batch together. */
  limit?: number;
};

type ParallelResults<T extends readonly ParallelTask<unknown>[]> = {
  -readonly [K in keyof T]: T[K] extends () => Promise<infer R>
    ? R
    : T[K] extends Promise<infer R>
      ? R
      : never;
};

type SqlOpts = {
  /** Name of a connection saved in the DB pane. Omit to use the collection's
   *  active connection; a name that matches none fails the call rather than
   *  quietly falling back to a different database. */
  db?: string;
  /** Raw connection string, bypassing the saved connections entirely. Takes
   *  precedence over `db`. `{{var}}` is resolved. */
  url?: string;
  /** TLS: `true` verifies the server certificate, `"no-verify"` encrypts
   *  without verifying it — what a managed Postgres behind a self-signed
   *  pooler certificate needs. Omit to let `sslmode` in the connection string
   *  decide. */
  ssl?: boolean | "no-verify";
  /** Postgres `statement_timeout` in ms for this query. @defaultValue 30000 */
  timeout?: number;
};

type SqlField = { name: string; dataTypeID: number };

type SqlResult<T = unknown> = {
  rows: T[];
  /** `null` for a statement that returns no row count (DDL, mostly). */
  rowCount: number | null;
  /** The statement's command tag — `SELECT`, `INSERT`, `UPDATE`, ... */
  command: string;
  fields: SqlField[];
  duration: number;
  /** Present only for a multi-statement batch, one entry per statement; the
   *  top-level fields then describe the last one. */
  statements?: Omit<SqlResult<T>, "duration" | "statements">[];
};

type StreamResult = {
  /** Aborts the stream early — same effect as the run itself being stopped. */
  close: () => void;
  /** Resolves once the stream ends (or fails), with everything received. */
  done: Promise<{ events: SseEvent[]; text: string; status: number | null }>;
};

type WsOpts = {
  /** Sub-protocol(s) for the WS handshake. Browsers can't set custom headers
   *  on a WebSocket upgrade request, so this is the only connection option. */
  protocols?: string | string[];
};

type IoOpts = Partial<ManagerOptions & SocketOptions>;

/** Live handle onto an open `api.ws`/`api.io` connection — returned to the
 *  script and, via `socketRegistry`, reachable from the UI's send composer. */
export type SocketHandle = {
  send: (data: string | object) => void;
  close: (code?: number, reason?: string) => void;
};

/** `api.io`'s handle adds `emit` for named Socket.IO events — `send` stays
 *  the lowest common denominator so the UI composer (which only ever sends
 *  plain text) works identically against either kind. */
type IoHandle = SocketHandle & {
  emit: (event: string, ...args: unknown[]) => void;
};

function buildAuthHeaders(
  opts: CallOpts,
  envVars: Record<string, string>,
): { authHeaders: Record<string, string>; authInfo: AuthInfo } {
  const authHeaders: Record<string, string> = {};
  let authInfo: AuthInfo = null;

  if (opts.auth) {
    const a = opts.auth;
    if (a.type === "bearer" && a.token) {
      authHeaders["Authorization"] = `Bearer ${a.token}`;
      authInfo = { type: "Bearer Token", token: a.token };
    } else if (a.type === "basic" && a.username && a.password) {
      authHeaders["Authorization"] =
        `Basic ${btoa(`${a.username}:${a.password}`)}`;
      authInfo = { type: "Basic Auth", username: a.username };
    } else if (a.type === "apikey" && a.key) {
      const header = a.header || "X-API-Key";
      authHeaders[header] = a.key;
      authInfo = { type: "API Key", header, key: a.key };
    }
  } else if (envVars.token) {
    authHeaders["Authorization"] = `Bearer ${envVars.token}`;
    authInfo = { type: "Bearer (env)", token: envVars.token };
  }

  return { authHeaders, authInfo };
}

/** Saved connections handed to a run so `api.query.pgsql` can resolve
 *  `opts.db` by name, and default to whichever one the DB pane has active. */
export type SqlConnections = {
  list: DbConnection[];
  active: DbConnection | null;
};

/** Last-resort connection string: environment variable names
 *  `api.query.pgsql` falls back to when the collection has no connection
 *  configured, compared with underscores stripped and case ignored — so
 *  `DATABASE_URL`, `databaseUrl` and `database_url` are all the same key. */
const PG_URL_KEYS = new Set([
  "databaseurl",
  "pgurl",
  "pgsqlurl",
  "postgresurl",
]);

/** The connection a call means: the one `db` names (by name, case- and
 *  space-insensitively, or by id), else whichever the DB pane has active.
 *  Returns null when nothing matches, which the caller reports differently
 *  depending on whether a name was asked for. */
function findConnection(
  connections: SqlConnections | undefined,
  db?: string,
): DbConnection | null {
  if (!db) return connections?.active ?? null;
  const key = db.trim().toLowerCase();
  return (
    (connections?.list ?? []).find(
      (c) => c.id === db || c.name.trim().toLowerCase() === key,
    ) ?? null
  );
}

function envPgUrl(envVars: Record<string, string>): string {
  for (const [key, value] of Object.entries(envVars)) {
    if (value && PG_URL_KEYS.has(key.replace(/_/g, "").toLowerCase())) {
      return value;
    }
  }
  return "";
}

/** `postgres://user@host:5432/db` — the password and any query string are
 *  dropped. A call record is persisted locally and synced to Supabase, so the
 *  connection string itself must never land on one. */
function describePgUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? `${u.username}@` : ""}${u.host}${u.pathname}`;
  } catch {
    return "postgres";
  }
}

/** One-line form of a statement — what a SQL call card shows where an HTTP one
 *  shows its URL. `analyzeScript` collapses the same way, so a literal
 *  statement's stub and its finished call pair up on this key. */
function collapseSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

export async function runScript(
  code: string,
  envVars: Record<string, string>,
  onUpdate: OnUpdate,
  waitForNext?: () => Promise<void>,
  responseCache?: Record<string, CachedEntry>,
  callTimeout?: number,
  abortSignal?: AbortSignal,
  socketRegistry?: Map<number, SocketHandle>,
  sqlConnections?: SqlConnections,
): Promise<{
  calls: ApiCall[];
  logs: LogEntry[];
  extractedVars: Record<string, string>;
  assertions: Assertion[];
}> {
  const calls: ApiCall[] = [];
  const logs: LogEntry[] = [];
  const mutableEnv: Record<string, string> = { ...envVars };

  // Expectations resolved before the first call land here, then move onto that
  // call once it exists; ones from a run that makes no calls stay here and are
  // still returned for the run summary.
  const pendingAssertions: Assertion[] = [];
  const allAssertions: Assertion[] = [];

  const recordAssertion = (a: Assertion) => {
    // The latest request, skipping `api.wait` steps — an expectation written
    // after a pause is still about the call before it.
    let target: ApiCall | undefined;
    for (let i = calls.length - 1; i >= 0 && !target; i--) {
      if (!isWait(calls[i])) target = calls[i];
    }
    if (target) (target.assertions ??= []).push(a);
    else pendingAssertions.push(a);
    allAssertions.push(a);
    logs.push({
      level: a.ok ? "info" : "error",
      msg: `${a.ok ? "✓" : "✗"} ${a.message}${a.detail ? ` — ${a.detail}` : ""}`,
    });
    onUpdate(
      calls.map((c) => ({ ...c })),
      [...logs],
    );
  };

  const expect = makeExpect(recordAssertion);

  const claimPending = (rec: ApiCall) => {
    if (pendingAssertions.length) {
      rec.assertions = [...(rec.assertions ?? []), ...pendingAssertions];
      pendingAssertions.length = 0;
    }
  };

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve, reject) => {
      if (abortSignal?.aborted) return reject(new Error("Script aborted"));
      const id = setTimeout(resolve, Math.max(0, Number(ms) || 0));
      abortSignal?.addEventListener(
        "abort",
        () => {
          clearTimeout(id);
          reject(new Error("Script aborted"));
        },
        { once: true },
      );
    });

  // `env` is a proxy so `env.x = v` and `env.set('x', v)` both write into
  // `mutableEnv`; `set` / `get` are surfaced without landing in the diff.
  const envProxy = new Proxy(mutableEnv, {
    get(target, prop) {
      if (typeof prop !== "string") return target[prop as unknown as string];
      if (prop === "set") {
        return (k: string, v: unknown) => {
          target[k] = v == null ? "" : String(v);
        };
      }
      if (prop === "get") return (k: string) => target[k];
      return target[prop];
    },
    set(target, prop, value) {
      if (typeof prop === "string") {
        target[prop] = value == null ? "" : String(value);
      }
      return true;
    },
  });

  // Preprocess // note: comments → api._note(...) calls, then strip types:
  // the buffer is TypeScript, the runtime executes JavaScript.
  const notedCode = code.replace(
    /^[ \t]*\/\/ note:(.+)$/gm,
    (_, msg) => `api._note(${JSON.stringify(msg.trim())});`,
  );

  let processedCode: string;
  try {
    processedCode = await toRunnableJs(notedCode);
  } catch (e) {
    logs.push({ level: "error", msg: `Script error: ${(e as Error).message}` });
    onUpdate([], [...logs]);
    return { calls, logs, extractedVars: {}, assertions: [] };
  }

  let pendingNote: string | null = null;

  const makeCall = async (
    method: string,
    url: string,
    body: unknown,
    opts: CallOpts = {},
    isServer = false,
  ) => {
    if (abortSignal?.aborted) throw new Error("Script aborted");

    const resolved = url.replace(
      /\{\{(\w+)\}\}/g,
      (_, k) => mutableEnv[k] ?? `{{${k}}}`,
    );
    const { authHeaders, authInfo } = buildAuthHeaders(opts, mutableEnv);

    // A FormData/File/Blob body — from `api.form()` or `api.file()` — is sent
    // to `fetch` as-is; JSON-encoding it would turn the file into "[object
    // File]". Only its (serializable) shape is kept on the call record.
    const rawBody = isRawBody(body);
    const methodSendsBody = !["GET", "HEAD", "OPTIONS"].includes(
      method.toUpperCase(),
    );
    const hasBody = Boolean(body) && methodSendsBody;

    const reqHeaders: Record<string, string> = {
      // Force JSON only when we're the one encoding the body — a raw body
      // sets its own Content-Type (the multipart boundary, for FormData).
      ...(rawBody ? {} : { "Content-Type": "application/json" }),
      ...authHeaders,
      ...(opts.headers || {}),
    };

    const rec: ApiCall = {
      idx: calls.length,
      method: method.toUpperCase(),
      url: resolved,
      urlExpr: url,
      status: "pending",
      statusCode: null,
      response: null,
      responseHeaders: {},
      requestBody: rawBody ? summarizeBody(body) : body,
      requestHeaders: reqHeaders,
      authInfo,
      duration: 0,
      error: null,
      timestamp: new Date().toISOString(),
      cache: false,
      note: pendingNote ?? undefined,
    };
    pendingNote = null;

    calls.push(rec);
    claimPending(rec);
    onUpdate(
      calls.map((c) => ({ ...c })),
      [...logs],
    );

    if (waitForNext) await waitForNext();
    if (abortSignal?.aborted) throw new Error("Script aborted");

    // Cache lookup
    const cacheKey = `${method.toUpperCase()}::${resolved}`;
    if (responseCache && cacheKey in responseCache) {
      const cached = responseCache[cacheKey];
      rec.statusCode = cached.statusCode;
      rec.status =
        cached.statusCode !== null &&
        cached.statusCode >= 200 &&
        cached.statusCode < 300
          ? "success"
          : "error";
      rec.response = cached.response;
      rec.responseHeaders = cached.responseHeaders;
      rec.duration = cached.duration;
      rec.timestamp = cached.timestamp;
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
      return {
        data: cached.response,
        status: cached.statusCode ?? 0,
        headers: cached.responseHeaders,
        ok: rec.status === "success",
      };
    }

    const t0 = Date.now();
    const controller = new AbortController();

    // Link to both callTimeout and external abortSignal
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    if (callTimeout && callTimeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, callTimeout);
    }
    abortSignal?.addEventListener("abort", () => controller.abort(), {
      once: true,
    });

    try {
      const fo: RequestInit = {
        method: method.toUpperCase(),
        headers: reqHeaders,
        signal: controller.signal,
      };
      if (hasBody) {
        fo.body = rawBody ? (body as FormData | Blob) : JSON.stringify(body);
      }

      let res: Response;
      let text: string;
      let headers: Record<string, string> = {};
      let isOk: boolean;

      if (isServer && rawBody) {
        // Stream the FormData/Blob straight through — re-encoding a file as
        // JSON would lose its bytes. The target lands in custom headers
        // because the outer Content-Type has to stay whatever the body itself
        // declares (the multipart boundary, for FormData).
        res = await fetch("/api/proxy", {
          method: "POST",
          headers: {
            "X-Proxy-Url": resolved,
            "X-Proxy-Method": method.toUpperCase(),
            "X-Proxy-Headers": encodeURIComponent(JSON.stringify(reqHeaders)),
          },
          body: body as FormData | Blob,
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Proxy error: ${res.statusText}`);

        const proxyData = await res.json();
        if (proxyData.error) throw new Error(proxyData.error);

        text = proxyData.data;
        headers = proxyData.headers || {};
        isOk = proxyData.status >= 200 && proxyData.status < 300;

        Object.defineProperty(res, "status", { value: proxyData.status });
        Object.defineProperty(res, "ok", { value: isOk });
      } else if (isServer) {
        res = await fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: method.toUpperCase(),
            url: resolved,
            headers: reqHeaders,
            body: hasBody ? body : undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Proxy error: ${res.statusText}`);

        const proxyData = await res.json();
        if (proxyData.error) throw new Error(proxyData.error);

        text = proxyData.data;
        headers = proxyData.headers || {};
        isOk = proxyData.status >= 200 && proxyData.status < 300;

        Object.defineProperty(res, "status", { value: proxyData.status });
        Object.defineProperty(res, "ok", { value: isOk });
      } else {
        res = await fetch(resolved, fo);
        text = await res.text();
        headers = Object.fromEntries([...res.headers.entries()]);
        isOk = res.ok;
      }

      if (timeoutId) clearTimeout(timeoutId);

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      rec.statusCode = res.status;
      rec.status = isOk ? "success" : "error";
      rec.response = data;
      rec.responseHeaders = headers;
      rec.duration = Date.now() - t0;
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
      return {
        data,
        status: res.status,
        headers: rec.responseHeaders,
        ok: isOk,
      };
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      rec.status = "error";
      rec.duration = Date.now() - t0;
      if (abortSignal?.aborted && !timedOut) {
        rec.error = "Aborted by user";
        onUpdate(
          calls.map((c) => ({ ...c })),
          [...logs],
        );
        throw new Error("Script aborted");
      }
      if (timedOut || (e as Error).name === "AbortError") {
        rec.error = `Timeout: call exceeded ${callTimeout}ms`;
        onUpdate(
          calls.map((c) => ({ ...c })),
          [...logs],
        );
        throw new Error(
          `Call to ${resolved} timed out after ${callTimeout}ms — script stopped`,
        );
      }
      rec.error = (e as Error).message;
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
      throw e;
    }
  };

  // Shared by `api.sse` / `api.stream` / their `api.server.*` counterparts.
  // `method` + `body` let a stream open with a POST and a JSON payload (an
  // LLM chat/completions call, typically) rather than only a bare GET; each
  // parsed SSE frame lands on `rec.sseEvents` and fires `onUpdate` as it
  // arrives, so the response panel renders tokens live instead of waiting for
  // the connection to close. `isServer` routes through `/api/proxy` with the
  // `X-Proxy-Stream` header so `proxyPassthrough` pipes the upstream body
  // straight through instead of buffering it — use it wherever CORS would
  // otherwise block calling the host directly.
  const makeStreamCall = async (
    method: string,
    url: string,
    body: unknown,
    opts: CallOpts = {},
    isServer = false,
    onEvent: (event: {
      type: string;
      data: string;
      id?: string;
    }) => void = () => {},
  ): Promise<StreamResult> => {
    if (abortSignal?.aborted) throw new Error("Script aborted");

    const resolved = url.replace(
      /\{\{(\w+)\}\}/g,
      (_, k) => mutableEnv[k] ?? `{{${k}}}`,
    );
    const { authHeaders, authInfo } = buildAuthHeaders(opts, mutableEnv);

    const M = method.toUpperCase();
    const sendsBody = body != null && !["GET", "HEAD", "OPTIONS"].includes(M);

    const reqHeaders: Record<string, string> = {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      ...(sendsBody ? { "Content-Type": "application/json" } : {}),
      ...authHeaders,
      ...(opts.headers || {}),
    };

    const rec: ApiCall = {
      idx: calls.length,
      // GET stays labelled "SSE" (matches the original api.sse() display);
      // any other verb shows as itself so a streamed POST reads as POST.
      method: M === "GET" ? "SSE" : M,
      url: resolved,
      urlExpr: url,
      status: "pending",
      statusCode: null,
      response: null,
      responseHeaders: {},
      requestBody: sendsBody ? body : null,
      requestHeaders: reqHeaders,
      authInfo,
      duration: 0,
      error: null,
      timestamp: new Date().toISOString(),
      cache: false,
      note: pendingNote ?? undefined,
      isSse: true,
      sseEvents: [],
    };
    pendingNote = null;

    calls.push(rec);
    claimPending(rec);
    onUpdate(
      calls.map((c) => ({ ...c })),
      [...logs],
    );

    if (waitForNext) await waitForNext();
    if (abortSignal?.aborted) throw new Error("Script aborted");

    const t0 = Date.now();
    const controller = new AbortController();
    abortSignal?.addEventListener("abort", () => controller.abort(), {
      once: true,
    });

    let resolveDone!: (v: {
      events: SseEvent[];
      text: string;
      status: number | null;
    }) => void;
    const done = new Promise<{
      events: SseEvent[];
      text: string;
      status: number | null;
    }>((resolve) => {
      resolveDone = resolve;
    });
    const settle = () =>
      resolveDone({
        events: rec.sseEvents ?? [],
        text: (rec.sseEvents ?? []).map((e) => e.data).join(""),
        status: rec.statusCode,
      });

    try {
      let res: Response;
      if (isServer) {
        res = await fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Proxy-Stream": "1" },
          body: JSON.stringify({
            method: M,
            url: resolved,
            headers: reqHeaders,
            body: sendsBody ? body : undefined,
          }),
          signal: controller.signal,
        });
        // Real upstream status rides in this header — the outer fetch's own
        // `status` is the proxy's own (already == upstream's, but pinning it
        // explicitly keeps `rec.statusCode` correct if that ever changes).
        const proxyStatus = res.headers.get("x-proxy-status");
        if (proxyStatus) {
          Object.defineProperty(res, "status", {
            value: Number(proxyStatus),
            configurable: true,
          });
        }
      } else {
        res = await fetch(resolved, {
          method: M,
          headers: reqHeaders,
          body: sendsBody ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      }

      rec.statusCode = res.status;
      rec.responseHeaders = Object.fromEntries([...res.headers.entries()]);

      if (!res.ok || !res.body) {
        rec.status = "error";
        rec.error = !res.ok ? `HTTP ${res.status}` : "No response body";
        rec.duration = Date.now() - t0;
        onUpdate(
          calls.map((c) => ({ ...c })),
          [...logs],
        );
        settle();
        return { close: () => {}, done };
      }

      rec.status = "success";
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const flushBuf = () => {
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          if (!block.trim()) continue;
          let type = "message";
          let data = "";
          let id: string | undefined;
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) type = line.slice(6).trim();
            else if (line.startsWith("data:"))
              data += (data ? "\n" : "") + line.slice(5).trim();
            else if (line.startsWith("id:")) id = line.slice(3).trim();
          }
          const ev: SseEvent = { type, data, id, ts: Date.now() };
          rec.sseEvents = [...(rec.sseEvents ?? []), ev];
          onUpdate(
            calls.map((c) => ({ ...c })),
            [...logs],
          );
          onEvent({ type, data, id });
        }
      };

      (async () => {
        try {
          for (;;) {
            const { done: rdDone, value } = await reader.read();
            if (rdDone) break;
            buf += decoder.decode(value, { stream: true });
            flushBuf();
          }
          if (buf.trim()) {
            buf += "\n\n";
            flushBuf();
          }
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            rec.error = (e as Error).message;
          }
        } finally {
          rec.duration = Date.now() - t0;
          onUpdate(
            calls.map((c) => ({ ...c })),
            [...logs],
          );
          settle();
        }
      })();

      return {
        close: () => {
          controller.abort();
        },
        done,
      };
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        settle();
        return { close: () => {}, done };
      }
      rec.status = "error";
      rec.error = (e as Error).message;
      rec.duration = Date.now() - t0;
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
      settle();
      return { close: () => {}, done };
    }
  };

  const makeSseCall = (
    url: string,
    opts: CallOpts = {},
    onEvent?: (event: { type: string; data: string; id?: string }) => void,
    isServer = false,
  ): Promise<StreamResult> =>
    makeStreamCall(
      opts.method ?? "GET",
      url,
      opts.body ?? null,
      opts,
      isServer,
      onEvent,
    );

  const makeStreamShorthand = (
    url: string,
    body: unknown,
    opts: CallOpts = {},
    onEvent?: (event: { type: string; data: string; id?: string }) => void,
    isServer = false,
  ): Promise<StreamResult> =>
    makeStreamCall(
      opts.method ?? (body != null ? "POST" : "GET"),
      url,
      body ?? opts.body ?? null,
      opts,
      isServer,
      onEvent,
    );

  // Shared by `api.ws` / `api.io`. Unlike a fetch-based stream, a socket is
  // bidirectional and long-lived beyond any single request/response — so
  // instead of a `done` promise resolved after the body finishes, this
  // resolves (or rejects) once the connection opens (or fails to), handing
  // back a `SocketHandle` the script keeps using for the rest of the run —
  // and, via `socketRegistry`, that the UI's send composer can reach too.
  const pushWsEvent = (
    rec: ApiCall,
    direction: WsEvent["direction"],
    data: string,
    event?: string,
  ) => {
    rec.wsEvents = [...(rec.wsEvents ?? []), { direction, data, event, ts: Date.now() }];
    onUpdate(
      calls.map((c) => ({ ...c })),
      [...logs],
    );
  };

  const makeSocketCall = (
    url: string,
    opts: WsOpts = {},
  ): Promise<SocketHandle> => {
    if (abortSignal?.aborted) return Promise.reject(new Error("Script aborted"));

    const resolved = url.replace(
      /\{\{(\w+)\}\}/g,
      (_, k) => mutableEnv[k] ?? `{{${k}}}`,
    );

    const rec: ApiCall = {
      idx: calls.length,
      method: "WS",
      url: resolved,
      urlExpr: url,
      status: "pending",
      statusCode: null,
      response: null,
      responseHeaders: {},
      requestBody: null,
      requestHeaders: {},
      authInfo: null,
      duration: 0,
      error: null,
      timestamp: new Date().toISOString(),
      cache: false,
      note: pendingNote ?? undefined,
      isWs: true,
      wsKind: "ws",
      wsEvents: [],
      wsOpen: false,
    };
    pendingNote = null;

    calls.push(rec);
    claimPending(rec);
    onUpdate(
      calls.map((c) => ({ ...c })),
      [...logs],
    );

    const t0 = Date.now();

    return new Promise((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(resolved, opts.protocols);
      } catch (e) {
        rec.status = "error";
        rec.error = (e as Error).message;
        onUpdate(
          calls.map((c) => ({ ...c })),
          [...logs],
        );
        reject(e as Error);
        return;
      }

      const onAbort = () => ws.close();
      abortSignal?.addEventListener("abort", onAbort, { once: true });

      ws.addEventListener("open", () => {
        rec.status = "success";
        rec.wsOpen = true;
        pushWsEvent(rec, "system", "Connected", "open");

        const handle: SocketHandle = {
          send: (data) => {
            const text = typeof data === "string" ? data : JSON.stringify(data);
            ws.send(text);
            pushWsEvent(rec, "out", text, "message");
          },
          close: (code, reason) => ws.close(code, reason),
        };
        socketRegistry?.set(rec.idx, handle);
        if (!settled) {
          settled = true;
          resolve(handle);
        }
      });

      ws.addEventListener("message", (ev) => {
        const text = typeof ev.data === "string" ? ev.data : "[binary data]";
        pushWsEvent(rec, "in", text, "message");
      });

      ws.addEventListener("error", () => {
        pushWsEvent(rec, "system", "Connection error", "error");
        if (!settled) {
          settled = true;
          rec.status = "error";
          rec.error = `WebSocket error connecting to ${resolved}`;
          onUpdate(
            calls.map((c) => ({ ...c })),
            [...logs],
          );
          reject(new Error(rec.error));
        }
      });

      ws.addEventListener("close", (ev) => {
        abortSignal?.removeEventListener("abort", onAbort);
        socketRegistry?.delete(rec.idx);
        rec.wsOpen = false;
        rec.duration = Date.now() - t0;
        if (rec.status === "pending") rec.status = "error";
        pushWsEvent(rec, "system", `Disconnected (code ${ev.code})`, "close");
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket closed before opening (code ${ev.code})`));
        }
      });
    });
  };

  const makeIoCall = async (
    url: string,
    opts: IoOpts = {},
    onEvent?: (event: { event: string; data: unknown }) => void,
  ): Promise<IoHandle> => {
    if (abortSignal?.aborted) throw new Error("Script aborted");

    const resolved = url.replace(
      /\{\{(\w+)\}\}/g,
      (_, k) => mutableEnv[k] ?? `{{${k}}}`,
    );

    const rec: ApiCall = {
      idx: calls.length,
      method: "IO",
      url: resolved,
      urlExpr: url,
      status: "pending",
      statusCode: null,
      response: null,
      responseHeaders: {},
      requestBody: null,
      requestHeaders: {},
      authInfo: null,
      duration: 0,
      error: null,
      timestamp: new Date().toISOString(),
      cache: false,
      note: pendingNote ?? undefined,
      isWs: true,
      wsKind: "io",
      wsEvents: [],
      wsOpen: false,
    };
    pendingNote = null;

    calls.push(rec);
    claimPending(rec);
    onUpdate(
      calls.map((c) => ({ ...c })),
      [...logs],
    );

    const t0 = Date.now();
    const { io } = await import("socket.io-client");

    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = io(resolved, opts);

      const onAbort = () => socket.close();
      abortSignal?.addEventListener("abort", onAbort, { once: true });

      const fmtArgs = (args: unknown[]) =>
        args.length === 1 && typeof args[0] === "string"
          ? args[0]
          : args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");

      socket.onAny((event: string, ...args: unknown[]) => {
        pushWsEvent(rec, "in", fmtArgs(args), event);
        onEvent?.({ event, data: args.length === 1 ? args[0] : args });
      });

      socket.on("connect", () => {
        rec.status = "success";
        rec.wsOpen = true;
        pushWsEvent(rec, "system", "Connected", "connect");

        const emit = (event: string, ...args: unknown[]) => {
          socket.emit(event, ...args);
          pushWsEvent(rec, "out", fmtArgs(args), event);
        };
        const handle: SocketHandle & { emit: typeof emit } = {
          send: (data) => emit("message", data),
          close: () => socket.close(),
          emit,
        };
        socketRegistry?.set(rec.idx, handle);
        if (!settled) {
          settled = true;
          resolve(handle);
        }
      });

      socket.on("connect_error", (err: Error) => {
        pushWsEvent(rec, "system", `Connection error: ${err.message}`, "connect_error");
        if (!settled) {
          settled = true;
          rec.status = "error";
          rec.error = err.message;
          onUpdate(
            calls.map((c) => ({ ...c })),
            [...logs],
          );
          reject(err);
        }
      });

      socket.on("disconnect", (reason: string) => {
        abortSignal?.removeEventListener("abort", onAbort);
        socketRegistry?.delete(rec.idx);
        rec.wsOpen = false;
        rec.duration = Date.now() - t0;
        pushWsEvent(rec, "system", `Disconnected: ${reason}`, "disconnect");
        onUpdate(
          calls.map((c) => ({ ...c })),
          [...logs],
        );
      });
    });
  };

  // `api.query.pgsql`. A browser can't speak the Postgres wire protocol, so
  // unlike an HTTP call — which only detours through the proxy when CORS
  // demands it — every query goes to `/api/query/pgsql`, which holds the
  // pooled `pg` connections. The statement is never interpolated: `{{var}}`
  // is resolved in the connection string only, and values belong in `params`
  // (`$1`, `$2`, ...) so the driver binds them out of band. A failed query
  // throws rather than resolving with an `ok: false`, the way every Postgres
  // client behaves — there is no in-band error status to hand back the way an
  // HTTP 500 is still a response.
  const makeSqlCall = async <T = unknown>(
    sql: string,
    params?: unknown[],
    opts: SqlOpts = {},
  ): Promise<SqlResult<T>> => {
    if (abortSignal?.aborted) throw new Error("Script aborted");

    // Resolution can fail (a `db` naming no saved connection, nothing
    // configured at all), but the failure is carried rather than thrown until
    // the record exists — a query that never reached Postgres still deserves
    // a card saying why.
    let connUrl = "";
    let ssl = opts.ssl;
    let resolveError: string | null = null;

    if (opts.url) {
      connUrl = opts.url;
    } else {
      const conn = findConnection(sqlConnections, opts.db);
      if (conn) {
        if (isConnectionUsable(conn)) {
          connUrl = connectionUrl(conn);
          ssl = opts.ssl ?? sslOption(conn);
        } else {
          resolveError = `Connection "${conn.name}" needs a host and a database — set them in the DB pane`;
        }
      } else if (opts.db) {
        resolveError = `No saved connection named "${opts.db}"`;
      } else {
        connUrl = envPgUrl(mutableEnv);
        if (!connUrl) {
          resolveError =
            "No Postgres connection — add one in the DB pane, or pass opts.url";
        }
      }
    }

    connUrl = connUrl.replace(
      /\{\{(\w+)\}\}/g,
      (_, k) => mutableEnv[k] ?? `{{${k}}}`,
    );
    const display = collapseSql(sql);

    const rec: ApiCall = {
      idx: calls.length,
      method: "PGSQL",
      url: display,
      urlExpr: display,
      status: "pending",
      statusCode: null,
      response: null,
      responseHeaders: {},
      requestBody: {
        database: describePgUrl(connUrl),
        sql,
        params: params ?? [],
      },
      requestHeaders: {},
      authInfo: null,
      duration: 0,
      error: null,
      timestamp: new Date().toISOString(),
      cache: false,
      note: pendingNote ?? undefined,
    };
    pendingNote = null;

    calls.push(rec);
    claimPending(rec);
    onUpdate(
      calls.map((c) => ({ ...c })),
      [...logs],
    );

    if (waitForNext) await waitForNext();
    if (abortSignal?.aborted) throw new Error("Script aborted");

    const cacheKey = `PGSQL::${display}`;
    if (responseCache && cacheKey in responseCache) {
      const cached = responseCache[cacheKey];
      rec.statusCode = cached.statusCode;
      rec.status = "success";
      rec.response = cached.response;
      rec.duration = cached.duration;
      rec.timestamp = cached.timestamp;
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
      return {
        ...(cached.response as SqlResult<T>),
        duration: cached.duration,
      };
    }

    const t0 = Date.now();
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    if (callTimeout && callTimeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, callTimeout);
    }
    abortSignal?.addEventListener("abort", () => controller.abort(), {
      once: true,
    });

    try {
      if (resolveError) throw new Error(resolveError);

      const res = await fetch("/api/query/pgsql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: connUrl,
          sql,
          params: params ?? [],
          ssl,
          // The route caps its own statement timeout; passing the run's
          // per-call timeout keeps Postgres from working on a statement this
          // side has already given up waiting for.
          timeout: opts.timeout ?? (callTimeout || undefined),
        }),
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);
      const payload = await res.json();

      if (!res.ok || payload.error) {
        rec.statusCode = res.status;
        rec.status = "error";
        rec.response = payload;
        rec.error = payload.error || `Query failed: ${res.statusText}`;
        rec.duration = Date.now() - t0;
        onUpdate(
          calls.map((c) => ({ ...c })),
          [...logs],
        );
        throw new Error(rec.error as string);
      }

      rec.statusCode = res.status;
      rec.status = "success";
      rec.response = {
        command: payload.command,
        rowCount: payload.rowCount,
        rows: payload.rows,
        fields: payload.fields,
        ...(payload.statements ? { statements: payload.statements } : {}),
      };
      rec.duration = Date.now() - t0;
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
      return { ...(rec.response as SqlResult<T>), duration: rec.duration };
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      if (rec.status !== "error") {
        rec.status = "error";
        rec.duration = Date.now() - t0;
        if (abortSignal?.aborted && !timedOut) {
          rec.error = "Aborted by user";
          onUpdate(
            calls.map((c) => ({ ...c })),
            [...logs],
          );
          throw new Error("Script aborted");
        }
        if (timedOut || (e as Error).name === "AbortError") {
          rec.error = `Timeout: query exceeded ${callTimeout}ms`;
          onUpdate(
            calls.map((c) => ({ ...c })),
            [...logs],
          );
          throw new Error(
            `Query timed out after ${callTimeout}ms — script stopped`,
          );
        }
        rec.error = (e as Error).message;
        onUpdate(
          calls.map((c) => ({ ...c })),
          [...logs],
        );
      }
      throw e;
    }
  };

  // Runs a batch of calls concurrently and resolves with their results in
  // input order, like `Promise.all`. Each call still lands its own card the
  // moment it starts, so the panel shows them filling in side by side. With
  // `limit`, thunks are handed to that many workers and started as slots
  // free up — the way to fan out over a list without hammering the host.
  const parallel = async <T extends readonly ParallelTask<unknown>[] | []>(
    tasks: T,
    opts: ParallelOpts = {},
  ): Promise<ParallelResults<T>> => {
    if (abortSignal?.aborted) throw new Error("Script aborted");
    const total = tasks.length;
    const limit = Math.min(
      total,
      Math.max(1, Math.floor(Number(opts.limit) || total)),
    );
    const results = new Array<unknown>(total);
    let next = 0;
    const worker = async () => {
      while (next < total) {
        const i = next++;
        const task = tasks[i] as ParallelTask<unknown>;
        results[i] = await (typeof task === "function" ? task() : task);
      }
    };
    await Promise.all(Array.from({ length: limit }, worker));
    return results as ParallelResults<T>;
  };

  // `api.wait` — the global `sleep`, but recorded as its own step (method
  // `WAIT`, planned ms in `url`) so the Call Script panel and waterfall show
  // where the run spent time between requests. Takes no step-mode pause and
  // no queued assertions; a `// note:` above it labels the wait itself.
  const makeWait = async (ms: unknown): Promise<void> => {
    if (abortSignal?.aborted) throw new Error("Script aborted");
    const pause = waitMs(ms);
    const rec: ApiCall = {
      idx: calls.length,
      method: WAIT_METHOD,
      url: String(pause),
      urlExpr: String(pause),
      status: "pending",
      statusCode: null,
      response: null,
      responseHeaders: {},
      requestBody: null,
      requestHeaders: {},
      authInfo: null,
      duration: 0,
      error: null,
      timestamp: new Date().toISOString(),
      cache: false,
      note: pendingNote ?? undefined,
    };
    pendingNote = null;
    calls.push(rec);
    onUpdate(
      calls.map((c) => ({ ...c })),
      [...logs],
    );

    const t0 = Date.now();
    try {
      await sleep(pause);
      rec.status = "success";
    } catch (e) {
      rec.status = "error";
      rec.error = "Aborted by user";
      throw e;
    } finally {
      rec.duration = Date.now() - t0;
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
    }
  };

  const api = {
    get: (url: string, opts?: CallOpts) =>
      makeCall("GET", url, null, opts, false),
    post: (url: string, body: unknown, opts?: CallOpts) =>
      makeCall("POST", url, body, opts, false),
    put: (url: string, body: unknown, opts?: CallOpts) =>
      makeCall("PUT", url, body, opts, false),
    patch: (url: string, body: unknown, opts?: CallOpts) =>
      makeCall("PATCH", url, body, opts, false),
    delete: (url: string, opts?: CallOpts) =>
      makeCall("DELETE", url, null, opts, false),
    options: (url: string, opts?: CallOpts) =>
      makeCall("OPTIONS", url, null, opts, false),
    head: (url: string, opts?: CallOpts) =>
      makeCall("HEAD", url, null, opts, false),
    sse: (
      url: string,
      opts?: CallOpts,
      onEvent?: (event: { type: string; data: string; id?: string }) => void,
    ) => makeSseCall(url, opts, onEvent),
    // POST (by default) a JSON body and stream the `text/event-stream` reply
    // live — an LLM chat/completions call, typically. Same live rendering as
    // `sse`, plus a body. Direct fetch: use `api.server.stream` instead when
    // the target blocks browser CORS (most hosted LLM APIs do).
    stream: (
      url: string,
      body?: unknown,
      opts?: CallOpts,
      onEvent?: (event: { type: string; data: string; id?: string }) => void,
    ) => makeStreamShorthand(url, body, opts, onEvent),
    // Native WebSocket. Resolves once the connection opens (rejects if it
    // fails to), handing back `{ send, close }` — keep using it for the rest
    // of the run. Every inbound/outbound/lifecycle frame also streams into
    // the response panel live, same as `sse`/`stream`. Connects directly —
    // there's no `api.server.ws`, since a browser WebSocket doesn't hit CORS
    // the way `fetch` does, so there's nothing to route around the proxy for.
    ws: (url: string, opts?: WsOpts) => makeSocketCall(url, opts),
    // Socket.IO client. Same shape as `ws`, plus `emit(event, ...args)` for
    // named events — `send(data)` is sugar for `emit('message', data)`.
    io: (
      url: string,
      opts?: IoOpts,
      onEvent?: (event: { event: string; data: unknown }) => void,
    ) => makeIoCall(url, opts, onEvent),
    parallel,
    // Pause between calls — polling a job until it finishes, pacing a
    // rate-limited host. Rejects at once when the run is stopped instead of
    // holding Stop hostage, and leaves a step in the timeline (see makeWait).
    wait: (ms: number) => makeWait(ms),
    _note: (msg: string) => {
      pendingNote = msg;
    },
    assert: (condition: unknown, message?: string) => {
      recordAssertion({
        ok: Boolean(condition),
        message: message || "assertion",
        detail: condition ? undefined : "value was falsy",
      });
    },
    file: (accept?: string): Promise<File> => {
      if (abortSignal?.aborted) return Promise.reject(new Error("Script aborted"));
      return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        if (accept) input.accept = accept;
        input.onchange = () => {
          const picked = input.files?.[0];
          if (picked) resolve(picked);
          else reject(new Error("No file selected"));
        };
        // Chromium fires `cancel` when the picker is dismissed with no file;
        // other engines just never resolve, same as any picker the user backs
        // out of.
        input.oncancel = () => reject(new Error("No file selected"));
        input.click();
      });
    },
    // Raw database queries. Namespaced rather than sitting beside the HTTP
    // verbs so a second driver reads as `api.query.<driver>` when one lands.
    query: {
      pgsql: <T = unknown>(sql: string, params?: unknown[], opts?: SqlOpts) =>
        makeSqlCall<T>(sql, params, opts),
    },
    form: (fields: Record<string, unknown>): FormData => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        data.append(key, value instanceof Blob ? value : String(value));
      }
      return data;
    },
    server: {
      get: (url: string, opts?: CallOpts) =>
        makeCall("GET", url, null, opts, true),
      post: (url: string, body: unknown, opts?: CallOpts) =>
        makeCall("POST", url, body, opts, true),
      put: (url: string, body: unknown, opts?: CallOpts) =>
        makeCall("PUT", url, body, opts, true),
      patch: (url: string, body: unknown, opts?: CallOpts) =>
        makeCall("PATCH", url, body, opts, true),
      delete: (url: string, opts?: CallOpts) =>
        makeCall("DELETE", url, null, opts, true),
      options: (url: string, opts?: CallOpts) =>
        makeCall("OPTIONS", url, null, opts, true),
      head: (url: string, opts?: CallOpts) =>
        makeCall("HEAD", url, null, opts, true),
      sse: (
        url: string,
        opts?: CallOpts,
        onEvent?: (event: { type: string; data: string; id?: string }) => void,
      ) => makeSseCall(url, opts, onEvent, true),
      // The proxied counterpart of `api.stream` — routes through
      // `/api/proxy` (`proxyPassthrough`) so a CORS-blocked LLM host still
      // streams live instead of failing or requiring a buffered response.
      stream: (
        url: string,
        body?: unknown,
        opts?: CallOpts,
        onEvent?: (event: { type: string; data: string; id?: string }) => void,
      ) => makeStreamShorthand(url, body, opts, onEvent, true),
    },
  };

  const fmt = (a: unknown[]) =>
    a
      .map((x) =>
        typeof x === "object" ? JSON.stringify(x, null, 2) : String(x),
      )
      .join(" ");

  const con = {
    log: (...a: unknown[]) => {
      logs.push({ level: "log", msg: fmt(a) });
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
    },
    error: (...a: unknown[]) => {
      logs.push({ level: "error", msg: fmt(a) });
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
    },
    warn: (...a: unknown[]) => {
      logs.push({ level: "warn", msg: fmt(a) });
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
    },
    info: (...a: unknown[]) => {
      logs.push({ level: "info", msg: fmt(a) });
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
    },
  };

  try {
    // Lazy — same reasoning as `socket.io-client` above: keeps lodash out of
    // the main bundle, pulled in only once a script actually runs. `default`
    // is the full `LoDashStatic` (CJS `module.exports = _`, via esModuleInterop).
    const lodash = (await import("lodash")).default;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const AF = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (...fArgs: unknown[]) => Promise<void>;
    await new AF(
      "api",
      "env",
      "console",
      "sleep",
      "expect",
      "lodash",
      processedCode,
    )(api, envProxy, con, sleep, expect, lodash);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg !== "Script aborted") {
      logs.push({ level: "error", msg: `Script error: ${msg}` });
      onUpdate(
        calls.map((c) => ({ ...c })),
        [...logs],
      );
    }
  }

  const extractedVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(mutableEnv)) {
    if (String(v) !== String(envVars[k] ?? "")) {
      extractedVars[k] = String(v);
    }
  }

  return { calls, logs, extractedVars, assertions: allAssertions };
}
