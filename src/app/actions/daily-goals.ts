"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { todayDateString } from "@/lib/drift-detection";

export async function getTodayGoals(goalDate: string = todayDateString()) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data } = await supabase
    .from("daily_goals")
    .select("*, tasks(id, title, course_name, estimated_duration, status)")
    .eq("user_id", user.id)
    .eq("goal_date", goalDate)
    .order("created_at", { ascending: true });

  return data ?? [];
}

/**
 * Upsert the `time_logged` flag only (does NOT affect task progress or parent completion).
 * `goalDate` must be the user's local calendar day (from client todayDateString()).
 */
export async function logTimeSession(
  taskId: string,
  timeLogged: boolean,
  goalDate: string = todayDateString(),
  scheduledMinutes?: number,
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { data: existing } = await supabase
    .from("daily_goals")
    .select("id")
    .eq("user_id", user.id)
    .eq("task_id", taskId)
    .eq("goal_date", goalDate)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("daily_goals")
      .update({ time_logged: timeLogged, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
  } else {
    const { data: task } = await supabase
      .from("tasks")
      .select("estimated_duration")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .single();

    const { error } = await supabase.from("daily_goals").insert({
      user_id:        user.id,
      task_id:        taskId,
      goal_date:      goalDate,
      target_minutes: scheduledMinutes ?? task?.estimated_duration ?? 60,
      time_logged:    timeLogged,
      updated_at:     new Date().toISOString(),
    });

    if (error) return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/", "layout");
  return { success: true as const };
}

export interface CompleteDailyGoalSnapshot {
  /** Registry baseline X before applying today's target */
  baselineProgressPct: number;
  /** Exact cumulative target X+Y to persist on the parent task */
  targetProgressPct:   number;
}

/**
 * Toggle parent-task attestation for a daily goal using snapshot/restore (zero drift).
 * CHECK:  tasks.progress ← targetProgressPct, snapshot ← baselineProgressPct
 * UNCHECK: tasks.progress ← baseline_progress_snapshot (no math)
 */
export async function completeDailyGoal(
  goalId: string,
  complete: boolean,
  snapshot?: CompleteDailyGoalSnapshot,
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { data: goal, error: fetchErr } = await supabase
    .from("daily_goals")
    .select("id, task_id, baseline_progress_snapshot")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !goal) return { error: fetchErr?.message ?? "Goal not found" };

  if (complete) {
    if (!snapshot) return { error: "Missing progress snapshot for completion" };

    const baseline = Math.min(100, Math.max(0, Math.round(snapshot.baselineProgressPct)));
    const target   = Math.min(100, Math.max(0, Math.round(snapshot.targetProgressPct)));
    const newStatus = target >= 100 ? "completed" : "in_progress";

    const { error: goalErr } = await supabase
      .from("daily_goals")
      .update({
        is_fully_completed:          true,
        baseline_progress_snapshot:  baseline,
        updated_at:                  new Date().toISOString(),
      })
      .eq("id", goalId)
      .eq("user_id", user.id);

    if (goalErr) return { error: goalErr.message };

    if (goal.task_id) {
      const { error: taskErr } = await supabase
        .from("tasks")
        .update({ progress: target, status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", goal.task_id)
        .eq("user_id", user.id);

      if (taskErr) return { error: taskErr.message };
    }
  } else {
    const restored =
      goal.baseline_progress_snapshot != null
        ? Math.min(100, Math.max(0, Math.round(goal.baseline_progress_snapshot)))
        : null;

    const { error: goalErr } = await supabase
      .from("daily_goals")
      .update({
        is_fully_completed:         false,
        baseline_progress_snapshot: null,
        updated_at:                 new Date().toISOString(),
      })
      .eq("id", goalId)
      .eq("user_id", user.id);

    if (goalErr) return { error: goalErr.message };

    if (goal.task_id && restored != null) {
      const newStatus = restored >= 100 ? "completed" : restored > 0 ? "in_progress" : "pending";
      const { error: taskErr } = await supabase
        .from("tasks")
        .update({ progress: restored, status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", goal.task_id)
        .eq("user_id", user.id);

      if (taskErr) return { error: taskErr.message };
    }
  }

  revalidatePath("/");
  revalidatePath("/", "layout");
  revalidatePath("/manage");
  return { success: true as const };
}

/** Legacy shim — kept so any existing callers still compile. */
export async function upsertDailyGoal(
  taskId: string,
  patch: { time_logged?: boolean; is_fully_completed?: boolean },
  goalDate: string = todayDateString(),
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
      goal_date:      goalDate,
      target_minutes: task?.estimated_duration ?? 60,
      ...patch,
      updated_at:     new Date().toISOString(),
    },
    { onConflict: "user_id,task_id,goal_date" }
  );

  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/", "layout");
  return { success: true as const };
}
