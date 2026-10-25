"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { CATEGORY_LABELS, CATEGORY_ORDER, type CategoryKey } from "@/lib/judgeMetrics";

export interface JudgeMetricsRadarSeries {
  id: string;
  label: string;
  values: number[];
}

const COLORS = [
  "#2563eb",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#ec4899",
  "#84cc16",
];

const RINGS = [25, 50, 75, 100];
const SIZE = 520;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 145;
const AXIS_COUNT = CATEGORY_ORDER.length;

function axisAngle(index: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / AXIS_COUNT;
}

function polar(radius: number, angle: number): { x: number; y: number } {
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  };
}

function polygonPoints(values: number[]): string {
  return values
    .map((value, index) => {
      const clamped = Math.min(100, Math.max(0, value));
      const point = polar((clamped / 100) * RADIUS, axisAngle(index));
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function ringPoints(level: number): string {
  return polygonPoints(Array.from({ length: AXIS_COUNT }, () => level));
}

function labelAnchor(x: number): "start" | "middle" | "end" {
  if (x < CX - 12) return "end";
  if (x > CX + 12) return "start";
  return "middle";
}

function seriesGroupKey(item: JudgeMetricsRadarSeries): string {
  const sep = item.id.indexOf("::");
  return sep === -1 ? item.id : item.id.slice(0, sep);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupAverages(series: JudgeMetricsRadarSeries[]): {
  key: string;
  color: string;
  values: number[];
  models: string[];
}[] {
  const groups: { key: string; color: string; members: JudgeMetricsRadarSeries[] }[] = [];
  for (const item of series) {
    const key = seriesGroupKey(item);
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.members.push(item);
    } else {
      groups.push({
        key,
        color: COLORS[groups.length % COLORS.length],
        members: [item],
      });
    }
  }
  return groups.map((group) => ({
    key: group.key,
    color: group.color,
    values: CATEGORY_ORDER.map((_, categoryIndex) =>
      mean(group.members.map((item) => item.values[categoryIndex] ?? 0)),
    ),
    models: modelNamesForGroup(group.key, group.members),
  }));
}

function modelNamesForGroup(runId: string, members: JudgeMetricsRadarSeries[]): string[] {
  const names: string[] = [];
  for (const member of members) {
    const prefix = `${runId} · `;
    const name = member.label.startsWith(prefix) ? member.label.slice(prefix.length) : member.label;
    if (name && name !== runId && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

type BarGroup = { key: string; color: string; values: number[]; models: string[] };

function orderGroups(groups: BarGroup[], order: string[]): BarGroup[] {
  const remaining = new Map(groups.map((group) => [group.key, group]));
  const next: BarGroup[] = [];
  for (const key of order) {
    const group = remaining.get(key);
    if (group) {
      next.push(group);
      remaining.delete(key);
    }
  }
  for (const group of groups) {
    if (remaining.has(group.key)) next.push(group);
  }
  return next;
}

function moveKey(order: string[], fromKey: string, toIndex: number): string[] {
  const from = order.indexOf(fromKey);
  if (from < 0 || from === toIndex) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(toIndex, 0, fromKey);
  return next;
}

function CategoryModelBars({
  averages,
  categoryIndex,
  onCategoryChange,
}: {
  averages: BarGroup[];
  categoryIndex: number;
  onCategoryChange: (index: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragKeyRef = useRef<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const displayed = useMemo(() => orderGroups(averages, order), [averages, order]);
  const longest = Math.max(8, ...displayed.map((group) => group.key.length));
  const width = Math.max(720, displayed.length * 72);
  const height = 220 + Math.min(220, longest * 5);
  const pad = { top: 28, right: 16, bottom: Math.min(200, 28 + longest * 4.6), left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = displayed.map((group) => group.values[categoryIndex] ?? 0);
  const maxValue = 100;
  const barGap = 8;
  const barWidth =
    displayed.length === 0 ? 0 : Math.min(64, Math.max(36, (innerW - barGap * displayed.length) / displayed.length));
  const highest = values.length === 0 ? -1 : values.indexOf(Math.max(...values));
  const lowest = values.length === 0 ? -1 : values.indexOf(Math.min(...values));
  const slotW = displayed.length === 0 ? 0 : innerW / displayed.length;

  function currentOrder(): string[] {
    return displayed.map((group) => group.key);
  }

  function slotIndexFromClientX(clientX: number): number {
    const svg = svgRef.current;
    if (!svg || displayed.length === 0) return 0;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width;
    return Math.max(0, Math.min(displayed.length - 1, Math.floor((x - pad.left) / slotW)));
  }

  function onBarPointerDown(key: string, event: ReactPointerEvent<SVGGElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    dragKeyRef.current = key;
    setDragKey(key);
    setOrder(currentOrder());
  }

  function onBarPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const key = dragKeyRef.current;
    if (!key) return;
    const toIndex = slotIndexFromClientX(event.clientX);
    setOrder((prev) => moveKey(prev.length > 0 ? prev : currentOrder(), key, toIndex));
  }

  function onBarPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    dragKeyRef.current = null;
    setDragKey(null);
  }

  return (
    <div className="w-full space-y-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Category averages</span>
        <select
          className="max-w-md rounded-md border border-zinc-300 bg-white px-3 py-1.5 dark:border-zinc-600 dark:bg-zinc-950"
          value={CATEGORY_ORDER[categoryIndex]}
          onChange={(event) => {
            const next = CATEGORY_ORDER.indexOf(event.target.value as CategoryKey);
            if (next >= 0) onCategoryChange(next);
          }}
        >
          {CATEGORY_ORDER.map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[key]}
            </option>
          ))}
        </select>
      </label>
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`h-auto w-full min-w-[640px] text-zinc-400 dark:text-zinc-500 ${
            dragKey ? "cursor-grabbing select-none" : ""
          }`}
          style={{ touchAction: "none" }}
          role="img"
          aria-label={`${CATEGORY_LABELS[CATEGORY_ORDER[categoryIndex]]} averages by model. Drag a bar to reorder.`}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
        >
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = pad.top + innerH - (tick / maxValue) * innerH;
            return (
              <g key={tick}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={width - pad.right}
                  y2={y}
                  className="stroke-zinc-200 dark:stroke-zinc-700"
                  strokeWidth={1}
                />
                <text x={pad.left - 6} y={y + 3} textAnchor="end" className="fill-zinc-400 text-[10px] dark:fill-zinc-500">
                  {tick}
                </text>
              </g>
            );
          })}
          {displayed.map((group, index) => {
            const value = values[index] ?? 0;
            const slotX = pad.left + slotW * index;
            const x = slotX + (slotW - barWidth) / 2;
            const barH = (value / maxValue) * innerH;
            const y = pad.top + innerH - barH;
            const labelY = pad.top + innerH + 10;
            const dragging = dragKey === group.key;
            return (
              <g
                key={group.key}
                className={dragKey ? undefined : "cursor-grab"}
                opacity={dragging ? 0.7 : 1}
                onPointerDown={(event) => onBarPointerDown(group.key, event)}
              >
                <rect x={slotX} y={0} width={slotW} height={height} fill="transparent" />
                <rect x={x} y={y} width={barWidth} height={Math.max(barH, 0)} fill={group.color} rx={2} />
                <text
                  x={x + barWidth / 2}
                  y={y + Math.max(barH, 14) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-white text-[11px] font-semibold"
                >
                  {value.toFixed(1)}%
                </text>
                {index === highest ? (
                  <text
                    x={x + barWidth / 2}
                    y={Math.max(12, y - 6)}
                    textAnchor="middle"
                    className="fill-zinc-700 text-[10px] dark:fill-zinc-300"
                  >
                    ★ Highest
                  </text>
                ) : null}
                {index === lowest && lowest !== highest ? (
                  <text
                    x={x + barWidth / 2}
                    y={Math.max(12, y - 6)}
                    textAnchor="middle"
                    className="fill-zinc-500 text-[10px]"
                  >
                    Lowest
                  </text>
                ) : null}
                <text
                  x={x + barWidth / 2}
                  y={labelY}
                  textAnchor="end"
                  transform={`rotate(-50 ${x + barWidth / 2} ${labelY})`}
                  className="fill-zinc-700 text-[11px] dark:fill-zinc-300"
                >
                  {group.key}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="space-y-1 text-sm">
        {displayed.map((group) => (
          <li key={group.key} className="flex items-start gap-2">
            <span
              className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: group.color }}
            />
            <span>
              <span className="font-medium">{group.key}</span>
              {group.models.length > 0 ? (
                <span className="ml-1 text-zinc-500">· {group.models.join(", ")}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JudgeMetricsRadar({
  series,
  modelSeries,
}: {
  series: JudgeMetricsRadarSeries[];
  modelSeries?: JudgeMetricsRadarSeries[];
}) {
  const [categoryIndex, setCategoryIndex] = useState(0);

  if (series.length === 0) {
    return <p className="text-sm text-zinc-500">No columns to compare.</p>;
  }

  const averages = groupAverages(series);
  const barAverages = groupAverages(modelSeries && modelSeries.length > 0 ? modelSeries : series);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full max-w-[420px] shrink-0 text-zinc-400 dark:text-zinc-500"
          role="img"
          aria-label="Composite score radar by category"
        >
          {RINGS.map((level) => (
            <polygon
              key={level}
              points={ringPoints(level)}
              fill="none"
              className="stroke-zinc-200 dark:stroke-zinc-700"
              strokeWidth={1}
            />
          ))}
          {CATEGORY_ORDER.map((_, index) => {
            const end = polar(RADIUS, axisAngle(index));
            return (
              <line
                key={index}
                x1={CX}
                y1={CY}
                x2={end.x}
                y2={end.y}
                className="stroke-zinc-200 dark:stroke-zinc-700"
                strokeWidth={1}
              />
            );
          })}
          {RINGS.map((level) => {
            const tick = polar((level / 100) * RADIUS, axisAngle(1));
            return (
              <text
                key={level}
                x={tick.x + 6}
                y={tick.y + 3}
                className="fill-zinc-400 text-[10px] dark:fill-zinc-500"
              >
                {level}
              </text>
            );
          })}
          {series.map((item, seriesIndex) => {
            const color = COLORS[seriesIndex % COLORS.length];
            return (
              <polygon
                key={item.id}
                points={polygonPoints(item.values)}
                fill={color}
                fillOpacity={0.18}
                stroke={color}
                strokeWidth={2}
              />
            );
          })}
          {CATEGORY_ORDER.map((key, index) => {
            const angle = axisAngle(index);
            const labelPoint = polar(RADIUS + 24, angle);
            const anchor = labelAnchor(labelPoint.x);
            return (
              <g
                key={key}
                className="cursor-pointer"
                onClick={() => setCategoryIndex(index)}
              >
                <text
                  x={labelPoint.x}
                  y={labelPoint.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className="fill-zinc-700 text-[11px] dark:fill-zinc-300"
                >
                  {CATEGORY_LABELS[key]}
                </text>
                {averages.map((group, groupIndex) => (
                  <text
                    key={group.key}
                    x={labelPoint.x}
                    y={labelPoint.y + 14 + groupIndex * 12}
                    textAnchor={anchor}
                    dominantBaseline="hanging"
                    fill={averages.length === 1 ? undefined : group.color}
                    className={
                      averages.length === 1
                        ? "fill-zinc-600 text-[11px] font-medium dark:fill-zinc-300"
                        : "text-[11px] font-medium"
                    }
                  >
                    {group.values[index].toFixed(1)}%
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
        <ul className="space-y-1.5 pt-2 text-sm">
          {series.map((item, seriesIndex) => (
            <li key={item.id} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: COLORS[seriesIndex % COLORS.length] }}
              />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <CategoryModelBars
        averages={barAverages}
        categoryIndex={categoryIndex}
        onCategoryChange={setCategoryIndex}
      />
    </div>
  );
}
