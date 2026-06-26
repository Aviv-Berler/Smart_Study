import { format, subDays } from "date-fns";

/** Maximum look-back for missed blocks — prevents ancient guilt-tripping. */
export const MISSED_HORIZON_DAYS = 7;

/** Blocks use daily_goal logging as completion status (no block.status column). */
export type BlockCompletionStatus = "pending" | "completed";

export interface DriftBlockLike {
  id: string;
  title?: string;
  task_id?: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  is_locked: boolean;
  kind: "ai" | "manual" | "fixed" | "one_off" | "class_override" | "class_cancelled";
}

export interface DriftTaskLike {
  id: string;
  due_date: string | null;
}

export function todayDateString(reference = new Date()): string {
  return format(reference, "yyyy-MM-dd");
}

/** Earliest date (inclusive) for missed-block fetch and drift alerts. */
export function getMissedHorizonStart(reference = new Date()): string {
  return format(subDays(reference, MISSED_HORIZON_DAYS), "yyyy-MM-dd");
}

export function isWithinMissedHorizon(
  scheduledDate: string,
  today: string,
  missedHorizonStart?: string,
): boolean {
  const horizonStart = missedHorizonStart ?? getMissedHorizonStart(new Date(`${today}T00:00:00`));
  return scheduledDate >= horizonStart && scheduledDate < today;
}

export function blockDurationMinutes(startTime: string, endTime: string): number {
  const hhmm = (s: string) => {
    const [h, m] = s.slice(0, 5).split(":").map(Number);
    return h * 60 + (m || 0);
  };
  return Math.max(0, hhmm(endTime) - hhmm(startTime));
}

export function goalCompletionKey(taskId: string, goalDate: string): string {
  return `${taskId}__${goalDate}`;
}

type DailyGoalKeyRow = {
  task_id: string;
  goal_date: string;
  time_logged: boolean;
  is_fully_completed: boolean;
};

/** Session logged only — drives logged-block cumulative math and session UX. */
export function buildSessionLoggedKeys(goals: DailyGoalKeyRow[]): Set<string> {
  const keys = new Set<string>();
  for (const g of goals) {
    if (g.time_logged) {
      keys.add(goalCompletionKey(g.task_id, g.goal_date));
    }
  }
  return keys;
}

/** Parent attestation only — drives snapshot progress restore, not session pills. */
export function buildFullyCompletedGoalKeys(goals: DailyGoalKeyRow[]): Set<string> {
  const keys = new Set<string>();
  for (const g of goals) {
    if (g.is_fully_completed) {
      keys.add(goalCompletionKey(g.task_id, g.goal_date));
    }
  }
  return keys;
}

/** Union — clears missed blocks when either session logged or parent attested. */
export function buildCompletedGoalKeys(goals: DailyGoalKeyRow[]): Set<string> {
  const keys = new Set<string>();
  for (const g of goals) {
    if (g.time_logged || g.is_fully_completed) {
      keys.add(goalCompletionKey(g.task_id, g.goal_date));
    }
  }
  return keys;
}

/** Task still has an upcoming (or open) deadline worth catching up on. */
export function taskHasUpcomingDeadline(
  task: DriftTaskLike | undefined,
  today: string,
): boolean {
  if (!task) return false;
  if (!task.due_date) return true;
  return task.due_date >= today;
}

export function blockCompletionStatus(
  block: DriftBlockLike,
  completedGoals: Set<string>,
): BlockCompletionStatus {
  if (!block.task_id) return "pending";
  const key = goalCompletionKey(block.task_id, block.scheduled_date);
  // Only mark completed when the exact task+date goal was explicitly logged.
  // Any other case (no goal row, date mismatch, stale goals) → treat as pending/missed.
  if (completedGoals.has(key)) return "completed";
  return "pending";
}

/**
 * Missed block: locked AI/manual session in the past that was not completed.
 * Maps user spec `status !== 'completed'` to daily_goal completion.
 */
export function isMissedBlock(
  block: DriftBlockLike,
  today: string,
  completedGoals: Set<string>,
  missedHorizonStart?: string,
): boolean {
  if (block.kind !== "ai" && block.kind !== "manual") return false;
  if (!block.is_locked) return false;
  if (!isWithinMissedHorizon(block.scheduled_date, today, missedHorizonStart)) return false;
  return blockCompletionStatus(block, completedGoals) !== "completed";
}

export function filterMissedBlocksForDrift(
  blocks: DriftBlockLike[],
  tasksById: Map<string, DriftTaskLike>,
  today: string,
  completedGoals: Set<string>,
): DriftBlockLike[] {
  return blocks.filter((block) => {
    if (!isMissedBlock(block, today, completedGoals)) return false;
    if (!block.task_id) return false;
    return taskHasUpcomingDeadline(tasksById.get(block.task_id), today);
  });
}

/** Calendar display — all past incomplete locked blocks in horizon (no deadline filter). */
export function filterMissedBlocksForCalendar(
  blocks: DriftBlockLike[],
  today: string,
  completedGoals: Set<string>,
): DriftBlockLike[] {
  return blocks.filter((block) => isMissedBlock(block, today, completedGoals));
}

export type BlockInteractivity = "readonly" | "drag-only" | "full";

/**
 * Past completed/fixed → read-only.
 * Past missed (red) → drag-only (reschedule forward).
 * Today and future → full edit for ai/manual blocks.
 */
export function getBlockInteractivity(
  block: DriftBlockLike,
  _today: string,
  _completedGoals: Set<string>,
): BlockInteractivity {
  if (block.kind === "class_cancelled") return "readonly";
  if (block.kind === "fixed" || block.kind === "class_override") return "full";
  if (block.kind === "ai" || block.kind === "manual" || block.kind === "one_off") {
    return "full";
  }
  return "readonly";
}

export function sumMissedDurationMinutes(blocks: DriftBlockLike[]): number {
  return blocks.reduce(
    (sum, b) => sum + blockDurationMinutes(b.start_time, b.end_time),
    0,
  );
}

export function groupMissedMinutesByTask(
  blocks: DriftBlockLike[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of blocks) {
    if (!b.task_id) continue;
    const dur = blockDurationMinutes(b.start_time, b.end_time);
    if (dur <= 0) continue;
    map.set(b.task_id, (map.get(b.task_id) ?? 0) + dur);
  }
  return map;
}
