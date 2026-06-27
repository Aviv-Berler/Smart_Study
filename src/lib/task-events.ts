import { format, subDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayDateString } from "@/lib/drift-detection";
import type {
  CourseVarianceInsight,
  TaskControlInsight,
  TaskEventType,
  WeeklyInsights,
} from "@/types/database";

type EventSupabase = SupabaseClient;

export interface TaskEventRow {
  id: string;
  task_id: string;
  event_type: TaskEventType;
  created_at: string;
}

export interface TaskAnalyticsRow {
  id: string;
  title: string;
  course_name: string | null;
  progress: number;
  original_eta: number | null;
  estimated_duration: number | null;
}

const DAILY_OUTCOME_TYPES: TaskEventType[] = ["DAILY_GOAL_MET", "DAILY_GOAL_MISSED"];

function goalDateStartIso(goalDate: string): string {
  return `${goalDate}T00:00:00.000Z`;
}

function goalDateEndIso(goalDate: string): string {
  return `${goalDate}T23:59:59.999Z`;
}

function endOfGoalDayIso(goalDate: string): string {
  return `${goalDate}T23:59:00.000Z`;
}

/** Append a behavioral event for a task (fire-and-forget safe). */
export async function insertTaskEvent(
  supabase: EventSupabase,
  taskId: string,
  eventType: TaskEventType,
  createdAt?: string,
): Promise<void> {
  const row: { task_id: string; event_type: TaskEventType; created_at?: string } = {
    task_id: taskId,
    event_type: eventType,
  };
  if (createdAt) row.created_at = createdAt;

  const { error } = await supabase.from("task_events").insert(row);
  if (error) {
    console.warn(`[task-events] insert ${eventType} failed:`, error.message);
  }
}

/** Idempotent guard — one daily outcome per task per calendar day. */
export async function hasDailyOutcomeEvent(
  supabase: EventSupabase,
  taskId: string,
  goalDate: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("task_events")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId)
    .in("event_type", DAILY_OUTCOME_TYPES)
    .gte("created_at", goalDateStartIso(goalDate))
    .lte("created_at", goalDateEndIso(goalDate));

  if (error) {
    console.warn("[task-events] daily outcome lookup failed:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

export async function insertDailyGoalMetEvent(
  supabase: EventSupabase,
  taskId: string,
  goalDate: string,
): Promise<void> {
  if (await hasDailyOutcomeEvent(supabase, taskId, goalDate)) return;
  await insertTaskEvent(supabase, taskId, "DAILY_GOAL_MET");
}

export async function insertDailyGoalMissedEvent(
  supabase: EventSupabase,
  taskId: string,
  goalDate: string,
): Promise<void> {
  if (await hasDailyOutcomeEvent(supabase, taskId, goalDate)) return;
  await insertTaskEvent(supabase, taskId, "DAILY_GOAL_MISSED", endOfGoalDayIso(goalDate));
}

/**
 * Backfill missed daily outcomes for past days in the analytics window.
 * Called before weekly insights aggregation so end-of-day misses are recorded.
 */
export async function syncPastDailyGoalMissedEvents(
  supabase: EventSupabase,
  userId: string,
  periodStart: string,
  referenceDate: string = todayDateString(),
): Promise<void> {
  if (periodStart >= referenceDate) return;

  const { data: goals, error } = await supabase
    .from("daily_goals")
    .select("task_id, goal_date, is_fully_completed, target_minutes")
    .eq("user_id", userId)
    .gte("goal_date", periodStart)
    .lt("goal_date", referenceDate)
    .gt("target_minutes", 0);

  if (error) {
    console.warn("[task-events] sync missed goals failed:", error.message);
    return;
  }

  for (const goal of goals ?? []) {
    if (goal.is_fully_completed) continue;
    await insertDailyGoalMissedEvent(supabase, goal.task_id, goal.goal_date);
  }
}

/** Relational pacing variance — positive = overrun, negative = under budget. */
export function computeRelationalVariance(
  originalEta: number | null,
  estimatedDuration: number | null,
  progressPct: number,
  actualMinutesSpent: number,
): number | null {
  if (actualMinutesSpent <= 0) return null;

  const progress = Math.min(100, Math.max(0, progressPct));

  // No relational baseline until progress advances — skip to avoid polluting course averages.
  if (progress <= 0) return null;

  const eta = Math.max(0, originalEta ?? estimatedDuration ?? 0);
  const expectedTime = eta * (progress / 100);
  if (expectedTime <= 0) return null;

  return (actualMinutesSpent - expectedTime) / expectedTime;
}

function eventGoalDate(createdAt: string): string {
  return createdAt.slice(0, 10);
}

function predominantlyMet(met: number, missed: number): boolean {
  return met > missed;
}

function frequentlyMissed(met: number, missed: number): boolean {
  return missed > 0 && missed >= met;
}

export function buildWeeklyInsights(params: {
  tasks: TaskAnalyticsRow[];
  events: TaskEventRow[];
  actualMinutesByTask: Map<string, number>;
  activeTaskIds: Set<string>;
  periodStart: string;
  periodEnd: string;
}): WeeklyInsights {
  const { tasks, events, actualMinutesByTask, activeTaskIds, periodStart, periodEnd } = params;

  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  const eventsByTask = new Map<string, TaskEventRow[]>();
  for (const event of events) {
    const list = eventsByTask.get(event.task_id) ?? [];
    list.push(event);
    eventsByTask.set(event.task_id, list);
  }

  const highControlTasks: TaskControlInsight[] = [];
  const lowControlTasks: TaskControlInsight[] = [];

  let totalMet = 0;
  let totalMissed = 0;

  for (const event of events) {
    if (event.event_type === "DAILY_GOAL_MET") totalMet += 1;
    if (event.event_type === "DAILY_GOAL_MISSED") totalMissed += 1;
  }

  for (const taskId of activeTaskIds) {
    const task = tasksById.get(taskId);
    if (!task) continue;

    const taskEvents = eventsByTask.get(taskId) ?? [];
    let metCount = 0;
    let missedCount = 0;
    let planAdjustedCount = 0;
    let targetReducedCount = 0;

    for (const event of taskEvents) {
      switch (event.event_type) {
        case "DAILY_GOAL_MET":
          metCount += 1;
          break;
        case "DAILY_GOAL_MISSED":
          missedCount += 1;
          break;
        case "PLAN_ADJUSTED":
          planAdjustedCount += 1;
          break;
        case "TARGET_REDUCED":
          targetReducedCount += 1;
          break;
      }
    }

    const entry: TaskControlInsight = {
      taskId,
      title: task.title,
      courseName: task.course_name,
      metCount,
      missedCount,
      planAdjustedCount,
      targetReducedCount,
    };

    const hasPlanAdjusted = planAdjustedCount > 0;
    const hasTargetReduced = targetReducedCount > 0;
    const hasAdjustingEvents = hasPlanAdjusted || hasTargetReduced;

    const isAgileHighControl =
      hasPlanAdjusted && predominantlyMet(metCount, missedCount);
    const isPerfectHighControl =
      !hasAdjustingEvents && metCount > 0 && missedCount === 0;

    if (isAgileHighControl || isPerfectHighControl) {
      highControlTasks.push(entry);
    } else if (
      (hasPlanAdjusted || hasTargetReduced) &&
      frequentlyMissed(metCount, missedCount)
    ) {
      lowControlTasks.push(entry);
    }
  }

  highControlTasks.sort((a, b) => b.metCount - a.metCount);
  lowControlTasks.sort((a, b) => b.missedCount - a.missedCount);

  const courseVarianceMap = new Map<string, { sum: number; count: number }>();

  for (const task of tasks) {
    const actual = actualMinutesByTask.get(task.id) ?? 0;
    if (actual <= 0) continue;

    const variance = computeRelationalVariance(
      task.original_eta,
      task.estimated_duration,
      task.progress,
      actual,
    );
    if (variance == null) continue;

    const courseKey = task.course_name?.trim() || "Uncategorized";
    const bucket = courseVarianceMap.get(courseKey) ?? { sum: 0, count: 0 };
    bucket.sum += variance;
    bucket.count += 1;
    courseVarianceMap.set(courseKey, bucket);
  }

  const courseVariances: CourseVarianceInsight[] = [...courseVarianceMap.entries()]
    .map(([courseName, { sum, count }]) => ({
      courseName,
      averageVariance: count > 0 ? sum / count : 0,
      taskCount: count,
    }))
    .sort((a, b) => b.averageVariance - a.averageVariance);

  const outcomeTotal = totalMet + totalMissed;
  const overallExecutionRate =
    outcomeTotal > 0 ? totalMet / outcomeTotal : null;

  return {
    highControlTasks,
    lowControlTasks,
    courseVariances,
    overallExecutionRate,
    taskControlScore: {
      highControlCount: highControlTasks.length,
      lowControlCount: lowControlTasks.length,
      activeTaskCount: activeTaskIds.size,
    },
    periodStart,
    periodEnd,
  };
}

export function getInsightsPeriod(
  days: number = 7,
  referenceDate: string = todayDateString(),
): {
  periodStart: string;
  periodEnd: string;
  periodStartIso: string;
  days: number;
} {
  const normalizedDays = Math.max(1, Math.min(90, Math.round(days)));
  const ref = new Date(`${referenceDate}T00:00:00`);
  const periodStart = format(subDays(ref, normalizedDays - 1), "yyyy-MM-dd");
  return {
    periodStart,
    periodEnd: referenceDate,
    periodStartIso: goalDateStartIso(periodStart),
    days: normalizedDays,
  };
}

/** @deprecated Use getInsightsPeriod(days) */
export function getWeeklyPeriod(referenceDate: string = todayDateString()) {
  return getInsightsPeriod(7, referenceDate);
}

/** Collect task ids with goals, blocks, or events in the window. */
export function collectActiveTaskIds(params: {
  eventTaskIds: string[];
  goalTaskIds: string[];
  blockTaskIds: string[];
}): Set<string> {
  const ids = new Set<string>();
  for (const id of params.eventTaskIds) ids.add(id);
  for (const id of params.goalTaskIds) ids.add(id);
  for (const id of params.blockTaskIds) ids.add(id);
  return ids;
}

export { eventGoalDate };
