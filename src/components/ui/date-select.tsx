"use client";

/**
 * Inline date picker built from three <select> elements.
 * Renders as DD / MM / YYYY and outputs "YYYY-MM-DD".
 * Avoids native date popover viewport collisions on mobile and RTL layouts.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface DateSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
}

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 py-1 text-sm font-mono " +
  "shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 " +
  "appearance-none text-center min-w-0";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseDate(value: string): { year: number; month: number; day: number } {
  const [y, m, d] = value.split("-").map((part) => parseInt(part, 10));
  const today = new Date();
  return {
    year:  Number.isFinite(y) ? y : today.getFullYear(),
    month: Number.isFinite(m) ? m : today.getMonth() + 1,
    day:   Number.isFinite(d) ? d : today.getDate(),
  };
}

function clampToBounds(
  year: number,
  month: number,
  day: number,
  min?: string,
  max?: string,
): { year: number; month: number; day: number } {
  let next = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (min && next < min) next = min;
  if (max && next > max) next = max;
  return parseDate(next);
}

function emitDate(
  year: number,
  month: number,
  day: number,
  min?: string,
  max?: string,
): string {
  const maxDay = daysInMonth(year, month);
  const clamped = clampToBounds(year, month, Math.min(day, maxDay), min, max);
  return (
    `${clamped.year}-` +
    `${String(clamped.month).padStart(2, "0")}-` +
    `${String(clamped.day).padStart(2, "0")}`
  );
}

export function DateSelect({
  value,
  onChange,
  disabled,
  min,
  max,
  className,
}: DateSelectProps) {
  const { year, month, day } = parseDate(value);

  const years = useMemo(() => {
    const minYear = min ? parseDate(min).year : year - 1;
    const maxYear = max ? parseDate(max).year : year + 2;
    const start = Math.min(minYear, year);
    const end = Math.max(maxYear, year);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [min, max, year]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1),
    [year, month],
  );

  const setYear = (nextYear: number) => onChange(emitDate(nextYear, month, day, min, max));
  const setMonth = (nextMonth: number) => onChange(emitDate(year, nextMonth, day, min, max));
  const setDay = (nextDay: number) => onChange(emitDate(year, month, nextDay, min, max));

  return (
    <div dir="ltr" className={cn("grid w-full grid-cols-[1fr_1fr_1.4fr] gap-1", className)}>
      <select
        value={day}
        onChange={(e) => setDay(Number(e.target.value))}
        disabled={disabled}
        aria-label="Day"
        className={selectCls}
      >
        {days.map((d) => (
          <option key={d} value={d}>
            {String(d).padStart(2, "0")}
          </option>
        ))}
      </select>

      <select
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        disabled={disabled}
        aria-label="Month"
        className={selectCls}
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>

      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        disabled={disabled}
        aria-label="Year"
        className={selectCls}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
