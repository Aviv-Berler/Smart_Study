import { normalizeTimeKey, toDateKey } from "@/lib/plan-horizon";
import type { CalendarBlock, ScheduleType, TodaySlot } from "@/types/database";

/** Recurring university class rule from `schedules` + joined course name */
export interface ScheduleRule {
  id:           string;
  day_of_week:  number; // DB: 1=Sun … 7=Sat
  start_time:   string;
  duration:     number | null;
  type:         string;
  course_name:  string | null;
}

/** Physical row for class override / cancellation */
export interface ClassInstanceRow {
  id:                 string;
  kind:               "class_override" | "class_cancelled";
  source_schedule_id: string;
  scheduled_date:     string;
  start_time:         string;
  end_time:           string;
  title:              string;
  is_locked:          boolean;
  task_id:            string | null;
}

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Synthetic id for a virtual (non-persisted) class instance */
export function virtualClassBlockId(scheduleId: string, date: string): string {
  return `virtual-${scheduleId}-${date}`;
}

export function isVirtualClassBlockId(id: string): boolean {
  return id.startsWith("virtual-") || id.startsWith("fixed-");
}

/** Parse synthetic virtual/fixed block ids (UUID + trailing YYYY-MM-DD) */
export function parseVirtualClassBlockId(
  id: string,
): { scheduleId: string; date: string } | null {
  if (!isVirtualClassBlockId(id)) return null;
  const rest = id.replace(/^(virtual|fixed)-/, "");
  const match = rest.match(/(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  const date = match[1];
  const scheduleId = rest.slice(0, -(date.length + 1));
  if (!scheduleId) return null;
  return { scheduleId, date };
}

function instanceKey(scheduleId: string, date: string): string {
  return `${scheduleId}__${date}`;
}

/** True when the viewed week overlaps the configured semester window */
export function isWeekWithinSemester(
  weekStart: string,
  weekEnd: string,
  semesterStart: string | null | undefined,
  semesterEnd: string | null | undefined,
): boolean {
  if (!semesterStart || !semesterEnd) return true;
  return weekStart <= semesterEnd && weekEnd >= semesterStart;
}

export function isDateWithinSemester(
  date: string,
  semesterStart: string | null | undefined,
  semesterEnd: string | null | undefined,
): boolean {
  if (!semesterStart || !semesterEnd) return true;
  return date >= semesterStart && date <= semesterEnd;
}

function buildSuppressedVirtualKeys(classRows: ClassInstanceRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of classRows) {
    if (row.kind === "class_cancelled" || row.kind === "class_override") {
      keys.add(instanceKey(row.source_schedule_id, row.scheduled_date));
    }
  }
  return keys;
}

function mapClassOverrideToBlock(row: ClassInstanceRow): CalendarBlock {
  return {
    id:                 row.id,
    kind:               "class_override",
    title:              row.title,
    scheduled_date:     row.scheduled_date,
    start_time:         normalizeTimeKey(row.start_time),
    end_time:           normalizeTimeKey(row.end_time),
    is_locked:          true,
    task_id:            null,
    source_schedule_id: row.source_schedule_id,
    is_virtual:         false,
    schedule_type:      "lecture",
  };
}

/**
 * Merge study blocks + virtual recurring classes + physical class overrides.
 * `class_cancelled` rows suppress virtual instances but are not rendered.
 */
export function mergeClassBlocksForWeek(params: {
  weekDays:        string[];
  weekStart:       string;
  weekEnd:         string;
  studyBlocks:     CalendarBlock[];
  schedules:       ScheduleRule[];
  classRows:       ClassInstanceRow[];
  semesterStart:   string | null | undefined;
  semesterEnd:     string | null | undefined;
}): CalendarBlock[] {
  const {
    weekDays,
    weekStart,
    weekEnd,
    studyBlocks,
    schedules,
    classRows,
    semesterStart,
    semesterEnd,
  } = params;

  const suppressed = buildSuppressedVirtualKeys(classRows);
  const overrides  = classRows
    .filter((r) => r.kind === "class_override")
    .map(mapClassOverrideToBlock);

  const showVirtual = isWeekWithinSemester(weekStart, weekEnd, semesterStart, semesterEnd);
  const virtualBlocks: CalendarBlock[] = [];

  if (showVirtual) {
    for (const rule of schedules) {
      const startTime = normalizeTimeKey(rule.start_time);
      const startMin  = timeToMin(startTime);
      const endTime   = minToTime(startMin + (rule.duration ?? 90));
      const title     = rule.course_name ?? rule.type ?? "Class";

      for (const dayStr of weekDays) {
        if (!isDateWithinSemester(dayStr, semesterStart, semesterEnd)) continue;

        const jsDay = new Date(`${dayStr}T12:00:00`).getDay();
        if (rule.day_of_week !== jsDay + 1) continue;

        if (suppressed.has(instanceKey(rule.id, dayStr))) continue;

        virtualBlocks.push({
          id:                 virtualClassBlockId(rule.id, dayStr),
          kind:               "fixed",
          title,
          scheduled_date:     dayStr,
          start_time:         startTime,
          end_time:           endTime,
          is_locked:          true,
          task_id:            null,
          source_schedule_id: rule.id,
          is_virtual:         true,
          schedule_type:      (rule.type as ScheduleType) ?? "lecture",
        });
      }
    }
  }

  const studyOnly = studyBlocks.filter(
    (b) => b.kind !== "class_cancelled" && b.kind !== "class_override",
  );

  return [...studyOnly, ...virtualBlocks, ...overrides];
}

export interface DatedBusyInterval {
  date:  string;
  start: number;
  end:   number;
}

/**
 * Build date-specific busy intervals for AI slot calculation.
 * Includes active virtual instances and class_override rows; excludes cancelled instances.
 */
export function buildClassBusyByDate(params: {
  dates:           string[];
  schedules:       ScheduleRule[];
  classRows:       ClassInstanceRow[];
  semesterStart:   string | null | undefined;
  semesterEnd:     string | null | undefined;
}): Map<string, DatedBusyInterval[]> {
  const { dates, schedules, classRows, semesterStart, semesterEnd } = params;
  const suppressed = buildSuppressedVirtualKeys(classRows);
  const map        = new Map<string, DatedBusyInterval[]>();

  for (const dateStr of dates) {
    const intervals: DatedBusyInterval[] = [];

    if (isDateWithinSemester(dateStr, semesterStart, semesterEnd)) {
      const jsDay = new Date(`${dateStr}T12:00:00`).getDay();

      for (const rule of schedules) {
        if (rule.day_of_week !== jsDay + 1) continue;
        if (suppressed.has(instanceKey(rule.id, dateStr))) continue;

        const start = timeToMin(normalizeTimeKey(rule.start_time));
        const end   = start + (rule.duration ?? 90);
        intervals.push({ date: dateStr, start, end });
      }
    }

    for (const row of classRows) {
      if (row.kind !== "class_override") continue;
      if (row.scheduled_date !== dateStr) continue;
      intervals.push({
        date:  dateStr,
        start: timeToMin(normalizeTimeKey(row.start_time)),
        end:   timeToMin(normalizeTimeKey(row.end_time)),
      });
    }

    if (intervals.length > 0) {
      map.set(dateStr, intervals.sort((a, b) => a.start - b.start));
    }
  }

  return map;
}

function agendaDurationMinutes(startTime: string, endTime: string): number {
  const toMin = (t: string) => {
    const [h, m] = normalizeTimeKey(t).split(":").map(Number);
    return h * 60 + (m || 0);
  };
  return Math.max(0, toMin(endTime) - toMin(startTime));
}

/**
 * Build the dashboard Daily Schedule from merged planner calendar blocks.
 * Includes virtual/fixed classes, class_override (moved makeup), and locked study blocks.
 */
export function buildTodayAgendaFromCalendarBlocks(
  blocks: CalendarBlock[],
  todayStr: string,
): TodaySlot[] {
  const slots: TodaySlot[] = [];

  for (const block of blocks) {
    if (toDateKey(block.scheduled_date) !== todayStr) continue;

    const startTime = normalizeTimeKey(block.start_time);
    const endTime   = normalizeTimeKey(block.end_time);
    const duration  = agendaDurationMinutes(startTime, endTime);

    if (block.kind === "fixed" || block.kind === "class_override") {
      slots.push({
        id:         block.id,
        courseName: block.title,
        type:       (block.schedule_type ?? "lecture") as ScheduleType,
        startTime,
        duration,
        kind:       "course",
      });
      continue;
    }

    if ((block.kind === "ai" || block.kind === "manual") && block.is_locked) {
      slots.push({
        id:         block.id,
        courseName: block.title,
        type:       "study",
        startTime,
        duration,
        kind:       "study",
        title:      block.title,
      });
    }
  }

  return slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
}
