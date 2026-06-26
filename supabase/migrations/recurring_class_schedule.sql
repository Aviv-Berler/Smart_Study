-- Semester bounds for recurring class virtual blocks
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS semester_start_date DATE,
  ADD COLUMN IF NOT EXISTS semester_end_date   DATE;

-- Link class overrides/cancellations to the recurring schedule rule
ALTER TABLE public.scheduled_blocks
  ADD COLUMN IF NOT EXISTS source_schedule_id UUID REFERENCES public.schedules(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_scheduled_blocks_source_schedule
  ON public.scheduled_blocks (user_id, source_schedule_id, scheduled_date)
  WHERE source_schedule_id IS NOT NULL;

-- Extend block kinds: class_override (moved instance), class_cancelled (hidden instance)
ALTER TABLE public.scheduled_blocks
  DROP CONSTRAINT IF EXISTS scheduled_blocks_kind_check;

ALTER TABLE public.scheduled_blocks
  ADD CONSTRAINT scheduled_blocks_kind_check
  CHECK (kind IN ('ai', 'manual', 'one_off', 'class_override', 'class_cancelled'));
