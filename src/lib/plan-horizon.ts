import { addWeeks, differenceInCalendarDays, endOfWeek, format, startOfWeek, subDays, addDays } from "date-fns";
import { MISSED_HORIZON_DAYS } from "@/lib/drift-detection";

export interface PlanHorizon {
  startDate:    string;
  endDate:      string;
  planDuration: number;
}

/** Default plan window: today through Saturday of next week (inclusive). */
export function getPlanHorizon(referenceDate = new Date()): PlanHorizon {
  const endSaturday = endOfWeek(addWeeks(referenceDate, 1), { weekStartsOn: 0 });
  const startDate   = format(referenceDate, "yyyy-MM-dd");
  const endDate     = format(endSaturday, "yyyy-MM-dd");
  const planDuration = differenceInCalendarDays(endSaturday, referenceDate) + 1;
  return { startDate, endDate, planDuration };
}

/** Parse YYYY-MM-DD as local noon (avoids UTC day-shift). */
export function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

/** Normalize any date-like value to YYYY-MM-DD for column matching. */
export function toDateKey(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return format(value, "yyyy-MM-dd");
  return String(value).slice(0, 10);
}

/** Normalize Postgres TIME / ISO time to HH:MM. */
export function normalizeTimeKey(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().slice(0, 5);
}

/** Normalize a date anchor to local noon of its calendar day. */
function toLocalNoon(anchor: Date): Date {
  return parseLocalDate(format(anchor, "yyyy-MM-dd"));
}

/** Sunday–Saturday bounds for the week containing `anchor`. */
export function getWeekBounds(anchor: Date | string = new Date()): {
  weekStart: string;
  weekEnd:   string;
  days:      Date[];
  dayKeys:   string[];
} {
  const ref = typeof anchor === "string" ? parseLocalDate(anchor) : toLocalNoon(anchor);
  const sun = startOfWeek(ref, { weekStartsOn: 0 });
  const sat = endOfWeek(ref, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(sun, i));
  const dayKeys = days.map((d) => format(d, "yyyy-MM-dd"));
  return {
    weekStart: format(sun, "yyyy-MM-dd"),
    weekEnd:   format(sat, "yyyy-MM-dd"),
    days,
    dayKeys,
  };
}

/** History look-back start (today − 7) for cumulative goals / missed detection. */
export function getHistoryStart(referenceDate = new Date()): string {
  return format(subDays(referenceDate, MISSED_HORIZON_DAYS), "yyyy-MM-dd");
}

/** Every calendar date in [startDate, endDate] inclusive (YYYY-MM-DD). */
export function getHorizonDateStrings(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end   = new Date(`${endDate}T00:00:00`);
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(format(cursor, "yyyy-MM-dd"));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
