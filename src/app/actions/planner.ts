"use server";

import { differenceInCalendarDays } from "date-fns";
import { revalidatePath } from "next/cache";
import Groq from "groq-sdk";
import type { ChatCompletion } from "groq-sdk/resources/chat/completions";
import { APIError } from "groq-sdk";
import { createClient } from "@/utils/supabase/server";
import { parseGroqApiKeys } from "@/lib/groq";
import { getHorizonDateStrings, getPlanHorizon, getHistoryStart, toDateKey, normalizeTimeKey } from "@/lib/plan-horizon";
import { isolateLtr } from "@/lib/bidi";
import {
  buildCompletedGoalKeys,
  buildFullyCompletedGoalKeys,
  buildSessionLoggedKeys,
  filterMissedBlocksForDrift,
  getMissedHorizonStart,
  groupMissedMinutesByTask,
  sumMissedDurationMinutes,
  todayDateString,
  type DriftBlockLike,
} from "@/lib/drift-detection";
import type {
  WeeklyHours,
  WeekDay,
  PlannerLLMBlock,
  PlannerBlackoutWindow,
  PlannerConflictOption,
  TodaySlot,
  CalendarBlock,
  LockedHistoryBlock,
} from "@/types/database";
import type { Task } from "@/types/database";

// ── Internal types ─────────────────────────────────────────────────────────────

interface AvailableSlot {
  date: string;
  day_name: string;
  start: string;
  end: string;
  duration_min: number;
}

interface LLMSuccess {
  status: "success";
  ai_message: string;
  scheduled_blocks: PlannerLLMBlock[];
  blackout_windows?: PlannerBlackoutWindow[];
}

interface LLMConflict {
  status: "conflict";
  message: string;
  options: PlannerConflictOption[];
}

type LLMResponse = LLMSuccess | LLMConflict;

interface FixedSlot {
  day_of_week: number;  // DB: 1=Sun … 7=Sat
  start_time: string;   // "HH:MM:SS" or "HH:MM" from Postgres TIME
  duration: number | null;
  type: string;
  course_name: string | null;
}

interface ActiveTask {
  id: string;
  title: string;
  course_name: string | null;
  due_date: string | null;
  estimated_duration: number | null;
  progress: number | null;
}

interface UserPlanningSettings {
  scheduling_style: "marathon" | "interleaved";
  learning_style:   string | null;
  weekly_hours:     WeeklyHours | null;
  work_rest_interval: string | null;
  buffer_time_minutes: number | null;
  hobbies_and_breaks: string | null;
  academic_background: string | null;
}

const TIER1_DEADLINE_HOURS = 72;

function hoursUntilDeadline(dueDate: string, nowMs = Date.now()): number {
  return (new Date(`${dueDate}T23:59:59Z`).getTime() - nowMs) / (1000 * 60 * 60);
}

function taskRemainingMin(task: ActiveTask): number {
  return Math.max(
    0,
    Math.round((task.estimated_duration ?? 60) * (1 - (task.progress ?? 0) / 100)),
  );
}

/** Tier 1 = deadline within 72 h; Tier 2 = later or no deadline. Each sorted by nearest due date. */
function classifyTasksByPriority(tasks: ActiveTask[], nowMs = Date.now()) {
  const tier1: ActiveTask[] = [];
  const tier2: ActiveTask[] = [];

  for (const t of tasks) {
    if (t.due_date && hoursUntilDeadline(t.due_date, nowMs) <= TIER1_DEADLINE_HOURS) {
      tier1.push(t);
    } else {
      tier2.push(t);
    }
  }

  const byNearestDeadline = (a: ActiveTask, b: ActiveTask) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  };

  tier1.sort(byNearestDeadline);
  tier2.sort(byNearestDeadline);
  return { tier1, tier2 };
}

function priorityTaskOrder(tasks: ActiveTask[]): string[] {
  const { tier1, tier2 } = classifyTasksByPriority(tasks);
  return [...tier1, ...tier2].map(t => t.id);
}

/** Target minutes for this plan window — paces far-deadline tasks to avoid burnout. */
function calcProportionalQuota(
  task: ActiveTask,
  planStartDate: string,
  planEndDate: string,
  tier1Ids: Set<string>,
): number {
  const remaining = taskRemainingMin(task);
  if (remaining <= 0) return 0;
  if (tier1Ids.has(task.id)) return remaining;

  const planDuration = differenceInCalendarDays(
    new Date(`${planEndDate}T00:00:00`),
    new Date(`${planStartDate}T00:00:00`),
  ) + 1;

  if (!task.due_date) {
    // No deadline — schedule ~25% of remaining per plan window
    return Math.ceil(remaining * (planDuration / (planDuration * 4)));
  }

  const daysToDeadline = differenceInCalendarDays(
    new Date(`${task.due_date}T00:00:00`),
    new Date(`${planStartDate}T00:00:00`),
  );

  if (daysToDeadline <= planDuration) return remaining;
  return Math.ceil(remaining * (planDuration / daysToDeadline));
}

function buildProportionalQuotas(
  tasks: ActiveTask[],
  planStartDate: string,
  planEndDate: string,
): Map<string, number> {
  const { tier1 } = classifyTasksByPriority(tasks);
  const tier1Ids  = new Set(tier1.map(t => t.id));
  return new Map(
    tasks.map(t => [t.id, calcProportionalQuota(t, planStartDate, planEndDate, tier1Ids)]),
  );
}

// ── Time helpers ───────────────────────────────────────────────────────────────

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Phase 1: Deterministic slot generator ─────────────────────────────────────

/**
 * Pre-computes free study windows for the next `horizonDays` days.
 *
 * NOTE: All date/day arithmetic uses UTC to prevent timezone drift between
 * `date.toISOString()` (always UTC) and `date.getDay()` (local time).
 * Using `getUTCDate` / `getUTCDay` keeps both in sync.
 */
function computeAvailableSlots(
  weeklyHours: WeeklyHours | null,
  fixedSlots: FixedSlot[],
  bufferMin: number,
  horizonDays = 7,
): AvailableSlot[] {
  const DAY_KEYS: WeekDay[] = [
    "sunday","monday","tuesday","wednesday","thursday","friday","saturday",
  ];
  const DAY_LABELS = [
    "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday",
  ];
  const MIN_SLOT_MIN = 30;

  const result: AvailableSlot[] = [];
  const baseDate = new Date();

  for (let i = 0; i < horizonDays; i++) {
    // Use UTC arithmetic so toISOString() and getUTCDay() stay consistent
    const date = new Date(baseDate);
    date.setUTCDate(date.getUTCDate() + i);

    const dateStr = date.toISOString().split("T")[0];  // UTC date YYYY-MM-DD
    const jsDay   = date.getUTCDay();                   // 0=Sun … 6=Sat (UTC)
    const dayKey  = DAY_KEYS[jsDay];

    const hours = weeklyHours?.[dayKey];
    if (!hours) continue; // null or undefined = rest day

    const dayStart = timeToMin(hours.start ?? "09:00");
    const dayEnd   = timeToMin(hours.end   ?? "21:00");
    if (dayStart >= dayEnd) continue;

    /**
     * DB day_of_week: 1=Sun … 7=Sat
     * JS getUTCDay:   0=Sun … 6=Sat
     * → dbDay = jsDay + 1
     */
    const busyIntervals = fixedSlots
      .filter(s => s.day_of_week === jsDay + 1)
      .map(s => {
        // Postgres TIME comes back as "HH:MM:SS" — take first 5 chars
        const start = timeToMin(s.start_time.slice(0, 5));
        const end   = start + (s.duration ?? 90);
        // Expand each fixed block by the buffer on both sides
        return { start: start - bufferMin, end: end + bufferMin };
      })
      .sort((a, b) => a.start - b.start);

    // Walk the timeline emitting free gaps
    let cursor = dayStart;

    for (const busy of busyIntervals) {
      // Clamp busy.start to [dayStart, dayEnd]
      const freeWindowEnd = Math.min(Math.max(cursor, busy.start), dayEnd);
      if (freeWindowEnd - cursor >= MIN_SLOT_MIN) {
        result.push({
          date: dateStr,
          day_name: DAY_LABELS[jsDay],
          start: minToTime(cursor),
          end:   minToTime(freeWindowEnd),
          duration_min: freeWindowEnd - cursor,
        });
      }
      cursor = Math.max(cursor, busy.end);
    }

    // Tail gap (after last busy block, or entire day if no busy blocks)
    if (dayEnd - cursor >= MIN_SLOT_MIN) {
      result.push({
        date: dateStr,
        day_name: DAY_LABELS[jsDay],
        start: minToTime(cursor),
        end:   minToTime(dayEnd),
        duration_min: dayEnd - cursor,
      });
    }
  }

  return result;
}

// ── Post-processing: collision shifting + placement helpers ───────────────────

interface PlacedInterval {
  date:     string;
  startMin: number;
  endMin:   number;
}

function blockDuration(block: PlannerLLMBlock): number {
  return timeToMin(block.end_time.slice(0, 5)) - timeToMin(block.start_time.slice(0, 5));
}

function intervalsOverlap(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
  gap = 0,
): boolean {
  return aStart < bEnd + gap && aEnd > bStart - gap;
}

function overlapsFixedClass(
  date: string,
  startMin: number,
  endMin: number,
  fixedSlots: FixedSlot[],
  bufferMin: number,
): boolean {
  const jsDay = new Date(date + "T00:00:00Z").getUTCDay();
  for (const fixed of fixedSlots.filter(s => s.day_of_week === jsDay + 1)) {
    const fStart = timeToMin(fixed.start_time.slice(0, 5)) - bufferMin;
    const fEnd   = timeToMin(fixed.start_time.slice(0, 5)) + (fixed.duration ?? 90) + bufferMin;
    if (intervalsOverlap(startMin, endMin, fStart, fEnd)) return true;
  }
  return false;
}

function isWithinAvailableSlot(
  date: string,
  startMin: number,
  endMin: number,
  slots: AvailableSlot[],
): boolean {
  for (const slot of slots.filter(s => s.date === date)) {
    const sStart = timeToMin(slot.start);
    const sEnd   = timeToMin(slot.end);
    if (startMin >= sStart && endMin <= sEnd) return true;
  }
  return false;
}

function canPlaceAt(
  date: string,
  startMin: number,
  endMin: number,
  placed: PlacedInterval[],
  availableSlots: AvailableSlot[],
  fixedSlots: FixedSlot[],
  bufferMin: number,
): boolean {
  if (!isWithinAvailableSlot(date, startMin, endMin, availableSlots)) return false;
  if (overlapsFixedClass(date, startMin, endMin, fixedSlots, bufferMin)) return false;
  for (const p of placed.filter(x => x.date === date)) {
    if (intervalsOverlap(startMin, endMin, p.startMin, p.endMin, bufferMin)) return false;
  }
  return true;
}

/** Returns true when [slotStart, slotEnd] on `date` overlaps any user blackout window. */
function isSlotBlackedOut(
  slotStartTime: string,
  slotEndTime: string,
  date: string,
  blackoutWindows: PlannerBlackoutWindow[],
): boolean {
  if (!blackoutWindows.length) return false;

  const startMin = timeToMin(slotStartTime.slice(0, 5));
  const endMin   = timeToMin(slotEndTime.slice(0, 5));

  for (const w of blackoutWindows) {
    if (w.date !== date) continue;
    const bStart = timeToMin(w.start_time.slice(0, 5));
    const bEnd   = timeToMin(w.end_time.slice(0, 5));
    if (intervalsOverlap(startMin, endMin, bStart, bEnd)) return true;
  }
  return false;
}

function normalizeBlackoutWindows(raw: unknown): PlannerBlackoutWindow[] {
  if (!Array.isArray(raw)) return [];
  const result: PlannerBlackoutWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    if (typeof w.date !== "string" || typeof w.start_time !== "string" || typeof w.end_time !== "string") {
      continue;
    }
    result.push({
      date:       w.date,
      start_time: w.start_time.slice(0, 5),
      end_time:   w.end_time.slice(0, 5),
    });
  }
  return result;
}

/** Walk available slots forward from `searchFrom` and return the first gap that fits. */
function findNextValidPlacement(
  duration: number,
  placed: PlacedInterval[],
  availableSlots: AvailableSlot[],
  fixedSlots: FixedSlot[],
  bufferMin: number,
  searchFrom: { date: string; min: number },
  deadlineDate?: string | null,
  blackoutWindows: PlannerBlackoutWindow[] = [],
): { date: string; startMin: number; endMin: number } | null {
  const sortedSlots = [...availableSlots].sort((a, b) =>
    `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`)
  );

  for (const slot of sortedSlots) {
    if (slot.date < searchFrom.date) continue;
    if (deadlineDate && slot.date > deadlineDate) continue;

    const slotStart = timeToMin(slot.start);
    const slotEnd   = timeToMin(slot.end);
    let cursor = slot.date === searchFrom.date
      ? Math.max(slotStart, searchFrom.min)
      : slotStart;

    while (cursor + duration <= slotEnd) {
      const endMin = cursor + duration;
      const startTime = minToTime(cursor);
      const endTime   = minToTime(endMin);

      if (isSlotBlackedOut(startTime, endTime, slot.date, blackoutWindows)) {
        cursor += 15;
        continue;
      }

      if (canPlaceAt(slot.date, cursor, endMin, placed, availableSlots, fixedSlots, bufferMin)) {
        return { date: slot.date, startMin: cursor, endMin };
      }
      cursor += 15;
    }
  }
  return null;
}

/**
 * Smart collision shifting: when a block overlaps another block or a fixed class,
 * shift it forward into the next valid available slot instead of deleting it.
 */
function resolveCollisions(
  blocks: PlannerLLMBlock[],
  availableSlots: AvailableSlot[],
  fixedSlots: FixedSlot[],
  bufferMin: number,
  taskTitles: Map<string, string>,
): { blocks: PlannerLLMBlock[]; warnings: string[] } {
  const sorted = [...blocks].sort((a, b) =>
    `${a.scheduled_date}T${a.start_time}`.localeCompare(`${b.scheduled_date}T${b.start_time}`)
  );

  const placed:  PlacedInterval[] = [];
  const result:  PlannerLLMBlock[] = [];
  const warnings: string[] = [];
  const warnedTasks = new Set<string>();

  for (const block of sorted) {
    const duration = blockDuration(block);
    if (duration <= 0) continue;

    let date     = block.scheduled_date;
    let startMin = timeToMin(block.start_time.slice(0, 5));
    let endMin   = startMin + duration;

    if (!canPlaceAt(date, startMin, endMin, placed, availableSlots, fixedSlots, bufferMin)) {
      const placement = findNextValidPlacement(
        duration, placed, availableSlots, fixedSlots, bufferMin,
        { date, min: startMin },
      );
      if (!placement) {
        const taskName = block.task_id
          ? (taskTitles.get(block.task_id) ?? block.title)
          : block.title;
        if (block.task_id) {
          if (!warnedTasks.has(block.task_id)) {
            warnings.push(`Could not fit all hours for ${isolateLtr(taskName)}.`);
            warnedTasks.add(block.task_id);
          }
        } else {
          warnings.push(`Could not fit block "${isolateLtr(taskName)}".`);
        }
        console.warn(`[planner] resolveCollisions: dropped "${block.title}" — no valid slot`);
        continue;
      }
      date     = placement.date;
      startMin = placement.startMin;
      endMin   = placement.endMin;
      console.log(
        `[planner] resolveCollisions: shifted "${block.title}" → ` +
        `${date} ${minToTime(startMin)}–${minToTime(endMin)}`
      );
    }

    placed.push({ date, startMin, endMin });
    result.push({
      ...block,
      scheduled_date: date,
      start_time:     minToTime(startMin),
      end_time:       minToTime(endMin),
    });
  }

  return { blocks: result, warnings };
}

function blocksToPlaced(blocks: PlannerLLMBlock[]): PlacedInterval[] {
  return blocks.map(b => ({
    date:     b.scheduled_date,
    startMin: timeToMin(b.start_time.slice(0, 5)),
    endMin:   timeToMin(b.end_time.slice(0, 5)),
  }));
}

function allocatedMinutes(blocks: PlannerLLMBlock[], taskId: string): number {
  return blocks
    .filter(b => b.task_id === taskId)
    .reduce((s, b) => s + Math.max(0, blockDuration(b)), 0);
}

/**
 * Deterministic auto-filler: top up tasks in priority order (Tier 1 → Tier 2).
 * Searches chronologically from now up to each task's deadline (never past it).
 */
function autoFillByPriority(
  blocks: PlannerLLMBlock[],
  tasks: ActiveTask[],
  taskQuotas: Map<string, number>,
  availableSlots: AvailableSlot[],
  fixedSlots: FixedSlot[],
  bufferMin: number,
  workMin: number,
  horizonEnd: string,
  blackoutWindows: PlannerBlackoutWindow[] = [],
): { blocks: PlannerLLMBlock[]; warnings: string[] } {
  const result:  PlannerLLMBlock[] = [...blocks];
  const placed:  PlacedInterval[]  = blocksToPlaced(result);
  const warnings: string[]         = [];
  const warnedTasks = new Set<string>();

  const { tier1, tier2 } = classifyTasksByPriority(tasks);
  const ordered = [...tier1, ...tier2];

  const now      = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const nowMin   = now.getUTCHours() * 60 + now.getUTCMinutes();

  for (const task of ordered) {
    const quota     = taskQuotas.get(task.id) ?? 0;
    let remaining   = quota - allocatedMinutes(result, task.id);
    if (remaining <= 0) continue;

    const deadlineDate = task.due_date ?? horizonEnd;
    let searchFrom     = { date: todayStr, min: nowMin };

    while (remaining > 0) {
      const blockDur  = Math.min(Math.max(MIN_SLOT_MIN, workMin), remaining);
      const placement = findNextValidPlacement(
        blockDur, placed, availableSlots, fixedSlots, bufferMin, searchFrom, deadlineDate,
        blackoutWindows,
      );
      if (!placement) {
        if (task.due_date && !warnedTasks.has(task.id)) {
          warnings.push(
            `Not enough free time available before the deadline to complete ${isolateLtr(task.title)}`,
          );
          warnedTasks.add(task.id);
        }
        console.warn(
          `[planner] autoFill: could not fill remaining ${remaining}min for "${task.title}" ` +
          `(deadline ${deadlineDate})`,
        );
        break;
      }

      result.push({
        task_id:        task.id,
        title:          `${task.title} — priority fill`,
        scheduled_date: placement.date,
        start_time:     minToTime(placement.startMin),
        end_time:       minToTime(placement.endMin),
      });
      placed.push({
        date:     placement.date,
        startMin: placement.startMin,
        endMin:   placement.endMin,
      });
      remaining -= blockDur;
      searchFrom = { date: placement.date, min: placement.endMin + bufferMin };
    }
  }

  return { blocks: result, warnings };
}

const MIN_SLOT_MIN = 30; // mirrors computeAvailableSlots minimum

// ── Prompt formatters ──────────────────────────────────────────────────────────

// ── Chronological quota trimming ───────────────────────────────────────────────
/**
 * Ensures the AI never over-schedules any single task.
 *
 * For each task, blocks are sorted chronologically (date + start_time).
 * We walk the sorted list and keep/trim blocks until the task's quota is
 * exactly filled — no chronological gaps, only the tail overflows cut off.
 *
 * @param blocks     LLM-generated blocks (post overlap-filter)
 * @param taskQuotas taskId → required remaining minutes
 */
function trimToQuota(
  blocks:      PlannerLLMBlock[],
  taskQuotas:  Map<string, number>,
  priorityOrder?: string[],
): PlannerLLMBlock[] {
  const byTask    = new Map<string, PlannerLLMBlock[]>();
  const freeBlocks: PlannerLLMBlock[] = [];

  for (const b of blocks) {
    if (!b.task_id) { freeBlocks.push(b); continue; }
    const list = byTask.get(b.task_id) ?? [];
    list.push(b);
    byTask.set(b.task_id, list);
  }

  const result: PlannerLLMBlock[] = [...freeBlocks];
  const taskOrder = priorityOrder?.length
    ? priorityOrder
    : [...byTask.keys()];

  for (const taskId of taskOrder) {
    const taskBlocks = byTask.get(taskId);
    if (!taskBlocks) continue;

    const quota = taskQuotas.get(taskId) ?? 0;
    if (quota <= 0) continue;

    const sorted = [...taskBlocks].sort((a, b) =>
      (`${a.scheduled_date}T${a.start_time}`).localeCompare(`${b.scheduled_date}T${b.start_time}`)
    );

    let remaining = quota;

    for (const block of sorted) {
      if (remaining <= 0) {
        console.log(`[planner] trimToQuota: dropped extra block for task ${taskId}: ${block.scheduled_date} ${block.start_time}-${block.end_time}`);
        break;
      }

      const blockDur = timeToMin(block.end_time.slice(0, 5)) - timeToMin(block.start_time.slice(0, 5));
      if (blockDur <= 0) continue;

      if (blockDur <= remaining) {
        result.push(block);
        remaining -= blockDur;
      } else {
        const newEndMin = timeToMin(block.start_time.slice(0, 5)) + remaining;
        console.log(
          `[planner] trimToQuota: trimmed block for task ${taskId} ` +
          `${block.end_time} → ${minToTime(newEndMin)} (saved ${remaining} of ${blockDur} min)`
        );
        result.push({ ...block, end_time: minToTime(newEndMin) });
        remaining = 0;
      }
    }
  }

  return result;
}

/** Drop Tier-2 blocks when any Tier-1 task is under quota so auto-fill can protect critical deadlines. */
function stripTier2ForTier1Shortfall(
  blocks: PlannerLLMBlock[],
  tasks: ActiveTask[],
  taskQuotas: Map<string, number>,
): PlannerLLMBlock[] {
  const { tier1, tier2 } = classifyTasksByPriority(tasks);
  if (tier2.length === 0) return blocks;

  const tier2Ids = new Set(tier2.map(t => t.id));
  const tier1Shortfall = tier1.some(t => {
    const quota = taskQuotas.get(t.id) ?? 0;
    return quota > 0 && allocatedMinutes(blocks, t.id) < quota;
  });

  if (!tier1Shortfall) return blocks;

  const stripped = blocks.filter(b => !b.task_id || !tier2Ids.has(b.task_id));
  console.log(
    `[planner] priority: stripped ${blocks.length - stripped.length} Tier-2 block(s) ` +
    `to protect Tier-1 deadlines`,
  );
  return stripped;
}

function formatTierTaskList(tasks: ActiveTask[], quotas: Map<string, number>): string {
  if (tasks.length === 0) return `  (none)`;
  return tasks
    .map((t, i) => {
      const remaining = taskRemainingMin(t);
      const target    = quotas.get(t.id) ?? remaining;
      const hoursLeft = t.due_date
        ? Math.max(0, hoursUntilDeadline(t.due_date)).toFixed(1)
        : null;
      return (
        `  ${i + 1}. id=${t.id} | "${t.title}"` +
        `${t.course_name ? ` (${t.course_name})` : ""}` +
        `${t.due_date ? ` | Due: ${t.due_date} (${hoursLeft}h left)` : " | No deadline"}` +
        ` | Plan target: ${target} min (${remaining} min total remaining)`
      );
    })
    .join("\n");
}

function formatDeadlineConstraints(
  tasks: ActiveTask[],
  horizonEnd: string,
  quotas: Map<string, number>,
): string {
  const urgent = tasks.filter(t => t.due_date && t.due_date <= horizonEnd);
  if (urgent.length === 0) return "  No deadlines within this planning window.";

  return urgent
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .map((t, i) => {
      const remaining = taskRemainingMin(t);
      const target    = quotas.get(t.id) ?? remaining;
      const daysLeft = Math.max(
        0,
        differenceInCalendarDays(
          new Date(`${t.due_date!}T00:00:00`),
          new Date(),
        ),
      );
      return (
        `  ${i + 1}. URGENT — "${t.title}"` +
        `${t.course_name ? ` (${t.course_name})` : ""}` +
        ` | Due: ${t.due_date} (${daysLeft} day(s) left)` +
        ` | Plan target: ${target} min (${remaining} min total remaining)`
      );
    })
    .join("\n");
}

function formatAvailableSlots(slots: AvailableSlot[]): string {
  if (slots.length === 0)
    return "  No available study time found — all days are rest days or fully occupied.";
  return slots
    .map((s, i) =>
      `  Slot ${String(i + 1).padStart(2)}: ${s.day_name} ${s.date}  ${s.start}–${s.end}  (${s.duration_min} min free)`
    )
    .join("\n");
}

function formatTaskQuotas(tasks: ActiveTask[], quotas: Map<string, number>): string {
  if (tasks.length === 0) return "  No tasks to schedule.";
  return tasks
    .map((t, i) => {
      const remaining = taskRemainingMin(t);
      const target    = quotas.get(t.id) ?? remaining;
      return (
        `  ${i + 1}. id=${t.id} | "${t.title}"` +
        `${t.course_name ? ` (${t.course_name})` : ""}` +
        `${t.due_date ? ` | Due: ${t.due_date}` : " | No deadline"}` +
        ` | Plan target: ${target} min (${remaining} min total remaining)`
      );
    })
    .join("\n");
}

// ── Shared insert helper ───────────────────────────────────────────────────────

async function insertDraftBlocks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  blocks: PlannerLLMBlock[],
) {
  const { error: delErr } = await supabase
    .from("scheduled_blocks")
    .delete()
    .eq("user_id", userId)
    .eq("kind", "ai")
    .eq("is_locked", false);
  if (delErr) throw new Error(delErr.message);

  if (blocks.length === 0) return;

  const { error: insErr } = await supabase.from("scheduled_blocks").insert(
    blocks.map(b => ({
      user_id:        userId,
      task_id:        b.task_id ?? null,
      title:          b.title,
      scheduled_date: b.scheduled_date,
      start_time:     b.start_time,
      end_time:       b.end_time,
      is_locked:      false,
      kind:           "ai",
    }))
  );
  if (insErr) throw new Error(insErr.message);
}

// ── Groq key rotation + rate limiting ─────────────────────────────────────────

const PLANNER_GEN_LOG_TITLE = "__planner_gen_log__";
const PLANNER_GEN_LOG_DATE  = "1970-01-01";
const PLANNER_GEN_LIMIT     = 3;
const PLANNER_GEN_WINDOW_MS = 60 * 60 * 1000;
const GROQ_MAX_RETRIES      = 3;
const GROQ_RATE_LIMIT_MSG =
  "You have reached the limit of 3 automatic schedules per hour. Please try again later.";

function isGroqRetryableError(err: unknown): boolean {
  if (err instanceof APIError) {
    return err.status === 401 || err.status === 429 || err.status === 503;
  }
  const status = (err as { status?: number }).status;
  return status === 401 || status === 429 || status === 503;
}

async function callGroqChatCompletionWithFailover(
  params: Omit<Parameters<Groq["chat"]["completions"]["create"]>[0], "stream">,
): Promise<ChatCompletion> {
  let pool = parseGroqApiKeys();
  if (pool.length === 0) {
    throw new Error("Groq API is not configured.");
  }

  let lastError: unknown;
  let retries = 0;

  while (pool.length > 0 && retries <= GROQ_MAX_RETRIES) {
    const keyIndex = Math.floor(Math.random() * pool.length);
    const apiKey   = pool[keyIndex];
    const client   = new Groq({ apiKey });

    try {
      return await client.chat.completions.create({
        ...params,
        stream: false,
      });
    } catch (err) {
      lastError = err;
      if (!isGroqRetryableError(err) || retries >= GROQ_MAX_RETRIES) {
        throw err;
      }
      pool = pool.filter((_, i) => i !== keyIndex);
      retries += 1;
      console.warn(
        `[planner] Groq ${(err as APIError).status ?? "error"} on key index ${keyIndex}; ` +
        `retry ${retries}/${GROQ_MAX_RETRIES} with ${pool.length} key(s) left.`,
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Groq API keys are rate-limited or unavailable. Please try again later.");
}

async function countRecentPlannerGenerations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number> {
  const since = new Date(Date.now() - PLANNER_GEN_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("scheduled_blocks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "ai")
    .eq("title", PLANNER_GEN_LOG_TITLE)
    .gte("created_at", since);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function recordPlannerGenerationAttempt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("scheduled_blocks").insert({
    user_id:        userId,
    task_id:        null,
    title:          PLANNER_GEN_LOG_TITLE,
    scheduled_date: PLANNER_GEN_LOG_DATE,
    start_time:     "00:00",
    end_time:       "00:01",
    is_locked:      true,
    kind:           "ai",
  });

  if (error) {
    console.error("[planner] generation log insert error:", error.message);
  }
}

// ── Drift / missed-block detection ────────────────────────────────────────────

async function loadMissedDriftContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const today = todayDateString();
  const missedHorizonStart = getMissedHorizonStart(new Date(`${today}T00:00:00`));

  const { data: pastRows, error: pastErr } = await supabase
    .from("scheduled_blocks")
    .select("id, task_id, title, scheduled_date, start_time, end_time, is_locked, kind")
    .eq("user_id", userId)
    .eq("is_locked", true)
    .in("kind", ["ai", "manual"])
    .gte("scheduled_date", missedHorizonStart)
    .lt("scheduled_date", today);

  if (pastErr) throw new Error(pastErr.message);

  const pastBlocks: DriftBlockLike[] = (pastRows ?? []).map((row) => ({
    id:             row.id,
    title:          row.title,
    task_id:        row.task_id,
    scheduled_date: row.scheduled_date,
    start_time:     (row.start_time as string).slice(0, 5),
    end_time:       (row.end_time as string).slice(0, 5),
    is_locked:      row.is_locked,
    kind:           row.kind as "ai" | "manual",
  }));

  if (pastBlocks.length === 0) {
    return {
      today,
      completedGoals: new Set<string>(),
      missedForDrift: [] as DriftBlockLike[],
      missedMinutesByTask: new Map<string, number>(),
    };
  }

  const pastDates = [...new Set(pastBlocks.map((b) => b.scheduled_date))];
  const taskIds   = [
    ...new Set(pastBlocks.map((b) => b.task_id).filter((id): id is string => Boolean(id))),
  ];

  const [{ data: goalRows }, tasksResult] = await Promise.all([
    supabase
      .from("daily_goals")
      .select("task_id, goal_date, time_logged, is_fully_completed")
      .eq("user_id", userId)
      .in("goal_date", pastDates),
    taskIds.length > 0
      ? supabase
          .from("tasks")
          .select("id, due_date")
          .eq("user_id", userId)
          .in("id", taskIds)
      : Promise.resolve({ data: [] as { id: string; due_date: string | null }[], error: null }),
  ]);

  const completedGoals = buildCompletedGoalKeys(goalRows ?? []);

  const tasksById = new Map<string, { id: string; due_date: string | null }>(
    (tasksResult.data ?? []).map((t) => [t.id, t]),
  );

  const missedForDrift = filterMissedBlocksForDrift(
    pastBlocks,
    tasksById,
    today,
    completedGoals,
  );

  return {
    today,
    completedGoals,
    missedForDrift,
    missedMinutesByTask: groupMissedMinutesByTask(missedForDrift),
  };
}

export interface DriftState {
  hasDrift:              boolean;
  missedDurationMinutes: number;
  completedGoalKeys:     string[];
  missedBlocks:          Array<{
    id:             string;
    kind:           "ai" | "manual";
    title:          string;
    scheduled_date: string;
    start_time:     string;
    end_time:       string;
    is_locked:      boolean;
    task_id:        string | null;
  }>;
}

export async function getDriftState(): Promise<DriftState> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      hasDrift: false,
      missedDurationMinutes: 0,
      completedGoalKeys: [],
      missedBlocks: [],
    };
  }

  try {
    const { completedGoals, missedForDrift } = await loadMissedDriftContext(
      supabase,
      user.id,
    );

    const missedDurationMinutes = sumMissedDurationMinutes(missedForDrift);

    return {
      hasDrift: missedDurationMinutes > 0,
      missedDurationMinutes,
      completedGoalKeys: [...completedGoals],
      missedBlocks: missedForDrift.map((b) => ({
        id:             b.id,
        kind:           b.kind as "ai" | "manual",
        title:          b.title ?? "Study block",
        scheduled_date: b.scheduled_date,
        start_time:     b.start_time,
        end_time:       b.end_time,
        is_locked:      b.is_locked,
        task_id:        b.task_id ?? null,
      })),
    };
  } catch {
    return {
      hasDrift: false,
      missedDurationMinutes: 0,
      completedGoalKeys: [],
      missedBlocks: [],
    };
  }
}

// ── generateSchedulePlan ──────────────────────────────────────────────────────

export async function generateSchedulePlan(
  constraints: string,
  options?: { resolveMissedDrift?: boolean },
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false as const, error: "Not authenticated" };

  try {
    const recentGenerations = await countRecentPlannerGenerations(supabase, user.id);
    if (recentGenerations >= PLANNER_GEN_LIMIT) {
      return { success: false as const, error: GROQ_RATE_LIMIT_MSG };
    }
  } catch (e) {
    console.error("[planner] rate-limit check error:", e);
    return {
      success: false as const,
      error: e instanceof Error ? e.message : "Could not verify generation limit.",
    };
  }

  // ── Clean-slate — delete existing AI draft blocks from plan start forward ───
  const { startDate: cleanFrom, endDate: cleanTo, planDuration } = getPlanHorizon();

  // Count first so we can log exactly how many rows are removed.
  const { count: draftCount } = await supabase
    .from("scheduled_blocks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("kind", "ai")
    .eq("is_locked", false)
    .gte("scheduled_date", cleanFrom);

  console.log(
    `[planner] clean-slate: found ${draftCount ?? 0} AI draft block(s) ` +
    `from ${cleanFrom} forward, deleting…`
  );

  const { error: cleanErr } = await supabase
    .from("scheduled_blocks")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", "ai")
    .eq("is_locked", false)
    .gte("scheduled_date", cleanFrom);

  if (cleanErr) {
    // RLS note: the policy "Users manage own scheduled blocks" on scheduled_blocks
    // uses FOR ALL USING (auth.uid() = user_id) — this covers DELETE operations.
    // If this error fires the session cookie is likely missing from the request.
    console.error("[planner] clean-slate DELETE error:", cleanErr.message, cleanErr.code);
  } else {
    console.log(`[planner] clean-slate: deleted ${draftCount ?? 0} draft block(s) successfully.`);
  }

  let missedMinutesByTask = new Map<string, number>();
  let missedIdsToDelete: string[] = [];

  if (options?.resolveMissedDrift) {
    const driftCtx = await loadMissedDriftContext(supabase, user.id);
    missedMinutesByTask = driftCtx.missedMinutesByTask;
    missedIdsToDelete = driftCtx.missedForDrift.map((b) => b.id);
  }

  const effectiveConstraints = constraints.trim() ||
    (options?.resolveMissedDrift
      ? "Recalculate my schedule from today forward to cover missed study time from previous days."
      : "Generate an optimal schedule based on my existing routine and tasks.");

  // ── Fetch data (profile, tasks, schedules are independent) ───────────────
  const [
    { data: profile, error: profileError },
    { data: tasks, error: tasksError },
    { data: rawSchedules, error: schedError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "academic_background, weekly_hours, work_rest_interval, buffer_time_minutes, " +
        "learning_style, scheduling_style, hobbies_and_breaks",
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("tasks")
      .select("id, title, course_name, due_date, estimated_duration, progress")
      .eq("user_id", user.id)
      .neq("status", "archived")
      .lt("progress", 100)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("schedules")
      .select("day_of_week, start_time, duration, type, courses(course_name)")
      .eq("user_id", user.id)
      .order("day_of_week", { ascending: true }),
  ]);

  if (profileError || !profile)
    return { success: false as const, error: "Could not load profile" };
  if (tasksError) return { success: false as const, error: tasksError.message };
  if (schedError) return { success: false as const, error: schedError.message };

  const profileRow = profile as unknown as {
    academic_background: string | null;
    weekly_hours: WeeklyHours | null;
    work_rest_interval: string | null;
    buffer_time_minutes: number | null;
    learning_style: string | null;
    scheduling_style: string | null;
    hobbies_and_breaks: string | null;
  };

  const userSettings: UserPlanningSettings = {
    scheduling_style:    (profileRow.scheduling_style as "marathon" | "interleaved") ?? "interleaved",
    learning_style:      profileRow.learning_style ?? null,
    weekly_hours:        profileRow.weekly_hours,
    work_rest_interval:  profileRow.work_rest_interval ?? null,
    buffer_time_minutes: profileRow.buffer_time_minutes ?? null,
    hobbies_and_breaks:  profileRow.hobbies_and_breaks ?? null,
    academic_background: profileRow.academic_background ?? null,
  };

  const fixedSlots: FixedSlot[] = (rawSchedules ?? []).map(s => ({
    day_of_week: s.day_of_week,
    start_time:  s.start_time,
    duration:    s.duration,
    type:        s.type,
    course_name: ((s.courses as unknown) as { course_name: string } | null)?.course_name ?? null,
  }));

  // ── Phase 1: Deterministic slot generation ─────────────────────────────────
  const workRest  = profileRow.work_rest_interval ?? "50/10";
  const buffer    = profileRow.buffer_time_minutes ?? 15;
  const [workMin] = workRest.split("/").map(Number);

  const availableSlots = computeAvailableSlots(
    profileRow.weekly_hours,
    fixedSlots,
    buffer,
    planDuration,
  );

  const activeTasks = (tasks ?? []) as ActiveTask[];
  const proportionalQuotas = buildProportionalQuotas(activeTasks, cleanFrom, cleanTo);

  if (missedMinutesByTask.size > 0) {
    for (const [taskId, extraMin] of missedMinutesByTask) {
      proportionalQuotas.set(
        taskId,
        (proportionalQuotas.get(taskId) ?? 0) + extraMin,
      );
    }
    console.log(
      `[planner] missed-drift quota boost for ${missedMinutesByTask.size} task(s).`,
    );
  }

  const totalAvailMin   = availableSlots.reduce((s, sl) => s + sl.duration_min, 0);
  const totalRequireMin = [...proportionalQuotas.values()].reduce((s, q) => s + q, 0);

  const horizonDates = getHorizonDateStrings(cleanFrom, cleanTo);
  const horizonEnd   = cleanTo;

  console.log(
    "[planner] tasks:", activeTasks.length,
    "| slots:", availableSlots.length,
    "| avail:", totalAvailMin, "min | proportional need:", totalRequireMin, "min",
    `| horizon: ${cleanFrom} → ${cleanTo} (${planDuration} days)`,
  );

  const { tier1, tier2 } = classifyTasksByPriority(activeTasks);
  const schedulingStyle  = userSettings.scheduling_style;

  // ── Phase 2: Build prompt ──────────────────────────────────────────────────
  const timeStatus = totalAvailMin < totalRequireMin
    ? `⚠️ TIME SHORTAGE: ${totalAvailMin} min available, ${totalRequireMin} min required → return CONFLICT schema.`
    : `✅ Time OK: ${totalAvailMin} min available, ${totalRequireMin} min required → return SUCCESS schema.`;

  const prompt = `
You are an AI Study Scheduler. The system has pre-computed ALL free time windows.
Your ONLY job: assign tasks into those pre-computed slots. Do NOT invent times outside them.

═══════════════════════════════════════
STUDENT PROFILE (live saved settings)
═══════════════════════════════════════
Academic Background : ${userSettings.academic_background ?? "Not specified"}
Work / Rest Rhythm  : ${workRest}
Buffer Between Blocks: ${buffer} min
Learning Style      : ${userSettings.learning_style ?? "mixed"}
Scheduling Style    : ${schedulingStyle} (saved preference — applies to Tier 2 only)
Hobbies & Routine   : ${userSettings.hobbies_and_breaks ?? "None provided"}

═══════════════════════════════════════
USER CONSTRAINTS — SUPREME DIRECTIVE (overrides ALL rules below, including Tier 1)
═══════════════════════════════════════
${effectiveConstraints}

If the user asks to keep a specific day or time range free, you MUST NOT schedule
blocks there. You MUST list every restricted timeframe in the blackout_windows array.

═══════════════════════════════════════
PRE-COMPUTED FREE STUDY SLOTS
Schedule ONLY within these windows — nothing else.
${timeStatus}
═══════════════════════════════════════
${formatAvailableSlots(availableSlots)}

═══════════════════════════════════════
PRIORITY TIER 1 — CRITICAL (deadline within 72 hours)
Allocate 100% of remaining time BEFORE any Tier 2 work.
═══════════════════════════════════════
${formatTierTaskList(tier1, proportionalQuotas)}

═══════════════════════════════════════
PRIORITY TIER 2 — NORMAL (deadline > 72h or none)
Follow the user's saved scheduling style after Tier 1 is fully satisfied.
═══════════════════════════════════════
${formatTierTaskList(tier2, proportionalQuotas)}

═══════════════════════════════════════
TASK QUOTAS — PROPORTIONAL PLAN TARGETS (${cleanFrom} → ${cleanTo}, ${planDuration} days)
Schedule ONLY the "Plan target" minutes per task this window — NOT the full remaining total
unless the deadline is imminent or the task is Tier 1 critical.
═══════════════════════════════════════
${formatTaskQuotas(activeTasks, proportionalQuotas)}

═══════════════════════════════════════
DEADLINE ENFORCEMENT — MANDATORY
═══════════════════════════════════════
Tasks with deadlines inside this window MUST receive their full plan target before due date.
${formatDeadlineConstraints(activeTasks, horizonEnd, proportionalQuotas)}

═══════════════════════════════════════
PRIORITY & PACING RULES — MANDATORY
═══════════════════════════════════════
Rule 1: You MUST allocate 100% of the plan target for ALL Tier 1 tasks BEFORE assigning any time to Tier 2 tasks.
Rule 2: For Tier 2 tasks, strictly follow the user's saved scheduling style: '${schedulingStyle}'.
  - If 'marathon': focus entirely on completing the first Tier 2 task before moving to the next.
  - If 'interleaved': distribute the remaining available time evenly across multiple Tier 2 tasks to maintain variety.
Rule 3: Never schedule any block after a task's due date.
Rule 4: Respect proportional pacing — do NOT schedule more than each task's "Plan target" this window.

═══════════════════════════════════════
GENERAL RULES
═══════════════════════════════════════
1. Place blocks ONLY inside the PRE-COMPUTED FREE STUDY SLOTS listed above.
2. Break each task into ~${workMin}-min work blocks. Stay within slot boundaries.
3. Leave ${buffer} min gap between tasks within the same slot.
4. USER CONSTRAINTS / blackout_windows override everything — never schedule inside a blackout.
5. LOCALIZATION: titles must be in the same language as the task titles.
6. Horizon dates: ${horizonDates.join(", ")}.

═══════════════════════════════════════
OUTPUT — raw JSON only, NO markdown
═══════════════════════════════════════
SUCCESS (time is sufficient):
{
  "status": "success",
  "ai_message": "...",
  "scheduled_blocks": [
    { "task_id": "uuid|null", "title": "...", "scheduled_date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM" }
  ],
  "blackout_windows": [
    { "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM" }
  ]
}
Use blackout_windows for every user-requested free period (whole day = "00:00"–"23:59"). Return [] if none.

CONFLICT (time is insufficient — max 3 options, titles 1-4 words):
{ "status": "conflict", "message": "...", "options": [ { "title": "Prioritize Deadlines", "pre_calculated_schedule": [ { block objects } ] } ] }
`.trim();

  // ── LLM call ──────────────────────────────────────────────────────────────
  let parsed: LLMResponse;
  try {
    await recordPlannerGenerationAttempt(supabase, user.id);

    const response = await callGroqChatCompletionWithFailover({
      messages: [
        {
          role: "system",
          content:
            "You are a scheduling assistant that assigns tasks to pre-computed free time slots. " +
            "Return ONLY raw JSON — no markdown. " +
            "status='success' with scheduled_blocks AND blackout_windows, OR status='conflict' with options (max 3, titles 1-4 words). " +
            "Blocks: task_id (uuid|null), title, scheduled_date (YYYY-MM-DD), start_time (HH:MM), end_time (HH:MM). " +
            "blackout_windows: array of { date (YYYY-MM-DD), start_time (HH:MM), end_time (HH:MM) } for every user-requested free period. " +
            "SUPREME DIRECTIVE: The user's custom text prompt overrides ALL other rules (including Tier 1 priorities). " +
            "If the user asks to keep a specific day or time range free, you MUST NOT schedule blocks there and MUST define those times in blackout_windows. " +
            "CRITICAL: Schedule 100% of Tier 1 (72h deadline) plan targets before ANY Tier 2 task — except where blackouts forbid it. " +
            "For Tier 2, honor the user's saved scheduling_style (marathon or interleaved). " +
            "Respect each task's proportional plan target — do NOT over-schedule far-deadline tasks in one window. " +
            "Never place blocks after a task's due date.",
        },
        { role: "user", content: prompt },
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
    });

    const rawText = response.choices[0]?.message?.content ?? "";
    console.log("[planner] Raw LLM:", rawText.slice(0, 400), rawText.length > 400 ? "…" : "");

    const cleanText = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    parsed = JSON.parse(cleanText) as LLMResponse;
    console.log("[planner] status:", parsed.status);
  } catch (e) {
    console.error("[planner] Groq/parse error:", e);
    if (isGroqRetryableError(e)) {
      return {
        success: false as const,
        error: "AI scheduling is temporarily unavailable due to high demand. Please try again in a few minutes.",
      };
    }
    return { success: false as const, error: e instanceof Error ? e.message : "AI call failed." };
  }

  // ── Conflict → return to UI, no DB write ──────────────────────────────────
  if (parsed.status === "conflict") {
    return {
      success:  true as const,
      status:   "conflict" as const,
      message:  parsed.message,
      options:  (parsed.options ?? []).slice(0, 3),
    };
  }

  // ── Success → post-process, then persist ──────────────────────────────────
  if (!Array.isArray(parsed.scheduled_blocks)) {
    return { success: false as const, error: "AI returned an unexpected format." };
  }

  const taskTitles    = new Map(activeTasks.map(t => [t.id, t.title]));
  const priorityOrder = priorityTaskOrder(activeTasks);
  const blackoutWindows = normalizeBlackoutWindows(
    (parsed as LLMSuccess).blackout_windows ?? [],
  );

  if (blackoutWindows.length > 0) {
    console.log(`[planner] LLM declared ${blackoutWindows.length} blackout window(s).`);
  }

  // Step 1: smart collision shifting (try to move overlaps forward, don't delete)
  const { blocks: shiftedBlocks, warnings: collisionWarnings } = resolveCollisions(
    parsed.scheduled_blocks,
    availableSlots,
    fixedSlots,
    buffer,
    taskTitles,
  );

  // Fetch already-approved (locked) blocks within the plan horizon
  const { data: lockedRows } = await supabase
    .from("scheduled_blocks")
    .select("task_id, start_time, end_time")
    .eq("user_id", user.id)
    .eq("is_locked", true)
    .in("kind", ["ai", "manual"])
    .not("task_id", "is", null)
    .gte("scheduled_date", cleanFrom)
    .lte("scheduled_date", cleanTo);

  const approvedMin = new Map<string, number>();
  for (const b of lockedRows ?? []) {
    if (!b.task_id) continue;
    const dur = timeToMin((b.end_time as string).slice(0, 5)) -
                timeToMin((b.start_time as string).slice(0, 5));
    if (dur > 0) approvedMin.set(b.task_id, (approvedMin.get(b.task_id) ?? 0) + dur);
  }

  const taskQuotas = new Map<string, number>(
    activeTasks.map(t => {
      const propTarget    = proportionalQuotas.get(t.id) ?? 0;
      const alreadyLocked = approvedMin.get(t.id) ?? 0;
      return [t.id, Math.max(0, propTarget - alreadyLocked)];
    })
  );

  // Step 1b: strip Tier-2 blocks if Tier-1 tasks are under quota
  const rebalanced = stripTier2ForTier1Shortfall(shiftedBlocks, activeTasks, taskQuotas);

  // Step 2: chronological quota trim (Tier 1 → Tier 2 order)
  const trimmedBlocks = trimToQuota(rebalanced, taskQuotas, priorityOrder);
  const trimmedCount  = rebalanced.length - trimmedBlocks.length;
  if (trimmedCount > 0) {
    console.log(`[planner] Quota trim dropped/shortened ${trimmedCount} block(s).`);
  }

  // Step 3: deterministic priority auto-fill (deadline-bounded, Tier 1 first)
  const { blocks: filledBlocks, warnings: fillWarnings } = autoFillByPriority(
    trimmedBlocks,
    activeTasks,
    taskQuotas,
    availableSlots,
    fixedSlots,
    buffer,
    workMin,
    horizonEnd,
    blackoutWindows,
  );
  const autoFilled = filledBlocks.length - trimmedBlocks.length;
  if (autoFilled > 0) {
    console.log(`[planner] autoFill injected ${autoFilled} block(s) by priority.`);
  }

  const allWarnings = [...collisionWarnings, ...fillWarnings];

  try {
    await insertDraftBlocks(supabase, user.id, filledBlocks);
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : "DB error." };
  }

  if (missedIdsToDelete.length > 0) {
    const { error: delMissedErr } = await supabase
      .from("scheduled_blocks")
      .delete()
      .eq("user_id", user.id)
      .in("id", missedIdsToDelete);

    if (delMissedErr) {
      console.error("[planner] missed-drift DELETE error:", delMissedErr.message);
    } else {
      console.log(
        `[planner] missed-drift: removed ${missedIdsToDelete.length} past block(s) after draft insert.`,
      );
    }
  }

  revalidatePath("/planner", "page");
  revalidatePath("/", "layout");

  return {
    success:     true as const,
    status:      "success" as const,
    ai_message:  parsed.ai_message,
    block_count: filledBlocks.length,
    warnings:    allWarnings,
  };
}

// ── acceptConflictOption ──────────────────────────────────────────────────────

export async function acceptConflictOption(blocks: PlannerLLMBlock[]) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false as const, error: "Not authenticated" };

  try {
    await insertDraftBlocks(supabase, user.id, blocks);
  } catch (e) {
    return { success: false as const, error: e instanceof Error ? e.message : "DB error." };
  }

  revalidatePath("/planner", "page");
  revalidatePath("/", "layout");
  return { success: true as const, block_count: blocks.length };
}

// ── updateBlockTime (drag + resize persistence) ────────────────────────────────

export async function updateBlockTime(
  blockId: string,
  startTime: string,
  endTime: string,
  scheduledDate?: string,
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false as const, error: "Not authenticated" };

  const patch: { start_time: string; end_time: string; scheduled_date?: string } = {
    start_time: startTime,
    end_time:   endTime,
  };
  if (scheduledDate) patch.scheduled_date = scheduledDate;

  const { error } = await supabase
    .from("scheduled_blocks")
    .update(patch)
    .eq("id", blockId)
    .eq("user_id", user.id);

  if (error) return { success: false as const, error: error.message };
  revalidatePath("/planner");
  revalidatePath("/", "layout");
  return { success: true as const };
}

// ── deleteBlock ───────────────────────────────────────────────────────────────

export async function deleteBlock(blockId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false as const, error: "Not authenticated" };

  const { error } = await supabase
    .from("scheduled_blocks")
    .delete()
    .eq("id", blockId)
    .eq("user_id", user.id);

  if (error) return { success: false as const, error: error.message };
  revalidatePath("/planner");
  revalidatePath("/", "layout");
  return { success: true as const };
}

/** Bulk reject: remove all unapproved AI draft blocks and exit review mode. */
export async function discardDraftPlan() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false as const, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("scheduled_blocks")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", "ai")
    .eq("is_locked", false)
    .select("id");

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/planner");
  revalidatePath("/", "layout");
  return { success: true as const, deleted: data?.length ?? 0 };
}

// ── approvePlan ───────────────────────────────────────────────────────────────

function hmToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function roundTo5(pct: number): number {
  return Math.round(pct / 5) * 5;
}

/** Planning horizon — today through Saturday of next week. */
// getPlanHorizon imported from @/lib/plan-horizon

/**
 * Fix 3 — Workflow pivot:
 * Approving a plan means "I intend to study this". It locks blocks and creates
 * daily_goals, but does NOT touch task.progress. Progress only advances when
 * the student checks off a daily_goal in the dashboard.
 */
export async function approvePlan(startDate?: string, endDate?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false as const, error: "Not authenticated" };

  const horizon   = getPlanHorizon();
  const rangeFrom = startDate ?? horizon.startDate;
  void (endDate ?? horizon.endDate); // horizon end kept for API compat; deletes are forward-only

  const [
    { data: draftBlocks, error: fetchErr },
    { data: currentTasks },
  ] = await Promise.all([
    supabase
      .from("scheduled_blocks")
      .select("id, task_id, start_time, end_time, scheduled_date, title")
      .eq("user_id", user.id)
      .eq("kind", "ai")
      .eq("is_locked", false),
    supabase
      .from("tasks")
      .select("id, title, progress, status")
      .eq("user_id", user.id),
  ]);

  if (fetchErr) return { success: false as const, error: fetchErr.message };
  if (!draftBlocks?.length)
    return { success: false as const, error: "No draft blocks to approve." };

  // ── Snapshot for undo ──────────────────────────────────────────────────────
  await supabase.from("approval_snapshots").insert({
    user_id: user.id,
    snapshot_data: {
      blocks:      draftBlocks,
      tasks:       currentTasks ?? [],
      snapshot_at: new Date().toISOString(),
    },
  });

  // ── Forward infinite wipe: remove ALL approved AI blocks from rangeFrom onward ─
  // Manual blocks (kind='manual') are never touched. No upper date bound.
  const { count: approvedCount } = await supabase
    .from("scheduled_blocks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("kind", "ai")
    .eq("is_locked", true)
    .gte("scheduled_date", rangeFrom);

  console.log(
    `[planner] approve: forward AI overwrite from ${rangeFrom}, ` +
    `removing ${approvedCount ?? 0} previously approved AI block(s)…`
  );

  const { error: overwriteErr } = await supabase
    .from("scheduled_blocks")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", "ai")
    .eq("is_locked", true)
    .gte("scheduled_date", rangeFrom);

  if (overwriteErr) {
    console.warn("[planner] approve forward delete error:", overwriteErr.message);
  } else {
    console.log(`[planner] approve: cleared ${approvedCount ?? 0} approved AI block(s) forward.`);
  }

  // Clear stale daily goals from rangeFrom forward (no upper bound)
  await supabase
    .from("daily_goals")
    .delete()
    .eq("user_id", user.id)
    .gte("goal_date", rangeFrom);

  // ── Lock all AI draft blocks ─────────────────────────────────────────────
  const { error: lockErr } = await supabase
    .from("scheduled_blocks")
    .update({ is_locked: true })
    .eq("user_id", user.id)
    .eq("kind", "ai")
    .eq("is_locked", false);
  if (lockErr) return { success: false as const, error: lockErr.message };

  // ── Daily aggregation (5% Rule) ────────────────────────────────────────────
  // Group blocks by "taskId__date" to create ONE daily_goal per (task × day).
  const aggMap = new Map<string, { taskId: string; date: string; totalMin: number }>();

  for (const b of draftBlocks) {
    if (!b.task_id) continue;
    const key      = `${b.task_id}__${b.scheduled_date}`;
    const blockMin = Math.max(
      0,
      hmToMin(b.end_time.slice(0, 5)) - hmToMin(b.start_time.slice(0, 5))
    );
    const existing = aggMap.get(key);
    if (existing) {
      existing.totalMin += blockMin;
    } else {
      aggMap.set(key, { taskId: b.task_id, date: b.scheduled_date, totalMin: blockMin });
    }
  }

  const aggEntries = [...aggMap.values()];
  const uniqueTaskIds = [...new Set(aggEntries.map((e) => e.taskId))];

  const { data: taskRows } = uniqueTaskIds.length > 0
    ? await supabase
        .from("tasks")
        .select("id, title, estimated_duration")
        .eq("user_id", user.id)
        .in("id", uniqueTaskIds)
    : { data: [] as { id: string; title: string; estimated_duration: number | null }[] };

  const tasksById = new Map((taskRows ?? []).map((t) => [t.id, t]));

  const goalUpserts: Array<{
    user_id:            string;
    task_id:            string;
    goal_date:          string;
    target_minutes:     number;
    title:              string;
    time_logged:        boolean;
    is_fully_completed: boolean;
  }> = [];

  for (const { taskId, date, totalMin } of aggEntries) {
    const task = tasksById.get(taskId);
    if (!task) continue;

    const estimated = task.estimated_duration ?? 60;

    /**
     * 5% Rule Math
     * ────────────────────────────────────────────────────────
     * rawPct     = (totalMin / estimated) × 100
     * roundedPct = round(rawPct / 5) × 5   (snap to nearest 5%)
     * title      = "{Task Name} — {roundedPct}%"
     *
     * The student's task.progress does NOT change here.
     * It advances only when they check this daily_goal off in the dashboard.
     */
    const rawPct     = (totalMin / estimated) * 100;
    const roundedPct = Math.max(5, Math.min(100, roundTo5(rawPct)));
    const goalTitle  = `${task.title} — ${roundedPct}%`;

    goalUpserts.push({
      user_id:            user.id,
      task_id:            taskId,
      goal_date:          date,
      target_minutes:     totalMin,
      title:              goalTitle,
      time_logged:        false,
      is_fully_completed: false,
    });
  }

  if (goalUpserts.length > 0) {
    const { error: goalsErr } = await supabase
      .from("daily_goals")
      .upsert(goalUpserts, { onConflict: "user_id,task_id,goal_date" });

    if (goalsErr) return { success: false as const, error: goalsErr.message };
  }

  revalidatePath("/planner");
  revalidatePath("/", "layout");

  return { success: true as const, approved: draftBlocks.length };
}

// ── undoApproval ──────────────────────────────────────────────────────────────

export async function undoApproval() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false as const, error: "Not authenticated" };

  const { data: snapshots } = await supabase
    .from("approval_snapshots")
    .select("id, snapshot_data")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!snapshots?.length)
    return { success: false as const, error: "No snapshot available to restore." };

  const snap = snapshots[0].snapshot_data as {
    tasks: Array<{ id: string; progress: number; status: string }>;
  };

  const taskRestores = snap.tasks ?? [];
  if (taskRestores.length > 0) {
    const { error: restoreErr } = await supabase.from("tasks").upsert(
      taskRestores.map((t) => ({
        id:       t.id,
        user_id:  user.id,
        progress: t.progress,
        status:   t.status,
      })),
      { onConflict: "id" },
    );

    if (restoreErr) {
      return { success: false as const, error: restoreErr.message };
    }
  }

  await supabase.from("approval_snapshots").delete().eq("id", snapshots[0].id);

  revalidatePath("/planner");
  revalidatePath("/", "layout");
  return { success: true as const };
}

// ── createManualBlock ─────────────────────────────────────────────────────────
/**
 * Inserts a single manually-created block.
 * Manual blocks are immediately locked (is_locked = true) — the user placed
 * them intentionally, so no approval step is needed.
 */
export async function createManualBlock(data: {
  task_id:        string | null;
  title:          string;
  scheduled_date: string;
  start_time:     string;
  end_time:       string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false as const, error: "Not authenticated" };

  const { data: inserted, error } = await supabase
    .from("scheduled_blocks")
    .insert({
      user_id:        user.id,
      task_id:        data.task_id || null,
      title:          data.title.trim(),
      scheduled_date: data.scheduled_date,
      start_time:     data.start_time,
      end_time:       data.end_time,
      is_locked:      true,
      kind:           "manual",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[planner] createManualBlock error:", error.message);
    return { success: false as const, error: error.message };
  }

  revalidatePath("/planner");
  revalidatePath("/", "layout");
  return { success: true as const, block: inserted };
}

// ── loadPlannerWeekData ───────────────────────────────────────────────────────

function mapStudyBlock(b: {
  id: string;
  kind: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  is_locked: boolean;
  task_id: string | null;
}): CalendarBlock {
  return {
    id:             b.id,
    kind:           b.kind as CalendarBlock["kind"],
    title:          b.title,
    scheduled_date: toDateKey(b.scheduled_date),
    start_time:     normalizeTimeKey(b.start_time),
    end_time:       normalizeTimeKey(b.end_time),
    is_locked:      b.is_locked,
    task_id:        b.task_id != null ? String(b.task_id).trim() : null,
  };
}

export interface ScheduleGoalRecord {
  taskId:                   string;
  goalDate:                 string;
  goalId:                   string | null;
  timeLogged:               boolean;
  isFullyCompleted:         boolean;
  baselineProgressSnapshot: number | null;
}

export interface PlannerWeekData {
  calendarBlocks:          CalendarBlock[];
  hasDraftBlocks:          boolean;
  lockedHistoryBlocks:     LockedHistoryBlock[];
  progressBlocks:          CalendarBlock[];
  /** Union — missed-block clearing (session logged ∪ parent attested) */
  completedGoalKeys:       string[];
  sessionLoggedKeys:       string[];
  fullyCompletedGoalKeys:  string[];
  tasks:                   Task[];
  goalRecords:             ScheduleGoalRecord[];
}

/** Fetches study blocks, fixed courses, and history baseline for a calendar week. */
export async function loadPlannerWeekData(
  weekStart: string,
  weekEnd:   string,
): Promise<PlannerWeekData> {
  const empty: PlannerWeekData = {
    calendarBlocks:         [],
    hasDraftBlocks:         false,
    lockedHistoryBlocks:    [],
    progressBlocks:         [],
    completedGoalKeys:      [],
    sessionLoggedKeys:      [],
    fullyCompletedGoalKeys: [],
    tasks:                  [],
    goalRecords:            [],
  };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;

  const todayStr     = todayDateString();
  const historyStart = getHistoryStart(new Date());
  const weekDays     = getHorizonDateStrings(weekStart, weekEnd);

  console.log("[loadPlannerWeekData] range:", { weekStart, weekEnd, historyStart });

  const [
    { data: studyBlocks, error: studyError },
    { data: rawSchedules, error: schedError },
    { data: historyBlocks, error: histError },
    { data: goals, error: goalsError },
    { data: progressBlockRows, error: progressError },
    { data: taskRows, error: tasksError },
  ] = await Promise.all([
    supabase
      .from("scheduled_blocks")
      .select("id, kind, title, scheduled_date, start_time, end_time, is_locked, task_id")
      .eq("user_id", user.id)
      .gte("scheduled_date", weekStart)
      .lte("scheduled_date", weekEnd)
      .order("scheduled_date")
      .order("start_time"),
    supabase
      .from("schedules")
      .select("id, day_of_week, start_time, duration, type, courses(course_name)")
      .eq("user_id", user.id),
    supabase
      .from("scheduled_blocks")
      .select("id, kind, title, scheduled_date, start_time, end_time, is_locked, task_id")
      .eq("user_id", user.id)
      .gte("scheduled_date", historyStart)
      .lt("scheduled_date", weekStart)
      .order("scheduled_date")
      .order("start_time"),
    supabase
      .from("daily_goals")
      .select("id, task_id, goal_date, time_logged, is_fully_completed, baseline_progress_snapshot")
      .eq("user_id", user.id),
    supabase
      .from("scheduled_blocks")
      .select("id, kind, title, scheduled_date, start_time, end_time, is_locked, task_id")
      .eq("user_id", user.id)
      .in("kind", ["ai", "manual"])
      .not("task_id", "is", null)
      .order("scheduled_date")
      .order("start_time"),
    supabase
      .from("tasks")
      .select("id, title, due_date, estimated_duration, course_name, status, progress")
      .eq("user_id", user.id)
      .in("status", ["pending", "in_progress", "completed"]),
  ]);

  if (studyError) {
    console.error("[loadPlannerWeekData] study blocks error:", studyError.message);
  }
  console.log("[loadPlannerWeekData] Fetched blocks:", studyBlocks ?? []);

  if (schedError) {
    console.error("[loadPlannerWeekData] schedules error:", schedError.message);
  }

  if (histError) {
    console.error("[loadPlannerWeekData] history blocks error:", histError.message);
  }

  if (goalsError) {
    console.error("[loadPlannerWeekData] daily_goals error:", goalsError.message);
  }

  if (progressError) {
    console.error("[loadPlannerWeekData] progress blocks error:", progressError.message);
  }

  if (tasksError) {
    console.error("[loadPlannerWeekData] tasks error:", tasksError.message);
  }

  const completedGoalKeys      = Array.from(buildCompletedGoalKeys(goals ?? []));
  const sessionLoggedKeys      = Array.from(buildSessionLoggedKeys(goals ?? []));
  const fullyCompletedGoalKeys = Array.from(buildFullyCompletedGoalKeys(goals ?? []));

  const weekGoals = (goals ?? []).filter(
    (g) => toDateKey(g.goal_date) >= weekStart && toDateKey(g.goal_date) <= weekEnd,
  );

  const goalRecords: ScheduleGoalRecord[] = weekGoals.map((g) => ({
    taskId:                   String(g.task_id).trim(),
    goalDate:                 toDateKey(g.goal_date),
    goalId:                   g.id as string,
    timeLogged:               g.time_logged,
    isFullyCompleted:         g.is_fully_completed,
    baselineProgressSnapshot: g.baseline_progress_snapshot ?? null,
  }));

  const calendarBlocks: CalendarBlock[] = (studyBlocks ?? []).map(mapStudyBlock);

  for (const slot of rawSchedules ?? []) {
    const startTime = normalizeTimeKey(slot.start_time);
    const startMin  = timeToMin(startTime);
    const endTime   = minToTime(startMin + (slot.duration ?? 90));
    const title =
      ((slot.courses as unknown) as { course_name: string } | null)?.course_name ??
      slot.type ??
      "Class";

    for (const dayStr of weekDays) {
      const jsDay = new Date(`${dayStr}T12:00:00`).getDay(); // 0=Sun … 6=Sat
      if (slot.day_of_week !== jsDay + 1) continue; // DB: 1=Sun … 7=Sat

      calendarBlocks.push({
        id:             `fixed-${slot.id}-${dayStr}`,
        kind:           "fixed",
        title,
        scheduled_date: dayStr,
        start_time:     startTime,
        end_time:       endTime,
        is_locked:      true,
        task_id:        null,
      });
    }
  }

  const lockedHistoryBlocks: LockedHistoryBlock[] = (historyBlocks ?? [])
    .filter((b) => b.task_id)
    .map((b) => ({
      task_id:        b.task_id!,
      scheduled_date: toDateKey(b.scheduled_date),
      start_time:     normalizeTimeKey(b.start_time),
      end_time:       normalizeTimeKey(b.end_time),
    }));

  const progressBlocks: CalendarBlock[] = (progressBlockRows ?? []).map(mapStudyBlock);

  const hasDraftBlocks = (studyBlocks ?? []).some(
    (b) => b.kind === "ai" && !b.is_locked,
  );

  return {
    calendarBlocks,
    hasDraftBlocks,
    lockedHistoryBlocks,
    progressBlocks,
    completedGoalKeys,
    sessionLoggedKeys,
    fullyCompletedGoalKeys,
    tasks:       (taskRows ?? []) as unknown as Task[],
    goalRecords,
  };
}

// ── clearPlannerRange ─────────────────────────────────────────────────────────
/**
 * Wipes AI scheduled_blocks (draft + approved) from startDate forward.
 * Manual blocks and fixed courses are never touched.
 */
export async function clearPlannerRange(startDate: string, _endDate?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false as const, error: "Not authenticated" };

  const todayStr = todayDateString();
  const effectiveStart = startDate < todayStr ? todayStr : startDate;

  const { count: total } = await supabase
    .from("scheduled_blocks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("kind", "ai")
    .gte("scheduled_date", effectiveStart);

  const { error } = await supabase
    .from("scheduled_blocks")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", "ai")
    .gte("scheduled_date", effectiveStart);

  if (error) {
    console.error("[planner] clearPlannerRange error:", error.message);
    return { success: false as const, error: error.message };
  }

  console.log(
    `[planner] clearPlannerRange: deleted ${total ?? 0} AI block(s) from ${effectiveStart} forward`,
  );
  revalidatePath("/planner");
  revalidatePath("/", "layout");
  return { success: true as const, deleted: total ?? 0 };
}

// ── getTodayStudyBlocks ───────────────────────────────────────────────────────
/** Approved AI study blocks for today — merged into dashboard agenda. */
export async function getTodayStudyBlocks(forDate: string = todayDateString()): Promise<TodaySlot[]> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const todayStr = forDate;

  const { data } = await supabase
    .from("scheduled_blocks")
    .select("id, title, start_time, end_time, tasks(title, course_name)")
    .eq("user_id", user.id)
    .eq("is_locked", true)
    .in("kind", ["ai", "manual"])
    .eq("scheduled_date", todayStr)
    .order("start_time", { ascending: true });

  if (!data) return [];

  return data.map(row => {
    const task = (row.tasks as unknown) as {
      title: string | null;
      course_name: string | null;
    } | null;
    const start = (row.start_time as string).slice(0, 5);
    const end   = (row.end_time as string).slice(0, 5);
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);

    return {
      id:         row.id as string,
      courseName: task?.course_name ?? task?.title ?? "Study",
      type:       "study" as const,
      startTime:  start,
      duration:   Math.max(0, duration),
      kind:       "study" as const,
      title:      row.title as string,
    };
  });
}
