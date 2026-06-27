"use server";

import { createClient } from "@/utils/supabase/server";
import { todayDateString } from "@/lib/drift-detection";
import {
  buildWeeklyInsights,
  collectActiveTaskIds,
  getInsightsPeriod,
  syncPastDailyGoalMissedEvents,
  type TaskAnalyticsRow,
  type TaskEventRow,
} from "@/lib/task-events";
import type { WeeklyInsights } from "@/types/database";

function clampDays(days: number): number {
  return Math.max(1, Math.min(90, Math.round(days)));
}

const EMPTY_INSIGHTS = (
  periodStart: string,
  periodEnd: string,
  days: number,
): WeeklyInsights => ({
  highControlTasks: [],
  lowControlTasks: [],
  courseVariances: [],
  overallExecutionRate: null,
  taskControlScore: {
    highControlCount: 0,
    lowControlCount: 0,
    activeTaskCount: 0,
  },
  days,
  periodStart,
  periodEnd,
});

/**
 * Bi-directional analytics engine for a rolling look-back window.
 * Syncs end-of-day missed outcomes before aggregation.
 */
export async function getInsights(
  days: number = 7,
  referenceDate: string = todayDateString(),
): Promise<WeeklyInsights> {
  const normalizedDays = clampDays(days);
  const { periodStart, periodEnd, periodStartIso } = getInsightsPeriod(
    normalizedDays,
    referenceDate,
  );

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return EMPTY_INSIGHTS(periodStart, periodEnd, normalizedDays);
  }

  await syncPastDailyGoalMissedEvents(supabase, user.id, periodStart, referenceDate);

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, course_name, progress, original_eta, estimated_duration")
    .eq("user_id", user.id)
    .neq("status", "archived");

  if (tasksError || !tasks?.length) {
    return EMPTY_INSIGHTS(periodStart, periodEnd, normalizedDays);
  }

  const taskIds = tasks.map((t) => t.id);

  const [
    { data: events },
    { data: goals },
    { data: loggedGoals },
    { data: blocks },
  ] = await Promise.all([
    supabase
      .from("task_events")
      .select("id, task_id, event_type, created_at")
      .in("task_id", taskIds)
      .gte("created_at", periodStartIso),
    supabase
      .from("daily_goals")
      .select("task_id")
      .eq("user_id", user.id)
      .gte("goal_date", periodStart)
      .lte("goal_date", periodEnd),
    supabase
      .from("daily_goals")
      .select("task_id, actual_minutes_spent")
      .eq("user_id", user.id)
      .gt("actual_minutes_spent", 0),
    supabase
      .from("scheduled_blocks")
      .select("task_id")
      .eq("user_id", user.id)
      .in("kind", ["ai", "manual"])
      .not("task_id", "is", null)
      .gte("scheduled_date", periodStart)
      .lte("scheduled_date", periodEnd),
  ]);

  const actualMinutesByTask = new Map<string, number>();
  for (const goal of loggedGoals ?? []) {
    const spent = goal.actual_minutes_spent ?? 0;
    if (spent <= 0) continue;
    actualMinutesByTask.set(
      goal.task_id,
      (actualMinutesByTask.get(goal.task_id) ?? 0) + spent,
    );
  }

  const activeTaskIds = collectActiveTaskIds({
    eventTaskIds: (events ?? []).map((e) => e.task_id),
    goalTaskIds: (goals ?? []).map((g) => g.task_id),
    blockTaskIds: (blocks ?? [])
      .map((b) => b.task_id)
      .filter((id): id is string => id != null),
  });

  const payload = buildWeeklyInsights({
    tasks: tasks as TaskAnalyticsRow[],
    events: (events ?? []) as TaskEventRow[],
    actualMinutesByTask,
    activeTaskIds,
    periodStart,
    periodEnd,
  });

  return { ...payload, days: normalizedDays };
}

/** @deprecated Use getInsights(days) */
export async function getWeeklyInsights(
  referenceDate: string = todayDateString(),
): Promise<WeeklyInsights> {
  return getInsights(7, referenceDate);
}
