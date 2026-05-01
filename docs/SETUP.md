# Cloud-services setup

Manual steps to stand up staging (and later prod). Most are one-time per environment. Each section is independent — do them in any order.

## 1. Supabase project (Postgres + Auth)

1. Sign up at https://supabase.com → create a new project named `bgcf-staging` (region: closest to you, e.g. `eu-west-2`).
2. Wait for the project to provision (~2 min). It hands you a project URL and three API keys.
3. Copy into Railway's `staging` env vars (and locally if connecting to staging from your machine):
   - `NEXT_PUBLIC_SUPABASE_URL` — the project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `anon` public key
   - `SUPABASE_SERVICE_ROLE_KEY` — `service_role` secret (server-only)
4. Get connection strings: **Project Settings → Database**.
   - `DATABASE_URL` — the **Connection pooler** URI (port 6543, mode "Transaction"). Used by the running app.
   - `DIRECT_DATABASE_URL` — the **direct** URI (port 5432). Used by `drizzle-kit` for migrations.
5. **Auth → URL Configuration**: add `https://<staging-domain>/auth/callback` to redirect URLs.
6. **Auth → Email Templates**: theme the magic-link / password-reset templates with your branding.
7. **Auth → SMTP Settings**: enable Custom SMTP and paste Resend's credentials (see §3).

Repeat for prod (`bgcf-prod`) at M9.

## 2. Cloudflare R2 (media storage)

1. Sign up at https://www.cloudflare.com (free). You don't need to move DNS — R2 works standalone.
2. Dashboard → R2 → enable (asks for a payment card; the free tier is generous).
3. Create a bucket: `bgcf-media-staging`.
4. **R2 → Manage API tokens → Create token** with permissions "Object Read & Write" scoped to the bucket. Save the credentials:
   - `STORAGE_ACCESS_KEY_ID`
   - `STORAGE_SECRET_ACCESS_KEY`
5. **Bucket → Settings → S3 API**: copy the endpoint URL → `STORAGE_ENDPOINT` (looks like `https://<accountid>.r2.cloudflarestorage.com`).
6. Set `STORAGE_REGION=auto`, `STORAGE_BUCKET=bgcf-media-staging`.
7. **Public URL** options:
   - Easiest: bucket → Settings → Public access → enable `r2.dev` URL. Use that as `NEXT_PUBLIC_STORAGE_PUBLIC_URL`.
   - Branded: bucket → Settings → Custom Domains → add `media-staging.<yourdomain>`. Cloudflare gives you a CNAME to add to your DNS provider. Then `NEXT_PUBLIC_STORAGE_PUBLIC_URL=https://media-staging.<yourdomain>`.

Repeat for prod (`bgcf-media-prod`) at M9.

## 3. Resend (transactional email)

1. Sign up at https://resend.com.
2. **Domains → Add Domain**: `mail-staging.<yourdomain>` (subdomain isolation — staging deliverability problems don't poison the prod sender).
3. Resend gives you DKIM, SPF, DMARC records. Add them to your DNS provider. Wait for verification (~5 min).
4. **API Keys → Create**: scope to "Full access" or "Sending access" → save as `RESEND_API_KEY`.
5. Set `RESEND_FROM_EMAIL=onboarding@mail-staging.<yourdomain>`.
6. For Supabase Custom SMTP (step §1.7), use Resend's SMTP credentials (see Resend dashboard → SMTP).

Repeat for prod (`mail.<yourdomain>`) at M9.

## 4. Stripe Connect platform

1. Create a Stripe account (or use existing) at https://dashboard.stripe.com.
2. **Connect → Settings**: enable Connect, set the platform name and branding.
3. **Test mode** toggle: stay in test mode for staging.
4. **Developers → API keys**: copy `pk_test_…` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `sk_test_…` → `STRIPE_SECRET_KEY`.
5. **Connect → Settings → Onboarding & verification**: configure the redirect URLs (return + refresh) to `https://<staging-domain>/dashboard/connect/return` and `https://<staging-domain>/dashboard/connect/refresh`.
6. **Developers → Webhooks → Add endpoint** for `https://<staging-domain>/api/stripe/webhook`. Select events: `account.updated`, `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
7. **Connect → Settings → Connect platform Client ID**: copy the test `ca_…` → `STRIPE_CONNECT_CLIENT_ID`.

Repeat for prod with **a separate live-mode Stripe account** at M9 (do not mix test and live data).

## 5. Railway (hosting)

1. Sign up at https://railway.app, link your GitHub.
2. **New project → Deploy from GitHub** → pick this repo. Railway auto-detects the monorepo.
3. **Configure two services in the project**:
   - `web` — root path `apps/web`, build command `pnpm install --frozen-lockfile && pnpm --filter @bgcf/web build`, start command `pnpm --filter @bgcf/web start`.
   - `worker` — root path `packages/jobs`, build command `pnpm install --frozen-lockfile`, start command `pnpm --filter @bgcf/jobs start`.
4. **Environments**: create `staging` (default) and (later) `prod`. Each has its own env vars.
5. Paste env vars into the staging environment from `.env.example`. Use the values gathered in §1–§4.
6. **Cron**: in Railway → Cron, schedule signed hits to:
   - `*/5 * * * *` → `https://<staging-domain>/api/cron/finalize-campaigns` with `Authorization: Bearer $CRON_SECRET`.
   - `0 * * * *` → `https://<staging-domain>/api/cron/ending-soon` with the same.
7. **Custom domain**: in Railway → Settings → Domains, add `staging.<yourdomain>`. Add the CNAME Railway gives you to DNS.

## 6. GitHub branch protection

1. **Repo → Settings → Branches → Add rule** for `main`.
2. Enable:
   - Require a pull request before merging
   - Require status checks to pass: `ci:quality`
   - Require branches to be up to date before merging
   - Require at least 1 approval (set to 0 if you're solo)
   - Require linear history (forces squash-merge)
   - Do not allow bypassing the above settings

## 7. Sentry (error tracking) — M9

Deferred to pre-launch hardening. When ready:

1. Sign up at https://sentry.io, create an `org/bgcf` project (Next.js).
2. Add the Sentry Next.js integration: `pnpm --filter @bgcf/web add @sentry/nextjs`, then run their wizard.
3. Add `SENTRY_DSN` and `SENTRY_AUTH_TOKEN` to Railway prod env.

## 8. Stripe Tax / VAT MOSS — post-v1

Deferred. When you have first paying creators in the EU, enable Stripe Tax in the Connect platform settings; otherwise we punt VAT collection to creators (T&Cs).
