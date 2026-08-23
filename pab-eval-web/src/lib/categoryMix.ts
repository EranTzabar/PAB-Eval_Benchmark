export interface MixSlotInput {
  runId: string;
  percent: number;
}

/** Largest-remainder: map item ids (sorted) to runs by percent shares. */
export function assignRunsByPercent(
  itemIds: string[],
  slots: MixSlotInput[],
): Record<string, string> {
  const valid = slots.filter((s) => s.runId && s.percent > 0);
  if (valid.length === 0 || itemIds.length === 0) return {};

  const totalPercent = valid.reduce((sum, s) => sum + s.percent, 0);
  if (Math.abs(totalPercent - 100) > 0.001) return {};

  const n = itemIds.length;
  const sortedIds = [...itemIds].sort();

  const parts = valid.map((slot) => {
    const exact = (n * slot.percent) / 100;
    const count = Math.floor(exact);
    return { runId: slot.runId, count, remainder: exact - count };
  });

  let assigned = parts.reduce((sum, p) => sum + p.count, 0);
  let remaining = n - assigned;
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining; i++) {
    byRemainder[i % byRemainder.length].count += 1;
  }

  const result: Record<string, string> = {};
  let idx = 0;
  for (const part of parts) {
    for (let i = 0; i < part.count; i++) {
      result[sortedIds[idx]!] = part.runId;
      idx += 1;
    }
  }
  return result;
}

export function mixTotalPercent(slots: { percent: string }[]): number {
  return slots.reduce((sum, s) => {
    const n = Number.parseFloat(s.percent);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export function parseMixSlots(
  slots: { runId: string; percent: string }[],
): MixSlotInput[] {
  return slots
    .filter((s) => s.runId)
    .map((s) => ({
      runId: s.runId,
      percent: Number.parseFloat(s.percent) || 0,
    }));
}
