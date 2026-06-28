-- Soft-delete columns + FK hardening for analytics retention

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS backlog_hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_backlog_hidden
  ON public.tasks (user_id, backlog_hidden_at)
  WHERE backlog_hidden_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_deleted
  ON public.tasks (user_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_auto_archive
  ON public.tasks (user_id, due_date, progress)
  WHERE backlog_hidden_at IS NULL AND progress >= 100;

-- Replace CASCADE with RESTRICT so hard deletes fail loudly when history exists
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS child_table
    FROM pg_constraint c
    WHERE c.confrelid = 'public.tasks'::regclass
      AND c.contype = 'f'
      AND c.conrelid IN (
        'public.task_events'::regclass,
        'public.daily_goals'::regclass
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.child_table, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.task_events
  ADD CONSTRAINT task_events_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE RESTRICT;

ALTER TABLE public.daily_goals
  ADD CONSTRAINT daily_goals_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE RESTRICT;
