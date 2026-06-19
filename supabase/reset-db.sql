-- ══════════════════════════════════════════════════════════════════
-- Smart Study Manager — FULL RESET  (schema v3, "nuke and pave")
-- Run this in Supabase → SQL Editor → New query
-- WARNING: drops ALL existing project tables and recreates them.
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 0. Tear down old tables (dependency order)
-- ─────────────────────────────────────────────
DROP TABLE IF EXISTS public.daily_goal_entries CASCADE;
DROP TABLE IF EXISTS public.daily_goals        CASCADE;
DROP TABLE IF EXISTS public.study_blocks       CASCADE;   -- legacy v1
DROP TABLE IF EXISTS public.schedules          CASCADE;
DROP TABLE IF EXISTS public.courses            CASCADE;
DROP TABLE IF EXISTS public.tasks              CASCADE;
DROP TABLE IF EXISTS public.profiles           CASCADE;

-- Drop functions (recreate below)
DROP FUNCTION IF EXISTS public.set_updated_at()    CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user()   CASCADE;

-- ─────────────────────────────────────────────
-- 1. Extensions
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- 2. Helper function: updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- 3. PROFILES  (extends Supabase Auth users)
-- ─────────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  email       TEXT,
  university  TEXT NOT NULL DEFAULT 'BGU',
  timezone    TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  theme_mode  TEXT NOT NULL DEFAULT 'system'
                CHECK (theme_mode IN ('light', 'dark', 'system')),
  language    TEXT NOT NULL DEFAULT 'he'
                CHECK (language IN ('en', 'he')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────
-- 4. TASKS
-- ─────────────────────────────────────────────
CREATE TABLE public.tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  course_name         TEXT,
  description         TEXT,
  due_date            DATE,
  estimated_duration  INTEGER CHECK (estimated_duration > 0),  -- minutes
  priority            SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'completed', 'archived')),
  source              TEXT NOT NULL DEFAULT 'manual',
  spark_id            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, spark_id)   -- kept for future spark dedup; manual tasks leave spark_id NULL
);

-- Partial unique index: enforce spark_id uniqueness only for non-NULL values
-- This allows unlimited manual tasks (spark_id = NULL) without constraint violations
CREATE UNIQUE INDEX idx_tasks_spark_unique
  ON public.tasks (user_id, spark_id)
  WHERE spark_id IS NOT NULL;

CREATE INDEX idx_tasks_user_id    ON public.tasks (user_id);
CREATE INDEX idx_tasks_due_date   ON public.tasks (due_date);
CREATE INDEX idx_tasks_status     ON public.tasks (status);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 5. COURSES
-- ─────────────────────────────────────────────
CREATE TABLE public.courses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_name  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courses_user_id ON public.courses (user_id);

CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 6. SCHEDULES  (recurring weekly class slots)
-- ─────────────────────────────────────────────
CREATE TABLE public.schedules (
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

CREATE INDEX idx_schedules_course_id  ON public.schedules (course_id);
CREATE INDEX idx_schedules_user_day   ON public.schedules (user_id, day_of_week);

-- ─────────────────────────────────────────────
-- 7. DAILY_GOALS  (per-day task targets)
-- ─────────────────────────────────────────────
CREATE TABLE public.daily_goals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id              UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  goal_date            DATE NOT NULL,
  target_minutes       INTEGER NOT NULL DEFAULT 60 CHECK (target_minutes > 0),
  time_logged          BOOLEAN NOT NULL DEFAULT false,
  is_fully_completed   BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, task_id, goal_date)
);

CREATE INDEX idx_daily_goals_user_date ON public.daily_goals (user_id, goal_date);
CREATE INDEX idx_daily_goals_task      ON public.daily_goals (task_id);

CREATE TRIGGER daily_goals_updated_at
  BEFORE UPDATE ON public.daily_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────
-- 8. DAILY_GOAL_ENTRIES  (individual work sessions, ML data)
-- ─────────────────────────────────────────────
CREATE TABLE public.daily_goal_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_goal_id  UUID NOT NULL REFERENCES public.daily_goals(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_minutes INTEGER NOT NULL CHECK (logged_minutes > 0),
  logged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dge_daily_goal ON public.daily_goal_entries (daily_goal_id);
CREATE INDEX idx_dge_user       ON public.daily_goal_entries (user_id);

-- ─────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_goal_entries ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- tasks
CREATE POLICY "own tasks select" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own tasks insert" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own tasks update" ON public.tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own tasks delete" ON public.tasks FOR DELETE USING (auth.uid() = user_id);

-- courses
CREATE POLICY "own courses select" ON public.courses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own courses insert" ON public.courses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own courses update" ON public.courses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own courses delete" ON public.courses FOR DELETE USING (auth.uid() = user_id);

-- schedules
CREATE POLICY "own schedules select" ON public.schedules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own schedules insert" ON public.schedules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own schedules update" ON public.schedules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own schedules delete" ON public.schedules FOR DELETE USING (auth.uid() = user_id);

-- daily_goals
CREATE POLICY "own daily_goals select" ON public.daily_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own daily_goals insert" ON public.daily_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own daily_goals update" ON public.daily_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own daily_goals delete" ON public.daily_goals FOR DELETE USING (auth.uid() = user_id);

-- daily_goal_entries
CREATE POLICY "own dge select" ON public.daily_goal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own dge insert" ON public.daily_goal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own dge delete" ON public.daily_goal_entries FOR DELETE USING (auth.uid() = user_id);
