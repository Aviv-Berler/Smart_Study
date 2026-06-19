# Smart Study Manager

Production-ready study schedule optimizer for BGU students, integrated with BGU Spark.

## Stack

- **Next.js 15** (App Router) + React + TypeScript
- **Tailwind CSS 4** + shadcn/ui-style components
- **Supabase** (PostgreSQL + Auth) — schema in `supabase/schema.sql`

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the mock dashboard.

## Supabase Setup

1. Create a new Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. (Later) Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`.

## First Step Deliverables

- **Schema**: `profiles`, `tasks`, `study_blocks`, `daily_goals` with RLS
- **Dashboard**: Mock Daily Task Board with 0–100% sliders + generic Study Blocks
