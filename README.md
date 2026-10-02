# Finance Tracker

A personal finance dashboard for recording income and spending, tracking budgets, and importing bank statements. Built with React, TypeScript, Tailwind CSS, and Supabase, and deployed on Vercel.

## Features

- **Accounts and sign-in.** Register, log in, and reset your password with Supabase Auth. Recovery emails link back to `/update-password`.
- **Overview.** Income, spending, and balance summaries for today, this week, month, or year, or a custom date range, with budget highlights. Amounts can be hidden with one click.
- **Transactions.** Add, edit, and delete transactions, then search, sort, and filter them. Export the selected period's transactions to CSV.
- **Analytics.** Charts of spending over time and by category, plus generated insights.
- **Budgets.** Set daily, weekly, monthly, or yearly budgets per category and track progress against each.
- **Settings.** Manage accounts and categories. Accounts and the default categories are shared. Custom categories are private to whoever created them.
- **Bank statement import.** Upload a PDF e-statement, including password-protected ones. The text is extracted in the browser. Bank Mandiri and Jenius statements are parsed locally. Other formats are sent as text (never the PDF) to a server-side Gemini function. You review, recategorize, and deduplicate rows before anything is saved.
- **Public demo.** `/demo` runs the full dashboard on local sample data, with no sign-in.
- **Light and dark themes**, a responsive layout with a mobile navigation drawer, and optional Sentry error monitoring.

Row-level security in Supabase limits each user's transactions and budgets to that user. See [database/README.md](database/README.md) for the access model.

## Tech stack

| Area | Tools |
| --- | --- |
| Frontend | React 18, TypeScript, React Router 7, Tailwind CSS 3, Recharts, lucide-react |
| Build | Vite 5 |
| Backend | Supabase (Postgres, Auth, RLS) and one Vercel function at `api/parse-statement.ts` |
| PDF and AI | `pdfjs-dist` in the browser; Gemini via the Vercel function |
| Quality | ESLint, Node's built-in test runner, Playwright, Storybook 7, GitHub Actions |

## Project layout

```
api/                     Vercel function: parse-statement.ts (+ _lib/ helpers)
src/
  components/            Feature components (Dashboard, BankStatementImporter, ...) and their stories
  contexts/              Auth and theme providers
  hooks/                 Data hooks for the live dashboard and the demo
  lib/                   Supabase client, REST client, monitoring
  utils/                 CSV export, duplicate detection, PDF extraction, bank parsers
supabase/                Supabase CLI config and migrations (schema source of truth)
database/                RLS migration, access tests, and security/rollout notes
tests/                   Unit tests (*.test.mjs) and Playwright tests (e2e/)
docs/                    Design specs and implementation plans
```

## Running locally

### Prerequisites

- Node.js 22. CI uses 22.13.0.
- A Supabase project to develop against. This can be a non-production hosted project or the local stack started with the [Supabase CLI](https://supabase.com/docs/guides/local-development).
- Optional: a [Gemini API key](https://aistudio.google.com/apikey) and the [Vercel CLI](https://vercel.com/docs/cli). You need both only to use AI parsing for unrecognized bank statements.

### 1. Install dependencies

```bash
cd supabase-registration
npm install
```

`.npmrc` sets `legacy-peer-deps=true`, which Storybook 7's peer ranges need.

### 2. Configure environment variables

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase **publishable** (or legacy anon) key. Never use a service-role or secret key here. |
| `VITE_SENTRY_DSN` | No | Turns on Sentry monitoring. Leave it blank to keep monitoring off. |
| `GEMINI_API_KEY` | No | Server-only key read by `api/parse-statement.ts`. Never give it a `VITE_` prefix, or Vite will embed it in the public bundle. |

The app refuses to start if either Supabase variable is missing. That includes `/demo`.

### 3. Prepare the database

**Hosted project:** the schema is already in place, so there is nothing to run. Do not replay any migration against production; see [supabase/README.md](supabase/README.md).

**Local Supabase stack:**

```bash
supabase start      # starts Postgres, Auth, and the API on 127.0.0.1:54321
supabase db reset   # applies supabase/migrations/
supabase status     # prints the API URL and the publishable key for .env
```

The local stack has email confirmations turned off. Its test inbox is at http://127.0.0.1:54324. No seed data is loaded, so after signing up, create an account and some categories under **Settings** before adding transactions.

### 4. Start the app

```bash
npm run dev
```

The app opens at http://localhost:3000. Register a user, or go to http://localhost:3000/demo to explore without signing in.

`npm run dev` serves only the frontend. Bank statement import works for Mandiri and Jenius statements, but AI parsing of other formats calls `/api/parse-statement`, which Vite does not serve. To run the frontend and the function together, use the Vercel CLI:

```bash
vercel dev
```

### Supabase Auth settings

For password-reset links to work, add your local and deployed origins under **Authentication → URL Configuration** in the Supabase dashboard. Set the site URL and add `/update-password` as a redirect URL, for example `http://localhost:3000/update-password`. The local stack takes these from `supabase/config.toml`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Type-checks the app and the `api/` function, then builds to `dist/` |
| `npm run preview` | Serves the built `dist/` (port 4173) |
| `npm run lint` | ESLint across the project |
| `npm run typecheck` | Type-check only |
| `npm run test:security` | Unit tests in `tests/*.test.mjs`: parsers, duplicate detection, REST client, API handler, rate limiter |
| `npm run test:database` | RLS access tests against a throwaway local PostgreSQL cluster. Needs the PostgreSQL CLI tools (`pg_ctl`, `psql`), not Supabase. |
| `npm run test:e2e` | Playwright tests against `npm run preview`. Run `npm run build` first. |
| `npm run storybook` | Storybook on http://localhost:6006 |
| `npm run build-storybook` | Static Storybook build |

### End-to-end tests

```bash
npx playwright install chromium   # first time only
npm run build && npm run test:e2e
```

The demo and dashboard-usability tests need only the Supabase variables. The signed-in flow test also needs `E2E_EMAIL` and `E2E_PASSWORD` for an existing test user, and is skipped without them.

## Deployment

Vercel builds the project with `npm ci --legacy-peer-deps` and `npm run build` (see [vercel.json](vercel.json)), and deploys `api/parse-statement.ts` as a function with a 150-second limit. Set the same environment variables in the Vercel project settings.

On every push to `main` and on every pull request, CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, the unit tests, the database access tests, and the build. Playwright runs as well when the E2E secrets are configured.

## Further reading

- [supabase/README.md](supabase/README.md): how to make schema changes safely
- [database/README.md](database/README.md): the RLS access model and its tests
- [BACKLOG.md](BACKLOG.md): planned features
- [docs/superpowers/](docs/superpowers/): the bank statement importer design and plan
- [.storybook/README.md](.storybook/README.md): Storybook setup

## License

This project is open source and available under the MIT License.
