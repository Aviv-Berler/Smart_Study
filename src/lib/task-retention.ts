import type { SupabaseClient } from "@supabase/supabase-js";

type RetentionSupabase = SupabaseClient;

/** True when the task has analytics-worthy history (events or logged minutes). */
export async function taskHasAccruedAnalytics(
  supabase: RetentionSupabase,
  taskId: string,
): Promise<boolean> {
  const [{ count: eventCount, error: eventsErr }, { count: minutesCount, error: minutesErr }] =
    await Promise.all([
      supabase
        .from("task_events")
        .select("id", { count: "exact", head: true })
        .eq("task_id", taskId),
      supabase
        .from("daily_goals")
        .select("id", { count: "exact", head: true })
        .eq("task_id", taskId)
        .gt("actual_minutes_spent", 0),
    ]);

  if (eventsErr) console.warn("[task-retention] task_events lookup failed:", eventsErr.message);
  if (minutesErr) console.warn("[task-retention] daily_goals lookup failed:", minutesErr.message);

  return (eventCount ?? 0) > 0 || (minutesCount ?? 0) > 0;
}

/** Remove zero-value daily_goal shells so a clean hard delete can succeed under RESTRICT. */
export async function deleteEmptyDailyGoalsForTask(
  supabase: RetentionSupabase,
  taskId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("daily_goals")
    .delete()
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .or("actual_minutes_spent.is.null,actual_minutes_spent.eq.0");

  if (error) {
    console.warn("[task-retention] empty daily_goals cleanup failed:", error.message);
  }
}
