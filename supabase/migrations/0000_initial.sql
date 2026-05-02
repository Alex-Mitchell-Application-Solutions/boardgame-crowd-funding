-- Supabase owns the `auth` schema and `auth.users` table. The FK reference
-- below resolves against Supabase's existing table — we never create it.
-- (drizzle-kit excludes `auth.users` from generation as long as schema.ts
-- doesn't re-export `authUsers` from drizzle-orm/supabase.)
CREATE TABLE "creator_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"avatar_r2_key" text,
	"stripe_account_id" text,
	"stripe_charges_enabled" boolean DEFAULT false NOT NULL,
	"stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
	"stripe_details_submitted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profiles_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
ALTER TABLE "creator_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "processed_stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- RLS enabled with NO policies → default-deny for non-superuser roles. Server
-- code (which connects as `postgres`) bypasses RLS and writes freely; nobody
-- else can read or modify the idempotency log.
ALTER TABLE "processed_stripe_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "creator_profiles_stripe_account_id_idx" ON "creator_profiles" USING btree ("stripe_account_id");
--> statement-breakpoint
CREATE POLICY "Owner can read their own creator profile" ON "creator_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "creator_profiles"."user_id");
--> statement-breakpoint
CREATE POLICY "Owner can insert their own creator profile" ON "creator_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "creator_profiles"."user_id");
--> statement-breakpoint
CREATE POLICY "Owner can update their own creator profile" ON "creator_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "creator_profiles"."user_id") WITH CHECK ((SELECT auth.uid()) = "creator_profiles"."user_id");
