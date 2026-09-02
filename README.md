# HelixDriving

Multi-tenant SaaS for driving schools. Each school manages its instructors,
students, vehicles, lesson packages and classroom sessions from a single
dashboard; instructors publish availability and students book lessons against it.

Three portals share one codebase, separated by role:

| Portal | Route | Who |
| --- | --- | --- |
| Admin dashboard | `/dashboard` | School staff — students, instructors, payments, reports |
| Instructor portal | `/instructor` | Schedule, availability templates, earnings, reimbursements |
| Student portal | `/student` | Book lessons, buy packages, track balance and progress |

## Stack

- **Next.js 16** (App Router, Server Components) + **React 19** + **TypeScript**
- **Supabase** — Postgres, Auth, Row Level Security, Storage
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives)
- **Stripe** — students paying their school for lesson packages
- **Lemon Squeezy** — schools paying the platform subscription
- **Resend** — transactional email
- **Vercel** — hosting + daily cron

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Open http://localhost:3000. The root route redirects to `/login`.

### Database

Run the migrations in `supabase/migrations/` in order, via the Supabase
dashboard SQL editor or the Supabase CLI. They are numbered and meant to be
applied sequentially — `001_initial_schema.sql` first.

Optionally load demo data (a school, instructors, students, lessons):

```bash
SEED_PASSWORD='YourPassword123!' npm run seed
```

The script prints the accounts it creates. `SEED_PASSWORD` defaults to
`ChangeMe123!` if unset.

## Environment variables

All keys are documented inline in [`.env.example`](.env.example). The app will
not boot without the three Supabase keys and `NEXT_PUBLIC_APP_URL`; email,
Stripe and Lemon Squeezy features degrade gracefully when their keys are absent.

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and must never reach the browser — it
is only read in server-side code and API routes.

## Project layout

```
app/
  (auth)/          login, register, password reset
  (dashboard)/     admin portal
  (instructor)/    instructor portal
  (student)/       student portal
  api/             route handlers (REST-ish, one folder per resource)
components/
  ui/              shadcn primitives
  <feature>/       feature components, mirroring the dashboard sections
lib/
  supabase/        client / server / admin / middleware clients
  services/        data access + business logic, called from server components
  email/           Resend senders
types/index.ts     database-mirroring TypeScript types
supabase/migrations/
scripts/           seed and maintenance scripts
```

Business logic lives in `lib/services/`, not in components or route handlers —
both call into it. Auth and tenant scoping are enforced twice: in middleware
(`lib/supabase/middleware.ts`) for routing, and in Postgres RLS policies for
data access.

## Scheduled jobs

`/api/cron/regenerate-openings` runs daily at 08:00 UTC (see `vercel.json`) to
roll instructor availability templates forward into bookable openings. It
authenticates with the `CRON_SECRET` bearer token and fails closed without it.

## Testing

Manual QA guides, in Spanish:

- [`TESTING.md`](TESTING.md) — scheduling, templates, openings, cancellations
- [`ACCOUNTING_TESTING.md`](ACCOUNTING_TESTING.md) — payments, credits, reports
