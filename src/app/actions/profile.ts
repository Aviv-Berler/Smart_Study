"use server";

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { Locale, LearningStyle, SchedulingStyle, ThemeMode, WeeklyHours } from "@/types/database";

// ── Appearance / identity preferences ───────────────────────────────────────

export interface ProfilePreferencesInput {
  full_name?: string;
  theme_mode?: ThemeMode;
  language?: Locale;
}

export async function saveProfilePreferences(data: ProfilePreferencesInput) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { success: true };
}

// ── AI Planning preferences ──────────────────────────────────────────────────

export interface PlanningPreferencesInput {
  academic_background?: string | null;
  weekly_hours?: WeeklyHours | null;
  work_rest_interval?: string | null;
  buffer_time_minutes?: number | null;
  learning_style?: LearningStyle | null;
  scheduling_style?: SchedulingStyle | null;
  hobbies_and_breaks?: string | null;
}

export async function savePlanningPreferences(data: PlanningPreferencesInput) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { success: true };
}

// ── Fetch ────────────────────────────────────────────────────────────────────

export async function getProfile() {
  noStore();
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}
