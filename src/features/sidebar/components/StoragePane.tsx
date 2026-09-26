"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useSelector } from "react-redux";
import {
  ChevronRight,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import type { Theme } from "@/lib/themes";
import * as ui from "@/lib/ui";
import {
  deleteStorageEntry,
  readStorageSnapshot,
  validateStorageWrite,
  writeStorageEntry,
  type StorageEntry,
  type StorageKind,
  type StorageSnapshot,
} from "@/lib/browserStorage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ConfirmDialog from "@/components/ConfirmDialog";
import RowMenu from "@/components/RowMenu";
import { selectRunning } from "@/store/runnerSlice";
import StorageEntryDialog, { type StorageDraft } from "./StorageEntryDialog";

/** The three stores, in the order the segmented control renders them. */
const KINDS: Array<{ id: StorageKind; label: string; noun: string; hint: string }> = [
  {
    id: "local",
    label: "Local",
    noun: "local storage",
    hint: "localStorage — survives reloads and browser restarts",
  },
  {
    id: "session",
    label: "Session",
    noun: "session storage",
    hint: "sessionStorage — cleared when this tab closes",
  },
  {
    id: "cookie",
    label: "Cookies",
    noun: "cookie",
    hint: "document.cookie — cookies this page's scripts can read",
  },
];

/** Characters of a value shown in a collapsed row; CSS truncates the rest. */
const PREVIEW_CHARS = 160;

/** Longest value an expanded row renders; copy still writes the whole value. */
const VALUE_CAP = 50_000;

/** Container that visually combines a `ButtonGroup`'s children, no border. */
const GROUP_BOX = "rounded-md overflow-hidden";

/** Ghost button hover matching the rest of the app's icon controls. */
const GROUP_BTN = "rounded-none hover:bg-app-hover hover:text-app-accent dark:hover:bg-app-hover";

/** Entry list: one bordered card with `divide-y` row separators, matching the
 *  lists in {@link EnvPane} and {@link DbPane} so the panes read as siblings. */
const LIST =
  "flex flex-col overflow-hidden rounded-md border border-app-border bg-app-panel divide-y divide-app-border";

/** Row block for one entry, flush edge-to-edge inside `LIST`. Stacks the
 *  header line over the expanded value; the left accent bar marks the open
 *  row and is always present, so opening one never shifts layout. */
const ROW =
  "group flex flex-col border-l-2 border-l-transparent bg-app-hover px-2.5 py-1.5 " +
  "transition-colors duration-200 hover:bg-app-selected " +
  "data-selected:border-l-app-accent data-selected:bg-app-selected";

/** Last snapshot read. Module-level so `useSyncExternalStore` gets the same
 *  object back on every render until something re-reads the stores. */
let cachedSnapshot: StorageSnapshot | null = null;

const snapshotListeners = new Set<() => void>();

/** Re-reads all three stores and notifies every mounted pane. */
function refreshSnapshot() {
  cachedSnapshot = readStorageSnapshot();
  snapshotListeners.forEach((notify) => notify());
}

/** No store announces a page's own writes, so the pane re-reads on focus and
 *  on `storage` (another tab's write) and otherwise waits to be asked. The
 *  window listeners are shared — adding the same function twice is a no-op —
 *  and come off with the last subscriber. */
function subscribeSnapshot(notify: () => void) {
  snapshotListeners.add(notify);
  window.addEventListener("focus", refreshSnapshot);
  window.addEventListener("storage", refreshSnapshot);
  return () => {
    snapshotListeners.delete(notify);
    if (snapshotListeners.size === 0) {
      window.removeEventListener("focus", refreshSnapshot);
      window.removeEventListener("storage", refreshSnapshot);
    }
  };
}

const getSnapshot = () => cachedSnapshot;
const getServerSnapshot = () => null;

/** Human-readable byte count, same scale as the response panel's sizes. */
function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** Indented JSON when the value parses to an object or array, else the raw
 *  string. Anything past `VALUE_CAP` is cut and left unparsed. */
function prettyValue(value: string): string {
  if (value.length > VALUE_CAP) return value.slice(0, VALUE_CAP);
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object"
      ? JSON.stringify(parsed, null, 2)
      : value;
  } catch {
    return value;
  }
}

/** First of `<key>-copy`, `<key>-copy-2`, … not already taken in the store. */
function duplicateKey(key: string, entries: StorageEntry[]): string {
  const taken = new Set(entries.map((e) => e.key));
  let candidate = `${key}-copy`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${key}-copy-${n}`;
  return candidate;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sidebar pane for what this origin keeps in the browser — local storage,
 * session storage, and script-readable cookies — one store at a time, with
 * a filter, an add button, and a `⋯` menu per entry to view, copy, edit,
 * duplicate or delete it. Reach for it to check or plant a token or flag a
 * script relies on; for variables a script extracted into the collection,
 * use {@link VarsPane} instead.
 *
 * @remarks
 * Status: stable — Type: pane
 *
 * State & behavior: all three stores are read together into one snapshot,
 * held in a module-level store and read through `useSyncExternalStore`, so
 * every count on the segmented control stays current. The snapshot is
 * re-read on mount, each time a script run starts or stops (`selectRunning`
 * from `runnerSlice`), when the window regains focus, on a `storage` event
 * from another tab, on the refresh button, and after every create, edit or
 * delete. Nothing else notifies a page of its own writes, so a value a script
 * changes mid-run shows after the run ends. Writes go through
 * `@/lib/browserStorage`: the add button, and a row menu's Edit and
 * Duplicate, open {@link StorageEntryDialog}, which shows any validation or
 * browser error in place; Duplicate starts a create from the entry's value
 * under the first free `<key>-copy`, `<key>-copy-2`, … key. Delete opens
 * {@link ConfirmDialog}, and a delete the browser won't fully honor leaves an
 * error line in the pane. View value toggles the same expansion as clicking
 * the row; Copy value swaps the row's size for "Copied" for 1.5 s. Local
 * state: the selected store (local by default), the filter text, the one
 * expanded row, the row whose value was just copied, the dialog's target (an
 * entry to edit, a template to duplicate, or neither for a blank create), the
 * entry pending deletion, and the last delete error. Switching stores
 * collapses the open row and clears the error. The filter matches key or
 * value, case-insensitive.
 *
 * Variants:
 * - local / session / cookie — which store the list shows and edits.
 * - reading — before the first snapshot lands, the list says so.
 * - empty — the store has no entries, or none match the filter.
 * - blocked — the browser threw on access; an error line replaces the list
 *   and the add button is disabled.
 *
 * Composition: header with the add and refresh controls, a `ButtonGroup`
 * segmented control, the origin line, an `Input` filter, then a bordered
 * `LIST` card of rows, each ending in a {@link RowMenu} — View/Hide value,
 * Copy value, Edit, Duplicate, then Delete below a separator. An expanded row
 * shows its value in a scrollable block, pretty-printed when it parses as a
 * JSON object or array. {@link StorageEntryDialog} and {@link ConfirmDialog}
 * mount on demand.
 *
 * Accessibility: the store switch is a `role="group"` of buttons carrying
 * `aria-pressed`. Each row's key is a disclosure button with `aria-expanded`
 * and, while open, `aria-controls` pointing at the value block. The `⋯`
 * trigger is labelled "More actions for <key>" and, like
 * {@link CollPane}'s, shows on row hover or focus; the menu itself is a
 * Radix `menu` with arrow-key navigation. A visually hidden `role="status"`
 * line announces a copy. The blocked and delete-error messages are
 * `role="alert"`.
 *
 * Test ids: add `storage-pane-add-button`, refresh
 * `storage-pane-refresh-button`, store switch
 * `storage-pane-kind-button-<kind>`, its count `storage-pane-kind-count-<kind>`,
 * filter `storage-pane-filter-input` (clear button
 * `storage-pane-filter-input-clear-button`), list `storage-pane-list`, row
 * `storage-pane-row-<id>`, disclosure `storage-pane-toggle-button-<id>`,
 * menu trigger `storage-pane-row-menu-button-<id>`, menu items
 * `storage-pane-menu-<action>-<id>` (`view`, `copy`, `edit`, `duplicate`,
 * `delete`), expanded value
 * `storage-pane-value-<id>`, empty state `storage-pane-empty-message`,
 * blocked state `storage-pane-error-message`, failed delete
 * `storage-pane-notice-message`.
 *
 * CSS classes: none — Tailwind utilities over the `app-*` tokens plus the
 * `ui.*` recipes.
 *
 * Edge cases:
 * - Only this app's own origin is visible; storage and cookies belonging to
 *   the APIs a script calls live on those hosts, out of reach.
 * - HttpOnly cookies are hidden from scripts and never listed; a footnote
 *   under the cookie list says so.
 * - Cookie attributes (path, domain, expiry) are not exposed by
 *   `document.cookie`, so saving a cookie writes it for this host at path
 *   `/` with the lifetime picked in the dialog. A name set on two paths lists
 *   twice, the second id suffixed `~2`; deleting either removes every copy
 *   the page can reach.
 * - A cookie with no `=` lists under an empty key, shown as `(empty key)`.
 * - Values show exactly as stored — cookie values are not URL-decoded, so a
 *   copied value pastes straight into a `Cookie` header.
 * - An expanded value longer than 50,000 characters renders cut off with a
 *   note; copy still writes the full value.
 * - A rejected clipboard write shows no "Copied" and no error.
 * - Deleting a key the app or a library depends on — a Supabase session
 *   token, say — takes effect at once; the confirm dialog is the only guard.
 *
 * Dependencies: `lucide-react`, `react-redux`, `@/store/runnerSlice`,
 * `@/lib/browserStorage`, `@/lib/ui`, `@/components/ui/input`,
 * `@/components/ui/button`, `@/components/ui/button-group`,
 * `@/components/ui/tooltip`, `@/components/ConfirmDialog`,
 * `@/components/RowMenu`, `./StorageEntryDialog`.
 *
 * @example
 * ```tsx
 * <StoragePane T={theme} />
 * ```
 *
 * @see {@link Sidebar}
 * @see {@link StorageEntryDialog}
 * @see {@link VarsPane}
 */
export default function StoragePane({}: StoragePaneProps) {
  const running = useSelector(selectRunning);
  const baseId = useId();
  const [kind, setKind] = useState<StorageKind>("local");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    entry?: StorageEntry;
    template?: { key: string; value: string };
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StorageEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const snapshot = useSyncExternalStore(
    subscribeSnapshot,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    refreshSnapshot();
  }, [running]);

  const store = snapshot?.[kind] ?? null;
  const noun = KINDS.find((k) => k.id === kind)?.noun ?? "storage";
  const addLabel = kind === "cookie" ? "Add cookie" : `Add ${noun} entry`;
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!store) return [];
    if (!needle) return store.entries;
    return store.entries.filter(
      (e) =>
        e.key.toLowerCase().includes(needle) ||
        e.value.toLowerCase().includes(needle),
    );
  }, [store, needle]);

  const openEntry = store?.entries.find((e) => e.id === openId) ?? null;
  const openText = useMemo(
    () => (openEntry ? prettyValue(openEntry.value) : ""),
    [openEntry],
  );

  const selectKind = (next: StorageKind) => {
    setKind(next);
    setOpenId(null);
    setCopiedId(null);
    setNotice(null);
  };

  const copy = async (entry: StorageEntry) => {
    try {
      await navigator.clipboard.writeText(entry.value);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1500);
    } catch {
      setCopiedId(null);
    }
  };

  const save = (draft: StorageDraft): string | null => {
    const write = {
      kind,
      key: draft.key,
      value: draft.value,
      maxAge: draft.maxAge,
      previousKey: editor?.entry?.key,
    };
    const invalid = validateStorageWrite(write);
    if (invalid) return invalid;
    try {
      writeStorageEntry(write);
    } catch (err) {
      refreshSnapshot();
      return errorMessage(err);
    }
    refreshSnapshot();
    setNotice(null);
    setEditor(null);
    return null;
  };

  const confirmDelete = (entry: StorageEntry) => {
    try {
      deleteStorageEntry(kind, entry.key);
      setNotice(null);
    } catch (err) {
      setNotice(errorMessage(err));
    }
    refreshSnapshot();
    setPendingDelete(null);
  };

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div className="mb-0.5 flex items-center justify-between gap-2 px-0.5">
        <h2 className={`${ui.label} truncate`}>Storage</h2>
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setEditor({})}
                disabled={!store || !!store.error}
                aria-label={addLabel}
                data-testid="storage-pane-add-button"
                className={ui.iconBtn}
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{addLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={refreshSnapshot}
                aria-label="Refresh storage lists"
                data-testid="storage-pane-refresh-button"
                className={ui.iconBtn}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Re-read all three stores</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ButtonGroup aria-label="Storage type" className={`${GROUP_BOX} w-full`}>
        {KINDS.map(({ id, label, hint }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => selectKind(id)}
                data-active={kind === id || undefined}
                aria-pressed={kind === id}
                data-testid={`storage-pane-kind-button-${id}`}
                className={`${GROUP_BTN} flex-1 px-1.5 text-[11px] data-active:bg-app-accent-faint data-active:text-app-accent`}
              >
                {label}
                <span
                  data-testid={`storage-pane-kind-count-${id}`}
                  className="font-mono text-[10px] opacity-70"
                >
                  {snapshot ? snapshot[id].entries.length : "–"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        ))}
      </ButtonGroup>

      {snapshot && (
        <p className={`${ui.meta} truncate px-0.5`}>Origin {snapshot.origin}</p>
      )}

      <Input
        icon={Search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter keys and values"
        aria-label="Filter entries by key or value"
        data-testid="storage-pane-filter-input"
        className="py-1 text-[11px]"
      />

      {notice && (
        <p
          role="alert"
          data-testid="storage-pane-notice-message"
          className="px-0.5 font-description text-[11px] leading-relaxed text-app-error"
        >
          {notice}
        </p>
      )}

      {store?.error ? (
        <p
          role="alert"
          data-testid="storage-pane-error-message"
          className="px-2 py-4 text-center font-description text-[12px] text-app-error"
        >
          {store.error}
        </p>
      ) : visible.length === 0 ? (
        <p
          data-testid="storage-pane-empty-message"
          className="px-2 py-6 text-center font-description text-[12px] text-app-dim"
        >
          {!snapshot
            ? "Reading storage…"
            : needle
              ? `No ${noun} entries match "${query.trim()}".`
              : `No ${noun} entries on this origin.`}
        </p>
      ) : (
        <ul className={LIST} data-testid="storage-pane-list">
          {visible.map((entry, i) => {
            const isOpen = entry.id === openId;
            const isCopied = entry.id === copiedId;
            const valueId = `${baseId}-value-${i}`;
            const keyLabel = entry.key || "(empty key)";
            return (
              <li
                key={entry.id}
                data-selected={isOpen || undefined}
                data-testid={`storage-pane-row-${entry.id}`}
                className={ROW}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : entry.id)}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? valueId : undefined}
                    data-testid={`storage-pane-toggle-button-${entry.id}`}
                    className="flex min-w-0 flex-1 items-start gap-1.5 rounded-sm border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-0"
                  >
                    <ChevronRight
                      size={12}
                      aria-hidden="true"
                      className={`mt-0.5 shrink-0 text-app-dim transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block font-title text-[12px] font-semibold ${isOpen ? "break-all text-app-bright" : "truncate text-app-text"}`}
                      >
                        {keyLabel}
                      </span>
                      {!isOpen && (
                        <span className="block truncate font-mono text-[11px] text-app-dim">
                          {entry.value.slice(0, PREVIEW_CHARS) || "(empty)"}
                        </span>
                      )}
                    </span>
                  </button>
                  <span
                    className={`shrink-0 ${isCopied ? "font-mono text-[11px] text-app-success" : ui.meta}`}
                  >
                    {isCopied ? "Copied" : formatBytes(entry.bytes)}
                  </span>
                  <ButtonGroup className={`${GROUP_BOX} ${ui.reveal}`}>
                    <RowMenu
                      id={entry.id}
                      label={keyLabel}
                      testIdPrefix="storage-pane"
                      actions={[
                        {
                          key: "view",
                          label: isOpen ? "Hide value" : "View value",
                          icon: isOpen ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />,
                          onSelect: () => setOpenId(isOpen ? null : entry.id),
                        },
                        {
                          key: "copy",
                          label: "Copy value",
                          icon: <Copy aria-hidden="true" />,
                          onSelect: () => void copy(entry),
                        },
                        {
                          key: "edit",
                          label: "Edit",
                          icon: <Pencil aria-hidden="true" />,
                          onSelect: () => setEditor({ entry }),
                        },
                        {
                          key: "duplicate",
                          label: "Duplicate",
                          icon: <CopyPlus aria-hidden="true" />,
                          onSelect: () =>
                            setEditor({
                              template: {
                                key: duplicateKey(entry.key, store?.entries ?? []),
                                value: entry.value,
                              },
                            }),
                        },
                        { key: "sep", label: "", icon: null, onSelect: () => {} },
                        {
                          key: "delete",
                          label: "Delete",
                          icon: <Trash2 aria-hidden="true" />,
                          variant: "destructive",
                          onSelect: () => setPendingDelete(entry),
                        },
                      ]}
                    />
                  </ButtonGroup>
                </div>
                {isOpen && (
                  <>
                    <pre
                      id={valueId}
                      data-testid={`storage-pane-value-${entry.id}`}
                      className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-app-panel p-2 font-mono text-[11px] text-app-bright"
                    >
                      {openText || "(empty)"}
                    </pre>
                    {entry.value.length > VALUE_CAP && (
                      <p className={`${ui.meta} mt-1`}>
                        Showing the first {VALUE_CAP.toLocaleString()} characters — copy gets
                        the full value.
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {kind === "cookie" && !store?.error && (
        <p className={`${ui.meta} px-0.5 leading-relaxed`}>
          HttpOnly cookies are hidden from scripts, so they never appear here.
        </p>
      )}

      <span role="status" className="sr-only">
        {copiedId ? "Value copied" : ""}
      </span>

      {editor && (
        <StorageEntryDialog
          kind={kind}
          entry={editor.entry}
          template={editor.template}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={kind === "cookie" ? "Delete cookie" : "Delete entry"}
          message={
            kind === "cookie"
              ? `Delete cookie "${pendingDelete.key}"? Every copy of that name this page can reach is removed.`
              : `Delete "${pendingDelete.key}" from ${noun}? This can't be undone.`
          }
          confirmLabel="Delete"
          onConfirm={() => confirmDelete(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

export type StoragePaneProps = {
  /** Active theme, passed by {@link Sidebar} like every pane. Unused — the
   *  pane paints from the `app-*` tokens. */
  T: Theme;
};
