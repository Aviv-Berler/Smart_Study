-- Scheduling style preference: marathon (finish one task at a time) vs interleaved (variety)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS scheduling_style TEXT NOT NULL DEFAULT 'interleaved'
    CHECK (scheduling_style IN ('marathon', 'interleaved'));
