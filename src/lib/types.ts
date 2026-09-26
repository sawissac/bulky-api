export type CallStatus = "idle" | "pending" | "success" | "error";

export type AuthInfo =
  | { type: "Bearer Token"; token: string }
  | { type: "Bearer (env)"; token: string }
  | { type: "Basic Auth"; username: string }
  | { type: "API Key"; header: string; key: string }
  | null;

export type SseEvent = {
  type: string;
  data: string;
  id?: string;
  ts: number;
};

/** One frame on a `api.ws`/`api.io` connection. Unlike `SseEvent` (server →
 *  client only), a socket is bidirectional, so `direction` carries what
 *  `SseEvent` never needed to. `event` is the Socket.IO event name;
 *  `"message"` for a raw WS text frame; `"open"` / `"close"` / `"error"` for
 *  connection lifecycle rows. */
export type WsEvent = {
  direction: "in" | "out" | "system";
  event?: string;
  data: string;
  ts: number;
};

export type Assertion = {
  ok: boolean;
  message: string;
  detail?: string;
};

/** One field of a multipart body, as stored on the call record — never the
 *  live `FormData`/`File`, which can't sit in Redux state or survive
 *  persistence. `file` is present only for a `File`/`Blob` field. */
export type RequestBodyPart = {
  key: string;
  value: string;
  file?: { name: string; size: number; type: string };
};

/** Serializable stand-in for a `FormData` or raw `Blob`/`File` request body —
 *  what `ApiCall.requestBody` holds instead of the live object. */
export type RequestBodySummary =
  | { kind: "multipart"; parts: RequestBodyPart[] }
  | { kind: "binary"; name: string; size: number; type: string };

export type ApiCall = {
  idx: number;
  method: string;
  url: string;
  urlExpr: string;
  status: CallStatus;
  statusCode: number | null;
  response: unknown;
  responseHeaders: Record<string, string>;
  requestBody: unknown;
  requestHeaders: Record<string, string>;
  authInfo: AuthInfo;
  duration: number;
  error: string | null;
  timestamp: string | null;
  cache: boolean;
  /** Position this call held in the run that produced it — the key the
   *  socket registry uses. Set only on records that actually ran, and
   *  differs from `idx` (the card's slot) once a selection run's calls are
   *  overlaid on the whole script's stubs. */
  runIdx?: number;
  /** A call the last run made beyond the script's stubs — a loop's later
   *  iterations, an `api.parallel` fan-out. Appended after the stubs by the
   *  run overlay and kept there by every re-merge until the next run starts,
   *  since no stub of its own can ever claim it. */
  extra?: boolean;
  note?: string;
  isSse?: boolean;
  sseEvents?: SseEvent[];
  isWs?: boolean;
  wsKind?: "ws" | "io";
  wsEvents?: WsEvent[];
  /** True while the connection is open — cleared on close/error. SSE has no
   *  equivalent (no separate "still open" signal beyond status/duration);
   *  the editor's socket composer needs this one to know when to show. */
  wsOpen?: boolean;
  assertions?: Assertion[];
  /** Set when a run ended with this call still `pending` — the script threw
   *  or was stopped before reaching it (a 404 body the next line can't read,
   *  say). The call is settled back to `idle`; the flag only changes what its
   *  card says. The next run's fresh stubs drop it. */
  skipped?: boolean;
};

export type LogEntry = {
  level: "log" | "warn" | "error" | "info";
  msg: string;
};
