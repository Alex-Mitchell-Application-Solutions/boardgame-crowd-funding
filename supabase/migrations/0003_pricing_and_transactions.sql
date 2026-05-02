CREATE TYPE "public"."pledge_transaction_kind" AS ENUM('charge', 'refund');--> statement-breakpoint
CREATE TABLE "pledge_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pledge_id" uuid NOT NULL,
	"kind" "pledge_transaction_kind" NOT NULL,
	"gross_pence" bigint NOT NULL,
	"stripe_fee_pence" bigint NOT NULL,
	"platform_fee_pence" bigint NOT NULL,
	"net_to_creator_pence" bigint NOT NULL,
	"applied_fee_pct" numeric(5, 4) NOT NULL,
	"stripe_charge_id" text,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pledge_transactions_gross_non_negative" CHECK ("pledge_transactions"."gross_pence" >= 0),
	CONSTRAINT "pledge_transactions_stripe_fee_non_negative" CHECK ("pledge_transactions"."stripe_fee_pence" >= 0),
	CONSTRAINT "pledge_transactions_platform_fee_non_negative" CHECK ("pledge_transactions"."platform_fee_pence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pledge_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"platform_fee_pct" numeric(5, 4) NOT NULL,
	"stripe_fee_pct" numeric(5, 4) NOT NULL,
	"stripe_fee_fixed_pence" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "pricing_config_singleton" CHECK ("pricing_config"."id" = 1),
	CONSTRAINT "pricing_config_platform_fee_range" CHECK ("pricing_config"."platform_fee_pct" >= 0 AND "pricing_config"."platform_fee_pct" <= 0.5),
	CONSTRAINT "pricing_config_stripe_fee_range" CHECK ("pricing_config"."stripe_fee_pct" >= 0 AND "pricing_config"."stripe_fee_pct" <= 0.1)
);
--> statement-breakpoint
ALTER TABLE "pricing_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pledge_transactions" ADD CONSTRAINT "pledge_transactions_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pledge_transactions_pledge_id_idx" ON "pledge_transactions" USING btree ("pledge_id");--> statement-breakpoint
CREATE INDEX "pledge_transactions_payment_intent_idx" ON "pledge_transactions" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE POLICY "Backer can read transactions for their own pledges" ON "pledge_transactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM pledges p WHERE p.id = "pledge_transactions"."pledge_id" AND p.backer_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Creator can read transactions for pledges to their campaigns" ON "pledge_transactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (
      SELECT 1 FROM pledges p
      JOIN campaigns c ON c.id = p.campaign_id
      WHERE p.id = "pledge_transactions"."pledge_id" AND c.creator_id = (SELECT auth.uid())
    ));--> statement-breakpoint
CREATE POLICY "Authenticated users can read pricing config" ON "pricing_config" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
-- Seed the singleton pricing_config row with the v1 platform fee (3%) and a
-- conservative Stripe pass-through estimate (UK domestic Stripe Connect: 1.5%
-- + 20p). Actual Stripe fees are read from BalanceTransaction.fee at
-- charge time and persisted in pledge_transactions; these values are only
-- used for forward-looking math (e.g. "creator will net £X if charged today").
INSERT INTO "pricing_config" ("id", "platform_fee_pct", "stripe_fee_pct", "stripe_fee_fixed_pence")
VALUES (1, 0.0300, 0.0150, 20)
ON CONFLICT ("id") DO NOTHING;
