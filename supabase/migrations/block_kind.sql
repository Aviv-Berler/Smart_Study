-- Add `kind` to scheduled_blocks so manual user blocks are immune to AI wipe/approve.
-- Values: 'ai' (default) | 'manual' (user-created via BlockFormModal)

ALTER TABLE public.scheduled_blocks
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'ai'
    CHECK (kind IN ('ai', 'manual'));

-- Back-fill: existing locked rows created before this migration stay 'ai'.
-- Manual blocks will be inserted with kind = 'manual' going forward.

CREATE INDEX IF NOT EXISTS idx_scheduled_blocks_user_kind_date
  ON public.scheduled_blocks (user_id, kind, scheduled_date);
