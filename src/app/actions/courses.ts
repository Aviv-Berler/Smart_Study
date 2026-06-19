"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { ScheduleType, TodaySlot } from "@/types/database";

export interface ScheduleSlotInput {
  type: ScheduleType;
  day_of_week: number;
  start_time: string;
  duration: number; // minutes
}

export interface SaveCourseInput {
  course_name: string;
  schedules: ScheduleSlotInput[];
}

export async function saveCourseWithSchedules(data: SaveCourseInput) {
  if (!data.course_name.trim()) return { error: "Course name is required" };
  if (data.schedules.length === 0)
    return { error: "Add at least one schedule slot" };

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  // Insert course
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .insert({ course_name: data.course_name.trim(), user_id: user.id })
    .select("id")
    .single();

  if (courseError || !course)
    return { error: courseError?.message ?? "Failed to create course" };

  // Batch-insert schedule slots
  const { error: schedError } = await supabase.from("schedules").insert(
    data.schedules.map((slot) => ({
      ...slot,
      course_id: course.id,
      user_id: user.id,
    }))
  );

  if (schedError) {
    await supabase.from("courses").delete().eq("id", course.id);
    return { error: schedError.message };
  }

  const { data: fullCourse, error: fetchError } = await supabase
    .from("courses")
    .select("*, schedules(*)")
    .eq("id", course.id)
    .single();

  if (fetchError || !fullCourse) {
    return { error: fetchError?.message ?? "Failed to load created course" };
  }

  revalidatePath("/", "layout");
  revalidatePath("/planner");
  revalidatePath("/manage");
  return { success: true, courseId: course.id, course: fullCourse };
}

/** Add extra slots to an existing course */
export async function addScheduleSlots(
  courseId: string,
  slots: ScheduleSlotInput[]
) {
  if (slots.length === 0) return { error: "No slots provided" };

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { error } = await supabase.from("schedules").insert(
    slots.map((slot) => ({
      ...slot,
      course_id: courseId,
      user_id: user.id,
    }))
  );

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/planner");
  revalidatePath("/manage");
  return { success: true };
}

export async function deleteCourse(courseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/planner");
  revalidatePath("/manage");
  return { success: true };
}

export async function deleteScheduleSlot(slotId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("schedules")
    .delete()
    .eq("id", slotId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/planner");
  revalidatePath("/manage");
  return { success: true };
}

/** Lightweight course list for dropdowns */
export async function getCourses(): Promise<{ id: string; course_name: string }[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data } = await supabase
    .from("courses")
    .select("id, course_name")
    .eq("user_id", user.id)
    .order("course_name");

  return (data ?? []) as { id: string; course_name: string }[];
}

export async function getCoursesWithSchedules() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data } = await supabase
    .from("courses")
    .select("*, schedules(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

/** Returns today's schedule slots enriched with course name */
export async function getSchedulesForToday(): Promise<TodaySlot[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];

  // JS: 0=Sun … 6=Sat; DB: 1=Sun … 7=Sat
  const todayDow = new Date().getDay() + 1;

  const { data } = await supabase
    .from("schedules")
    .select("id, type, start_time, duration, day_of_week, courses(course_name)")
    .eq("user_id", user.id)
    .eq("day_of_week", todayDow)
    .order("start_time", { ascending: true });

  if (!data) return [];

  return data.map((row) => ({
    id: row.id,
    courseName:
      ((row.courses as unknown) as { course_name: string } | null)
        ?.course_name ?? "—",
    type: row.type as ScheduleType,
    startTime: row.start_time.slice(0, 5), // "HH:MM"
    duration: row.duration,
  }));
}
