import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ApiCall, LogEntry, Assertion } from "@/lib/types";
import { removeItem } from "./collectionsSlice";
import { findCallIndex } from "@/lib/callMatch";

type RunnerState = {
  builtCalls: ApiCall[];
  logs: LogEntry[];
  running: boolean;
  runStartedAt: number | null;
  stepMode: boolean;
  paused: boolean;
  callsByItemId: Record<string, ApiCall[]>;
  currentItemId: string | null;
  runCacheFlags: boolean[];
  /** Whole-script stubs captured at run start. A run of a selection executes
   *  only some of them, so live calls are overlaid onto this list rather than
   *  replacing it — the calls the fragment skipped stay on screen as stubs. */
  runPreview: ApiCall[];
  extractedVars: Record<string, string>;
  assertions: Assertion[];
};

const initialState: RunnerState = {
  builtCalls: [],
  logs: [],
  running: false,
  runStartedAt: null,
  stepMode: false,
  paused: false,
  callsByItemId: {},
  currentItemId: null,
  runCacheFlags: [],
  runPreview: [],
  extractedVars: {},
  assertions: [],
};

function applyStored(nc: ApiCall, existing: ApiCall): ApiCall {
  return {
    ...nc,
    url: existing.url,
    status: existing.status,
    statusCode: existing.statusCode,
    response: existing.response,
    responseHeaders: existing.responseHeaders,
    requestBody: existing.requestBody,
    requestHeaders: existing.requestHeaders,
    authInfo: existing.authInfo,
    duration: existing.duration,
    error: existing.error,
    timestamp: existing.timestamp,
    cache: existing.cache,
    isSse: existing.isSse,
    sseEvents: existing.sseEvents,
    isWs: existing.isWs,
    wsKind: existing.wsKind,
    wsEvents: existing.wsEvents,
    wsOpen: existing.wsOpen,
    assertions: existing.assertions,
  };
}

/**
 * Merge stored run results onto freshly analyzed call stubs.
 * Pass 1 — exact method + url match (handles env-resolved URLs).
 * Pass 2 — method + pre-interpolation `urlExpr` match, for calls whose stored
 *   url is resolved but whose stub still carries `{{vars}}` the analyzer
 *   can't expand.
 * Pass 3 — positional fallback for dynamic URLs neither pass can pair.
 */
function mergeCallsInto(
  analyzedCalls: ApiCall[],
  storedCalls: ApiCall[],
  slotOf: (analyzedIndex: number) => number | undefined,
): { calls: ApiCall[]; usedOld: Set<number> } {
  const usedOld = new Set<number>();
  if (storedCalls.length === 0) return { calls: analyzedCalls, usedOld };

  // Pass 1 + 2: same method, matched on the resolved url or — for a
  // `{{var}}` only the run could expand — on the pre-interpolation
  // expression. Without the second key a selection run's result, whose url is
  // resolved while every stub's isn't, falls through to the positional pass
  // and lands on whichever stub happens to share its index.
  const result: (ApiCall | null)[] = analyzedCalls.map((nc) => {
    const idx = findCallIndex(nc, storedCalls, usedOld);
    if (idx === -1) return null;
    usedOld.add(idx);
    return applyStored(nc, storedCalls[idx]);
  });

  // Pass 3: positional fallback for dynamic URLs neither key can pair — a
  // `${local}` the analyzer left verbatim, a url built at runtime. `slotOf`
  // says which stored index a stub's position corresponds to, since the two
  // lists only line up index-for-index when both came from the same script.
  for (let i = 0; i < analyzedCalls.length; i++) {
    if (result[i]) continue;
    const slot = slotOf(i);
    const stored = slot === undefined ? undefined : storedCalls[slot];
    result[i] =
      slot !== undefined &&
      stored &&
      !usedOld.has(slot) &&
      stored.method === analyzedCalls[i].method
        ? (usedOld.add(slot), applyStored(analyzedCalls[i], stored))
        : analyzedCalls[i];
  }

  return { calls: result as ApiCall[], usedOld };
}

/**
 * Stubs first, then the stored run's `extra` calls nothing claimed — a loop's
 * second and third iterations, a fan-out's tail. Without them a re-analyze
 * after the run trims the list back to one card per call site. A stored call
 * that is neither claimed nor `extra` was a call site the script no longer
 * has, so it drops.
 */
function mergeCalls(
  analyzedCalls: ApiCall[],
  storedCalls: ApiCall[],
): ApiCall[] {
  const { calls, usedOld } = mergeCallsInto(analyzedCalls, storedCalls, (i) => i);
  const extras = storedCalls.filter((c, i) => c.extra && !usedOld.has(i));
  return [...calls, ...extras].map((c, i) => ({ ...c, idx: i }));
}

/**
 * Overlays a run's live calls onto the whole-script stubs captured at run
 * start, so the requests a selection run never reached keep their cards
 * instead of vanishing the moment the first real call arrives.
 *
 * A live call the preview can't account for — an extra loop iteration, a url
 * built at runtime — is appended rather than dropped, so nothing that ran
 * goes unshown. `idx` is renumbered to the card's slot (it drives the card
 * label, its test id and the cache toggle); `runIdx` keeps the position the
 * run itself used, which is the socket registry's key.
 */
function overlayRunCalls(preview: ApiCall[], live: ApiCall[]): ApiCall[] {
  if (preview.length === 0) return live;

  // The run only makes the calls whose stubs were marked pending at run
  // start, in script order, so the k-th live call is the k-th pending stub's.
  // That pairs a stub whose url the analyzer couldn't resolve — without it the
  // live call lands as an extra card and the stub spins forever.
  const pendingSlots = new Map<number, number>();
  preview.forEach((c, i) => {
    if (c.status === "pending") pendingSlots.set(i, pendingSlots.size);
  });
  const { calls, usedOld } = mergeCallsInto(preview, live, (i) =>
    pendingSlots.get(i),
  );
  const extras = live
    .filter((_, i) => !usedOld.has(i))
    .map((c) => ({ ...c, extra: true }));

  return [...calls, ...extras].map((c, i) => ({ ...c, idx: i }));
}

const runnerSlice = createSlice({
  name: "runner",
  initialState,
  reducers: {
    setBuiltCalls(state, action: PayloadAction<ApiCall[]>) {
      state.builtCalls = action.payload;
      state.runCacheFlags = action.payload.map((c) => c.cache);
    },
    setRunPreview(state, action: PayloadAction<ApiCall[]>) {
      state.runPreview = action.payload;
    },
    syncAnalyzedCalls(state, action: PayloadAction<ApiCall[]>) {
      state.builtCalls = mergeCalls(action.payload, state.builtCalls);
    },
    switchToItem(
      state,
      action: PayloadAction<{
        itemId: string | null;
        analyzedCalls: ApiCall[];
      }>,
    ) {
      const { itemId, analyzedCalls } = action.payload;
      state.currentItemId = itemId;

      if (!itemId) {
        state.builtCalls = analyzedCalls;
        return;
      }

      const stored = state.callsByItemId[itemId] ?? [];
      state.builtCalls = mergeCalls(analyzedCalls, stored);
    },
    setLogs(state, action: PayloadAction<LogEntry[]>) {
      state.logs = action.payload;
    },
    setExtractedVars(state, action: PayloadAction<Record<string, string>>) {
      state.extractedVars = action.payload;
    },
    setAssertions(state, action: PayloadAction<Assertion[]>) {
      state.assertions = action.payload;
    },
    setRunning(state, action: PayloadAction<boolean>) {
      state.running = action.payload;
      if (action.payload) {
        state.runStartedAt = Date.now();
        state.extractedVars = {};
        state.assertions = [];
      }
      if (!action.payload) {
        state.paused = false;
        state.runPreview = [];
      }
    },
    setStepMode(state, action: PayloadAction<boolean>) {
      state.stepMode = action.payload;
    },
    setPaused(state, action: PayloadAction<boolean>) {
      state.paused = action.payload;
    },
    updateCallsAndLogs(
      state,
      action: PayloadAction<{
        calls: ApiCall[];
        logs: LogEntry[];
        itemId: string | null;
      }>,
    ) {
      // `runIdx` outlives the overlay's renumbering — the socket registry is
      // keyed by the position the run used, not by the card's slot.
      const live = action.payload.calls.map((c, i) => ({ ...c, runIdx: i }));

      // Restore user cache flags using snapshot taken at run start. The
      // snapshot is indexed by preview slot, which is what the overlay yields.
      const calls = overlayRunCalls(state.runPreview, live).map((c, i) => ({
        ...c,
        cache: state.runCacheFlags[i] ?? false,
      }));

      if (action.payload.itemId === state.currentItemId) {
        state.builtCalls = calls;
        state.logs = action.payload.logs;
      }

      if (action.payload.itemId) {
        state.callsByItemId[action.payload.itemId] = calls;
      }
    },
    toggleCallCache(state, action: PayloadAction<number>) {
      const call = state.builtCalls[action.payload];
      if (call) call.cache = !call.cache;

      // Keep callsByItemId in sync
      if (state.currentItemId) {
        state.callsByItemId[state.currentItemId] = state.builtCalls.map(
          (c) => ({ ...c }),
        );
      }
    },
    hydrateRunner(_state, action: PayloadAction<Partial<RunnerState>>) {
      return {
        ...initialState,
        builtCalls: action.payload.builtCalls ?? [],
        callsByItemId: action.payload.callsByItemId ?? {},
        currentItemId: action.payload.currentItemId ?? null,
      };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(removeItem, (state, action) => {
      delete state.callsByItemId[action.payload.itemId];
    });
  },
});

export const {
  setBuiltCalls,
  setRunPreview,
  syncAnalyzedCalls,
  switchToItem,
  setLogs,
  setRunning,
  setStepMode,
  setPaused,
  setExtractedVars,
  setAssertions,
  updateCallsAndLogs,
  toggleCallCache,
  hydrateRunner,
} = runnerSlice.actions;
export default runnerSlice.reducer;

export const selectBuiltCalls = (s: { runner: RunnerState }) =>
  s.runner.builtCalls;
export const selectLogs = (s: { runner: RunnerState }) => s.runner.logs;
export const selectRunning = (s: { runner: RunnerState }) => s.runner.running;
export const selectRunStartedAt = (s: { runner: RunnerState }) =>
  s.runner.runStartedAt;
export const selectStepMode = (s: { runner: RunnerState }) => s.runner.stepMode;
export const selectPaused = (s: { runner: RunnerState }) => s.runner.paused;
export const selectExtractedVars = (s: { runner: RunnerState }) =>
  s.runner.extractedVars;
export const selectAssertions = (s: { runner: RunnerState }) =>
  s.runner.assertions;
