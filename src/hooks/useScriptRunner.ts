"use client";

import { useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { analyzeScript } from "@/lib/scriptAnalyzer";
import { runScript, type SocketHandle } from "@/lib/scriptRunner";
import { composeScript } from "@/lib/composeScript";
import { findCallIndex } from "@/lib/callMatch";
import { selectCode } from "@/store/editorSlice";
import {
  selectEnvVars,
  selectActiveEnv,
  selectActiveHooks,
  selectConnections,
  selectActiveConnection,
} from "@/store/collectionsSlice";
import {
  selectBuiltCalls,
  selectRunning,
  selectStepMode,
  setBuiltCalls,
  setRunPreview,
  setRunning,
  setPaused,
  setExtractedVars,
  setAssertions,
  updateCallsAndLogs,
} from "@/store/runnerSlice";
import { selectActiveId } from "@/store/collectionsSlice";
import { selectCallTimeout } from "@/store/uiSlice";

export function useScriptRunner() {
  const dispatch = useDispatch();
  const code = useSelector(selectCode);
  const envVars = useSelector(selectEnvVars);
  const activeEnv = useSelector(selectActiveEnv);
  const hooks = useSelector(selectActiveHooks);
  const connections = useSelector(selectConnections);
  const activeConnection = useSelector(selectActiveConnection);
  const builtCalls = useSelector(selectBuiltCalls);
  const running = useSelector(selectRunning);
  const activeId = useSelector(selectActiveId);
  const stepMode = useSelector(selectStepMode);
  const callTimeout = useSelector(selectCallTimeout);

  // Calls paused in step mode, oldest first. More than one waits at a time
  // when `api.parallel` fans out, so each Next releases exactly one of them
  // rather than the last to arrive clobbering the rest.
  const stepQueueRef = useRef<Array<() => void>>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const socketRegistryRef = useRef<Map<number, SocketHandle>>(new Map());

  const waitForNext = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      stepQueueRef.current.push(resolve);
      dispatch(setPaused(true));
    });
  }, [dispatch]);

  const onNext = useCallback(() => {
    const resume = stepQueueRef.current.shift();
    if (resume) {
      resume();
      if (stepQueueRef.current.length === 0) dispatch(setPaused(false));
    }
  }, [dispatch]);

  const onStop = useCallback(() => {
    abortControllerRef.current?.abort();
    // If paused in step mode, resume so the script can see the abort and exit
    if (stepQueueRef.current.length) {
      stepQueueRef.current.splice(0).forEach((resume) => resume());
      dispatch(setPaused(false));
    }
  }, [dispatch]);

  // `overrideCode` runs a fragment — the editor's current selection — in
  // place of the item's full script. The collection's hooks still fold around
  // it, so the fragment sees the same env/auth setup a whole-script run does.
  const onRun = useCallback(
    async (overrideCode?: string) => {
      if (running) return;

      // A socket opened by the previous run can outlive that run's script
      // (nothing awaits it closing) — close any still open before starting a
      // fresh one, since there's no other UI affordance to reach it once its
      // run has finished.
      for (const handle of socketRegistryRef.current.values()) handle.close();
      socketRegistryRef.current = new Map();

      const runItemId = activeId;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Fold the active collection's pre-run / post-run hooks around the item
      // script — one source string for both the card preview and the run.
      const fullScript = composeScript({
        preRun: hooks.preRun,
        code,
        postRun: hooks.postRun,
      });
      const script = overrideCode
        ? composeScript({
            preRun: hooks.preRun,
            code: overrideCode,
            postRun: hooks.postRun,
          })
        : fullScript;

      // Cards always preview the whole script, even when only a selection runs:
      // the calls this run skips stay on screen as idle stubs beside the ones it
      // is about to make, instead of the list collapsing to the fragment.
      const previewCalls = analyzeScript(fullScript, envVars);
      const runCalls = overrideCode
        ? analyzeScript(script, envVars)
        : previewCalls;

      const willRun = new Set<number>();
      for (const rc of runCalls) {
        const i = findCallIndex(rc, previewCalls, willRun);
        if (i !== -1) willRun.add(i);
      }

      dispatch(setRunning(true));
      const stubs = previewCalls.map((c, i) => ({
        ...c,
        status: willRun.has(i) ? ("pending" as const) : ("idle" as const),
        cache: builtCalls[i]?.cache ?? false,
      }));
      dispatch(setBuiltCalls(stubs));
      dispatch(setRunPreview(stubs));

      const callCache = Object.fromEntries(
        builtCalls
          .filter((c) => c.cache && c.response !== null)
          .map((c) => [
            `${c.method}::${c.url}`,
            {
              statusCode: c.statusCode,
              response: c.response,
              responseHeaders: c.responseHeaders,
              duration: c.duration,
              timestamp: c.timestamp,
            },
          ]),
      );

      const { extractedVars, assertions } = await runScript(
        script,
        { ...envVars, current: activeEnv?.name ?? "" },
        (calls, logs) =>
          dispatch(updateCallsAndLogs({ calls, logs, itemId: runItemId })),
        stepMode ? waitForNext : undefined,
        Object.keys(callCache).length > 0 ? callCache : undefined,
        callTimeout > 0 ? callTimeout : undefined,
        controller.signal,
        socketRegistryRef.current,
        { list: connections, active: activeConnection },
      );

      stepQueueRef.current = [];
      abortControllerRef.current = null;
      if (Object.keys(extractedVars).length > 0)
        dispatch(setExtractedVars(extractedVars));
      if (assertions.length > 0) dispatch(setAssertions(assertions));
      dispatch(setRunning(false));
    },
    [
      running,
      code,
      envVars,
      activeEnv,
      hooks,
      connections,
      activeConnection,
      builtCalls,
      activeId,
      stepMode,
      callTimeout,
      waitForNext,
      dispatch,
    ],
  );

  const sendSocketMessage = useCallback((idx: number, text: string) => {
    socketRegistryRef.current.get(idx)?.send(text);
  }, []);

  const closeSocketConnection = useCallback((idx: number) => {
    socketRegistryRef.current.get(idx)?.close();
  }, []);

  return { onRun, onNext, onStop, sendSocketMessage, closeSocketConnection };
}
