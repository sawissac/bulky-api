export type StorageKind = "local" | "session" | "cookie";

/** One key/value pair read from a store. */
export type StorageEntry = {
  /** Unique within its store — the key itself, suffixed `~2`, `~3`… when a
   *  cookie name repeats (same name set on different paths or domains). */
  id: string;
  key: string;
  value: string;
  /** UTF-8 size of key plus value. */
  bytes: number;
};

export type StoreSnapshot = { entries: StorageEntry[]; error: string | null };

export type StorageSnapshot = Record<StorageKind, StoreSnapshot> & { origin: string };

/** One create or update, as {@link writeStorageEntry} applies it. */
export type StorageWrite = {
  kind: StorageKind;
  key: string;
  value: string;
  /** The entry's key before an edit — a different `key` renames it. Unset
   *  when creating. */
  previousKey?: string;
  /** Cookie lifetime in seconds; `null` or unset makes a session cookie.
   *  Ignored by local and session storage. */
  maxAge?: number | null;
};

const BLOCKED_MESSAGE =
  "The browser blocked access to this store — site data is disabled or this is a private window.";

/** Browsers cap one cookie's name plus value at 4096 bytes. */
const COOKIE_MAX_BYTES = 4096;

function webStorage(kind: "local" | "session"): Storage {
  return kind === "local" ? window.localStorage : window.sessionStorage;
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function toEntry(id: string, key: string, value: string): StorageEntry {
  return { id, key, value, bytes: utf8Length(key) + utf8Length(value) };
}

function byKey(a: StorageEntry, b: StorageEntry): number {
  return a.key.localeCompare(b.key);
}

function readWebStorage(kind: "local" | "session"): StoreSnapshot {
  try {
    const store = webStorage(kind);
    const entries: StorageEntry[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null) entries.push(toEntry(key, key, store.getItem(key) ?? ""));
    }
    return { entries: entries.sort(byKey), error: null };
  } catch {
    return { entries: [], error: BLOCKED_MESSAGE };
  }
}

/** Parses `document.cookie` as the browser hands it over: `name=value` pairs,
 *  values left exactly as stored (not URL-decoded). A pair with no `=` is a
 *  nameless cookie, listed under an empty key. */
function readCookies(): StoreSnapshot {
  try {
    const seen = new Map<string, number>();
    const entries = document.cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((pair) => {
        const eq = pair.indexOf("=");
        const key = eq === -1 ? "" : pair.slice(0, eq);
        const value = eq === -1 ? pair : pair.slice(eq + 1);
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        return toEntry(n === 1 ? key : `${key}~${n}`, key, value);
      });
    return { entries: entries.sort(byKey), error: null };
  } catch {
    return { entries: [], error: BLOCKED_MESSAGE };
  }
}

function readStore(kind: StorageKind): StoreSnapshot {
  return kind === "cookie" ? readCookies() : readWebStorage(kind);
}

/**
 * Reads local storage, session storage and script-visible cookies for this
 * app's origin in one pass. A store the browser refuses to open comes back
 * empty with its `error` set; the other two are unaffected. Client-only.
 */
export function readStorageSnapshot(): StorageSnapshot {
  return {
    origin: window.location.origin,
    local: readWebStorage("local"),
    session: readWebStorage("session"),
    cookie: readCookies(),
  };
}

/** Every `; path=…; domain=…` pair a cookie visible on this page could have
 *  been set with: each ancestor of the current path (with and without a
 *  trailing slash), each on host-only and on every parent domain. Invalid
 *  domains (IP octets, a bare TLD) are rejected by the browser, harmlessly. */
function cookieScopes(): string[] {
  const { hostname, pathname } = window.location;
  const labels = hostname.split(".");
  const domains = [""];
  for (let i = 0; i < labels.length - 1; i++) {
    domains.push(`; domain=${labels.slice(i).join(".")}`);
  }
  const paths = ["/"];
  let prefix = "";
  for (const segment of pathname.split("/").filter(Boolean)) {
    prefix += `/${segment}`;
    paths.push(prefix, `${prefix}/`);
  }
  return domains.flatMap((domain) => paths.map((path) => `; path=${path}${domain}`));
}

/** Expires `name` on every scope from {@link cookieScopes}. A nameless cookie
 *  is written as a bare value, which the browser files under the empty name. */
function expireCookie(name: string): void {
  const pair = name === "" ? "deleted" : `${name}=`;
  for (const scope of cookieScopes()) {
    document.cookie = `${pair}; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT${scope}`;
  }
}

function cookieValues(name: string): string[] {
  return readCookies()
    .entries.filter((e) => e.key === name)
    .map((e) => e.value);
}

/**
 * Checks a create or update before anything is written. Returns the message to
 * show, or `null` when the write can go ahead. Catches an empty key, a key
 * that already names another entry in the same store, and cookie names or
 * values the browser would silently cut short or drop.
 */
export function validateStorageWrite(write: StorageWrite): string | null {
  const { kind, key, value, previousKey } = write;
  if (!key.trim()) return "Key is required.";
  if (kind === "cookie") {
    if (/[\s;=,]/.test(key) || hasControlChars(key)) {
      return "Cookie names can't contain spaces, ';', '=' or ','.";
    }
    if (value.includes(";") || hasControlChars(value)) {
      return "Cookie values can't contain ';' or line breaks — URL-encode the value first.";
    }
    if (utf8Length(key) + utf8Length(value.trim()) > COOKIE_MAX_BYTES) {
      return "A cookie's name and value together can't exceed 4096 bytes.";
    }
  }
  if (key !== previousKey && readStore(kind).entries.some((e) => e.key === key)) {
    return `"${key}" already exists — edit that entry instead.`;
  }
  return null;
}

/**
 * Creates or updates one entry; a `previousKey` different from `key` renames
 * it, writing the new key before removing the old one so a failed write loses
 * nothing. Throws an `Error` with a user-facing message when the browser
 * refuses — storage full, storage blocked, or a cookie that never appears.
 *
 * A cookie is written host-only at path `/` with `SameSite=Lax`, plus `Secure`
 * over HTTPS, since `document.cookie` can't reveal the original's attributes.
 * Its value is trimmed first, as the browser would trim it anyway.
 */
export function writeStorageEntry(write: StorageWrite): void {
  const { kind, key, value, previousKey } = write;
  const renamed = previousKey !== undefined && previousKey !== key;

  if (kind === "cookie") {
    const stored = value.trim();
    const attrs = ["path=/", "SameSite=Lax"];
    if (write.maxAge != null) attrs.push(`max-age=${write.maxAge}`);
    if (window.location.protocol === "https:") attrs.push("Secure");
    document.cookie = `${key}=${stored}; ${attrs.join("; ")}`;
    if (!cookieValues(key).includes(stored)) {
      throw new Error(`The browser refused cookie "${key}" — cookies may be blocked for this site.`);
    }
    if (renamed) expireCookie(previousKey);
    return;
  }

  try {
    const store = webStorage(kind);
    store.setItem(key, value);
    if (renamed) store.removeItem(previousKey);
  } catch (err) {
    throw new Error(
      err instanceof DOMException && err.name === "QuotaExceededError"
        ? "Storage is full — the browser refused to save this value."
        : BLOCKED_MESSAGE,
    );
  }
}

/**
 * Removes one entry. For a cookie that means every copy of the name this page
 * can see, since `document.cookie` can't tell copies on different paths or
 * domains apart. Throws an `Error` with a user-facing message when the store
 * is blocked or a copy survives — set on a scope this page can't target.
 */
export function deleteStorageEntry(kind: StorageKind, key: string): void {
  if (kind === "cookie") {
    expireCookie(key);
    if (cookieValues(key).length > 0) {
      throw new Error(
        `Couldn't remove every copy of cookie "${key}" — one was set on a path or domain this page can't target.`,
      );
    }
    return;
  }

  try {
    webStorage(kind).removeItem(key);
  } catch {
    throw new Error(BLOCKED_MESSAGE);
  }
}
