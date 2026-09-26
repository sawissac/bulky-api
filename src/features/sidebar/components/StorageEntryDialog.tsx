"use client";

import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import type { StorageEntry, StorageKind } from "@/lib/browserStorage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

/** What the dialog is called for each store, after "New" or "Edit". */
const NOUNS: Record<StorageKind, string> = {
  local: "local storage entry",
  session: "session storage entry",
  cookie: "cookie",
};

/** Cookie lifetimes on offer, in the order the segmented control renders them. */
const EXPIRY_OPTIONS: Array<{ id: string; label: string; maxAge: number | null }> = [
  { id: "session", label: "Session", maxAge: null },
  { id: "1d", label: "1 day", maxAge: 86_400 },
  { id: "7d", label: "7 days", maxAge: 604_800 },
  { id: "30d", label: "30 days", maxAge: 2_592_000 },
  { id: "1y", label: "1 year", maxAge: 31_536_000 },
];

const FIELD_LABEL = "font-title text-[10px] font-semibold uppercase tracking-[0.12em] text-app-dim";

/** Container that visually combines a `ButtonGroup`'s children, no border. */
const GROUP_BOX = "rounded-md overflow-hidden";

/** Ghost button hover matching the rest of the app's icon controls. */
const GROUP_BTN = "rounded-none hover:bg-app-hover hover:text-app-accent dark:hover:bg-app-hover";

const TEXTAREA =
  "w-full min-w-0 resize-y rounded-md border-2 border-transparent bg-app-hover px-2.5 py-1.5 " +
  "font-mono text-[11px] leading-relaxed text-app-bright outline-none transition-colors duration-200 " +
  "placeholder:text-app-dim focus:border-app-accent focus:bg-app-panel";

/**
 * Modal form for creating or editing one browser-storage entry — a key, a
 * value, and for cookies a lifetime. Rendered by {@link StoragePane} from its
 * add button (empty) and from each row's `⋯` menu — Edit (prefilled from the
 * entry) and Duplicate (a create prefilled from `template`). For deleting an
 * entry the pane uses {@link ConfirmDialog} instead.
 *
 * @remarks
 * Status: stable — Type: overlay
 *
 * State & behavior: holds the key, value and cookie-lifetime drafts plus the
 * last error, all local — nothing touches a store until the caller's `onSave`
 * runs. Save hands the draft over and shows whatever message `onSave` returns;
 * a `null` return means the entry was saved, and the caller closes the
 * dialog. Editing either field clears the message. A whitespace-only key
 * disables Save. Focus lands on the key when creating and on the value when
 * editing.
 *
 * Variants:
 * - create — no `entry`; "New …" title, Create button. Fields start empty,
 *   or from `template` when duplicating.
 * - edit — `entry` set; prefilled fields, "Edit …" title, Save button.
 *   Changing the key renames the entry.
 * - cookie — `kind` is `"cookie"`; adds the lifetime control and a note on
 *   the attributes the cookie is written with.
 *
 * Composition: renders no children. Fixed to the viewport at `z-200`, the
 * same layer as {@link ConfirmDialog} and {@link NewEnvironmentDialog}.
 *
 * Accessibility: `role="dialog"` with `aria-modal` and a label naming the
 * action. The lifetime switch is a `role="group"` of buttons carrying
 * `aria-pressed`. The error line is `role="alert"`. Escape closes, Enter in
 * the key field saves, and Ctrl/⌘+Enter saves from the value field, where a
 * plain Enter is a newline.
 *
 * Test ids: root `storage-entry-dialog-root`, key
 * `storage-entry-dialog-key-input` (clear button
 * `storage-entry-dialog-key-input-clear-button`), value
 * `storage-entry-dialog-value-input`, lifetime
 * `storage-entry-dialog-expiry-button-<id>` (`session`, `1d`, `7d`, `30d`,
 * `1y`), error `storage-entry-dialog-error-message`, close
 * `storage-entry-dialog-close-button`, cancel
 * `storage-entry-dialog-cancel-button`, confirm
 * `storage-entry-dialog-save-button`.
 *
 * CSS classes: none — Tailwind utilities over the `app-*` theme tokens only.
 *
 * Edge cases:
 * - `template` is ignored when `entry` is set — an edit always starts from
 *   the entry itself.
 * - Editing a cookie always starts on "Session": `document.cookie` never
 *   reveals the current expiry, so the note says the saved cookie takes the
 *   lifetime picked here.
 * - Key and value go out exactly as typed, untrimmed — a local or session
 *   storage key may legitimately carry spaces.
 *
 * Dependencies: `lucide-react`, `@/components/ui/input` ({@link Input}),
 * `@/components/ui/button`, `@/components/ui/button-group`.
 *
 * @example
 * ```tsx
 * {editor && (
 *   <StorageEntryDialog
 *     kind="local"
 *     entry={editor.entry}
 *     template={editor.template}
 *     onSave={(draft) => save(draft)}
 *     onClose={() => setEditor(null)}
 *   />
 * )}
 * ```
 *
 * @see {@link StoragePane}
 */
export default function StorageEntryDialog({
  kind,
  entry,
  template,
  onSave,
  onClose,
}: StorageEntryDialogProps) {
  const start = entry ?? template;
  const [key, setKey] = useState(start?.key ?? "");
  const [value, setValue] = useState(start?.value ?? "");
  const [expiry, setExpiry] = useState("session");
  const [error, setError] = useState<string | null>(null);
  const title = `${entry ? "Edit" : "New"} ${NOUNS[kind]}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commit = () => {
    if (!key.trim()) return;
    const maxAge =
      kind === "cookie"
        ? (EXPIRY_OPTIONS.find((o) => o.id === expiry)?.maxAge ?? null)
        : null;
    setError(onSave({ key, value, maxAge }));
  };

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/65 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="storage-entry-dialog-root"
        className="flex w-[min(440px,92vw)] animate-[fadeUp_0.18s_ease] flex-col overflow-hidden rounded-lg border-2 border-app-border-mid bg-app-panel"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-app-border px-3 py-1.5">
          <span className="flex-1 font-title text-[13px] font-semibold tracking-[-0.01em] text-app-bright">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()} dialog`}
            data-testid="storage-entry-dialog-close-button"
            className="flex size-7 items-center justify-center rounded-md border-0 bg-transparent text-app-dim transition-colors duration-200 hover:bg-app-hover hover:text-app-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 px-3 py-2.5">
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>{kind === "cookie" ? "Name" : "Key"}</span>
            <Input
              autoFocus={!entry}
              icon={KeyRound}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
              }}
              placeholder={kind === "cookie" ? "session_id" : "auth.token"}
              aria-label={kind === "cookie" ? "Cookie name" : "Key"}
              data-testid="storage-entry-dialog-key-input"
              className="h-8 font-mono text-[11px]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Value</span>
            <textarea
              autoFocus={!!entry}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commit();
                }
              }}
              rows={8}
              spellCheck={false}
              placeholder="Plain text or JSON"
              aria-label="Value"
              data-testid="storage-entry-dialog-value-input"
              className={TEXTAREA}
            />
          </label>

          {kind === "cookie" && (
            <div className="flex flex-col gap-1">
              <span className={FIELD_LABEL}>Expires</span>
              <ButtonGroup aria-label="Cookie lifetime" className={`${GROUP_BOX} w-full`}>
                {EXPIRY_OPTIONS.map(({ id, label }) => (
                  <Button
                    key={id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpiry(id)}
                    data-active={expiry === id || undefined}
                    aria-pressed={expiry === id}
                    data-testid={`storage-entry-dialog-expiry-button-${id}`}
                    className={`${GROUP_BTN} flex-1 px-1.5 text-[11px] data-active:bg-app-accent-faint data-active:text-app-accent`}
                  >
                    {label}
                  </Button>
                ))}
              </ButtonGroup>
              <p className="font-description text-[11px] leading-relaxed text-app-dim">
                Saved for this host at path <code className="font-mono">/</code>.
                {entry &&
                  " Browsers don't reveal a cookie's current path or expiry, so saving replaces them with these."}
              </p>
            </div>
          )}

          {error && (
            <p
              role="alert"
              data-testid="storage-entry-dialog-error-message"
              className="font-description text-[11px] leading-relaxed text-app-error"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-app-border px-3 py-1.5">
          <button
            type="button"
            onClick={onClose}
            data-testid="storage-entry-dialog-cancel-button"
            className="h-8 rounded-md border border-app-border bg-transparent px-3.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-app-dim transition-colors duration-200 hover:bg-app-hover hover:text-app-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-panel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={!key.trim()}
            data-testid="storage-entry-dialog-save-button"
            className="h-8 rounded-md border-0 bg-app-accent px-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-app-on-solid transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-panel disabled:pointer-events-none disabled:opacity-50"
          >
            {entry ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What the dialog hands to `onSave`. */
export type StorageDraft = {
  /** Key exactly as typed. */
  key: string;
  /** Value exactly as typed. */
  value: string;
  /** Cookie lifetime in seconds; `null` for a session cookie, and always
   *  `null` outside the cookie store. */
  maxAge: number | null;
};

export type StorageEntryDialogProps = {
  /** Store the entry lives in — names it in the title and decides whether
   *  the cookie lifetime control shows. */
  kind: StorageKind;
  /** Entry being edited, prefilling the form. Unset opens the dialog to
   *  create one. */
  entry?: StorageEntry;
  /** Starting key and value for a create — how Duplicate prefills the form.
   *  Ignored when `entry` is set. */
  template?: { key: string; value: string };
  /**
   * Fires on Create/Save, Enter in the key field, or Ctrl/⌘+Enter in the
   * value field — never with a whitespace-only key. Returns the message to
   * show in the dialog, or `null` once the entry is saved. Does not close the
   * dialog; the caller does that.
   * @param draft - the key, value and cookie lifetime as entered
   */
  onSave: (draft: StorageDraft) => string | null;
  /** Fires on the header close button, Cancel, a scrim click, and Escape. */
  onClose: () => void;
};
