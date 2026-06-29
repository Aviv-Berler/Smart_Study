import { normalizeTimeKey, toDateKey } from "@/lib/plan-horizon";
import type { GoalRecord } from "@/lib/planner-goals";

export const PLANNER_DEFAULT_TIMEZONE = "Asia/Jerusalem";

export interface PlannerResetBlockLike {
  kind: string;
  scheduled_date: string;
  start_time: string;
  task_id?: string | null;
}

/** Minutes since midnight from HH:MM block start time. */
export function blockStartMinutes(startTime: string): number {
  const [h, m] = normalizeTimeKey(startTime).split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Wall clock in a specific IANA timezone — safe on Vercel (avoids naive UTC). */
export function getClockInTimezone(
  timeZone: string,
  reference = new Date(),
): { todayStr: string; nowMin: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(reference);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  const hour   = Number(part("hour"));
  const minute = Number(part("minute"));

  return {
    todayStr: `${part("year")}-${part("month")}-${part("day")}`,
    nowMin:   hour * 60 + minute,
  };
}

/** Validate profile TZ and fall back to the app default (matches server clearPlannerRange). */
export function resolvePlannerTimezone(profileTimezone?: string | null): string {
  const candidate = profileTimezone?.trim();
  if (!candidate) return PLANNER_DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch {
    return PLANNER_DEFAULT_TIMEZONE;
  }
}

/** Profile-aligned wall clock — use on client and server for identical reset semantics. */
export function getPlannerClock(
  profileTimezone?: string | null,
  reference = new Date(),
): { todayStr: string; nowMin: number; timeZone: string } {
  const timeZone = resolvePlannerTimezone(profileTimezone);
  return { ...getClockInTimezone(timeZone, reference), timeZone };
}

export function buildProtectedTaskIdsForDay(
  entries: ReadonlyArray<{
    taskId: string;
    actualMinutesSpent?: number;
    isFullyCompleted?: boolean;
  }>,
): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if ((entry.actualMinutesSpent ?? 0) > 0 || entry.isFullyCompleted) {
      ids.add(entry.taskId);
    }
  }
  return ids;
}

export function protectedTaskIdsFromGoalRecords(
  goalRecords: ReadonlyMap<string, GoalRecord>,
  todayStr: string,
): Set<string> {
  const entries: Array<{
    taskId: string;
    actualMinutesSpent?: number;
    isFullyCompleted?: boolean;
  }> = [];

  for (const [key, rec] of goalRecords) {
    const suffix = `__${todayStr}`;
    if (!key.endsWith(suffix)) continue;
    entries.push({
      taskId:             key.slice(0, -suffix.length),
      actualMinutesSpent: rec.actualMinutesSpent,
      isFullyCompleted:   rec.isFullyCompleted,
    });
  }

  return buildProtectedTaskIdsForDay(entries);
}

/**
 * Optimistic / display filter — true when the block should remain visible.
 * Past calendar days: keep all AI blocks.
 * Today: keep started blocks (start <= now) and tasks with logged/completed goals.
 * Future days: remove AI blocks.
 */
export function shouldKeepBlockAfterPlannerReset(
  block: PlannerResetBlockLike,
  todayStr: string,
  nowMin: number,
  protectedTaskIds: ReadonlySet<string> = new Set(),
): boolean {
  if (block.kind !== "ai") return true;

  const date = toDateKey(block.scheduled_date);
  if (date < todayStr) return true;
  if (date > todayStr) return false;

  const taskId = block.task_id != null ? String(block.task_id).trim() : "";
  if (taskId && protectedTaskIds.has(taskId)) return true;

  return blockStartMinutes(block.start_time) <= nowMin;
}

/** Server delete predicate — inverse of keep logic with effectiveStart bound. */
export function shouldDeleteAiBlockOnReset(
  block: Pick<PlannerResetBlockLike, "scheduled_date" | "start_time" | "task_id">,
  todayStr: string,
  nowMin: number,
  effectiveStart: string,
  protectedTaskIds: ReadonlySet<string>,
): boolean {
  const date = toDateKey(block.scheduled_date);
  if (date < effectiveStart) return false;
  if (date < todayStr) return false;
  if (date > todayStr) return true;

  const taskId = block.task_id != null ? String(block.task_id).trim() : "";
  if (taskId && protectedTaskIds.has(taskId)) return false;

  return blockStartMinutes(block.start_time) > nowMin;
}

export function filterBlocksAfterPlannerReset<T extends PlannerResetBlockLike>(
  blocks: T[],
  todayStr: string,
  nowMin: number,
  protectedTaskIds: ReadonlySet<string> = new Set(),
): T[] {
  return blocks.filter((b) =>
    shouldKeepBlockAfterPlannerReset(b, todayStr, nowMin, protectedTaskIds),
  );
}
