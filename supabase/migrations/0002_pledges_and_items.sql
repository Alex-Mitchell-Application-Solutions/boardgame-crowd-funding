CREATE TYPE "public"."pledge_status" AS ENUM('pending', 'charged', 'failed', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TABLE "backer_stripe_customers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backer_stripe_customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
ALTER TABLE "backer_stripe_customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pledge_id" uuid NOT NULL,
	"reward_tier_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_pence" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pledge_items_quantity_min" CHECK ("pledge_items"."quantity" >= 1),
	CONSTRAINT "pledge_items_unit_price_min" CHECK ("pledge_items"."unit_price_pence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pledge_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pledges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"backer_id" uuid NOT NULL,
	"amount_pence" bigint NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_payment_method_id" text,
	"stripe_setup_intent_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"status" "pledge_status" DEFAULT 'pending' NOT NULL,
	"shipping_name" text,
	"shipping_line1" text,
	"shipping_line2" text,
	"shipping_city" text,
	"shipping_postal_code" text,
	"shipping_country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"charged_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "pledges_stripe_setup_intent_id_unique" UNIQUE("stripe_setup_intent_id"),
	CONSTRAINT "pledges_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "pledges_amount_pence_min" CHECK ("pledges"."amount_pence" >= 100)
);
--> statement-breakpoint
ALTER TABLE "pledges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "backer_stripe_customers" ADD CONSTRAINT "backer_stripe_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge_items" ADD CONSTRAINT "pledge_items_pledge_id_pledges_id_fk" FOREIGN KEY ("pledge_id") REFERENCES "public"."pledges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledge_items" ADD CONSTRAINT "pledge_items_reward_tier_id_reward_tiers_id_fk" FOREIGN KEY ("reward_tier_id") REFERENCES "public"."reward_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_backer_id_users_id_fk" FOREIGN KEY ("backer_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pledge_items_pledge_id_idx" ON "pledge_items" USING btree ("pledge_id");--> statement-breakpoint
CREATE INDEX "pledge_items_reward_tier_id_idx" ON "pledge_items" USING btree ("reward_tier_id");--> statement-breakpoint
CREATE INDEX "pledges_campaign_id_status_idx" ON "pledges" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "pledges_backer_id_created_at_idx" ON "pledges" USING btree ("backer_id","created_at");--> statement-breakpoint
CREATE INDEX "pledges_payment_intent_idx" ON "pledges" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pledges_one_active_per_backer_idx" ON "pledges" USING btree ("campaign_id","backer_id") WHERE "pledges"."status" IN ('pending', 'charged');--> statement-breakpoint
CREATE POLICY "Owner can read their own backer-stripe-customer mapping" ON "backer_stripe_customers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "backer_stripe_customers"."user_id");--> statement-breakpoint
CREATE POLICY "Backer can read items on their own pledges" ON "pledge_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM pledges p WHERE p.id = "pledge_items"."pledge_id" AND p.backer_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Creator can read items on pledges to their campaigns" ON "pledge_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (
      SELECT 1 FROM pledges p
      JOIN campaigns c ON c.id = p.campaign_id
      WHERE p.id = "pledge_items"."pledge_id" AND c.creator_id = (SELECT auth.uid())
    ));--> statement-breakpoint
CREATE POLICY "Backer can insert items on their own pledges" ON "pledge_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (SELECT 1 FROM pledges p WHERE p.id = "pledge_items"."pledge_id" AND p.backer_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Backer can read their own pledges" ON "pledges" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "pledges"."backer_id");--> statement-breakpoint
CREATE POLICY "Creator can read pledges to their own campaigns" ON "pledges" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "pledges"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Backer can insert their own pledges" ON "pledges" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "pledges"."backer_id");--> statement-breakpoint
CREATE POLICY "Backer can update their own pledges" ON "pledges" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "pledges"."backer_id") WITH CHECK ((SELECT auth.uid()) = "pledges"."backer_id");