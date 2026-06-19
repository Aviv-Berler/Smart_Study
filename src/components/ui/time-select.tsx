"use client";

/**
 * Custom 24-hour time picker built from two <select> elements.
 * Renders as "HH : MM" and always outputs a "HH:MM" string.
 * Immune to OS locale / browser AM-PM settings.
 */

import { cn } from "@/lib/utils";

interface TimeSelectProps {
  value: string;              // "HH:MM"
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Minute increment. Default: 15 */
  minuteStep?: number;
  className?: string;
}

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 py-1 text-sm font-mono " +
  "shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 " +
  "appearance-none text-center";

export function TimeSelect({
  value,
  onChange,
  disabled,
  minuteStep = 15,
  className,
}: TimeSelectProps) {
  const [rawH, rawM] = value.split(":");
  const currentH = parseInt(rawH ?? "0", 10);
  const currentM = parseInt(rawM ?? "0", 10);

  const setH = (h: number) =>
    onChange(`${String(h).padStart(2, "0")}:${String(currentM).padStart(2, "0")}`);

  const setM = (m: number) =>
    onChange(`${String(currentH).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes: number[] = [];
  for (let m = 0; m < 60; m += minuteStep) minutes.push(m);

  return (
    // dir="ltr" pins HH on the left and MM on the right regardless of the page's RTL direction
    <div dir="ltr" className={cn("flex items-center gap-1", className)}>
      {/* Hours */}
      <select
        value={currentH}
        onChange={(e) => setH(Number(e.target.value))}
        disabled={disabled}
        aria-label="Hours"
        className={cn(selectCls, "w-[3.2rem]")}
      >
        {hours.map((h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, "0")}
          </option>
        ))}
      </select>

      <span className="select-none text-sm font-bold text-muted-foreground">:</span>

      {/* Minutes */}
      <select
        value={currentM}
        onChange={(e) => setM(Number(e.target.value))}
        disabled={disabled}
        aria-label="Minutes"
        className={cn(selectCls, "w-[3.2rem]")}
      >
        {minutes.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
    </div>
  );
}
