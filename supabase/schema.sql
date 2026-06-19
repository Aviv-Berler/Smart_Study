-- Smart Study Manager — Supabase Schema
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- Profiles (extends Supabase Auth users)
-- ─────────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  email       TEXT,
  university  TEXT NOT NULL DEFAULT 'BGU',
  timezone    TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Tasks (deadlines / assignments scraped from Spark)
-- ─────────────────────────────────────────────
CREATE TABLE public.tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spark_id         TEXT,                          -- external ID for dedup on re-scrape
  title            TEXT NOT NULL,
  course_name      TEXT,
  description      TEXT,
  due_date         TIMESTAMPTZ,
  estimated_hours  NUMERIC(5, 1),
  priority         SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'in_progress', 'completed', 'archived')),
  source           TEXT NOT NULL DEFAULT 'spark',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, spark_id)
);

-- ─────────────────────────────────────────────
-- Study Blocks (generic, flexible time blocks)
-- ─────────────────────────────────────────────
CREATE TABLE public.study_blocks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id           UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  scheduled_date    DATE NOT NULL,
  start_time        TIME,
  end_time          TIME,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
  block_type        TEXT NOT NULL DEFAULT 'focus'
                      CHECK (block_type IN ('focus', 'review', 'break', 'flexible')),
  status            TEXT NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('planned', 'active', 'completed', 'skipped')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Daily Goals (per-day targets + progress feedback loop)
-- ─────────────────────────────────────────────
CREATE TABLE public.daily_goals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id             UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  study_block_id      UUID REFERENCES public.study_blocks(id) ON DELETE SET NULL,
  goal_date           DATE NOT NULL,
  target_minutes      INTEGER NOT NULL CHECK (target_minutes > 0),
  completion_percent  SMALLINT NOT NULL DEFAULT 0
                        CHECK (completion_percent BETWEEN 0 AND 100),
  notes               TEXT,
  logged_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, task_id, goal_date)
);

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
CREATE INDEX idx_tasks_user_id        ON public.tasks (user_id);
CREATE INDEX idx_tasks_due_date       ON public.tasks (due_date);
CREATE INDEX idx_tasks_status         ON public.tasks (status);

CREATE INDEX idx_study_blocks_user_date ON public.study_blocks (user_id, scheduled_date);
CREATE INDEX idx_study_blocks_task      ON public.study_blocks (task_id);

CREATE INDEX idx_daily_goals_user_date  ON public.daily_goals (user_id, goal_date);
CREATE INDEX idx_daily_goals_task       ON public.daily_goals (task_id);

-- ─────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER study_blocks_updated_at
  BEFORE UPDATE ON public.study_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER daily_goals_updated_at
  BEFORE UPDATE ON public.daily_goals
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
-- Row Level Security
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_blocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_goals   ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Tasks
CREATE POLICY "Users can view own tasks"
  ON public.tasks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks"
  ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON public.tasks FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks"
  ON public.tasks FOR DELETE USING (auth.uid() = user_id);

-- Study Blocks
CREATE POLICY "Users can view own study blocks"
  ON public.study_blocks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own study blocks"
  ON public.study_blocks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own study blocks"
  ON public.study_blocks FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own study blocks"
  ON public.study_blocks FOR DELETE USING (auth.uid() = user_id);

-- Daily Goals
CREATE POLICY "Users can view own daily goals"
  ON public.daily_goals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily goals"
  ON public.daily_goals FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily goals"
  ON public.daily_goals FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own daily goals"
  ON public.daily_goals FOR DELETE USING (auth.uid() = user_id);
