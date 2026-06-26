import { differenceInCalendarDays } from "date-fns";
import { goalCompletionKey, isMissedBlock } from "@/lib/drift-detection";
import { normalizeDueDateKey, normalizeTimeKey, parseLocalDate, toDateKey } from "@/lib/plan-horizon";
import type { CalendarBlock, DailyGoalTableRow, Task } from "@/types/database";

/** Live-computed daily target entry (shared Planner + Dashboard) */
export interface LiveDailyGoalEntry {
  taskId:           string;
  taskTitle:        string;
  /** Calendar day this session belongs to (YYYY-MM-DD) */
  goalDate:         string;
  /** Minutes scheduled on this calendar day (display only) */
  scheduledMinutes: number;
  /** Absolute cumulative target % through end of this day (base + pending blocks) */
  plannedPct:       number;
  /** Logged actual cumulative % through end of this day */
  finishedPct:      number;
  isSessionDone:    boolean;
}

/** Parent-task deadline for the dashboard milestones row (macro view) */
export interface UpcomingMilestoneItem {
  id:              string;
  title:           string;
  courseName:      string | null;
  dueDate:         string;
  dueInDays:       number;
  progressPercent: number;
}

/** Prefix-sum index of block minutes per task (chronological) */
export interface CumulativeBlockIndex {
  byTask:      Map<string, { date: string; dayMinutes: number; prefixMinutes: number }[]>;
  titleByTask: Map<string, string>;
}

export interface GoalRecord {
  goalId:                    string | null;
  timeLogged:                boolean;
  isFullyCompleted:          boolean;
  baselineProgressSnapshot:  number | null;
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
  return blocks.filter((b) => {
    if (b.kind === "fixed" || b.kind === "one_off") return true;
    if (!b.is_locked) return true;
    if (toDateKey(b.scheduled_date) >= todayStr) return true;
    return isMissedBlock(b, todayStr, completedGoals);
  });
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

/** Prefix sums of session-logged blocks only (excludes missed/red blocks). */
export function buildLoggedCumulativeIndex(
  allBlocks: CalendarBlock[],
  sessionLoggedKeys: Set<string>,
  today: string,
  missedClearedKeys: Set<string>,
): CumulativeBlockIndex {
  const logged = allBlocks.filter((b) => {
    if (b.kind !== "ai" && b.kind !== "manual") return false;
    const taskId = normalizeTaskId(b.task_id);
    if (!taskId) return false;
    if (isMissedBlock(b, today, missedClearedKeys)) return false;
    return sessionLoggedKeys.has(goalCompletionKey(taskId, toDateKey(b.scheduled_date)));
  });
  return buildCumulativeBlockIndex(logged);
}

function filterEligibleStudyBlocks(
  allBlocks: CalendarBlock[],
  today: string,
  missedClearedKeys: Set<string>,
): CalendarBlock[] {
  return allBlocks.filter((b) => {
    if (b.kind !== "ai" && b.kind !== "manual") return false;
    if (!normalizeTaskId(b.task_id)) return false;
    if (isMissedBlock(b, today, missedClearedKeys)) return false;
    return true;
  });
}

/** Planned target: registry base + all scheduled block minutes through cutoff (stable when session logged). */
export function getScheduledTargetAtDate(
  scheduleIndex: CumulativeBlockIndex,
  taskId: string,
  cutoffDate: string,
  task: Task | undefined,
): {
  targetPct:            number;
  baseProgress:         number;
  scheduledAdditionPct: number;
} {
  const required = taskEstimatedMinutes(task);
  const base     = getBaseProgressPct(task);
  const addition = getCumulativeAtDate(scheduleIndex, taskId, cutoffDate, required);

  return {
    targetPct:            Math.min(100, base + addition.cumulativePct),
    baseProgress:         base,
    scheduledAdditionPct: addition.cumulativePct,
  };
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
 * Daily target projection (legacy helper — uses full schedule index, not session-filtered).
 * @deprecated Prefer getScheduledTargetAtDate directly.
 */
export function getProjectedDailyTargetAtDate(
  scheduleIndex: CumulativeBlockIndex,
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
  const addition = getCumulativeAtDate(scheduleIndex, taskId, cutoffDate, required);

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
  sessionLoggedKeys: Set<string>,
  fullyCompletedKeys: Set<string>,
  missedClearedKeys: Set<string>,
  todayKey: string,
): LiveDailyGoalEntry[][] {
  const eligibleBlocks = filterEligibleStudyBlocks(progressBlocks, todayKey, missedClearedKeys);
  const scheduleIndex  = buildCumulativeBlockIndex(eligibleBlocks);
  const loggedIndex    = buildLoggedCumulativeIndex(
    progressBlocks,
    sessionLoggedKeys,
    todayKey,
    missedClearedKeys,
  );

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
      console.group(`[GoalsSync] ${dayStr} (base + scheduled blocks)`);
      console.log("a) Today scheduled taskIds:", [...scheduledByTask.keys()]);
      for (const [taskId] of scheduledByTask) {
        const task = tasksById.get(taskId);
        const proj = getScheduledTargetAtDate(scheduleIndex, taskId, dayStr, task);
        console.log(
          `b) task=${taskId} base=${proj.baseProgress}% +scheduled=${proj.scheduledAdditionPct}% → target=${proj.targetPct}%`,
        );
      }
      console.groupEnd();
    }

    const entries: LiveDailyGoalEntry[] = [];
    for (const [taskId, dayMinutes] of scheduledByTask) {
      if (dayMinutes <= 0) continue;

      const recordKey     = goalCompletionKey(taskId, dayStr);
      const isSessionDone = sessionLoggedKeys.has(recordKey);
      const isFullyDone   = fullyCompletedKeys.has(recordKey);

      const task          = tasksById.get(taskId);
      const taskTitle     = task?.title ?? titleByTask.get(taskId) ?? scheduleIndex.titleByTask.get(taskId) ?? "Task";

      let plannedPct: number;
      let finishedPct: number;

      if (isFullyDone) {
        plannedPct  = getBaseProgressPct(task);
        finishedPct = getBaseProgressPct(task);
      } else {
        const scheduled = getScheduledTargetAtDate(scheduleIndex, taskId, dayStr, task);
        plannedPct      = scheduled.targetPct;
        finishedPct     = getActualProgressAtDate(loggedIndex, taskId, dayStr, task);
      }

      entries.push({
        taskId,
        taskTitle,
        goalDate:         dayStr,
        scheduledMinutes: dayMinutes,
        plannedPct,
        finishedPct,
        isSessionDone,
      });
    }

    return entries.sort((a, b) => a.goalDate.localeCompare(b.goalDate) || a.taskTitle.localeCompare(b.taskTitle));
  });
}

/**
 * Upcoming parent-task deadlines sorted by due_date (macro milestones row).
 * Overdue active tasks appear first. Excludes 100%-complete / completed-status tasks.
 */
export function computeUpcomingMilestones(
  tasks: Task[],
  todayKey: string,
  horizonDays = 14,
  limit = 4,
): UpcomingMilestoneItem[] {
  const today = parseLocalDate(todayKey);

  return tasks
    .filter((t) => {
      if (!t.due_date) return false;
      if (t.status === "completed") return false;
      if ((t.progress ?? 0) >= 100) return false;
      return normalizeDueDateKey(t.due_date) != null;
    })
    .map((t) => {
      const dueKey    = normalizeDueDateKey(t.due_date!)!;
      const dueInDays = differenceInCalendarDays(parseLocalDate(dueKey), today);
      return { task: t, dueKey, dueInDays };
    })
    .filter(({ dueInDays }) => dueInDays <= horizonDays)
    .sort(
      (a, b) =>
        a.dueKey.localeCompare(b.dueKey) ||
        a.task.title.localeCompare(b.task.title),
    )
    .slice(0, limit)
    .map(({ task, dueInDays }) => ({
      id:              task.id,
      title:           task.title,
      courseName:      task.course_name ?? null,
      dueDate:         normalizeDueDateKey(task.due_date!)!,
      dueInDays,
      progressPercent: Math.min(100, Math.max(0, Math.round(task.progress ?? 0))),
    }));
}

/** Map live entries → dashboard table rows */
export function liveGoalEntriesToTableRows(
  entries: LiveDailyGoalEntry[],
  tasksById: Map<string, Task>,
  goalRecords: Map<string, GoalRecord>,
  dayKey: string,
): DailyGoalTableRow[] {
  return entries.map((e) => {
    const task = tasksById.get(e.taskId);
    const rec  = goalRecords.get(goalCompletionKey(e.taskId, dayKey));
    return {
      taskId:              e.taskId,
      goalId:              rec?.goalId ?? null,
      taskTitle:           e.taskTitle,
      courseName:          task?.course_name ?? null,
      targetMinutes:       e.scheduledMinutes,
      cumulativeTargetPct: e.plannedPct,
      registryProgressPct: Math.min(100, Math.max(0, Math.round(task?.progress ?? 0))),
      timeLogged:          rec?.timeLogged ?? false,
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
