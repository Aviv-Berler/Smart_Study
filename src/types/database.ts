export type ThemeMode = "light" | "dark" | "system";
export type Locale = "en" | "he";
export type TaskStatus = "pending" | "in_progress" | "completed" | "archived";
export type ScheduleType = "lecture" | "tutorial" | "other";
export type LearningStyle = "visual" | "reading" | "practice" | "mixed";
export type SchedulingStyle = "marathon" | "interleaved";
export type WeekDay =
  | "sunday" | "monday" | "tuesday" | "wednesday"
  | "thursday" | "friday" | "saturday";

/** Per-day availability window. `null` means the day is a rest day. */
export type DaySchedule = { start: string; end: string } | null;

/** Full-week availability map used by the AI planner. */
export type WeeklyHours = Record<WeekDay, DaySchedule>;

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  university: string;
  timezone: string;
  theme_mode: ThemeMode;
  language: Locale;

  // ── AI Planning Preferences (added by user_preferences.sql migration) ──
  /** e.g. "B.Sc Computer Science, Year 1" */
  academic_background: string | null;
  /** Per-day availability windows; null day = rest day */
  weekly_hours: WeeklyHours | null;
  /** Work/break ratio string, e.g. "50/10", "90/20" */
  work_rest_interval: string | null;
  /** Minutes of padding the AI adds between consecutive blocks */
  buffer_time_minutes: number | null;
  /** Preferred study modality */
  learning_style: LearningStyle | null;
  /** Tier-2 task pacing: marathon = one task at a time; interleaved = rotate across tasks */
  scheduling_style: SchedulingStyle | null;
  /** Hobbies, sport, or routine constraints the AI should respect */
  hobbies_and_breaks: string | null;

  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  spark_id: string | null;
  title: string;
  course_name: string | null;
  description: string | null;
  due_date: string | null;            // ISO date "YYYY-MM-DD"
  estimated_duration: number | null;  // minutes
  priority: number;
  status: TaskStatus;
  /** 0–100 completion percentage. Added by ai_planner_setup.sql migration. */
  progress: number;
  source: string;
  /** User-defined order from Manage → Edit Priority (lower = higher priority) */
  user_priority_index: number | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  user_id: string;
  course_name: string;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: string;
  course_id: string;
  user_id: string;
  type: ScheduleType;
  day_of_week: number; // 1 = Sunday … 7 = Saturday
  start_time: string;  // stored as "HH:MM:SS" from Postgres TIME
  duration: number;    // minutes
  created_at: string;
}

export interface CourseWithSchedules extends Course {
  schedules: Schedule[];
}

export interface DailyGoal {
  id: string;
  user_id: string;
  task_id: string;
  /** "{Task Name} — XX%" label written by approvePlan aggregation */
  title: string | null;
  goal_date: string;
  target_minutes: number;
  time_logged: boolean;
  is_fully_completed: boolean;
  /** Exact registry progress (X) captured when parent attestation is checked */
  baseline_progress_snapshot: number | null;
  created_at: string;
  updated_at: string;
}

export interface DailyGoalEntry {
  id: string;
  daily_goal_id: string;
  user_id: string;
  logged_minutes: number;
  logged_at: string;
}

/** Merged view used by the dashboard task board */
export interface DailyGoalTableRow {
  taskId: string;
  goalId: string | null;
  taskTitle: string;
  courseName: string | null;
  targetMinutes: number;
  /** Absolute cumulative target % through end of today (shared with Planner) */
  cumulativeTargetPct: number;
  /** Registry baseline X (tasks.progress) — used for snapshot/restore on attestation toggle */
  registryProgressPct: number;
  timeLogged: boolean;
  isFullyCompleted: boolean;
  /** "{Task Name} — XX%" written by approvePlan; null for manually created goals */
  goalTitle: string | null;
}

/** AI-generated (or user-created) study block */
export type ScheduledBlockKind = "ai" | "manual" | "one_off";

export interface ScheduledBlock {
  id: string;
  user_id: string;
  task_id: string | null;
  title: string;
  scheduled_date: string;   // "YYYY-MM-DD"
  start_time: string;       // "HH:MM"
  end_time: string;         // "HH:MM"
  is_locked: boolean;
  /** 'ai' = planner-generated; 'manual' = user-created (immune to AI wipe) */
  kind: ScheduledBlockKind;
  created_at: string;
  updated_at: string;
}

/**
 * Unified calendar event used by the Planner UI.
 * kind="ai"     → AI-generated study block (orange = draft, green = approved)
 * kind="manual" → User-created block via BlockFormModal (immune to AI wipe)
 * kind="fixed"  → Recurring course slot expanded from the schedules table (blue)
 */
export interface CalendarBlock {
  id: string;
  kind: "ai" | "manual" | "fixed" | "one_off";
  title: string;
  scheduled_date: string;  // "YYYY-MM-DD"
  start_time: string;      // "HH:MM"
  end_time: string;        // "HH:MM"
  is_locked: boolean;      // false = AI draft, true = AI approved or fixed slot
  task_id?: string | null;
}

// ── Planner V2 types ──────────────────────────────────────────────────────────

/** User-requested time ranges that must stay free (from LLM prompt parsing) */
export interface PlannerBlackoutWindow {
  date:       string;  // YYYY-MM-DD
  start_time: string;  // HH:MM
  end_time:   string;  // HH:MM
}

/** Locked study block used for cross-week cumulative progress */
export interface LockedHistoryBlock {
  task_id:        string;
  scheduled_date: string;
  start_time:     string;
  end_time:       string;
}

/** A single AI-generated block (also used inside conflict option schedules) */
export interface PlannerLLMBlock {
  task_id: string | null;
  title: string;
  scheduled_date: string;  // YYYY-MM-DD
  start_time: string;      // HH:MM
  end_time: string;        // HH:MM
}

/** One option inside a conflict dilemma returned by the AI */
export interface PlannerConflictOption {
  title: string;
  pre_calculated_schedule: PlannerLLMBlock[];
}

/** Conflict state surfaced to the Planner UI */
export interface PlannerConflictState {
  message: string;
  options: PlannerConflictOption[];
}

/** Snapshot record for undo functionality */
export interface ApprovalSnapshot {
  id: string;
  user_id: string;
  snapshot_data: unknown;
  created_at: string;
}

/** Today schedule slot enriched with course name or AI study block */
export interface TodaySlot {
  id: string;
  courseName: string;
  type: ScheduleType | "study";
  startTime: string;   // "HH:MM" (trimmed)
  duration: number;    // minutes
  /** Distinguishes fixed courses from approved AI study blocks */
  kind?: "course" | "study";
  /** Block title for AI study sessions */
  title?: string;
}
