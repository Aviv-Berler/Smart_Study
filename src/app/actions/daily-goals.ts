"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

const TODAY = () => new Date().toISOString().split("T")[0];

export async function getTodayGoals() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data } = await supabase
    .from("daily_goals")
    .select("*, tasks(id, title, course_name, estimated_duration, status)")
    .eq("user_id", user.id)
    .eq("goal_date", TODAY())
    .order("created_at", { ascending: true });

  return data ?? [];
}

/**
 * Upsert the `time_logged` flag only (does NOT affect task progress).
 * Used by the time-session pill on the daily board.
 */
export async function logTimeSession(taskId: string, timeLogged: boolean) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { data: task } = await supabase
    .from("tasks")
    .select("estimated_duration")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase.from("daily_goals").upsert(
    {
      user_id:        user.id,
      task_id:        taskId,
      goal_date:      TODAY(),
      target_minutes: task?.estimated_duration ?? 60,
      time_logged:    timeLogged,
      updated_at:     new Date().toISOString(),
    },
    { onConflict: "user_id,task_id,goal_date" }
  );

  if (error) return { error: error.message };
  revalidatePath("/");
  return { success: true };
}

/**
 * Mark a daily_goal as fully completed and advance the parent task's progress.
 *
 * Progress math:
 *   1. Try to extract the percentage from the goal title  (e.g. "HW — 20%" → 20)
 *   2. Fallback: compute from target_minutes / task.estimated_duration × 100
 *
 * Calling this twice for the same goal is idempotent because we cap progress at 100.
 * Unchecking (isFullyCompleted=false) only clears the flag — it does NOT decrement
 * task progress (reversing learning credit would be confusing UX).
 */
export async function completeDailyGoal(goalId: string, complete: boolean) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  // Always update the completion flag
  const { error: flagErr } = await supabase
    .from("daily_goals")
    .update({ is_fully_completed: complete, updated_at: new Date().toISOString() })
    .eq("id", goalId)
    .eq("user_id", user.id);

  if (flagErr) return { error: flagErr.message };

  // Only add progress when marking complete (not when unchecking)
  if (complete) {
    // Fetch the goal + parent task in one query
    const { data: goal } = await supabase
      .from("daily_goals")
      .select("title, target_minutes, task_id, tasks(estimated_duration, progress, status)")
      .eq("id", goalId)
      .eq("user_id", user.id)
      .single();

    if (goal?.task_id) {
      const task = (goal.tasks as unknown as {
        estimated_duration: number | null;
        progress: number;
        status: string;
      } | null);

      const estimated  = task?.estimated_duration ?? 60;
      const currentPct = task?.progress ?? 0;

      // 1️⃣ Try to parse the exact percentage from the goal title ("Task — 20%")
      let pctToAdd = 0;
      if (goal.title) {
        const m = goal.title.match(/(\d+)%\s*$/);
        if (m) pctToAdd = parseInt(m[1], 10);
      }
      // 2️⃣ Fallback: derive from minutes
      if (pctToAdd === 0) {
        pctToAdd = Math.max(5, Math.round((goal.target_minutes / estimated) * 100));
      }

      const newProgress = Math.min(100, currentPct + pctToAdd);
      const newStatus   = newProgress >= 100 ? "completed" : "in_progress";

      await supabase
        .from("tasks")
        .update({ progress: newProgress, status: newStatus })
        .eq("id", goal.task_id)
        .eq("user_id", user.id);
    }
  }

  revalidatePath("/");
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Legacy shim — kept so any existing callers still compile.
 * New code should use logTimeSession / completeDailyGoal directly.
 */
export async function upsertDailyGoal(
  taskId: string,
  patch: { time_logged?: boolean; is_fully_completed?: boolean }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { data: task } = await supabase
    .from("tasks")
    .select("estimated_duration")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase.from("daily_goals").upsert(
    {
      user_id:        user.id,
      task_id:        taskId,
      goal_date:      TODAY(),
      target_minutes: task?.estimated_duration ?? 60,
      ...patch,
      updated_at:     new Date().toISOString(),
    },
    { onConflict: "user_id,task_id,goal_date" }
  );

  if (error) return { error: error.message };
  revalidatePath("/");
  return { success: true };
}
