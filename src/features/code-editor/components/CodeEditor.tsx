"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useDispatch, useSelector } from "react-redux";
import {
  FolderOpen,
  Feather,
  ChevronDown,
  SkipForward,
  BookOpen,
  WandSparkles,
  Square,
  Send,
  Unplug,
  Search,
  SlidersHorizontal,
  Laptop,
  FileLock,
  TableProperties,
  Database,
  FolderDown,
  FolderUp,
  HardDrive,
  Download,
  Upload,
  SquareTerminal,
  Footprints,
  Play,
  PanelLeftRightDashed,
  TvMinimal,
  Form,
  Rows2,
  Code2,
} from "lucide-react";
import type { Theme } from "@/lib/themes";
import { selectCode, setCode } from "@/store/editorSlice";
import {
  selectActiveItem,
  selectActiveCollection,
  selectCollections,
  selectEnvVars,
  selectEnvironments,
  setActiveId,
  setEnvIdx,
  renameCollection,
  renameItem,
} from "@/store/collectionsSlice";
import {
  selectBuiltCalls,
  selectStepMode,
  setStepMode,
} from "@/store/runnerSlice";
import {
  selectTweaksOpen,
  setTweaksOpen,
  setSidebarTab,
  selectCommandPaletteOpen,
  setCommandPaletteOpen,
  selectLayout,
  setLayout,
  type SidebarTab,
  type LayoutKey,
} from "@/store/uiSlice";
import { useDisplayMode } from "@/hooks/useDisplayMode";
import { useFileActions } from "@/hooks/useFileActions";
import { EXAMPLE_SCRIPTS } from "@/lib/sampleData";
import type { ExampleScript } from "@/lib/sampleData";
import MethodPill from "@/components/MethodPill";
import ExampleDialog from "./ExampleDialog";
import CommandPalette, { type Command } from "./CommandPalette";
import CurlImportDialog from "@/features/sidebar/components/CurlImportDialog";
import EditorEmptyState from "./EditorEmptyState";
import { Input } from "@/components/ui/input";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { EditorInstance } from "./MonacoCodeEditor";
import * as prettier from "prettier/standalone";
import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";

const MonacoCodeEditor = dynamic(() => import("./MonacoCodeEditor"), {
  ssr: false,
});

/** Footer toggle: borderless, sits flush in the status bar — fills with a
 *  faint accent tint on hover/active instead of drawing its own box. */
const TOOL_BTN =
  "flex h-6 shrink-0 items-center gap-1 rounded border-0 bg-transparent px-1.5 text-app-dim transition-colors duration-200 " +
  "hover:bg-app-selected hover:text-app-accent " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-1 focus-visible:ring-offset-app-panel " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "data-active:bg-app-accent-faint data-active:text-app-accent";

/** Run / Stop / Next: the pane's solid action blocks. No gradient, no glow. */
const ACTION_BTN =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-md border-0 px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-app-on-solid " +
  "transition-transform duration-200 hover:scale-105 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-app-panel " +
  "disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100";

/** Wraps the footer's utility toggles for spacing only — no outer border or
 *  radius, so the group reads as embedded in the status bar rather than a
 *  floating segmented block. */
const GROUP_BOX = "gap-0.5";

/** The footer's compact layout switcher — same four {@link LayoutKey}
 *  values and icons as `TweaksPanel`'s full-size `LAYOUT_OPTIONS` list, just
 *  without the label/detail text a `TOOL_BTN`-sized icon has no room for. */
const LAYOUT_TOOL_OPTIONS: Array<{
  id: LayoutKey;
  label: string;
  Icon: React.ElementType;
}> = [
  { id: "balanced", label: "Balanced layout", Icon: PanelLeftRightDashed },
  { id: "editor-focus", label: "Editor Focus layout", Icon: TvMinimal },
  { id: "response-focus", label: "Response Focus layout", Icon: Form },
  { id: "stacked", label: "Stacked layout", Icon: Rows2 },
];

type Props = {
  /** Active theme, passed straight through to {@link MonacoCodeEditor} and
   *  {@link ExampleDialog} — this component reads no theme values itself. */
  T: Theme;
  /** Fires on the Run button, the palette's Run entry and the ⌘↵ shortcut
   *  (handled by the parent, which owns the run loop — this component only
   *  renders the shortcut label on the button itself). Carries the editor's
   *  selected text whenever the selection holds non-blank source, so the
   *  parent runs only those lines.
   *  @param selection - Selected source, or `undefined` for the whole buffer. */
  onRun: (selection?: string) => void;
  /** Fires on the Next button, shown only while `paused`. */
  onNext: () => void;
  /** Fires on the Stop button, shown only while `running` and not `paused`. */
  onStop: () => void;
  /** Whether a run is in progress. Swaps the action block to Stop (or Next,
   *  if also `paused`). */
  running: boolean;
  /** Whether a stepped run is currently paused. Shows the pulsing Next
   *  action block in place of Run/Stop. */
  paused: boolean;
  /** Sends `text` over the open `api.ws`/`api.io` connection at call index
   *  `idx` — wired to the socket registry `useScriptRunner` keeps for the
   *  current run. Fires from the socket composer bar, which only renders
   *  while a call in `builtCalls` has `isWs && wsOpen`. */
  onSendSocketMessage: (idx: number, text: string) => void;
  /** Closes the open connection at call index `idx` from the UI, same
   *  registry as {@link onSendSocketMessage}. Fires from the composer's
   *  Disconnect button. */
  onCloseSocket: (idx: number) => void;
};

/**
 * The editor panel: toolbar (breadcrumb, run/stop/next), the Monaco
 * instance, and a footer status bar (method, format, examples,
 * language/runtime).
 *
 * @remarks
 * Status: stable — Type: panel
 *
 * State & behavior: each breadcrumb segment is split into a label button and
 * a trailing chevron button. Clicking the label starts an inline rename;
 * clicking the chevron opens that segment's picker. `openMenu`
 * (`"coll" | "item" | null`) gates the two pickers, one open at a time, each
 * a Radix {@link Popover} that owns its own positioning, outside-click and
 * Escape. The footer's Examples menu is a separate, self-contained
 * `examplesOpen` flag driving its own {@link Popover}. `renaming`/
 * `renameDraft` swap the segment's collection or request name for an inline
 * `Input`, committed on blur/Enter, discarded on Escape. `selectedExample`
 * gates {@link ExampleDialog} once a menu entry is picked, from either the
 * footer's Examples menu or the command palette. Format runs Prettier's
 * `babel-ts` parser on the current code — the buffer is TypeScript — via
 * `formatWithPrettier`; the footer's Format button (`handleFormat`) falls
 * back to Monaco's own format action if Prettier throws (e.g. code that
 * doesn't parse as a module), while the command palette's Format entry calls
 * `formatWithPrettier` directly, without that fallback, since a ref read
 * cannot happen inside the palette's `commands` list (built every render,
 * not inside an event handler). `commandPaletteOpen` (`uiSlice`, toggled here
 * or by ⌘K/Ctrl+K in `BulkyApp.tsx`) gates {@link CommandPalette}, given a
 * fresh `commands: Command[]` built every render — Actions mirrors the
 * toolbar's own mutually-exclusive Run/Stop/Next gating below so only the
 * relevant one is ever listed, plus step-mode/format/Tweaks/fullscreen/
 * sidebar-tab entries and the five file actions from {@link useFileActions}
 * (save/import script, export/import collection, import from cURL) — the last
 * flips `curlImportOpen` to mount {@link CurlImportDialog}, the same dialog
 * `FilePane` opens; Examples maps `EXAMPLE_SCRIPTS` onto the same
 * `setSelectedExample` the footer's Examples menu uses; Requests flattens
 * every collection's items and reuses `selectItemRow`; Environments lists
 * the active collection's environments and is omitted outright (not shown
 * empty) with no active collection. `wsDraft` backs a
 * composer bar that appears only while `builtCalls` (read directly from
 * `runnerSlice`) has a call with `isWs && wsOpen` — Enter (without Shift)
 * or the Send button calls `onSendSocketMessage(idx, wsDraft)` for the
 * most-recently-opened such call and clears the draft; Disconnect calls
 * `onCloseSocket(idx)` for that same call instead. Both buttons disable
 * while `running` — the script itself is driving the connection mid-run, so
 * manual sends/disconnects wait until the run finishes or is stopped; Send
 * is further disabled whenever `wsDraft` is blank. `selection` mirrors the
 * editor's selection, pushed up by {@link MonacoCodeEditor} on every cursor
 * move; while it holds non-blank source the action block reads "Run Sel" and
 * both it and the palette's Run entry hand that text to `onRun`, so only the
 * selected lines execute — ⌘↵ inside the editor does the same, ⌘⇧↵ always
 * runs the whole buffer.
 *
 * Variants: with no collection at all, the whole panel is replaced by
 * {@link EditorEmptyState} — no toolbar, editor or status bar. With at least
 * one collection but no active item, renders "Scratch Pad" in the breadcrumb
 * instead of a collection/request pair.
 *
 * Composition: renders {@link MonacoCodeEditor} (dynamically imported,
 * `ssr: false`) for the editor body, {@link ExampleDialog} for the selected
 * example's preview, {@link CommandPalette} while `commandPaletteOpen`, and
 * {@link CurlImportDialog} while `curlImportOpen` (opened from the palette's
 * cURL file action). Each breadcrumb segment renders as an
 * input-styled shell (`bg-app-hover`, matching the {@link Input} recipe)
 * holding two buttons split by a hairline divider: a text label that starts
 * an inline rename, and a `ChevronDown` button that opens the segment's
 * picker. The two segments are joined by a literal `/` separator instead of
 * an arrow, reading as a path. Both pickers are a `Popover`
 * (`@/components/ui/popover`) anchored to their chevron and styled to match
 * the footer's Examples menu — rows in a vertical `ButtonGroup` inside a
 * `p-0` `PopoverContent`. The collection picker lists every collection and
 * jumps to its first request (collections with none are disabled); the
 * request picker lists only the active collection's requests, each behind a
 * small {@link MethodPill}. The footer status bar (not the top toolbar)
 * leads with the active item's {@link MethodPill} (omitted for Scratch Pad),
 * then two icon-only `ButtonGroup`s split by a hairline divider: Format/
 * Examples/Search first, then the layout switcher (`LAYOUT_TOOL_OPTIONS` —
 * the same four {@link LayoutKey} values and icons as `TweaksPanel`'s full
 * Layout section, `data-active`/`aria-pressed` marking the current one).
 * Every footer button (Format/Examples/Search, the layout switcher) is
 * icon-only and unlabeled by design — a `Tooltip` carries the name on
 * hover/focus, `aria-label` for everything else. The trailing language
 * indicator is the one exception left with visible text: a small `Code2`
 * icon beside "TypeScript · Bulky Runtime v2.0", unchanged from before the
 * icon-only pass — TypeScript is type-stripped to JavaScript at run time.
 * Examples opens a `Popover` anchored to its trigger, listing each
 * {@link ExampleScript} behind a small {@link MethodPill} inside a vertical
 * `ButtonGroup`; picking one closes the popover and opens
 * {@link ExampleDialog} for that script. Search opens {@link CommandPalette}
 * — the same thing ⌘K/Ctrl+K does from anywhere in the app. Between the
 * editor body and the status bar, the socket composer mounts only while a
 * `textarea` next to a stacked pair of labeled buttons (`Disconnect` above
 * `Send`, both the `ACTION_BTN` recipe Run/Stop/Next use — `Disconnect`
 * compact and tinted `bg-app-error` like Stop, `Send` full-size and tinted
 * the theme accent).
 *
 * Accessibility: each segment's rename label is a plain button with a
 * tooltip; the chevron button carries an explicit `aria-label` ("Switch
 * collection" / "Switch request") and `aria-expanded`. All three menus —
 * both breadcrumb pickers and Examples — are Radix `Popover`s, which supply
 * their own `aria-haspopup`/`aria-controls` wiring and Escape/outside-click
 * dismissal with focus returned to the trigger. Picker rows are plain
 * buttons reachable by their visible name. Every icon-only footer button
 * (Format/Examples/Search, the four layout buttons) carries an
 * `aria-label` and a `Tooltip`, since none render visible text; the layout
 * buttons additionally set `aria-pressed` for the active one. The language
 * indicator needs neither — its text is already visible.
 *
 * Test ids: breadcrumb rename fields
 * `code-editor-rename-collection-input` / `code-editor-rename-item-input`
 * (single instance each, via the shared `Input`), plus the socket composer's
 * `code-editor-socket-message-textarea` (a dynamic-value field a role/name
 * query can't pin down), `code-editor-socket-send-button` and
 * `code-editor-socket-disconnect-button`. The breadcrumb label and chevron
 * buttons, footer buttons (Format/Examples/Search, layout switcher, language
 * indicator alike), and popover entries carry no testid — all are reachable
 * by role and their own (static or, for the rename labels, dynamic but
 * singular) accessible name. {@link CommandPalette} carries its own testids
 * (`command-palette-input`).
 *
 * CSS classes: none — Tailwind utilities over the `app-*` theme tokens only.
 *
 * Edge cases: picking a collection with no requests from the collection
 * dropdown is a no-op beyond closing the menu — there is nothing to make
 * active. A rename committed as only whitespace is discarded, leaving the
 * original name intact. With zero collections the component returns
 * {@link EditorEmptyState} before the footer (and so before the command
 * palette's mount point) ever renders — ⌘K/Ctrl+K still flips
 * `commandPaletteOpen` in that state, but nothing visibly opens.
 *
 * Dependencies: `lucide-react`, `next/dynamic`, `react-redux`, `prettier/
 * standalone` + `plugins/babel` + `plugins/estree`, `@/components/
 * MethodPill`, `@/components/ui/input`, `@/components/ui/button-group`,
 * `@/components/ui/tooltip`, `@/components/ui/popover`, `./ExampleDialog`,
 * `./CommandPalette`, `@/features/sidebar/components/CurlImportDialog`,
 * `./EditorEmptyState`, `./MonacoCodeEditor`, `@/store/editorSlice`,
 * `@/store/collectionsSlice`, `@/store/runnerSlice`, `@/store/uiSlice`,
 * `@/hooks/useDisplayMode`, `@/hooks/useFileActions`, `@/lib/sampleData`.
 *
 * @example
 * ```tsx
 * <CodeEditor
 *   T={theme}
 *   onRun={runScript}
 *   onNext={stepNext}
 *   onStop={stopRun}
 *   running={running}
 *   paused={paused}
 *   onSendSocketMessage={sendSocketMessage}
 *   onCloseSocket={closeSocketConnection}
 * />
 * ```
 */
export default function CodeEditor({
  T,
  onRun,
  onNext,
  onStop,
  running,
  paused,
  onSendSocketMessage,
  onCloseSocket,
}: Props) {
  const dispatch = useDispatch();
  const code = useSelector(selectCode);
  const activeItem = useSelector(selectActiveItem);
  const activeCollection = useSelector(selectActiveCollection);
  const collections = useSelector(selectCollections);
  const envVars = useSelector(selectEnvVars);
  const environments = useSelector(selectEnvironments);
  const builtCalls = useSelector(selectBuiltCalls);
  const stepMode = useSelector(selectStepMode);
  const tweaksOpen = useSelector(selectTweaksOpen);
  const commandPaletteOpen = useSelector(selectCommandPaletteOpen);
  const layout = useSelector(selectLayout);
  const { mode: displayMode, apply: applyDisplayMode } = useDisplayMode();
  const fileActions = useFileActions();
  const monacoEditorRef = useRef<EditorInstance | null>(null);
  const [openMenu, setOpenMenu] = useState<"coll" | "item" | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [curlImportOpen, setCurlImportOpen] = useState(false);
  const [selectedExample, setSelectedExample] = useState<ExampleScript | null>(
    null,
  );
  const [renaming, setRenaming] = useState<"coll" | "item" | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [wsDraft, setWsDraft] = useState("");
  const [selection, setSelection] = useState("");

  // A whitespace-only selection is treated as none — Monaco reports the same
  // for its own run actions, so button, palette and ⌘↵ agree on the target.
  const hasSelection = selection.trim().length > 0;
  const selectionLines = hasSelection ? selection.trim().split("\n").length : 0;
  const runTarget = () => (hasSelection ? selection : undefined);

  // Last-opened-wins if a script somehow opens more than one socket — a v1
  // limitation, not something the composer is built to juggle.
  const openSocket = [...builtCalls].reverse().find((c) => c.isWs && c.wsOpen);
  // The registry is keyed by the socket's position in the run, which is not
  // the card's slot once a selection run overlays its calls on the stubs.
  const openSocketKey = openSocket?.runIdx ?? openSocket?.idx ?? -1;

  const sendWsDraft = () => {
    if (!openSocket || running || !wsDraft.trim()) return;
    onSendSocketMessage(openSocketKey, wsDraft);
    setWsDraft("");
  };

  const selectCollectionRow = (col: (typeof collections)[number]) => {
    const first = col.items[0];
    if (first) {
      dispatch(setActiveId(first.id));
      dispatch(setCode(first.code));
    }
    setOpenMenu(null);
  };

  const selectItemRow = (it: (typeof collections)[number]["items"][number]) => {
    dispatch(setActiveId(it.id));
    dispatch(setCode(it.code));
    setOpenMenu(null);
  };

  const startRename = (kind: "coll" | "item") => {
    setOpenMenu(null);
    setRenaming(kind);
    setRenameDraft(
      (kind === "coll" ? activeCollection?.name : activeItem?.name) ?? "",
    );
  };

  const commitRename = () => {
    const name = renameDraft.trim();
    if (name) {
      if (renaming === "coll" && activeCollection)
        dispatch(renameCollection({ id: activeCollection.id, name }));
      if (renaming === "item" && activeItem)
        dispatch(renameItem({ itemId: activeItem.id, name }));
    }
    setRenaming(null);
  };

  // Split so the command palette's Format entry (built during render, thus
  // barred from touching `monacoEditorRef` — a ref read during render is
  // exactly what `react-hooks/refs` flags) can call the Prettier-only path
  // without the ref-touching fallback below. `handleFormat`, wired to the
  // footer's `onClick` (a real event handler position, not render output),
  // keeps the fallback.
  const formatWithPrettier = async () => {
    try {
      const formatted = await prettier.format(code, {
        parser: "babel-ts",
        plugins: [babelPlugin, estreePlugin],
        singleQuote: true,
        printWidth: 80,
        trailingComma: "all",
      });
      dispatch(setCode(formatted));
      return true;
    } catch (e) {
      console.warn("Prettier format failed:", e);
      return false;
    }
  };

  const handleFormat = async () => {
    const ok = await formatWithPrettier();
    if (!ok) {
      monacoEditorRef.current?.getAction("editor.action.formatDocument")?.run();
    }
  };

  // Command palette's full catalog — Actions mirrors the toolbar's own
  // mutually-exclusive Run/Stop/Next gating below (only the relevant one is
  // ever included, so the palette never needs a `disabled` row), Examples
  // and Requests reuse the exact handlers the footer's Examples popover and
  // the breadcrumb's request picker already call, and Environments is
  // omitted outright (not shown empty) with no active collection.
  const commands: Command[] = (() => {
    const actions: Command[] = [];
    if (paused) {
      actions.push({
        id: "action-next",
        category: "Actions",
        label: "Step to next call",
        icon: SkipForward,
        onSelect: onNext,
      });
    } else if (running) {
      actions.push({
        id: "action-stop",
        category: "Actions",
        label: "Stop run",
        icon: Square,
        onSelect: onStop,
      });
    } else {
      actions.push({
        id: "action-run",
        category: "Actions",
        label: hasSelection ? "Run selection" : "Run script",
        keywords: ["execute"],
        icon: Play,
        onSelect: () => onRun(runTarget()),
      });
    }
    actions.push(
      {
        id: "action-step-mode",
        category: "Actions",
        label: stepMode ? "Disable step mode" : "Enable step mode",
        icon: Footprints,
        onSelect: () => dispatch(setStepMode(!stepMode)),
      },
      {
        id: "action-format",
        category: "Actions",
        label: "Format code",
        keywords: ["prettier"],
        icon: WandSparkles,
        onSelect: () => void formatWithPrettier(),
      },
      {
        id: "action-tweaks",
        category: "Actions",
        label: tweaksOpen ? "Close Tweaks panel" : "Open Tweaks panel",
        keywords: ["settings", "theme", "layout"],
        icon: SlidersHorizontal,
        onSelect: () => dispatch(setTweaksOpen(!tweaksOpen)),
      },
      {
        id: "action-fullscreen",
        category: "Actions",
        label:
          displayMode === "fullscreen" ? "Exit fullscreen" : "Enter fullscreen",
        keywords: ["zen", "full screen"],
        icon: Laptop,
        onSelect: () =>
          void applyDisplayMode(
            displayMode === "fullscreen" ? "browser" : "fullscreen",
          ),
      },
      ...(
        [
          { id: "collections", label: "Go to Requests", Icon: FolderOpen },
          { id: "env", label: "Go to Envs", Icon: FileLock },
          { id: "vars", label: "Go to Vars", Icon: TableProperties },
          { id: "db", label: "Go to DB", Icon: Database },
          { id: "file", label: "Go to File", Icon: FolderDown },
          { id: "storage", label: "Go to Storage", Icon: HardDrive },
        ] as Array<{ id: SidebarTab; label: string; Icon: typeof FolderOpen }>
      ).map(({ id, label, Icon }) => ({
        id: `action-sidebar-${id}`,
        category: "Actions" as const,
        label,
        icon: Icon,
        onSelect: () => dispatch(setSidebarTab(id)),
      })),
    );

    // File actions — the same operations FilePane exposes, so a script or
    // collection can be saved/loaded without leaving the editor.
    actions.push(
      {
        id: "action-file-save-script",
        category: "Actions",
        label: "Save script to file",
        keywords: ["export", "download", "ts"],
        icon: Download,
        onSelect: fileActions.saveScript,
      },
      {
        id: "action-file-import-script",
        category: "Actions",
        label: "Import script from file",
        keywords: ["open", "load", "upload"],
        icon: Upload,
        onSelect: () => void fileActions.importScript(),
      },
      {
        id: "action-file-export-collection",
        category: "Actions",
        label: "Export collections to JSON",
        keywords: ["save", "download", "backup"],
        icon: FolderDown,
        onSelect: fileActions.exportCollection,
      },
      {
        id: "action-file-import-collection",
        category: "Actions",
        label: "Import collections from JSON",
        keywords: ["load", "upload", "restore"],
        icon: FolderUp,
        onSelect: () => void fileActions.importCollection(),
      },
      {
        id: "action-file-import-curl",
        category: "Actions",
        label: "Import request from cURL",
        keywords: ["curl", "paste"],
        icon: SquareTerminal,
        onSelect: () => setCurlImportOpen(true),
      },
    );

    const examples: Command[] = EXAMPLE_SCRIPTS.map((ex) => ({
      id: `example-${ex.label}`,
      category: "Examples",
      label: ex.label,
      method: ex.method,
      onSelect: () => setSelectedExample(ex),
    }));

    const requestSource = collections.flatMap((col) =>
      col.items.map((it) => ({ ...it, collectionName: col.name })),
    );
    const requests: Command[] = requestSource.map((it) => ({
      id: `request-${it.id}`,
      category: "Requests",
      label: it.name,
      sublabel: it.collectionName,
      method: it.method,
      onSelect: () => selectItemRow(it),
    }));

    const environmentCommands: Command[] =
      activeCollection && environments.length > 0
        ? environments.map((env, i) => ({
            id: `env-${env.id}`,
            category: "Environments",
            label: env.name,
            onSelect: () =>
              dispatch(
                setEnvIdx({ collectionId: activeCollection.id, envIdx: i }),
              ),
          }))
        : [];

    return [...actions, ...examples, ...requests, ...environmentCommands];
  })();

  if (collections.length === 0) return <EditorEmptyState />;

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-app-editor">
      {/* Toolbar */}
      <div className="flex h-11 min-w-0 shrink-0 items-center gap-2 border-b border-app-border bg-app-panel px-3">
        <FolderOpen
          size={14}
          className="shrink-0 text-app-accent-dim"
          aria-hidden="true"
        />

        {/* Breadcrumb — each segment splits a rename label (click) from a
            chevron that opens its picker Popover. */}
        {activeItem && activeCollection ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {renaming === "coll" ? (
              <div className="w-[180px] shrink-0">
                <Input
                  autoFocus
                  icon={Feather}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={commitRename}
                  aria-label={`Rename ${activeCollection.name}`}
                  data-testid="code-editor-rename-collection-input"
                  className="py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]"
                />
              </div>
            ) : (
              <Popover
                open={openMenu === "coll"}
                onOpenChange={(o) =>
                  setOpenMenu((prev) =>
                    o ? "coll" : prev === "coll" ? null : prev,
                  )
                }
              >
                <div
                  data-active={openMenu === "coll" || undefined}
                  className="flex shrink-0 items-center overflow-hidden rounded-md border-2 border-transparent bg-app-hover text-app-dim transition-colors duration-200 focus-within:border-app-accent data-active:border-app-accent data-active:text-app-accent"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => startRename("coll")}
                        className="max-w-[110px] py-1 pl-2 pr-1 text-left text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors duration-200 hover:text-app-accent focus-visible:text-app-accent focus-visible:outline-none"
                      >
                        <span className="block truncate">
                          {activeCollection.name}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Click to rename collection</TooltipContent>
                  </Tooltip>
                  <span
                    className="my-1 w-px self-stretch bg-app-border-mid"
                    aria-hidden="true"
                  />
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Switch collection"
                      aria-expanded={openMenu === "coll"}
                      className="flex items-center self-stretch px-1 transition-colors duration-200 hover:text-app-accent focus-visible:text-app-accent focus-visible:outline-none"
                    >
                      <ChevronDown
                        size={12}
                        className="opacity-70"
                        aria-hidden="true"
                      />
                    </button>
                  </PopoverTrigger>
                </div>
                <PopoverContent
                  align="start"
                  aria-label="Switch collection"
                  className="p-0"
                >
                  <ButtonGroup
                    orientation="vertical"
                    className="w-full flex-col gap-0"
                  >
                    {collections.map((col) => {
                      const empty = col.items.length === 0;
                      return (
                        <button
                          key={col.id}
                          type="button"
                          disabled={empty}
                          onClick={() => selectCollectionRow(col)}
                          data-active={
                            col.id === activeCollection?.id || undefined
                          }
                          className="flex w-full items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-2 text-left transition-colors duration-200 hover:bg-app-accent-faint hover:text-app-accent focus-visible:bg-app-accent-faint focus-visible:text-app-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent disabled:pointer-events-none disabled:opacity-40 data-active:bg-app-accent-faint data-active:text-app-accent"
                        >
                          <FolderOpen
                            size={13}
                            aria-hidden="true"
                            className="shrink-0 text-app-dim"
                          />
                          <span className="min-w-0 flex-1 truncate text-[12px] text-app-text">
                            {col.name}
                          </span>
                        </button>
                      );
                    })}
                  </ButtonGroup>
                </PopoverContent>
              </Popover>
            )}
            <span
              className="shrink-0 select-none text-[12px] text-app-dim"
              aria-hidden="true"
            >
              /
            </span>
            {renaming === "item" ? (
              <div className="w-[180px] shrink-0">
                <Input
                  autoFocus
                  icon={Feather}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={commitRename}
                  aria-label={`Rename ${activeItem.name}`}
                  data-testid="code-editor-rename-item-input"
                  className="py-0.5 text-[12px]"
                />
              </div>
            ) : (
              <Popover
                open={openMenu === "item"}
                onOpenChange={(o) =>
                  setOpenMenu((prev) =>
                    o ? "item" : prev === "item" ? null : prev,
                  )
                }
              >
                <div
                  data-active={openMenu === "item" || undefined}
                  className="flex min-w-0 items-center overflow-hidden rounded-md border-2 border-transparent bg-app-hover text-app-bright transition-colors duration-200 focus-within:border-app-accent data-active:border-app-accent data-active:text-app-accent"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => startRename("item")}
                        className="min-w-0 py-1 pl-2 pr-1 text-left text-[12px] font-bold tracking-[0.02em] transition-colors duration-200 hover:text-app-accent focus-visible:text-app-accent focus-visible:outline-none"
                      >
                        <span className="block truncate">
                          {activeItem.name}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Click to rename request</TooltipContent>
                  </Tooltip>
                  <span
                    className="my-1 w-px self-stretch bg-app-border-mid"
                    aria-hidden="true"
                  />
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Switch request"
                      aria-expanded={openMenu === "item"}
                      className="flex items-center self-stretch px-1 transition-colors duration-200 hover:text-app-accent focus-visible:text-app-accent focus-visible:outline-none"
                    >
                      <ChevronDown
                        size={12}
                        className="opacity-70"
                        aria-hidden="true"
                      />
                    </button>
                  </PopoverTrigger>
                </div>
                <PopoverContent
                  align="start"
                  aria-label="Switch request"
                  className="p-0"
                >
                  <ButtonGroup
                    orientation="vertical"
                    className="w-full flex-col gap-0"
                  >
                    {activeCollection?.items.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => selectItemRow(it)}
                        data-active={it.id === activeItem?.id || undefined}
                        className="flex w-full items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-2 text-left transition-colors duration-200 hover:bg-app-accent-faint hover:text-app-accent focus-visible:bg-app-accent-faint focus-visible:text-app-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent data-active:bg-app-accent-faint data-active:text-app-accent"
                      >
                        <span className="flex w-11 shrink-0 justify-center">
                          <MethodPill method={it.method} sm focusable={false} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-app-text">
                          {it.name}
                        </span>
                      </button>
                    ))}
                  </ButtonGroup>
                </PopoverContent>
              </Popover>
            )}
          </div>
        ) : (
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-app-dim">
            Scratch Pad
          </span>
        )}

        {/* Next — only when paused in step mode */}
        {paused && (
          <button
            type="button"
            onClick={onNext}
            className={`${ACTION_BTN} animate-[pulse_1s_ease-in-out_infinite] bg-app-warn focus-visible:ring-app-warn`}
          >
            <SkipForward size={13} fill="currentColor" aria-hidden="true" />
            Next
          </button>
        )}

        {/* Stop — only while running */}
        {running && !paused && (
          <button
            type="button"
            onClick={onStop}
            className={`${ACTION_BTN} bg-app-error focus-visible:ring-app-error`}
          >
            <Square size={12} fill="currentColor" aria-hidden="true" />
            Stop
          </button>
        )}

        {/* Run — hidden while running or paused */}
        {!running && !paused && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onRun(runTarget())}
                className={`${ACTION_BTN} bg-app-accent focus-visible:ring-app-accent`}
              >
                {hasSelection ? "Run Sel" : "Run"}
                <span className="text-[10px] font-normal normal-case tracking-normal opacity-75">
                  ⌘↵
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {hasSelection
                ? `Run ${selectionLines} selected line${selectionLines === 1 ? "" : "s"} — ⌘⇧↵ runs all`
                : "Run shortcut"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Editor body */}
      <div className="relative flex-1 overflow-hidden">
        <MonacoCodeEditor
          value={code}
          onChange={(v) => dispatch(setCode(v))}
          envVars={envVars}
          T={T}
          onRun={onRun}
          onSelectionChange={setSelection}
          onMount={(editor) => {
            monacoEditorRef.current = editor;
          }}
        />
      </div>

      {/* Example preview dialog */}
      {selectedExample && (
        <ExampleDialog
          T={T}
          example={selectedExample}
          onClose={() => setSelectedExample(null)}
          onLoad={() => {
            dispatch(setCode(selectedExample.code));
            setSelectedExample(null);
          }}
        />
      )}

      {/* Command palette — global, opened by the footer's Search button or
          ⌘K/Ctrl+K anywhere in the app (BulkyApp.tsx). */}
      {commandPaletteOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => dispatch(setCommandPaletteOpen(false))}
        />
      )}

      {/* cURL import — reachable from the command palette's "Import request
          from cURL" entry; the same dialog FilePane opens. */}
      {curlImportOpen && (
        <CurlImportDialog
          onImport={(command) => {
            fileActions.importCurl(command);
            setCurlImportOpen(false);
          }}
          onClose={() => setCurlImportOpen(false)}
        />
      )}

      {/* Socket composer — only while a call in this run has an open
          `api.ws`/`api.io` connection. Enter sends, Shift+Enter inserts a
          newline. Disconnect closes it directly; the script can also
          `sock.close()`, Stop closes it mid-run, and starting a new run
          closes any leftover connection (useScriptRunner). */}
      {openSocket && (
        <div className="flex shrink-0 items-end gap-2 border-t border-app-border bg-app-panel px-3 py-2">
          <textarea
            data-testid="code-editor-socket-message-textarea"
            rows={2}
            value={wsDraft}
            onChange={(e) => setWsDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendWsDraft();
              }
            }}
            placeholder="Send a message over the open connection…"
            className="h-16 min-w-0 flex-1 resize-none rounded-md border border-app-border bg-app-editor px-2.5 py-1.5 font-mono text-[12px] text-app-text outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
          />
          <div className="flex shrink-0 flex-col gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-testid="code-editor-socket-disconnect-button"
                  onClick={() => onCloseSocket(openSocketKey)}
                  disabled={running}
                  className={`${ACTION_BTN} h-6 bg-app-error px-2.5 focus-visible:ring-app-error`}
                >
                  <Unplug size={12} aria-hidden="true" />
                  Disconnect
                </button>
              </TooltipTrigger>
              <TooltipContent>Disconnect</TooltipContent>
            </Tooltip>
            <button
              type="button"
              data-testid="code-editor-socket-send-button"
              onClick={sendWsDraft}
              disabled={running || !wsDraft.trim()}
              className={ACTION_BTN}
              style={{ background: T.accent }}
            >
              <Send size={13} aria-hidden="true" />
              Send
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex h-9 min-w-0 shrink-0 items-center gap-2 border-t border-app-border bg-app-panel px-3">
        {activeItem && <MethodPill method={activeItem.method} sm />}

        <ButtonGroup className={GROUP_BOX}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleFormat}
                aria-label="Format document"
                className={TOOL_BTN}
              >
                <WandSparkles size={13} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Format document (Shift+Alt+F)</TooltipContent>
          </Tooltip>

          <Popover open={examplesOpen} onOpenChange={setExamplesOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Example scripts"
                aria-expanded={examplesOpen}
                data-active={examplesOpen || undefined}
                className={TOOL_BTN}
              >
                <BookOpen size={13} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="center"
              aria-label="Example scripts"
              className="p-0"
            >
              <ButtonGroup
                orientation="vertical"
                className="w-full flex-col gap-0"
              >
                {EXAMPLE_SCRIPTS.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => {
                      setSelectedExample(ex);
                      setExamplesOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-2 text-left transition-colors duration-200 hover:bg-app-accent-faint hover:text-app-accent focus-visible:bg-app-accent-faint focus-visible:text-app-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent"
                  >
                    <span className="flex w-11 shrink-0 justify-center">
                      <MethodPill method={ex.method} sm focusable={false} />
                    </span>
                    <span className="text-[12px] text-app-text">
                      {ex.label}
                    </span>
                  </button>
                ))}
              </ButtonGroup>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => dispatch(setCommandPaletteOpen(true))}
                aria-label="Command palette"
                className={TOOL_BTN}
              >
                <Search size={13} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Command palette (⌘K)</TooltipContent>
          </Tooltip>
        </ButtonGroup>

        <span
          className="my-1.5 w-px self-stretch bg-app-border-mid"
          aria-hidden="true"
        />

        {/* Layout switcher — same four LayoutKey values TweaksPanel's full
            Layout section offers, as a compact icon-only segmented group so
            switching doesn't need a trip through Tweaks. */}
        <ButtonGroup className={GROUP_BOX}>
          {LAYOUT_TOOL_OPTIONS.map(({ id, label, Icon }) => (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => dispatch(setLayout(id))}
                  aria-label={label}
                  aria-pressed={layout === id}
                  data-active={layout === id || undefined}
                  className={TOOL_BTN}
                >
                  <Icon size={13} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </ButtonGroup>

        <span className="flex-1" />
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-app-dim">
          <Code2 size={12} aria-hidden="true" />
          TypeScript <span className="text-app-border-mid">·</span>{" "}
          <span className="text-app-accent-dim">Bulky Runtime v2.0</span>
        </span>
      </div>
    </div>
  );
}
