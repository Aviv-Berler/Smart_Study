import { goalCompletionKey, isMissedBlock } from "@/lib/drift-detection";
import { normalizeTimeKey, toDateKey } from "@/lib/plan-horizon";
import type { CalendarBlock, DailyGoalTableRow, Task } from "@/types/database";

/** Live-computed daily target entry (shared Planner + Dashboard) */
export interface LiveDailyGoalEntry {
  taskId:           string;
  taskTitle:        string;
  /** Minutes scheduled on this calendar day (display only) */
  scheduledMinutes: number;
  /** Absolute cumulative target % through end of this day (base + pending blocks) */
  plannedPct:       number;
  /** Logged actual cumulative % through end of this day */
  finishedPct:      number;
  isSessionDone:    boolean;
}

/** Prefix-sum index of block minutes per task (chronological) */
export interface CumulativeBlockIndex {
  byTask:      Map<string, { date: string; dayMinutes: number; prefixMinutes: number }[]>;
  titleByTask: Map<string, string>;
}

export interface GoalRecord {
  goalId:           string | null;
  timeLogged:       boolean;
  isFullyCompleted: boolean;
}

export function normalizeTaskId(taskId: string | null | undefined): string | null {
  if (taskId == null || taskId === "") return null;
  return String(taskId).trim();
}

function hhmm(s: string): number {
  const normalized = normalizeTimeKey(s);
  const [h, m] = normalized.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

export function blockDurationMinutes(block: { start_time: string; end_time: string }): number {
  const dur = hhmm(block.end_time) - hhmm(block.start_time);
  return Number.isFinite(dur) && dur > 0 ? dur : 0;
}

/** Same draft-filter used by the planner timeline grid (ideal future projection) */
export function buildTimelineBlocks(
  blocks: CalendarBlock[],
  hasDrafts: boolean,
  todayStr: string,
  completedGoals: Set<string>,
  isMissedBlock: (
    block: CalendarBlock,
    today: string,
    completed: Set<string>,
  ) => boolean,
): CalendarBlock[] {
  if (!hasDrafts) return blocks;
  return blocks.filter(
    (b) =>
      !(b.is_locked && b.kind === "ai") ||
      isMissedBlock(b, todayStr, completedGoals),
  );
}

/**
 * Build chronological prefix sums from study blocks.
 * Used for absolute cumulative target: all blocks from first block through cutoff date.
 */
export function buildCumulativeBlockIndex(allBlocks: CalendarBlock[]): CumulativeBlockIndex {
  const minutesByTaskDate = new Map<string, Map<string, number>>();
  const titleByTask       = new Map<string, string>();

  for (const b of allBlocks) {
    if (b.kind !== "ai" && b.kind !== "manual") continue;

    const taskId = normalizeTaskId(b.task_id);
    if (!taskId) continue;

    const dayStr = toDateKey(b.scheduled_date);
    const dur    = blockDurationMinutes(b);
    if (dur <= 0) continue;

    if (!minutesByTaskDate.has(taskId)) minutesByTaskDate.set(taskId, new Map());
    const dayMap = minutesByTaskDate.get(taskId)!;
    dayMap.set(dayStr, (dayMap.get(dayStr) ?? 0) + dur);

    if (!titleByTask.has(taskId) && b.title) {
      titleByTask.set(taskId, b.title);
    }
  }

  const byTask = new Map<string, { date: string; dayMinutes: number; prefixMinutes: number }[]>();
  for (const [taskId, dayMap] of minutesByTaskDate) {
    const sorted = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    let prefix = 0;
    byTask.set(
      taskId,
      sorted.map(([date, dayMinutes]) => {
        prefix += dayMinutes;
        return { date, dayMinutes, prefixMinutes: prefix };
      }),
    );
  }

  return { byTask, titleByTask };
}

/** Prefix sums of only logged/completed session blocks (excludes missed/red blocks). */
export function buildLoggedCumulativeIndex(
  allBlocks: CalendarBlock[],
  completedGoals: Set<string>,
  today: string,
): CumulativeBlockIndex {
  const logged = allBlocks.filter((b) => {
    if (b.kind !== "ai" && b.kind !== "manual") return false;
    const taskId = normalizeTaskId(b.task_id);
    if (!taskId) return false;
    if (isMissedBlock(b, today, completedGoals)) return false;
    return completedGoals.has(goalCompletionKey(taskId, toDateKey(b.scheduled_date)));
  });
  return buildCumulativeBlockIndex(logged);
}

/** Prefix sums of scheduled blocks not yet logged — excludes missed/red blocks. */
export function buildUncompletedCumulativeIndex(
  allBlocks: CalendarBlock[],
  completedGoals: Set<string>,
  today: string,
): CumulativeBlockIndex {
  const pending = allBlocks.filter((b) => {
    if (b.kind !== "ai" && b.kind !== "manual") return false;
    const taskId = normalizeTaskId(b.task_id);
    if (!taskId) return false;
    if (isMissedBlock(b, today, completedGoals)) return false;
    return !completedGoals.has(goalCompletionKey(taskId, toDateKey(b.scheduled_date)));
  });
  return buildCumulativeBlockIndex(pending);
}

/** Registry baseline — same field the AI scheduler uses for remaining-work quotas */
export function getBaseProgressPct(task: Task | undefined): number {
  if (!task) return 0;
  if (task.status === "completed") return 100;
  return Math.min(100, Math.max(0, Math.round(task.progress ?? 0)));
}

function taskEstimatedMinutes(task: Task | undefined): number {
  const est = task?.estimated_duration;
  return est != null && est > 0 ? est : 60;
}

/**
 * Block-only cumulative minutes / % through `cutoffDate` (inclusive).
 * Does not include task registry base progress.
 */
export function getCumulativeAtDate(
  index: CumulativeBlockIndex,
  taskId: string,
  cutoffDate: string,
  estimatedDuration: number,
): { cumulativeMinutes: number; cumulativePct: number } {
  const entries = index.byTask.get(taskId);
  if (!entries?.length) {
    return { cumulativeMinutes: 0, cumulativePct: 0 };
  }

  let cumulativeMinutes = 0;
  for (const e of entries) {
    if (e.date > cutoffDate) break;
    cumulativeMinutes = e.prefixMinutes;
  }

  const required = estimatedDuration > 0 ? estimatedDuration : 60;
  return {
    cumulativeMinutes,
    cumulativePct: Math.min(100, Math.round((cumulativeMinutes / required) * 100)),
  };
}

/**
 * Daily target projection: BaseProgress + uncompleted scheduled blocks through cutoff.
 * FinalDailyTarget = min(100, base + Σ pending block minutes ≤ cutoff / estimate)
 */
export function getProjectedDailyTargetAtDate(
  uncompletedIndex: CumulativeBlockIndex,
  taskId: string,
  cutoffDate: string,
  task: Task | undefined,
): {
  targetPct:                number;
  baseProgress:             number;
  projectedAdditionPct:     number;
  projectedAdditionMinutes: number;
} {
  const required = taskEstimatedMinutes(task);
  const base     = getBaseProgressPct(task);
  const addition = getCumulativeAtDate(uncompletedIndex, taskId, cutoffDate, required);

  return {
    targetPct:                Math.min(100, base + addition.cumulativePct),
    baseProgress:             base,
    projectedAdditionPct:     addition.cumulativePct,
    projectedAdditionMinutes: addition.cumulativeMinutes,
  };
}

/** Actual progress: BaseProgress + logged scheduled blocks through cutoff */
export function getActualProgressAtDate(
  loggedIndex: CumulativeBlockIndex,
  taskId: string,
  cutoffDate: string,
  task: Task | undefined,
): number {
  const required = taskEstimatedMinutes(task);
  const base     = getBaseProgressPct(task);
  const logged   = getCumulativeAtDate(loggedIndex, taskId, cutoffDate, required);
  return Math.min(100, base + logged.cumulativePct);
}

/** Replace in-week study blocks inside the lifecycle progress array */
export function mergeWeekProgressBlocks(
  allBlocks: CalendarBlock[],
  weekBlocks: CalendarBlock[],
  weekStart: string,
  weekEnd: string,
): CalendarBlock[] {
  const outsideWeek = allBlocks.filter((b) => {
    const d = toDateKey(b.scheduled_date);
    return d < weekStart || d > weekEnd;
  });
  const inWeekStudy = weekBlocks.filter(
    (b) => (b.kind === "ai" || b.kind === "manual") && normalizeTaskId(b.task_id),
  );
  return [...outsideWeek, ...inWeekStudy.map(normalizeCalendarBlock)];
}

/**
 * Goals row + dashboard entries.
 * - Which tasks appear per day: from timelineBlocks (visible week schedule).
 * - Target %: task.progress (base) + uncompleted blocks through that day (no double-count).
 */
export function computeLiveDailyGoals(
  dayKeys: string[],
  timelineBlocks: CalendarBlock[],
  progressBlocks: CalendarBlock[],
  tasksById: Map<string, Task>,
  completedGoals: Set<string>,
  todayKey: string,
): LiveDailyGoalEntry[][] {
  const uncompletedIndex = buildUncompletedCumulativeIndex(progressBlocks, completedGoals, todayKey);
  const loggedIndex      = buildLoggedCumulativeIndex(progressBlocks, completedGoals, todayKey);

  return dayKeys.map((dayStr) => {
    const scheduledByTask = new Map<string, number>();
    const titleByTask     = new Map<string, string>();

    for (const b of timelineBlocks) {
      if (b.kind !== "ai" && b.kind !== "manual") continue;
      if (toDateKey(b.scheduled_date) !== dayStr) continue;

      const taskId = normalizeTaskId(b.task_id);
      if (!taskId) continue;

      scheduledByTask.set(
        taskId,
        (scheduledByTask.get(taskId) ?? 0) + blockDurationMinutes(b),
      );
      if (!titleByTask.has(taskId) && b.title) {
        titleByTask.set(taskId, b.title);
      }
    }

    if (process.env.NODE_ENV === "development" && dayStr === todayKey) {
      console.group(`[GoalsSync] ${dayStr} (base + pending blocks)`);
      console.log("a) Today scheduled taskIds:", [...scheduledByTask.keys()]);
      for (const [taskId] of scheduledByTask) {
        const task = tasksById.get(taskId);
        const proj = getProjectedDailyTargetAtDate(uncompletedIndex, taskId, dayStr, task);
        console.log(
          `b) task=${taskId} base=${proj.baseProgress}% +pending=${proj.projectedAdditionPct}% → target=${proj.targetPct}%`,
        );
      }
      console.groupEnd();
    }

    const entries: LiveDailyGoalEntry[] = [];
    for (const [taskId, dayMinutes] of scheduledByTask) {
      if (dayMinutes <= 0) continue;

      const task          = tasksById.get(taskId);
      const taskTitle     = task?.title ?? titleByTask.get(taskId) ?? uncompletedIndex.titleByTask.get(taskId) ?? "Task";
      const projected     = getProjectedDailyTargetAtDate(uncompletedIndex, taskId, dayStr, task);
      const finishedPct   = getActualProgressAtDate(loggedIndex, taskId, dayStr, task);
      const isSessionDone = completedGoals.has(goalCompletionKey(taskId, dayStr));

      entries.push({
        taskId,
        taskTitle,
        scheduledMinutes: dayMinutes,
        plannedPct:       projected.targetPct,
        finishedPct,
        isSessionDone,
      });
    }

    return entries.sort((a, b) => b.plannedPct - a.plannedPct);
  });
}

/** Map live entries → dashboard table rows */
export function liveGoalEntriesToTableRows(
  entries: LiveDailyGoalEntry[],
  tasksById: Map<string, Task>,
  goalRecords: Map<string, GoalRecord>,
): DailyGoalTableRow[] {
  return entries.map((e) => {
    const task = tasksById.get(e.taskId);
    const rec  = goalRecords.get(e.taskId);
    return {
      taskId:              e.taskId,
      goalId:              rec?.goalId ?? null,
      taskTitle:           e.taskTitle,
      courseName:          task?.course_name ?? null,
      targetMinutes:       e.scheduledMinutes,
      cumulativeTargetPct: e.plannedPct,
      timeLogged:          rec?.timeLogged ?? e.isSessionDone,
      isFullyCompleted:    rec?.isFullyCompleted ?? false,
      goalTitle:           `${e.taskTitle} — ${e.plannedPct}%`,
    };
  });
}

export function normalizeCalendarBlock(b: CalendarBlock): CalendarBlock {
  return {
    ...b,
    scheduled_date: toDateKey(b.scheduled_date),
    start_time:     normalizeTimeKey(b.start_time),
    end_time:       normalizeTimeKey(b.end_time),
    task_id:        normalizeTaskId(b.task_id),
  };
}
