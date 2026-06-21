-- ─────────────────────────────────────────────────────────────────────────────
-- Query performance indexes
-- Run in Supabase → SQL Editor
--
-- Targets hot paths in planner.ts and daily-goals.ts.
-- Uses IF NOT EXISTS — safe to re-run.
--
-- Already present (do NOT recreate):
--   scheduled_blocks (user_id, scheduled_date)
--   scheduled_blocks (user_id, kind, scheduled_date)
--   daily_goals      (user_id, goal_date)
--   daily_goals      UNIQUE (user_id, task_id, goal_date)
--   tasks            (user_id), (status), (due_date)
--   schedules        (user_id)
--   approval_snapshots (user_id, created_at DESC)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── scheduled_blocks ─────────────────────────────────────────────────────────
-- Filters: kind + is_locked on nearly every planner write/read path
--   • discardDraftPlan, insertDraftBlocks, approvePlan draft fetch/lock
--   • generateSchedulePlan clean-slate, approvePlan forward AI wipe
--   • clearPlannerRange (kind = ai, date >= …)
CREATE INDEX IF NOT EXISTS idx_scheduled_blocks_user_kind_locked_date
  ON public.scheduled_blocks (user_id, kind, is_locked, scheduled_date);

-- Locked study blocks by date — dashboard + drift detection
--   • getTodayStudyBlocks  (user_id, is_locked, kind, scheduled_date = today)
--   • loadMissedDriftContext (user_id, is_locked, kind, scheduled_date range)
CREATE INDEX IF NOT EXISTS idx_scheduled_blocks_user_locked_study_date
  ON public.scheduled_blocks (user_id, scheduled_date, start_time)
  WHERE is_locked = true AND kind IN ('ai', 'manual');

-- Cumulative progress scan — loadPlannerWeekData progressBlockRows
--   • user_id + kind IN (ai, manual) + task_id IS NOT NULL
--   • ORDER BY scheduled_date, start_time
CREATE INDEX IF NOT EXISTS idx_scheduled_blocks_user_progress_blocks
  ON public.scheduled_blocks (user_id, scheduled_date, start_time)
  WHERE task_id IS NOT NULL AND kind IN ('ai', 'manual');

-- ── daily_goals ──────────────────────────────────────────────────────────────
-- getTodayGoals: user_id + goal_date + ORDER BY created_at
-- approvePlan:   DELETE … goal_date >= rangeFrom  (prefix on user_id, goal_date)
CREATE INDEX IF NOT EXISTS idx_daily_goals_user_date_created
  ON public.daily_goals (user_id, goal_date, created_at);

-- Drift context: user_id + goal_date IN (…)
-- Covered by (user_id, goal_date) prefix on the index above.

-- ── tasks ────────────────────────────────────────────────────────────────────
-- generateSchedulePlan: user_id, status != archived, progress < 100, ORDER BY due_date
-- loadPlannerWeekData:  user_id, status IN (pending, in_progress, completed)
-- getTasks / getAllTasks: user_id + status filter + ORDER BY due_date
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_due_date
  ON public.tasks (user_id, status, due_date);

-- Planner task pick during approvePlan bulk fetch: user_id + id IN (…)
-- Uses PK on id; user_id is a secondary filter — no extra index needed.

-- ── schedules ────────────────────────────────────────────────────────────────
-- loadPlannerWeekData + generateSchedulePlan:
--   user_id + ORDER BY day_of_week
CREATE INDEX IF NOT EXISTS idx_schedules_user_day
  ON public.schedules (user_id, day_of_week);
