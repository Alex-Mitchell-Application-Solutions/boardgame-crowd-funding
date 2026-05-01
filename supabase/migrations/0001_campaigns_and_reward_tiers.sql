-- Required for the GIN trigram index on campaigns.title (used for ILIKE
-- search on /browse). Supabase exposes pg_trgm but doesn't always enable it
-- on a fresh project; the IF NOT EXISTS makes this idempotent.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TYPE "public"."campaign_category" AS ENUM('strategy', 'family', 'party', 'rpg', 'wargame', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'live', 'succeeded', 'failed', 'cancelled', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('cover', 'gallery_image', 'gallery_video');--> statement-breakpoint
CREATE TABLE "campaign_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" bigint,
	"width" integer,
	"height" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_media_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
ALTER TABLE "campaign_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"tagline" text,
	"story_md" text NOT NULL,
	"category" "campaign_category" NOT NULL,
	"goal_pence" bigint NOT NULL,
	"currency" text DEFAULT 'gbp' NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"launched_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"fee_override_pct" numeric(5, 4),
	"total_pledged_pence" bigint DEFAULT 0 NOT NULL,
	"pledge_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_slug_unique" UNIQUE("slug"),
	CONSTRAINT "campaigns_goal_pence_min" CHECK ("campaigns"."goal_pence" >= 100),
	CONSTRAINT "campaigns_currency_lower" CHECK ("campaigns"."currency" = lower("campaigns"."currency"))
);
--> statement-breakpoint
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reward_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description_md" text NOT NULL,
	"price_pence" bigint NOT NULL,
	"quantity_limit" integer,
	"quantity_claimed" integer DEFAULT 0 NOT NULL,
	"estimated_delivery" date,
	"position" integer DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_tiers_price_pence_min" CHECK ("reward_tiers"."price_pence" >= 100),
	CONSTRAINT "reward_tiers_quantity_claimed_within_limit" CHECK ("reward_tiers"."quantity_limit" IS NULL OR "reward_tiers"."quantity_claimed" <= "reward_tiers"."quantity_limit")
);
--> statement-breakpoint
ALTER TABLE "reward_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_media" ADD CONSTRAINT "campaign_media_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_creator_id_creator_profiles_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_tiers" ADD CONSTRAINT "reward_tiers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_media_campaign_id_position_idx" ON "campaign_media" USING btree ("campaign_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_media_one_cover_per_campaign_idx" ON "campaign_media" USING btree ("campaign_id") WHERE "campaign_media"."kind" = 'cover';--> statement-breakpoint
CREATE INDEX "campaigns_status_deadline_idx" ON "campaigns" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE INDEX "campaigns_category_status_idx" ON "campaigns" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "campaigns_creator_id_idx" ON "campaigns" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "campaigns_title_trgm_idx" ON "campaigns" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "reward_tiers_campaign_id_position_idx" ON "reward_tiers" USING btree ("campaign_id","position");--> statement-breakpoint
CREATE POLICY "Public can read media of live or succeeded campaigns" ON "campaign_media" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "campaign_media"."campaign_id" AND c.status IN ('live', 'succeeded')));--> statement-breakpoint
CREATE POLICY "Owner can read media of their own campaigns" ON "campaign_media" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "campaign_media"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Owner can insert media on their own campaigns" ON "campaign_media" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "campaign_media"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Owner can update media on their own campaigns" ON "campaign_media" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "campaign_media"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Owner can delete media on their own campaigns" ON "campaign_media" AS PERMISSIVE FOR DELETE TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "campaign_media"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Public can read live or succeeded campaigns" ON "campaigns" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ("campaigns"."status" IN ('live', 'succeeded'));--> statement-breakpoint
CREATE POLICY "Owner can read their own campaigns at any status" ON "campaigns" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "campaigns"."creator_id");--> statement-breakpoint
CREATE POLICY "Owner can insert their own campaigns" ON "campaigns" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "campaigns"."creator_id");--> statement-breakpoint
CREATE POLICY "Owner can update their own campaigns" ON "campaigns" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "campaigns"."creator_id") WITH CHECK ((SELECT auth.uid()) = "campaigns"."creator_id");--> statement-breakpoint
CREATE POLICY "Public can read reward tiers of live or succeeded campaigns" ON "reward_tiers" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "reward_tiers"."campaign_id" AND c.status IN ('live', 'succeeded')));--> statement-breakpoint
CREATE POLICY "Owner can read reward tiers of their own campaigns" ON "reward_tiers" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "reward_tiers"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Owner can insert reward tiers on their own campaigns" ON "reward_tiers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "reward_tiers"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Owner can update reward tiers on their own campaigns" ON "reward_tiers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "reward_tiers"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Owner can delete reward tiers on their own campaigns" ON "reward_tiers" AS PERMISSIVE FOR DELETE TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "reward_tiers"."campaign_id" AND c.creator_id = (SELECT auth.uid())));