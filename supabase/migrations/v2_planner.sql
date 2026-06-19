-- ─────────────────────────────────────────────────────────────────
-- Smart Planner V2 migrations
-- Run this in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────

-- 1. Add optional title column to daily_goals
--    Used by the approval aggregation to store "{Task} — XX%" labels.
ALTER TABLE public.daily_goals
  ADD COLUMN IF NOT EXISTS title TEXT;

-- 2. Approval snapshots — stores a JSON snapshot of blocks + task
--    progress just before each approval so the user can undo once.
CREATE TABLE IF NOT EXISTS public.approval_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_data JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_user ON public.approval_snapshots (user_id, created_at DESC);

ALTER TABLE public.approval_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own snapshots" ON public.approval_snapshots;
CREATE POLICY "own snapshots" ON public.approval_snapshots
  FOR ALL USING (auth.uid() = user_id);

-- 3. Trigger: keep only the latest 3 snapshots per user
CREATE OR REPLACE FUNCTION public.prune_approval_snapshots()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.approval_snapshots
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM public.approval_snapshots
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 3
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_latest_snapshots ON public.approval_snapshots;
CREATE TRIGGER keep_latest_snapshots
  AFTER INSERT ON public.approval_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prune_approval_snapshots();
