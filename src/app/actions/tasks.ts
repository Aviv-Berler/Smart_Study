"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sortTasksByDisplayOrder } from "@/lib/task-sort";
import { insertTaskEvent } from "@/lib/task-events";
import {
  deleteEmptyDailyGoalsForTask,
  taskHasAccruedAnalytics,
} from "@/lib/task-retention";
import { todayDateString } from "@/lib/drift-detection";
import type { Task } from "@/types/database";

export type DeleteTaskMode = "backlog_hidden" | "soft_deleted" | "hard_deleted";

function revalidateTaskSurfaces() {
  revalidatePath("/", "layout");
  revalidatePath("/tasks");
  revalidatePath("/manage");
  revalidatePath("/planner");
}

export interface AddTaskInput {
  title: string;
  course_name: string;
  due_date: string | null;
  estimated_duration: number | null; // minutes
}

export async function addTask(data: AddTaskInput) {
  if (!data.title.trim()) return { error: "Title is required" };

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  // spark_id is intentionally omitted so Postgres stores NULL.
  // A UNIQUE constraint on (user_id, spark_id) would fire for multiple NULLs
  // in standard Postgres, so the schema uses a partial unique index
  // WHERE spark_id IS NOT NULL — leaving manual tasks unrestricted.
  const eta = data.estimated_duration || null;
  const { data: task, error } = await supabase.from("tasks").insert({
    title: data.title.trim(),
    course_name: data.course_name.trim() || null,
    due_date: data.due_date || null,
    estimated_duration: eta,
    original_eta: eta,
    user_id: user.id,
    source: "manual",
    status: "pending",
  }).select().single();

  if (error) return { error: error.message };

  revalidateTaskSurfaces();
  return { success: true, task };
}

/** Update the 0-100 progress value. Auto-sets status to completed at 100. */
export async function updateTaskProgress(taskId: string, progress: number) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const status = progress >= 100 ? "completed" : progress > 0 ? "in_progress" : "pending";

  const { error } = await supabase
    .from("tasks")
    .update({ progress, status, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateTaskSurfaces();
  return { success: true as const };
}

/** Update estimated time to complete (minutes). Pass null to clear. */
export async function updateTaskEstimatedDuration(
  taskId: string,
  estimatedDuration: number | null,
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  if (estimatedDuration != null && estimatedDuration <= 0) {
    return { error: "Estimated time must be greater than 0." };
  }

  const { data: existing } = await supabase
    .from("tasks")
    .select("estimated_duration")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("tasks")
    .update({
      estimated_duration: estimatedDuration,
      updated_at:         new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  const previous = existing?.estimated_duration;
  if (
    previous != null &&
    estimatedDuration != null &&
    estimatedDuration < previous
  ) {
    await insertTaskEvent(supabase, taskId, "TARGET_REDUCED");
  }

  revalidateTaskSurfaces();
  return { success: true as const };
}

/** Update a task's due date (deadline). Pass null to clear. */
export async function updateTaskDueDate(taskId: string, dueDate: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tasks")
    .update({
      due_date: dueDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateTaskSurfaces();
  return { success: true };
}

export async function updateTaskStatus(
  taskId: string,
  status: "pending" | "in_progress" | "completed"
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateTaskSurfaces();
  return { success: true };
}

/**
 * Conditional delete — preserves analytics history.
 * A: completed → backlog_hidden_at
 * B: active + accrued data → deleted_at
 * C: active + no data → hard DELETE
 */
export async function deleteTask(taskId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("id, progress, backlog_hidden_at, deleted_at")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !task) return { error: fetchError?.message ?? "Task not found" };

  const now = new Date().toISOString();
  const progress = task.progress ?? 0;

  if (progress >= 100) {
    if (task.backlog_hidden_at) {
      revalidateTaskSurfaces();
      return { success: true as const, mode: "backlog_hidden" as DeleteTaskMode };
    }

    const { error } = await supabase
      .from("tasks")
      .update({ backlog_hidden_at: now, updated_at: now })
      .eq("id", taskId)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
    revalidateTaskSurfaces();
    return { success: true as const, mode: "backlog_hidden" as DeleteTaskMode };
  }

  const hasAccrued = await taskHasAccruedAnalytics(supabase, taskId);
  if (hasAccrued) {
    if (task.deleted_at) {
      revalidateTaskSurfaces();
      return { success: true as const, mode: "soft_deleted" as DeleteTaskMode };
    }

    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", taskId)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
    revalidateTaskSurfaces();
    return { success: true as const, mode: "soft_deleted" as DeleteTaskMode };
  }

  await deleteEmptyDailyGoalsForTask(supabase, taskId, user.id);

  const { error: deleteError } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (deleteError) {
    console.warn("[deleteTask] hard delete blocked, falling back to soft delete:", deleteError.message);
    const { error: softError } = await supabase
      .from("tasks")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", taskId)
      .eq("user_id", user.id);

    if (softError) return { error: softError.message };
    revalidateTaskSurfaces();
    return { success: true as const, mode: "soft_deleted" as DeleteTaskMode };
  }

  revalidateTaskSurfaces();
  return { success: true as const, mode: "hard_deleted" as DeleteTaskMode };
}

/**
 * Cron / Edge Function entry point — auto-hide expired completed tasks.
 * Requires CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY. Not called from page loads.
 */
export async function autoArchiveExpiredTasks(cronSecret: string) {
  const expected = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return { error: "Unauthorized" as const };
  }

  try {
    const supabase = createAdminClient();
    const today = todayDateString();

    const { data, error } = await supabase
      .from("tasks")
      .update({
        backlog_hidden_at: new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      })
      .gte("progress", 100)
      .not("due_date", "is", null)
      .lt("due_date", today)
      .is("backlog_hidden_at", null)
      .select("id");

    if (error) return { error: error.message };

    return { success: true as const, archivedCount: data?.length ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    return { error: message };
  }
}

/** Active tasks only — excludes aborted soft-deletes (dashboard fallback lists) */
export async function getTasks() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["pending", "in_progress"])
    .is("deleted_at", null);

  return sortTasksByDisplayOrder(data ?? []);
}

/**
 * All non-legacy-archived tasks for Manage — includes soft-deleted/hidden rows.
 * UI filters backlog_hidden_at / deleted_at client-side.
 */
export async function getAllTasks() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "archived");

  return sortTasksByDisplayOrder(data ?? []);
}

/** External sync lookup — includes soft-deleted/hidden tasks to prevent duplicates. */
export async function findTaskBySparkId(sparkId: string): Promise<Task | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user || !sparkId.trim()) return null;

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("spark_id", sparkId.trim())
    .maybeSingle();

  return (data as Task | null) ?? null;
}

/** Persist drag-and-drop task order from Manage → Edit Priority */
export async function updateTaskPriorityOrder(orderedTaskIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const updates = orderedTaskIds.map((id, index) =>
    supabase
      .from("tasks")
      .update({ user_priority_index: index, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  revalidateTaskSurfaces();
  return { success: true as const };
}

/** Clear custom order — revert to default due-date sorting */
export async function resetTaskPriorities() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tasks")
    .update({ user_priority_index: null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidateTaskSurfaces();
  return { success: true as const };
}

