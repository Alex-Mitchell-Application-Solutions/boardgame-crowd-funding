# Boardgame Crowdfunding

A focused crowdfunding platform for tabletop / boardgame creators. **3% platform fee + Stripe pass-through** — undercutting Kickstarter / GameFound / BackerKit's 5% so indie creators keep more of every pledge.

> See [`docs/PLAN.md`](./docs/PLAN.md) for the canonical project plan, [`docs/SETUP.md`](./docs/SETUP.md) for cloud-services setup, and [`docs/TESTING.md`](./docs/TESTING.md) for the testing guide.

## Stack

Next.js 15 (App Router) + Supabase (Postgres + Auth) + Drizzle + Cloudflare R2 + Stripe Connect Express + pg-boss + Resend, all on Railway. pnpm + Turborepo, GitHub Actions running `ci:quality` (build + test + lint + typecheck + format:check).

## Prerequisites

- **Node.js 22+** (`.nvmrc` pins this — `nvm use` if you have nvm)
- **pnpm 10+** (`corepack enable` then `corepack prepare pnpm@latest --activate`)
- **Docker** (for local Supabase or local Postgres)
- **Stripe CLI** (`brew install stripe/stripe-cli/stripe`)
- **Supabase CLI** (`brew install supabase/tap/supabase`) — only if using Option A below

## Quick start

```bash
pnpm install
cp env.example .env.local
# Fill in .env.local — see Local development paths below for which values you need
pnpm dev
```

> **Note**: the example env file is committed as `env.example` (no leading dot) so it's not caught by the workspace's `.env*` write guard. You can `mv env.example .env.example` if you prefer the conventional name — `.env.example` is in `.gitignore`'s allowlist so it'll still be tracked.

Visit http://localhost:3000.

## Local development paths

You can run locally two ways. **Option A is the recommended primary** — it gives you a real auth + email loop without hitting cloud services. **Option B is a faster fallback** for schema-only or UI-only work.

### Option A — Local Supabase via Docker (recommended)

`supabase start` brings up Postgres, Auth, Storage, Realtime, and Inbucket (a fake SMTP/IMAP server you can browse to read auth + transactional emails without sending anything real).

```bash
# One-time
supabase init                               # creates supabase/config.toml + migrations dir
supabase start                              # boots the full local stack — first time pulls images (~5 min)

# Use the URLs/keys printed by `supabase start` in .env.local:
# NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<printed>
# SUPABASE_SERVICE_ROLE_KEY=<printed>
# DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
# DIRECT_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

pnpm dev                                    # http://localhost:3000
# Inbucket (read sent emails): http://localhost:54324
```

When you're done: `supabase stop` to free resources, or `supabase stop --no-backup` to wipe local data.

### Option B — Local Postgres only (fast iteration)

For schema-only or UI-only work where you don't need live auth/email.

```bash
docker compose up -d postgres mailpit       # Postgres + a local SMTP previewer
# Auth: point at the staging Supabase project (cheap, real flows)
#   NEXT_PUBLIC_SUPABASE_URL=<staging URL>
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>
# DB writes: local Postgres
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bgcf
#   DIRECT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bgcf

pnpm dev
# Mailpit (read sent emails): http://localhost:8025
```

## Common scripts

```bash
pnpm dev              # run apps/web in dev mode
pnpm build            # production build all workspaces
pnpm test             # vitest in all workspaces
pnpm lint             # eslint all workspaces
pnpm typecheck        # tsc --noEmit all workspaces
pnpm format           # prettier --write
pnpm format:check     # prettier --check
pnpm ci:quality       # the full CI pipeline locally — run this before opening a PR

pnpm --filter @bgcf/db db:generate    # generate a new migration from schema changes
pnpm --filter @bgcf/db db:migrate     # apply pending migrations
pnpm --filter @bgcf/db db:studio      # open Drizzle Studio
```

## Deployment

- **`main` → staging** auto-deploys via Railway.
- **Tagged releases (`v*`) → prod** (post-M9 only).

See [`docs/SETUP.md`](./docs/SETUP.md) for the cloud-services setup walkthrough (Supabase project, Cloudflare R2 bucket, Resend domain, Railway environments, GitHub branch protection).

## Contributing

- One milestone = one or more PRs. Use the [PR template](./docs/PULL_REQUEST_TEMPLATE.md).
- Conventional Commits within a PR: `feat(scope):`, `fix(scope):`, `test(scope):`, `chore(scope):`. Squash-merge at the end.
- `ci:quality` must be green before merge.
- Anything touching Stripe/payment code requires unit tests **and** Playwright e2e — see [`docs/TESTING.md`](./docs/TESTING.md).
