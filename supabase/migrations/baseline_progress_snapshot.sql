-- Snapshot/restore pattern for reversible daily-goal → parent-task progress updates.
-- baseline_progress_snapshot stores exact registry progress (X) before applying target (X+Y).

ALTER TABLE public.daily_goals
  ADD COLUMN IF NOT EXISTS baseline_progress_snapshot INTEGER
    CHECK (baseline_progress_snapshot IS NULL OR (baseline_progress_snapshot >= 0 AND baseline_progress_snapshot <= 100));
