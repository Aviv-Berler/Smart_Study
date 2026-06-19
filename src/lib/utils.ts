import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

/** Format a "HH:MM:SS" or "HH:MM" time string as 24-hour "HH:MM" */
export function formatTime(time: string): string {
  const parts = time.split(":");
  const h = parts[0].padStart(2, "0");
  const m = parts[1] ?? "00";
  return `${h}:${m}`;
}

export function formatHoursQuantized(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours.toFixed(1)}h` : `${hours}h`;
}
