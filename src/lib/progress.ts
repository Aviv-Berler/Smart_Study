import type { MockDailyGoal } from "@/types/study";

/** Progress bar: fully-finished tasks only */
export function calculateTaskCompletion(goals: MockDailyGoal[]): number {
  if (goals.length === 0) return 0;
  const finished = goals.filter((g) => g.isFullyCompleted).length;
  return Math.round((finished / goals.length) * 100);
}

export function getCompletionLabel(
  percent: number,
  locale: "en" | "he" = "en"
): string {
  if (locale === "he") {
    if (percent === 0) return "טרם הושלמה משימה";
    if (percent < 34) return "בהתחלה";
    if (percent < 67) return "באמצע הדרך";
    if (percent < 100) return "כמעט שם";
    return "כל המשימות הושלמו! 🎉";
  }
  if (percent === 0) return "No tasks finished yet";
  if (percent < 34) return "Getting started";
  if (percent < 67) return "Making good progress";
  if (percent < 100) return "Almost there";
  return "All tasks done for today! 🎉";
}
