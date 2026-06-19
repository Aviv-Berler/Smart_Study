-- ============================================================
-- User Planning Preferences Migration
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

ALTER TABLE public.profiles
  -- e.g. "B.Sc Computer Science, Year 1"
  ADD COLUMN IF NOT EXISTS academic_background TEXT,

  -- JSON map of day → {start, end} or null for a rest day.
  -- Default gives Mon–Thu full day, Fri morning, Sat–Sun off.
  ADD COLUMN IF NOT EXISTS weekly_hours JSONB NOT NULL DEFAULT '{
    "sunday":    null,
    "monday":    {"start": "09:00", "end": "21:00"},
    "tuesday":   {"start": "09:00", "end": "21:00"},
    "wednesday": {"start": "09:00", "end": "21:00"},
    "thursday":  {"start": "09:00", "end": "21:00"},
    "friday":    {"start": "09:00", "end": "14:00"},
    "saturday":  null
  }'::jsonb,

  -- Pomodoro-style work/break ratio string, e.g. "50/10", "90/20"
  ADD COLUMN IF NOT EXISTS work_rest_interval TEXT NOT NULL DEFAULT '50/10',

  -- Minutes of padding the AI adds between consecutive blocks
  ADD COLUMN IF NOT EXISTS buffer_time_minutes INTEGER NOT NULL DEFAULT 15,

  -- "visual" | "reading" | "practice" | "mixed"
  ADD COLUMN IF NOT EXISTS learning_style TEXT NOT NULL DEFAULT 'mixed',

  -- Free-text about hobbies, sport, regular breaks, etc.
  ADD COLUMN IF NOT EXISTS hobbies_and_breaks TEXT;
