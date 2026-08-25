"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ScoreDefinition } from "@/lib/scoreDefinitions";

const PANEL_WIDTH = 256;
const VIEWPORT_MARGIN = 8;

interface ScoreColumnHeaderProps {
  definition: ScoreDefinition;
}

function clampPanelLeft(buttonLeft: number): number {
  const maxLeft = window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN;
  return Math.max(VIEWPORT_MARGIN, Math.min(buttonLeft, maxLeft));
}

export function ScoreColumnHeader({ definition }: ScoreColumnHeaderProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePanelPosition = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setPanelStyle({
      top: rect.bottom + 4,
      left: clampPanelLeft(rect.left),
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }
    updatePanelPosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const onScrollOrResize = () => {
      updatePanelPosition();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  const panel =
    open && panelStyle ? (
      <div
        ref={panelRef}
        id={panelId}
        role="tooltip"
        style={{ top: panelStyle.top, left: panelStyle.left, width: PANEL_WIDTH }}
        className="fixed z-50 rounded-md border border-zinc-200 bg-white p-3 text-left text-xs font-normal normal-case text-zinc-700 shadow-lg dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
      >
        <span className="block font-semibold text-zinc-900 dark:text-zinc-100">
          {definition.label} — {definition.fullName}
        </span>
        <span className="mt-0.5 block text-zinc-500 dark:text-zinc-400">
          Range: {definition.range}
        </span>
        <span className="mt-2 block">{definition.summary}</span>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {definition.details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <>
      <span className="inline-flex items-center gap-0.5">
        <span>{definition.label}</span>
        <button
          ref={buttonRef}
          type="button"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] leading-none text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
          aria-label={`About ${definition.label}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          ?
        </button>
      </span>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
