-- ============================================================
-- AI Planner Setup Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── 1. Add `progress` column to tasks ───────────────────────────────────────
--
-- Replaces the binary completed/status model with a 0-100 integer so the AI
-- engine can read partial completion and schedule remaining work accordingly.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0
    CHECK (progress >= 0 AND progress <= 100);

-- Optional: back-fill existing completed tasks to 100
UPDATE public.tasks SET progress = 100 WHERE status = 'completed';

-- ── 2. Create `scheduled_blocks` table ──────────────────────────────────────
--
-- The AI engine writes study blocks here; users can lock/unlock them.

CREATE TABLE IF NOT EXISTS public.scheduled_blocks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id        UUID REFERENCES public.tasks(id) ON DELETE SET NULL,

  title          TEXT NOT NULL,            -- e.g. "Finish 20% of HW 4"
  scheduled_date DATE NOT NULL,
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  is_locked      BOOLEAN NOT NULL DEFAULT FALSE, -- user-approved / pinned block

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-user date range queries
CREATE INDEX IF NOT EXISTS idx_scheduled_blocks_user_date
  ON public.scheduled_blocks (user_id, scheduled_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_scheduled_blocks()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_scheduled_blocks ON public.scheduled_blocks;
CREATE TRIGGER trg_touch_scheduled_blocks
  BEFORE UPDATE ON public.scheduled_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_scheduled_blocks();

-- ── 3. RLS for scheduled_blocks ─────────────────────────────────────────────

ALTER TABLE public.scheduled_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own scheduled blocks" ON public.scheduled_blocks;
CREATE POLICY "Users manage own scheduled blocks"
  ON public.scheduled_blocks
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
