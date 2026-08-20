"use client";

import { useEffect, useRef } from "react";

import type { RunEvent } from "@/types/api";

import { runEventsUrl } from "./api";

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

    const source = new EventSource(runEventsUrl(runId));
    const handlers = new Map<string, EventListener>();

    const close = () => {
      closeSource(source, handlers);
      if (closeRef.current === close) {
        closeRef.current = null;
      }
    };
    closeRef.current = close;

    for (const type of EVENT_TYPES) {
      const handler = ((event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as RunEvent;
          onEventRef.current(type, data);
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

    source.onerror = () => {
      close();
    };

    return () => {
      close();
    };
  }, [runId, enabled]);

  return () => {
    closeRef.current?.();
    closeRef.current = null;
  };
}
