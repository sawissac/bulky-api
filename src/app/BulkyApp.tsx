"use client";

import { useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { THEMES, themeVars } from "@/lib/themes";
import { analyzeScript } from "@/lib/scriptAnalyzer";
import { composeScript } from "@/lib/composeScript";
import { useScriptRunner } from "@/hooks/useScriptRunner";
import {
  selectTheme,
  selectTweaksOpen,
  selectViewByItemId,
  setResponseView,
  selectLayout,
  selectCommandPaletteOpen,
  setCommandPaletteOpen,
  selectPatternOpacity,
} from "@/store/uiSlice";
import { selectCode, setCode } from "@/store/editorSlice";
import { selectEnvVars, selectActiveHooks } from "@/store/collectionsSlice";
import {
  selectRunning,
  selectStepMode,
  selectPaused,
  syncAnalyzedCalls,
  switchToItem,
  setStepMode,
} from "@/store/runnerSlice";
import {
  selectActiveId,
  selectActiveItem,
  selectCollections,
  saveItemCode,
} from "@/store/collectionsSlice";
import ActivityRail from "@/features/sidebar/components/ActivityRail";
import Sidebar from "@/features/sidebar/components/Sidebar";
import CodeEditor from "@/features/code-editor/components/CodeEditor";
import ResponsePanel from "@/features/response-panel/components/ResponsePanel";
import TweaksPanel from "@/features/tweaks/components/TweaksPanel";
import {
  ResizableGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

const LAYOUT_SIZES = {
  balanced: { side: "25%", editor: "50%", resp: "25%" },
  "editor-focus": { side: "18%", editor: "64%", resp: "18%" },
  "response-focus": { side: "18%", editor: "32%", resp: "50%" },
  // `editor`/`resp` split the right column's height (editor top, response
  // bottom) instead of the row's width the other three presets use them for.
  stacked: { side: "20%", editor: "60%", resp: "40%" },
} as const;

const HANDLE =
  "w-3 bg-transparent text-app-border transition-colors duration-200 hover:text-app-border-accent " +
  "aria-[orientation=horizontal]:h-3 " +
  "data-[resize-handle-active]:text-app-accent [&>div]:h-8 [&>div]:w-[3px] [&>div]:rounded-full [&>div]:bg-current";

const PANE = "h-full w-full overflow-hidden rounded-xl border border-app-border";

/**
 * Application shell: a fixed vertical rail on the left, then three resizable
 * panes — sidebar, script editor, response panel — filling the rest of the
 * viewport. It owns the wiring between the active collection item, the editor
 * buffer and the runner, and mounts the tweaks panel when it is open. This is
 * the only place that composes those pieces; individual panes are mounted
 * nowhere else.
 *
 * @remarks
 * Status: stable — Type: page shell
 *
 * State & behavior: no local state. Six effects do the work. The first mirrors
 * the active theme's variables onto `<html>` so portalled UI (dialogs, tweaks
 * panel) and document chrome (scrollbars) read the same tokens as the app root;
 * the inline `style` on the root applies them again so the very first paint is
 * already themed and does not flash. The second re-analyzes the script 300ms
 * after the code, environment, or the active collection's pre-run / post-run
 * hooks settle — the hooks are folded around the buffer by `composeScript`
 * first, so the card preview matches what a run will do — skipping analysis
 * while a run is in flight and on the render that follows an item switch;
 * `isSwitchingItemRef` carries that flag, since the code change there comes
 * from the store, not the user. The third loads an item's code and restores its stored call results
 * when `activeId` changes; when nothing is active it clears the runner, and
 * also empties the editor buffer if an item had just been open — so deleting
 * the active request or its collection leaves no stale script behind. The
 * fourth writes edits back to the active item 400ms after typing stops. The
 * fifth empties the editor buffer when the last collection goes away, so a
 * deleted collection's script does not linger in the pad. The sixth swallows
 * ⌘S / Ctrl+S on `window` in the capture phase — nothing in the app saves on
 * that key, and the browser's Save Page dialog only gets in the way. The
 * seventh, same capture-phase treatment, toggles `commandPaletteOpen` on
 * ⌘K / Ctrl+K so {@link CodeEditor}'s command palette opens from anywhere in
 * the app, not just its own footer button.
 *
 * Variants: pane sizes follow the `layout` setting — `balanced`,
 * `editor-focus`, `response-focus` all arrange sidebar/editor/response in one
 * horizontal row, differing only in width split. `stacked` instead nests a
 * second, vertical {@link ResizableGroup} inside the row's right-hand
 * panel, so the editor sits above the response panel rather than beside it;
 * the sidebar panel is unchanged. Changing `layout` remounts the outer panel
 * group by key, which is what resets panes a user has dragged.
 *
 * Composition: renders {@link ActivityRail}, {@link Sidebar},
 * {@link CodeEditor}, {@link ResponsePanel} and, when open,
 * {@link TweaksPanel}. Expects the Redux provider above it.
 *
 * Accessibility: the pane group is the page's `main` landmark; the rail
 * provides the `nav` landmark. Resize handles come from the resizable
 * primitives and are keyboard-operable.
 *
 * Test ids: none of its own — the rail, panes and tweaks panel carry theirs.
 *
 * CSS classes: none — Tailwind utilities over the `app-*` theme tokens only.
 *
 * Edge cases:
 * - Unknown `layout` value falls back to `editor-focus` sizing.
 * - No active item but collections remain → the runner is cleared. The editor
 *   buffer is emptied when an item had just been open (a deleted request or
 *   collection); a hydrated snapshot with no active item keeps its buffer as
 *   a scratch pad.
 * - No collections at all → the editor buffer is emptied, both when the last
 *   one is deleted and when a snapshot with none is hydrated.
 * - Both debounce timers are cleared on unmount, so a pending analyze or save
 *   cannot dispatch after teardown.
 *
 * Dependencies: `react-redux`, internal `useScriptRunner` hook, `analyzeScript`,
 * `composeScript`.
 *
 * @example
 * ```tsx
 * export default function Page() {
 *   return (
 *     <Providers>
 *       <BulkyApp />
 *     </Providers>
 *   );
 * }
 * ```
 *
 * @see {@link ActivityRail}
 */
export default function BulkyApp() {
  const dispatch = useDispatch();
  const theme = useSelector(selectTheme);
  const layout = useSelector(selectLayout);
  const tweaksOpen = useSelector(selectTweaksOpen);
  const commandPaletteOpen = useSelector(selectCommandPaletteOpen);
  const patternOpacity = useSelector(selectPatternOpacity);
  const viewByItemId = useSelector(selectViewByItemId);
  const code = useSelector(selectCode);
  const envVars = useSelector(selectEnvVars);
  const hooks = useSelector(selectActiveHooks);
  const running = useSelector(selectRunning);
  const activeId = useSelector(selectActiveId);
  const activeItem = useSelector(selectActiveItem);
  const collections = useSelector(selectCollections);
  const stepMode = useSelector(selectStepMode);
  const paused = useSelector(selectPaused);

  const { onRun, onNext, onStop, sendSocketMessage, closeSocketConnection } =
    useScriptRunner();

  const T = THEMES[theme] || THEMES.ocean;
  const L = LAYOUT_SIZES[layout] ?? LAYOUT_SIZES["editor-focus"];

  useEffect(() => {
    const root = document.documentElement;
    const vars = themeVars(T);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    root.style.colorScheme = T.isLight ? "light" : "dark";
  }, [T]);

  // `patternOpacity` (0–100, uiSlice) as the 0–1 multiplier the
  // `app-panel-texture--*` utilities scale every gradient color by — set
  // here rather than folded into `themeVars()`, which is pure `Theme -> CSS
  // vars` and used by places with no `ui` state at all (StatusScreen, the
  // mocks gallery).
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-pattern-alpha",
      String(patternOpacity / 100),
    );
  }, [patternOpacity]);

  // Stable identity so the memoized ResponsePanel survives a keystroke:
  // `code` changes on every character typed, re-rendering this component, and
  // an inline arrow here would hand the panel a new prop each time and defeat
  // the memo.
  const onToggleStep = useCallback(
    () => dispatch(setStepMode(!stepMode)),
    [stepMode, dispatch],
  );

  const isSwitchingItemRef = useRef(false);

  const analyzeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const switching = isSwitchingItemRef.current;
    isSwitchingItemRef.current = false;
    if (running || switching) return;
    clearTimeout(analyzeTimerRef.current ?? undefined);
    analyzeTimerRef.current = setTimeout(() => {
      dispatch(
        syncAnalyzedCalls(
          analyzeScript(
            composeScript({ preRun: hooks.preRun, code, postRun: hooks.postRun }),
            envVars,
          ),
        ),
      );
    }, 300);
    return () => clearTimeout(analyzeTimerRef.current ?? undefined);
  }, [code, envVars, hooks, running, dispatch]);

  const prevActiveIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeId && activeId !== prevActiveIdRef.current) {
      prevActiveIdRef.current = activeId;
      if (activeItem) {
        isSwitchingItemRef.current = true;
        dispatch(setCode(activeItem.code));
        dispatch(
          switchToItem({
            itemId: activeId,
            analyzedCalls: analyzeScript(
              composeScript({
                preRun: hooks.preRun,
                code: activeItem.code,
                postRun: hooks.postRun,
              }),
              envVars,
            ),
          }),
        );
        dispatch(setResponseView(viewByItemId[activeId] ?? "cards"));
      }
    } else if (!activeId) {
      const hadActiveItem = prevActiveIdRef.current !== null;
      prevActiveIdRef.current = null;
      if (hadActiveItem) dispatch(setCode(""));
      dispatch(switchToItem({ itemId: null, analyzedCalls: [] }));
    }
  }, [activeId, activeItem, envVars, hooks, dispatch, viewByItemId]);

  const hadCollectionsRef = useRef(false);
  useEffect(() => {
    const has = collections.length > 0;
    if (hadCollectionsRef.current && !has) dispatch(setCode(""));
    hadCollectionsRef.current = has;
  }, [collections, dispatch]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeId) return;
    clearTimeout(saveTimerRef.current ?? undefined);
    saveTimerRef.current = setTimeout(() => {
      dispatch(saveItemCode({ itemId: activeId, code }));
    }, 400);
    return () => clearTimeout(saveTimerRef.current ?? undefined);
  }, [code, activeId, dispatch]);

  // ⌘S / Ctrl+S: the browser's Save Page dialog is noise here — edits are
  // already persisted on their own — so the shortcut is swallowed app-wide,
  // in the capture phase so Monaco never sees it either.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  // ⌘K / Ctrl+K: toggles the global command palette from anywhere in the
  // app, capture phase so it fires even with focus inside Monaco. The
  // palette itself mounts inside `CodeEditor` (its commands close over
  // things only that component already holds — `onRun`/`onStop`/`onNext`,
  // `handleFormat`, the example list); this effect only flips the shared
  // Redux flag `CodeEditor` reads to show it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        dispatch(setCommandPaletteOpen(!commandPaletteOpen));
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [commandPaletteOpen, dispatch]);

  return (
    <div
      style={
        {
          ...themeVars(T),
          "--app-pattern-alpha": String(patternOpacity / 100),
        } as React.CSSProperties
      }
      className="flex h-screen w-screen overflow-hidden bg-app-bg font-sans text-app-text"
    >
      <ActivityRail />

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden p-2">
        <ResizableGroup
          key={layout}
          orientation="horizontal"
          className="h-full"
        >
          <ResizablePanel defaultSize={L.side} minSize="15%" maxSize="40%">
            <div className={PANE}>
              <Sidebar T={T} />
            </div>
          </ResizablePanel>
          <ResizableHandle className={HANDLE} />
          {layout === "stacked" ? (
            <ResizablePanel
              defaultSize={`${100 - parseInt(L.side, 10)}%`}
              minSize="30%"
            >
              <ResizableGroup orientation="vertical" className="h-full">
                <ResizablePanel defaultSize={L.editor} minSize="20%">
                  <div className={PANE}>
                    <CodeEditor
                      T={T}
                      onRun={onRun}
                      onNext={onNext}
                      onStop={onStop}
                      running={running}
                      paused={paused}
                      onSendSocketMessage={sendSocketMessage}
                      onCloseSocket={closeSocketConnection}
                    />
                  </div>
                </ResizablePanel>
                <ResizableHandle className={HANDLE} />
                <ResizablePanel defaultSize={L.resp} minSize="15%">
                  <div className={PANE}>
                    <ResponsePanel
                      T={T}
                      stepMode={stepMode}
                      running={running}
                      onToggleStep={onToggleStep}
                    />
                  </div>
                </ResizablePanel>
              </ResizableGroup>
            </ResizablePanel>
          ) : (
            <>
              <ResizablePanel defaultSize={L.editor} minSize="25%">
                <div className={PANE}>
                  <CodeEditor
                    T={T}
                    onRun={onRun}
                    onNext={onNext}
                    onStop={onStop}
                    running={running}
                    paused={paused}
                    onSendSocketMessage={sendSocketMessage}
                    onCloseSocket={closeSocketConnection}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle className={HANDLE} />
              <ResizablePanel defaultSize={L.resp} minSize="15%" maxSize="70%">
                <div className={PANE}>
                  <ResponsePanel
                    T={T}
                    stepMode={stepMode}
                    running={running}
                    onToggleStep={onToggleStep}
                  />
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizableGroup>
      </main>

      {tweaksOpen && <TweaksPanel T={T} />}
    </div>
  );
}
