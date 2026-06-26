-- One-off completion/class blocks — locked, never touched by AI wipe/approve
ALTER TABLE public.scheduled_blocks
  DROP CONSTRAINT IF EXISTS scheduled_blocks_kind_check;

ALTER TABLE public.scheduled_blocks
  ADD CONSTRAINT scheduled_blocks_kind_check
  CHECK (kind IN ('ai', 'manual', 'one_off'));
