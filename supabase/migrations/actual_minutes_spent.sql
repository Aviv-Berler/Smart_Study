-- Absolute logged work time per daily goal (separate from task completion %)
ALTER TABLE public.daily_goals
  ADD COLUMN IF NOT EXISTS actual_minutes_spent INTEGER NOT NULL DEFAULT 0;
