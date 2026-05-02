CREATE TYPE "public"."notification_kind" AS ENUM('pledge_confirmed', 'pledge_charged', 'pledge_charge_failed', 'pledge_refunded', 'campaign_succeeded', 'campaign_failed', 'campaign_update_posted', 'comment_reply', 'connect_onboarding_incomplete');--> statement-breakpoint
CREATE TABLE "campaign_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"is_backers_only" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_body_not_empty" CHECK (length(trim("comments"."body")) > 0)
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"inapp_pledge_confirmed" boolean DEFAULT true NOT NULL,
	"inapp_pledge_charged" boolean DEFAULT true NOT NULL,
	"inapp_pledge_charge_failed" boolean DEFAULT true NOT NULL,
	"inapp_pledge_refunded" boolean DEFAULT true NOT NULL,
	"inapp_campaign_succeeded" boolean DEFAULT true NOT NULL,
	"inapp_campaign_failed" boolean DEFAULT true NOT NULL,
	"inapp_campaign_update_posted" boolean DEFAULT true NOT NULL,
	"inapp_comment_reply" boolean DEFAULT true NOT NULL,
	"inapp_connect_onboarding_incomplete" boolean DEFAULT true NOT NULL,
	"email_pledge_confirmed" boolean DEFAULT true NOT NULL,
	"email_pledge_charged" boolean DEFAULT true NOT NULL,
	"email_pledge_charge_failed" boolean DEFAULT true NOT NULL,
	"email_pledge_refunded" boolean DEFAULT true NOT NULL,
	"email_campaign_succeeded" boolean DEFAULT true NOT NULL,
	"email_campaign_failed" boolean DEFAULT true NOT NULL,
	"email_campaign_update_posted" boolean DEFAULT true NOT NULL,
	"email_comment_reply" boolean DEFAULT true NOT NULL,
	"email_connect_onboarding_incomplete" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_updates" ADD CONSTRAINT "campaign_updates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_updates" ADD CONSTRAINT "campaign_updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_updates_campaign_id_published_idx" ON "campaign_updates" USING btree ("campaign_id","published_at");--> statement-breakpoint
CREATE INDEX "comments_campaign_id_created_at_idx" ON "comments" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_parent_id_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE POLICY "Public can read non-backers-only published updates" ON "campaign_updates" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ("campaign_updates"."published_at" IS NOT NULL AND "campaign_updates"."is_backers_only" = false AND EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = "campaign_updates"."campaign_id" AND c.status IN ('live', 'succeeded')
    ));--> statement-breakpoint
CREATE POLICY "Backers can read backers-only updates on their campaigns" ON "campaign_updates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("campaign_updates"."published_at" IS NOT NULL AND EXISTS (
      SELECT 1 FROM pledges p
      WHERE p.campaign_id = "campaign_updates"."campaign_id"
        AND p.backer_id = (SELECT auth.uid())
        AND p.status IN ('pending', 'charged')
    ));--> statement-breakpoint
CREATE POLICY "Creator can read all updates on their own campaigns" ON "campaign_updates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "campaign_updates"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Creator can insert updates on their own campaigns" ON "campaign_updates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "campaign_updates"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Creator can update updates on their own campaigns" ON "campaign_updates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "campaign_updates"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Creator can delete updates on their own campaigns" ON "campaign_updates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "campaign_updates"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Public can read non-hidden comments on visible campaigns" ON "comments" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ("comments"."is_hidden" = false AND EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = "comments"."campaign_id" AND c.status IN ('live', 'succeeded')
    ));--> statement-breakpoint
CREATE POLICY "Author can read their own comments" ON "comments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "comments"."author_id");--> statement-breakpoint
CREATE POLICY "Creator can read all comments on their campaigns" ON "comments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "comments"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Authenticated users can post comments to live campaigns" ON "comments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "comments"."author_id" AND EXISTS (
      SELECT 1 FROM campaigns c WHERE c.id = "comments"."campaign_id" AND c.status IN ('live', 'succeeded')
    ));--> statement-breakpoint
CREATE POLICY "Author can delete their own comments" ON "comments" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT auth.uid()) = "comments"."author_id");--> statement-breakpoint
CREATE POLICY "Creator can update comments on their campaigns (for hiding)" ON "comments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = "comments"."campaign_id" AND c.creator_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "Users can read their own preferences" ON "notification_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "notification_preferences"."user_id");--> statement-breakpoint
CREATE POLICY "Users can insert their own preferences" ON "notification_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "notification_preferences"."user_id");--> statement-breakpoint
CREATE POLICY "Users can update their own preferences" ON "notification_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "notification_preferences"."user_id") WITH CHECK ((SELECT auth.uid()) = "notification_preferences"."user_id");--> statement-breakpoint
CREATE POLICY "Users can read their own notifications" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "notifications"."user_id");--> statement-breakpoint
CREATE POLICY "Users can update their own notifications (mark read)" ON "notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "notifications"."user_id") WITH CHECK ((SELECT auth.uid()) = "notifications"."user_id");