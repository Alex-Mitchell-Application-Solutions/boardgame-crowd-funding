# Testing guide

Three layers, ordered fastest → slowest. Run all locally before opening a payment-touching PR.

## Layer 1 — Unit (Vitest)

```bash
pnpm test                  # all packages
pnpm --filter @bgcf/jobs test
pnpm --filter @bgcf/web test
```

Required 100% coverage areas (CI fails below):

- `packages/jobs/src/lib/fees.ts` — fee calculation purity + invariants (use `fast-check` for property-based)
- Pledge state machine
- Webhook idempotency helper
- Zod env validator

## Layer 2 — Integration (Vitest + testcontainers Postgres)

Spins up a real Postgres container for each test run; resets schema between tests via `pnpm db:reset`.

```bash
pnpm --filter @bgcf/db test:integration
pnpm --filter @bgcf/web test:integration
```

Critical scenarios:

- Tier quota race (20 concurrent pledges, `quantity_limit = 10` → exactly 10 win)
- Drizzle counter integrity under concurrent inserts/cancels
- pg-boss handler retry semantics (transient throws retry, card declines don't)
- Webhook ordering races (`setup_intent.succeeded` arriving before pledge row exists)

## Layer 3 — End-to-end (Playwright)

Hits the running app + Stripe test mode + Stripe CLI for webhook forwarding.

```bash
# Terminal 1
pnpm --filter @bgcf/web dev

# Terminal 2 — forward Stripe webhooks
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Copy the printed webhook secret into .env.local as STRIPE_WEBHOOK_SECRET

# Terminal 3
pnpm --filter @bgcf/web test:e2e
```

CI runs Playwright nightly on `main` and on every PR touching `apps/web/server/**`, `packages/jobs/**`, or `packages/db/**`.

### Critical user journeys

1. **Creator path**: sign-up → onboard Stripe Connect → create campaign → publish → live page renders.
2. **Backer path**: sign up → land on campaign → pledge with `4242…` → SetupIntent succeeds → pledge appears in account dashboard.
3. **Time-travelled deadline**: dev-only endpoint `/api/dev/finalize?campaignId=…` triggers `finalize_campaign` immediately.
4. **Off-session charge failure**: pledge with `4000…0341` (passes setup, fails at charge) → assert that pledge `failed`, others `charged`, dashboard shows the gap.
5. **Refund**: creator → refund pledge → backer sees refunded status + email.

### Adversarial / boundary cases

6. Webhook signature: bad body → 400; bad signature → 400; replay → 200 no-op.
7. Authorization: user A POSTs to user B's edit Server Action → 403.
8. Double-pledge: same backer pledges twice → second cancels first.
9. Card-update window: card expiring before deadline gets T-7d email + can update.
10. Concurrent quota: tier limit = 1, two backers race — exactly one wins.

## Stripe test cards

| Card                  | Behaviour                                                                   |
| --------------------- | --------------------------------------------------------------------------- |
| `4242 4242 4242 4242` | Generic success                                                             |
| `4000 0000 0000 0002` | Generic decline at SetupIntent                                              |
| `4000 0000 0000 0341` | Succeeds on SetupIntent, fails on off-session charge — our charge-fail path |
| `4000 0027 6000 3184` | 3DS authentication required                                                 |
| `4000 0000 0000 9995` | Insufficient funds                                                          |
| `4000 0000 0000 0069` | Expired card                                                                |
| `4000 0000 0000 0119` | Processing error                                                            |

Full reference: https://stripe.com/docs/testing#cards

Use any future expiry, any 3-digit CVC, any postal code.

## Stripe CLI primer

```bash
stripe login                                           # one-time
stripe listen --forward-to localhost:3000/api/stripe/webhook   # webhook forwarding
stripe trigger payment_intent.succeeded                # fire a synthetic event
stripe trigger account.updated                         # exercise creator onboarding webhook
```

The webhook signing secret printed by `stripe listen` is what you put in `.env.local` as `STRIPE_WEBHOOK_SECRET` for local dev. Each `stripe listen` session prints a new secret.

## Test Connect platform

We maintain a **separate Stripe platform account in test mode** for staging — do NOT mix test creators with the prod platform. Onboarding URLs in staging point to the test platform's Express onboarding flow.

## Coverage targets (CI floors)

- `packages/jobs/src/lib/fees.ts`: **100%**
- Pledge state machine, webhook idempotency, env validator: **100%**
- `apps/web/server/**` Server Actions: **80%+ statements**
- React components / pages: no enforced threshold; rely on Playwright

## Pre-deploy payment-safety check

Any deploy that touches Stripe code must pass the Stripe-flow Playwright subset against staging _before_ rolling to prod. The deploy script gates on this; failure aborts the deploy.
