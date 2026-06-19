-- Smart Study Manager — Schema v2 Migration
-- Run AFTER schema.sql (or in a fresh project, run schema-full.sql instead)
-- Execute in: Supabase → SQL Editor → New query

-- ─────────────────────────────────────────────
-- 1. Extend profiles
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_mode TEXT NOT NULL DEFAULT 'system'
    CHECK (theme_mode IN ('light', 'dark', 'system')),
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'he'
    CHECK (language IN ('en', 'he'));

-- ─────────────────────────────────────────────
-- 2. Extend tasks (add estimated_duration in minutes,
--    keep estimated_hours for backward compat)
-- ─────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_duration INTEGER CHECK (estimated_duration > 0);

-- Allow manual tasks (no spark_id required)
ALTER TABLE public.tasks
  ALTER COLUMN source SET DEFAULT 'manual';

-- ─────────────────────────────────────────────
-- 3. Courses
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.courses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_name  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_user_id ON public.courses (user_id);

-- ─────────────────────────────────────────────
-- 4. Schedules (recurring weekly slots per course)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'lecture'
                 CHECK (type IN ('lecture', 'tutorial', 'other')),
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time   TIME NOT NULL,
  duration     INTEGER NOT NULL CHECK (duration > 0),  -- minutes
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedules_course_id ON public.schedules (course_id);
CREATE INDEX IF NOT EXISTS idx_schedules_user_id   ON public.schedules (user_id);

-- ─────────────────────────────────────────────
-- 5. Extend daily_goals with two boolean states
--    (decoupled from completion_percent for ML)
-- ─────────────────────────────────────────────
ALTER TABLE public.daily_goals
  ADD COLUMN IF NOT EXISTS time_logged        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fully_completed BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────
-- 6. updated_at triggers for new tables
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS courses_updated_at ON public.courses;
CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 7. RLS for new tables
-- ─────────────────────────────────────────────
ALTER TABLE public.courses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- Courses
DROP POLICY IF EXISTS "Users can view own courses"   ON public.courses;
DROP POLICY IF EXISTS "Users can insert own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update own courses" ON public.courses;
DROP POLICY IF EXISTS "Users can delete own courses" ON public.courses;

CREATE POLICY "Users can view own courses"
  ON public.courses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own courses"
  ON public.courses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own courses"
  ON public.courses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own courses"
  ON public.courses FOR DELETE USING (auth.uid() = user_id);

-- Schedules
DROP POLICY IF EXISTS "Users can view own schedules"   ON public.schedules;
DROP POLICY IF EXISTS "Users can insert own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can update own schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can delete own schedules" ON public.schedules;

CREATE POLICY "Users can view own schedules"
  ON public.schedules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own schedules"
  ON public.schedules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own schedules"
  ON public.schedules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own schedules"
  ON public.schedules FOR DELETE USING (auth.uid() = user_id);
