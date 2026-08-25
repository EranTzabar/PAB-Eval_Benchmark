"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export interface ResizableColumn {
  id: string;
  header: ReactNode;
  width: number;
  minWidth?: number;
  cellClassName?: string;
}

export interface ResizableTableProps<T> {
  columns: ResizableColumn[];
  rows: T[];
  getRowKey: (row: T) => string;
  renderCell: (row: T, columnId: string) => ReactNode;
  emptyMessage?: string;
}

const DEFAULT_MIN_WIDTH = 72;

export function ResizableTable<T>({
  columns,
  rows,
  getRowKey,
  renderCell,
  emptyMessage = "No rows.",
}: ResizableTableProps<T>) {
  const [widths, setWidths] = useState<number[]>(() => columns.map((c) => c.width));
  const dragRef = useRef<{
    index: number;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);

  const onResizeStart = useCallback(
    (index: number, event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        index,
        startX: event.clientX,
        startWidth: widths[index] ?? columns[index].width,
        minWidth: columns[index].minWidth ?? DEFAULT_MIN_WIDTH,
      };
    },
    [columns, widths],
  );

  const onResizeMove = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    const nextWidth = Math.max(drag.minWidth, drag.startWidth + delta);
    setWidths((prev) => {
      const next = [...prev];
      next[drag.index] = nextWidth;
      return next;
    });
  }, []);

  const onResizeEnd = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    if (dragRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  }, []);

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyMessage}</p>;
  }

  const totalWidth = widths.reduce(
    (sum, w, index) => sum + (w ?? columns[index]?.width ?? 0),
    0,
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table
        className="table-fixed text-left text-sm"
        style={{ width: totalWidth }}
      >
        <colgroup>
          {columns.map((col, index) => (
            <col
              key={col.id}
              style={{ width: `${widths[index] ?? col.width}px` }}
            />
          ))}
        </colgroup>
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
          <tr>
            {columns.map((col, index) => (
              <th
                key={col.id}
                className="relative overflow-visible px-4 py-2 font-medium"
              >
                <span className="block overflow-visible pr-2">{col.header}</span>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${col.id} column`}
                  title="Drag to resize column"
                  className="group absolute inset-y-0 -right-1.5 z-10 flex w-3 cursor-col-resize touch-none select-none items-center justify-center"
                  onPointerDown={(e) => onResizeStart(index, e)}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeEnd}
                  onPointerCancel={onResizeEnd}
                >
                  <span
                    aria-hidden
                    className="h-5/6 w-0.5 rounded-full bg-zinc-400 transition-colors group-hover:bg-sky-500 group-active:bg-sky-600 dark:bg-zinc-500 dark:group-hover:bg-sky-400 dark:group-active:bg-sky-300"
                  />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="bg-white dark:bg-zinc-950">
              {columns.map((col) => (
                <td
                  key={col.id}
                  className={`px-4 py-2 align-top ${col.cellClassName ?? ""}`}
                >
                  {renderCell(row, col.id)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
