"use client";

import { useEffect, useRef } from "react";

import type { RunEvent } from "@/types/api";

import { judgeEventsUrl, runEventsUrl } from "./api";

const EVENT_TYPES = [
  "snapshot",
  "progress",
  "item_done",
  "item_failed",
  "awaiting_decision",
  "decision",
  "finished",
  "error",
] as const;

const TERMINAL_EVENTS = new Set(["finished", "error"]);

function closeSource(source: EventSource, handlers: Map<string, EventListener>): void {
  for (const [type, handler] of handlers) {
    source.removeEventListener(type, handler);
  }
  handlers.clear();
  source.close();
}

function subscribeEvents(
  url: string,
  onEvent: (type: string, data: RunEvent) => void,
): () => void {
  const source = new EventSource(url);
  const handlers = new Map<string, EventListener>();

  const close = () => closeSource(source, handlers);

  for (const type of EVENT_TYPES) {
    const handler = ((event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as RunEvent;
        onEvent(type, data);
        if (TERMINAL_EVENTS.has(type)) {
          close();
        }
      } catch {
        // ignore malformed payloads
      }
    }) as EventListener;
    handlers.set(type, handler);
    source.addEventListener(type, handler);
  }

  source.onerror = () => close();
  return close;
}

export function useRunEvents(
  runId: string | null,
  onEvent: (type: string, data: RunEvent) => void,
  enabled = true,
): () => void {
  const onEventRef = useRef(onEvent);
  const closeRef = useRef<(() => void) | null>(null);
  onEventRef.current = onEvent;

  useEffect(() => {
    closeRef.current?.();
    closeRef.current = null;

    if (!runId || !enabled) {
      return;
    }

    const close = subscribeEvents(runEventsUrl(runId), (type, data) => {
      onEventRef.current(type, data);
    });
    closeRef.current = close;

    return () => close();
  }, [runId, enabled]);

  return () => {
    closeRef.current?.();
    closeRef.current = null;
  };
}

export function useJudgeEvents(
  runId: string | null,
  judgeRunId: string | null,
  onEvent: (type: string, data: RunEvent) => void,
  enabled = true,
): () => void {
  const onEventRef = useRef(onEvent);
  const closeRef = useRef<(() => void) | null>(null);
  onEventRef.current = onEvent;

  useEffect(() => {
    closeRef.current?.();
    closeRef.current = null;

    if (!runId || !judgeRunId || !enabled) {
      return;
    }

    const close = subscribeEvents(judgeEventsUrl(runId, judgeRunId), (type, data) => {
      onEventRef.current(type, data);
    });
    closeRef.current = close;

    return () => close();
  }, [runId, judgeRunId, enabled]);

  return () => {
    closeRef.current?.();
    closeRef.current = null;
  };
}
