/** Left-to-right mark — isolates embedded numbers/times in RTL paragraphs */
export const LRM = "\u200E";

/** Right-to-left mark */
export const RLM = "\u200F";

/** Wrap dynamic LTR content (times, counts, %) for plain-text / toast strings */
export function isolateLtr(value: string | number): string {
  const s = String(value);
  return `${LRM}${s}${LRM}`;
}

/** Parse planner daily goal titles like "Task — 50%" into label + optional percent */
export function parseGoalTitleWithPct(goalTitle: string): {
  label: string;
  pct?: number;
} {
  const m = goalTitle.match(/^(.+?)\s*[—–-]\s*(\d+)\s*%$/u);
  if (m) return { label: m[1].trim(), pct: Number(m[2]) };
  return { label: goalTitle };
}
