-- User-defined drag order for tasks (Manage → Edit Priority)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS user_priority_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_tasks_user_priority
  ON public.tasks (user_id, user_priority_index)
  WHERE user_priority_index IS NOT NULL;
