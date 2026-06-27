-- Event-sourced analytics: task control & relational pacing metrics

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS original_eta INTEGER;

UPDATE public.tasks
  SET original_eta = estimated_duration
  WHERE original_eta IS NULL
    AND estimated_duration IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_event_type') THEN
    CREATE TYPE public.task_event_type AS ENUM (
      'PLAN_ADJUSTED',
      'TARGET_REDUCED',
      'DAILY_GOAL_MET',
      'DAILY_GOAL_MISSED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.task_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_type public.task_event_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_created
  ON public.task_events (task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_events_type_created
  ON public.task_events (event_type, created_at DESC);

ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own task events" ON public.task_events;
CREATE POLICY "Users read own task events"
  ON public.task_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert own task events" ON public.task_events;
CREATE POLICY "Users insert own task events"
  ON public.task_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id AND t.user_id = auth.uid()
    )
  );
