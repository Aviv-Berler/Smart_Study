import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { formatMinutes } from "@/lib/utils";

export interface TimePresetOption {
  percent: 0 | 25 | 50 | 75 | 100;
  minutes: number;
  label:   string;
}

function roundToTen(minutes: number): number {
  return Math.round(minutes / 10) * 10;
}

function formatShortMinutes(minutes: number, locale: Locale): string {
  if (minutes <= 0) return t(locale, "timePresetReset").split(" / ")[0] ?? "0";
  if (minutes < 60) {
    return t(locale, "timeMinShort").replace("{n}", String(minutes));
  }
  const hours = Math.floor(minutes / 60);
  const rem   = minutes % 60;
  return rem > 0
    ? t(locale, "timeHourMinShort").replace("{h}", String(hours)).replace("{m}", String(rem))
    : t(locale, "timeHourShort").replace("{h}", String(hours));
}

/**
 * Five quick-tap presets for today's planned study time:
 * 0% reset, 25/50/75% rounded to nearest 10 min, 100% exact planned total.
 */
export function generateTimePresets(
  plannedMinutesToday: number,
  locale: Locale = "he",
): TimePresetOption[] {
  const planned = Math.max(0, Math.round(plannedMinutesToday));

  const pct25 = roundToTen(planned * 0.25);
  const pct50 = roundToTen(planned * 0.5);
  const pct75 = roundToTen(planned * 0.75);

  return [
    { percent: 0,   minutes: 0,       label: t(locale, "timePresetReset") },
    { percent: 25,  minutes: pct25,     label: formatShortMinutes(pct25, locale) },
    { percent: 50,  minutes: pct50,     label: formatShortMinutes(pct50, locale) },
    { percent: 75,  minutes: pct75,     label: formatShortMinutes(pct75, locale) },
    {
      percent: 100,
      minutes: planned,
      label:   `${formatMinutes(planned)} ${t(locale, "timePresetCompleteSuffix")}`,
    },
  ];
}
