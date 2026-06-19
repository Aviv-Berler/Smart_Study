"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

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
  const { data: task, error } = await supabase.from("tasks").insert({
    title: data.title.trim(),
    course_name: data.course_name.trim() || null,
    due_date: data.due_date || null,
    estimated_duration: data.estimated_duration || null,
    user_id: user.id,
    source: "manual",
    status: "pending",
  }).select().single();

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/tasks");
  revalidatePath("/manage");
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

  revalidatePath("/", "layout");
  revalidatePath("/tasks");
  revalidatePath("/manage");
  return { success: true };
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

  revalidatePath("/", "layout");
  revalidatePath("/tasks");
  revalidatePath("/manage");
  revalidatePath("/planner");
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

  revalidatePath("/", "layout");
  revalidatePath("/tasks");
  revalidatePath("/manage");
  return { success: true };
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/tasks");
  revalidatePath("/manage");
  return { success: true };
}

/** Active tasks only — used for dashboard daily board and planner view */
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
    .order("due_date", { ascending: true, nullsFirst: false });

  return data ?? [];
}

/** All non-archived tasks — used for manage/tasks pages (shows completed too) */
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
    .neq("status", "archived")
    .order("due_date", { ascending: true, nullsFirst: false });

  return data ?? [];
}

