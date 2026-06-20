# Smart Study

**A fully functional study optimizer for Ben-Gurion University students** — live on production, backed by a real database, powered by AI, and ready to use from day one.

## 🚀 Live Demo

### **[https://hub02-hackathon.vercel.app](https://hub02-hackathon.vercel.app)**

Deployed on **Vercel**. Sign in, complete the guided onboarding tour, add your courses and tasks, and let the AI build your weekly study plan.

---

## ✨ Key Features

- **Today's Dashboard** — Daily goals, progress tracking, and a unified schedule that blends fixed class slots with AI-generated study blocks.
- **AI Future Planner** — Describe your constraints in natural language; **Groq** generates a personalized weekly schedule you can drag, resize, edit, and approve.
- **Course & Task Registry** — Manage lectures, tutorials, deadlines, and estimated workload with instant UI updates on save.
- **Learning Preferences** — Weekly availability, work/rest intervals, learning style, and scheduling strategy feed directly into the AI planner.
- **Interactive Onboarding Tour** — A 12-step guided walkthrough (Settings → Courses → Tasks → Planner → Dashboard) so new users never get lost.
- **Bilingual UX** — Full English and Hebrew support, including RTL layout for Hebrew.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS, shadcn/ui-style components |
| **Database & Auth** | Supabase (PostgreSQL + Row Level Security) |
| **AI** | Groq SDK — schedule generation & conflict resolution |
| **Deployment** | Vercel |
| **Onboarding** | react-joyride |

**Integrations:** BGU Spark ecosystem · Live Supabase persistence · Server Actions with `revalidatePath`

---

## 💻 Local Development

Want to run the project on your machine?

### Prerequisites

- Node.js 18+
- A Supabase project with the schema applied (`supabase/schema-v2.sql` and migrations in `supabase/migrations/`)

### Setup

```bash
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GROQ_API_KEY=your_groq_api_key
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Run production build locally |
| `npm run lint` | ESLint |

---

Built for **HUB02 Hackathon** · Ben-Gurion University · 2026
