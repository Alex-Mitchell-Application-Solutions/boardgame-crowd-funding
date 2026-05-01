# Plan: Tabletop Crowdfunding Platform

## Context

**Why this project**: Build a Kickstarter / GameFound / BackerKit-style crowdfunding platform focused exclusively on tabletop / boardgames. Incumbents charge **5% platform + ~3% + 30p Stripe** (≈ 8% + 30p total). The thesis: a focused, lean platform can run profitably at a **3% platform fee**, undercutting the field by ~37% and meaningfully helping indie creators who can't afford to give up margin.

**Outcome we want for v1**: A working MVP where a creator can launch a campaign, backers pledge with payment-methods saved (not charged), and at deadline — if goal is hit — all backers are charged simultaneously and the creator is paid out minus our 3% platform fee + Stripe pass-through.

> This document is the canonical project plan. Update it in PRs as scope or architecture decisions change.

## Locked decisions

| #   | Decision        | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | App topology    | **Single Next.js 15 (App Router) monolith on Railway**. Server Actions + API routes. NestJS extraction deferred to post-v1 if a separate API surface is needed.                                                                                                                                                                                                                                                                                                                              |
| 2   | Auth            | **Supabase Auth** (magic link primary, OAuth post-v1). Resend as Supabase's Custom SMTP so all auth emails come from `auth@mail.<domain>` with branded templates edited via Supabase dashboard.                                                                                                                                                                                                                                                                                              |
| 3   | Database        | **Supabase Postgres + Drizzle ORM**. App tables FK directly to `auth.users(id)`.                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4   | Media storage   | **Cloudflare R2 (S3-compatible, zero-egress)** from the start. Public assets served via a `media.<domain>` CNAME for branded URLs. Storage interface kept provider-agnostic in `apps/web/server/storage.ts` so the underlying provider is a config change — but R2 is the default and only configured provider for v1. Reasoning: egress is where this stack saves real money on a public, media-heavy site (~$150+/mo at modest viral traffic), aligning with the indie-cost-saving thesis. |
| 5   | Funding model   | **All-or-nothing only** for v1. SetupIntent during campaign, bulk PaymentIntent at deadline if goal met.                                                                                                                                                                                                                                                                                                                                                                                     |
| 6   | Stripe Connect  | **Express only** for v1. Standard (creators with existing Stripe accounts) added in v1.x.                                                                                                                                                                                                                                                                                                                                                                                                    |
| 7   | Marketing pages | **Static MDX** under `app/(marketing)/`. No CMS. PayloadCMS deferred.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 8   | Fees            | **3% platform fee + Stripe pass-through.** Stored in single-row `pricing_config` table; per-campaign override on `campaigns.fee_override_pct`. Full breakdown persisted per pledge in `pledge_transactions` for audit.                                                                                                                                                                                                                                                                       |
| 9   | MVP scope       | Creator onboarding + Connect · campaign creation (with reward tiers) · public campaign page + browse/search · pledge/SetupIntent flow · deadline automation · creator updates + comments · Resend transactional email · in-app notifications + per-user prefs · static MDX marketing pages · basic admin moderation.                                                                                                                                                                         |

## Stack

- **Runtime**: Next.js 15 (App Router, Server Actions), React 19, TypeScript strict
- **DB**: Supabase Postgres + Drizzle + drizzle-kit migrations
- **Auth**: Supabase Auth + `@supabase/ssr`. RLS _off_ — auth checks in TS via `requireUser()` / `requireCreator()` / `requireCampaignOwner()` helpers (RLS adds a second mental model that fights Drizzle and the worker's `service_role` writes — not worth the complexity at this scale).
- **Media**: Cloudflare R2 (S3-compatible, zero egress), presigned uploads from Server Actions, served via `media.<domain>` CNAME. Storage layer provider-agnostic in code.
- **Payments**: Stripe Connect Express + SetupIntent/PaymentIntent + webhooks
- **Email**: Resend (transactional, React Email templates) + Supabase Custom SMTP via Resend for auth emails
- **Jobs**: `pg-boss` (Postgres-backed queue) running as a **separate Railway worker service** (in-process workers crash on Next.js HMR and can't scale independently)
- **Cron**: Railway native cron hitting signed internal endpoints
- **UI**: Tailwind + shadcn/ui (copied into `packages/ui`), `react-hook-form` + `zod`, TanStack Query for the dashboard's live bits
- **Tooling**: pnpm, Turborepo, GitHub Actions running `ci:quality = pnpm build && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check`, Vitest, Playwright (nightly + payment-touching PRs), ESLint, Prettier
- **Hosting**: Railway (web + worker + Postgres-via-Supabase + buckets + cron)

## Environments + local development

| Tier        | When                               | Supabase                                                         | Stripe                                        | Resend                                                                   | Railway                       | Notes                           |
| ----------- | ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------- | ------------------------------- |
| **local**   | dev machine                        | Local Supabase via Docker (preferred) **or** local Postgres only | Test mode + Stripe CLI for webhook forwarding | API key against test sandbox domain (or local Inbucket via Supabase CLI) | n/a                           | hot reload, fast iteration      |
| **staging** | from M1 onward                     | Hosted Supabase staging project                                  | Test mode (separate Connect platform account) | Test sandbox domain (e.g. `mail-staging.<domain>`)                       | Railway "staging" environment | auto-deploys from `main`        |
| **prod**    | added at M9 (pre-launch hardening) | Hosted Supabase prod project                                     | Live mode                                     | Live sender domain (`mail.<domain>`)                                     | Railway "prod" environment    | deploys via tagged release `v*` |

Branch / deploy strategy: **`main` → staging on push; tagged `v*` releases → prod**. Single trunk, no long-lived `staging` branch. Production not stood up until M9.

For local-dev setup, see the [README](../README.md) and [SETUP.md](./SETUP.md).

## Pull request workflow

- **One milestone = one or more PRs.** Some milestones (e.g. M3 campaign creation, M6 deadline automation) are large enough to split into 2–3 PRs along clean seams (schema/migrations, server actions, UI). Splitting keeps reviews tractable and lets us merge incremental progress.
- **Commits within a PR are grouped by concern**, prefixed Conventional-Commits style (`feat(pledges): add SetupIntent server action`, `test(stripe): cover off-session charge failure`, `chore(db): migration for pledge_transactions`). Squash-merge the PR; commits inside it are for review readability rather than long-term history.
- **CI must be green** (`ci:quality` = build + test + lint + typecheck + format:check) before merge. Branch protection on `main` enforces this.
- **`main` is always deployable to staging.** Tagged releases (`v*`) deploy to prod (post-M9 only).
- **PR template lives at [`docs/PULL_REQUEST_TEMPLATE.md`](./PULL_REQUEST_TEMPLATE.md)** — GitHub picks it up automatically.

## Repo layout

```
boardgame-crowd-funding/
├── apps/
│   └── web/                          # Next.js 15 monolith
│       ├── app/
│       │   ├── (marketing)/          # static MDX
│       │   ├── (app)/                # authed app
│       │   ├── (admin)/admin/        # moderation
│       │   └── api/
│       │       ├── stripe/webhook/route.ts
│       │       ├── cron/finalize-campaigns/route.ts
│       │       ├── cron/ending-soon/route.ts
│       │       └── storage/presign/route.ts
│       ├── components/
│       ├── lib/                      # client helpers, query keys
│       ├── server/                   # Server Actions, server-only utils, auth, stripe, storage
│       └── tests/
├── packages/
│   ├── db/                           # Drizzle schema + migrations + db client
│   ├── email/                        # Resend client + React Email templates
│   ├── jobs/                         # pg-boss queue defs + handlers + worker entrypoint
│   ├── config/                       # eslint, tsconfig, prettier base
│   └── ui/                           # shadcn primitives + cross-cutting components
├── .github/workflows/ci.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

`turbo.json` pipelines: `build` (with `dependsOn: ["^build"]`), `test`, `lint`, `typecheck`, `format:check` running in parallel.

## Drizzle schema sketch

All money in **`bigint` pence** (BIGINT not INTEGER — pledge totals can blow past 2.1B pence on a viral campaign). Timestamps `timestamp({ withTimezone: true, mode: 'date' })`. `auth.users` referenced via `pgSchema('auth')`.

**Tables**:

- `creator_profiles` — extends auth.users, holds `stripe_account_id` + Connect status flags. PK = `user_id`.
- `campaigns` — `creator_id`, `slug` (unique), `title`, `tagline`, `story_md`, `category` (enum), `goal_pence`, `currency` ('gbp' v1), `status` (`draft|live|succeeded|failed|cancelled|hidden`), `launched_at`, `deadline_at`, `finalized_at`, `fee_override_pct nullable`, denormalized `total_pledged_pence` + `pledge_count`. Indexes: `(status, deadline_at)`, `(category, status)`, `slug`, `creator_id`. GIN trigram on `title` for ILIKE search.
- `campaign_media` — cover + gallery, R2 keys, `kind` (`cover|gallery_image|gallery_video`), `position`.
- `reward_tiers` — `campaign_id`, `title`, `description_md`, `price_pence`, `quantity_limit nullable`, `quantity_claimed`, `estimated_delivery`, `position`, `is_hidden`.
- `pledges` — `campaign_id`, `backer_id`, `amount_pence`, `stripe_customer_id`, `stripe_payment_method_id`, `stripe_setup_intent_id`, `stripe_payment_intent_id nullable`, `status` (`pending|charged|failed|refunded|cancelled`), shipping fields. Partial unique index on `(campaign_id, backer_id) WHERE status IN ('pending','charged')` — one active pledge per backer per campaign.
- `pledge_items` — model now even though add-ons are post-v1. `pledge_id`, `reward_tier_id nullable` (null = no-reward custom amount), `quantity`, `unit_price_pence` (frozen at pledge time).
- `pledge_transactions` — audit row at charge / refund. `kind` (`charge|refund`), `gross_pence`, `stripe_fee_pence`, `platform_fee_pence`, `net_to_creator_pence`, `applied_fee_pct`, `stripe_charge_id`, `stripe_payment_intent_id`, `stripe_refund_id`, `occurred_at`.
- `campaign_updates` — markdown posts, `is_backers_only`, `published_at nullable`.
- `comments` — one-level threading via `parent_id nullable`, `is_hidden` for moderation.
- `notifications` — `user_id`, `kind` (enum), `payload jsonb`, `read_at nullable`. Index `(user_id, read_at, created_at desc)`.
- `notification_preferences` — `user_id PK`, one boolean per `email_*` / `inapp_*` kind.
- `pricing_config` — single-row table (CHECK id = 1). `platform_fee_pct`, `stripe_fee_pct`, `stripe_fee_fixed_pence`.
- `processed_stripe_events` — `event_id PK` for webhook idempotency.
- `admin_users` — membership table for admin role (no flag on `auth.users` since we don't own that table).
- `audit_log` — admin actions only.

Critical schema files: `packages/db/src/schema/{auth,creators,campaigns,pledges,comments,notifications,pricing,admin}.ts` + barrel `index.ts`.

## Stripe Connect Express flow

**1. Creator onboarding**: `createConnectAccount()` Server Action → `stripe.accounts.create({ type: 'express', country: 'GB', capabilities: { card_payments, transfers }, business_type: 'individual' })` → store `stripe_account_id` → `stripe.accountLinks.create({ type: 'account_onboarding' })` → redirect. `account.updated` webhook is the source of truth for `stripe_charges_enabled` / `payouts_enabled` / `details_submitted`. `draft → live` transition gated on `stripe_charges_enabled = true`.

**2. Pledge**: `/c/[slug]/back` → `createPledgeSetupIntent({ campaignId, items, shipping })` validates tier availability → creates pledge row `status='pending'` → `stripe.setupIntents.create({ customer, payment_method_types: ['card'], usage: 'off_session', metadata: { pledge_id } })` → returns `client_secret` → client confirms via Stripe Elements. `setup_intent.succeeded` webhook stores `stripe_payment_method_id`, increments `reward_tiers.quantity_claimed` + `campaigns.total_pledged_pence` transactionally.

**3. Deadline**: Railway cron `*/5 * * * *` hits `/api/cron/finalize-campaigns` (signed). Enqueues `finalize_campaign` job per campaign with `deadline_at <= now() AND status='live'`. Handler:

- Goal missed → `status='failed'`, all pending pledges → `cancelled`, enqueue `CampaignFailed` emails.
- Goal hit → `status='succeeded'`, snapshot `pricing_config` into job payload, enqueue one `charge_pledge` per pending pledge.

`charge_pledge` handler computes `application_fee_amount = floor(gross * applied_pct)` and calls `stripe.paymentIntents.create({ amount, currency: 'gbp', customer, payment_method, off_session: true, confirm: true, application_fee_amount, transfer_data: { destination: creator.stripe_account_id }, metadata: { pledge_id } })`. `payment_intent.succeeded` webhook writes `pledge_transactions` (using the BalanceTransaction's _actual_ Stripe fee, not our estimate) and flips pledge to `charged`. `payment_intent.payment_failed` → `failed` + `PledgeChargeFailed` email with retry CTA.

**4. Failure handling**: pg-boss retries `charge_pledge` 3× with exponential backoff for transient errors only. Card-decline failures don't retry. Worker rate-limited to 50 PI creates/sec to stay under Stripe's ~100 writes/sec ceiling. Post-charge, if some pledges fail, the platform pays out only what charged — the all-or-nothing test is at deadline, not post-charge (industry norm; document in T&Cs).

**5. Refunds**: Creator dashboard → `refundPledge(pledgeId, reason)` → `stripe.refunds.create({ payment_intent, refund_application_fee: true, reverse_transfer: true })` → `charge.refunded` webhook writes refund-kind `pledge_transactions` row.

**6. Webhooks**: Single endpoint `apps/web/app/api/stripe/webhook/route.ts`, `runtime = 'nodejs'`, raw body via `await req.text()`, `stripe.webhooks.constructEvent` for signature verification. Handlers in `apps/web/server/stripe/handlers/`, idempotent via `processed_stripe_events`. Events: `account.updated`, `setup_intent.{succeeded,setup_failed}`, `payment_intent.{succeeded,payment_failed}`, `charge.refunded`, `charge.dispute.created`.

## Background jobs + cron

**pg-boss as a separate Railway worker service** (`packages/jobs/src/worker.ts`, `pnpm --filter @bgcf/jobs start`). Shares `DATABASE_URL` with web app.

Job types (v1): `charge_pledge`, `finalize_campaign`, `send_email`, `send_campaign_ending_soon`, `send_update_digest`, `reconcile_stripe_account`.

Cron (Railway native, signed internal endpoints):

- `*/5 * * * *` — finalize-campaigns scanner
- `0 * * * *` — ending-soon emailer (campaigns deadlining 24–25h ahead)
- `0 3 * * *` — reconcile pending Connect accounts (catch missed `account.updated` webhooks)

## Email + notifications

**Sender domain**: `mail.<your-domain>` (subdomain isolation — deliverability problems on transactional don't poison root). DKIM + SPF + DMARC `p=quarantine`.

**Supabase Custom SMTP** points at Resend's SMTP credentials. Auth emails (magic link, password reset) use Supabase's templates themed in the Supabase dashboard (logo, colours, copy), sent through Resend. All transactional app emails use React Email templates in `packages/email/src/templates/`.

Templates v1: `WelcomeBacker`, `WelcomeCreator`, `PledgeConfirmed`, `CampaignEndingSoon`, `CampaignSucceeded` (creator + backer variants), `CampaignFailed` (creator + backer), `PledgeCharged`, `PledgeChargeFailed`, `PledgeRefunded`, `CampaignUpdatePosted`, `CommentReply`, `ConnectOnboardingIncomplete`.

**In-app notifications**: row inserted alongside any email. Bell UI = Server Component first paint + TanStack Query polling at 30s while focused. Real-time via Supabase Realtime deferred — adds connection-count cost we don't need at this scale. `notification_preferences` is consulted by the email-sender (notification row always written; email is conditional).

## Auth + access control

`@supabase/ssr` `createServerClient` in `apps/web/server/auth.ts` reads JWT from cookies → returns `{ user }`, memoized per-request via React `cache()`. Drizzle uses a separate connection pool with the database password (Supabase pooler connection string).

Roles: creator = "user with a `creator_profiles` row." Admin = membership in `admin_users`. Helpers: `requireUser()`, `requireCreator()`, `requireCampaignOwner(campaignId)`, `requireAdmin()` — every Server Action and route handler entrypoint goes through one.

## Milestones (ship in this order)

**M1 — Bootstrap** · Turborepo skeleton, `packages/db` wired to Supabase, magic-link auth, Resend custom SMTP, base layout, CI green. Also: copy this plan into `docs/PLAN.md`, write `.env.example` at root, `README.md` documenting both local-dev paths, `docs/PULL_REQUEST_TEMPLATE.md`, `docs/TESTING.md`, `docker-compose.yml` for the Postgres-only fallback, wire `supabase init` + `supabase/config.toml` for the Supabase-Docker path, set up Railway staging environment + auto-deploy from `main`, configure GitHub branch protection on `main` (require `ci:quality` green + 1 approval).

**M2 — Creator onboarding + Connect** · `creator_profiles` schema, `/dashboard/connect`, `account.updated` handler.

**M3 — Campaign creation** · `campaigns`, `campaign_media`, `reward_tiers` schema. Multi-step wizard at `/dashboard/campaigns/new`. Storage presign endpoint. `draft → live` gated on Connect status.

**M4 — Browse + campaign page** · `/browse` with category filter + ILIKE search, `/c/[slug]` public render.

**M5 — Pledge flow** · `pledges` + `pledge_items` schema. `/c/[slug]/back` wizard. SetupIntent + Elements + `setup_intent.succeeded` handler + tier-quota enforcement.

**M6 — Deadline automation + charges** · pg-boss + worker on Railway. `finalize_campaign` + `charge_pledge` handlers. `pledge_transactions` audit. PI webhooks. Refund Server Action.

**M7 — Updates, comments, notifications** · `campaign_updates`, `comments`, `notifications`, `notification_preferences`. Bell with polling.

**M8 — Email polish + admin** · All transactional templates. `/admin` moderation: hide campaign/comment, audit log.

**M9 — Pre-launch hardening** · Rate limit Server Actions, 404/500 pages, Sentry, OG images, sitemap, robots, legal copy review. Load test charge fan-out with 500 fake pledges in Stripe test mode.

## Testing strategy

Payment code is the highest-stakes part of this app — a wrong fee calc, a missed webhook, or a non-idempotent handler causes real financial damage. Testing is layered: pure logic gets exhaustive unit coverage, the DB layer gets integration coverage against a real Postgres, and Stripe flows get end-to-end coverage in test mode. See [`docs/TESTING.md`](./TESTING.md) for the full strategy and Stripe test-card reference.

Coverage floors:

- `packages/jobs/src/lib/fees.ts`: **100%**
- Pledge state machine, webhook idempotency, env validator: **100%**
- `apps/web/server/**` Server Actions: **80%+ statements** (focus on auth + payment paths; skip glue)

CI gates:

- `ci:quality` on every PR — required to merge.
- Playwright on PRs touching `apps/web/server/**` or `packages/jobs/**` or `packages/db/**` — required to merge.
- Pre-deploy "payment safety" check: deploy script runs the Stripe-flow Playwright subset against staging before any deploy touching Stripe code.

## Deliberate non-goals for v1

Add-ons / surveys / pledge-management post-charge (BackerKit territory). Multi-currency (`currency` column reserved, locked to gbp). Stretch goals as a first-class feature (creators describe in markdown). OAuth providers beyond magic link (Google added in M9 if time permits). Mobile app, push notifications. AI features. Public REST/GraphQL API. Search beyond ILIKE + trigram. Forum / DMs. Multi-creator campaigns. Tax forms / VAT MOSS (Stripe Tax post-v1). Real-time pledge counters via Supabase Realtime. Disputes UI (manual via Stripe dashboard for v1; webhook stored only).

## Known risks / decisions to revisit

- **Card expiry between pledge and deadline**: SetupIntent saved 60d before charge may decline on expired cards. Stripe's automatic card updater handles most reissues; surface card expiry in backer dashboard with "update card" CTA; cron at T-7d emails affected backers.
- **Stripe rate limits on charge fan-out**: ~100 writes/sec ceiling. Worker rate-limited to 50/sec. Revisit if any campaign trends past 2k pledges.
- **Post-charge goal underrun**: if 30% of pledges fail to charge, creator may lack viable funding even though all-or-nothing test passed at deadline. Industry norm: ship anyway. Document in T&Cs.
- **Railway cold starts**: Next.js scales-to-zero by default. Webhook latency on cold start can exceed Stripe's 10s timeout under load. Keep `apps/web` always-on; accept the floor cost.
- **Search scaling**: trigram + ILIKE good to ~10k campaigns. Plan a Meilisearch sidecar past that.
- **Storage egress costs**: chose Cloudflare R2 (zero egress) up front because at modest viral traffic Railway bucket egress would cost £100+/mo while R2 is effectively free. Storage layer is provider-agnostic so we're not locked in either direction.
- **Presigned upload trust boundary**: client uploads directly. Validate Content-Length + Content-Type at presign time; deferred but flagged: scan + re-encode images server-side via a `process_media` job (post-v1).
- **`pricing_config` mid-campaign change**: pledge-time pricing frozen by storing `applied_fee_pct` in `pledge_transactions`; charge-time fee is `pricing_config` snapshotted into the `finalize_campaign` job payload so all pledges in a campaign use one rate. Document in T&Cs.
- **Webhook ordering races**: `setup_intent.succeeded` may arrive before pledge row exists; `account.updated` may arrive before `creator_profiles` row. Handlers are find-or-buffer: if no matching row, insert into `pending_stripe_events` for 60s replay.
- **Single-region Postgres**: Supabase EU-West-2 fine for UK, painful for US backers. Acceptable for v1.
