import type { Task } from "@/types/database";

/** Default: due date ascending. With custom priority: user_priority_index asc, then due date. */
export function sortTasksByDisplayOrder<T extends Pick<Task, "due_date" | "user_priority_index">>(
  tasks: T[],
): T[] {
  const hasCustom = tasks.some((t) => t.user_priority_index != null);
  return [...tasks].sort((a, b) => {
    if (hasCustom) {
      const ai = a.user_priority_index ?? Number.MAX_SAFE_INTEGER;
      const bi = b.user_priority_index ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
    }
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}
