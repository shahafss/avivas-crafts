DELETE FROM admin_session;--> statement-breakpoint
DELETE FROM oauth_flow;--> statement-breakpoint
-- Spec 004 (Google sign-in only): the two DELETEs end all sessions and half-finished sign-ins (dropping
-- `stage` would otherwise leave pending sessions looking full); admins keep access as role `admin` below.
DROP TABLE "admin_passkey" CASCADE;--> statement-breakpoint
DROP TABLE "admin_recovery_code" CASCADE;--> statement-breakpoint
ALTER TABLE "admin_session" DROP COLUMN "stage";--> statement-breakpoint
ALTER TABLE "admin_session" DROP COLUMN "webauthn_challenge";--> statement-breakpoint
ALTER TABLE "admin_session" DROP COLUMN "recovery_verified_at";--> statement-breakpoint
ALTER TABLE "admin_session" DROP COLUMN "purpose";--> statement-breakpoint
ALTER TABLE "admin_session" DROP COLUMN "ended_at";--> statement-breakpoint
ALTER TABLE "admin_session" DROP COLUMN "abandon_processed_at";--> statement-breakpoint
ALTER TABLE "admin_session" DROP COLUMN "reauth_at";--> statement-breakpoint
ALTER TABLE "admin_session" DROP COLUMN "next_path";--> statement-breakpoint
ALTER TABLE "admin_user" DROP COLUMN "setup_token_hash";--> statement-breakpoint
ALTER TABLE "admin_user" DROP COLUMN "setup_token_expires_at";--> statement-breakpoint
ALTER TABLE "admin_user" DROP COLUMN "passkey_fail_count";--> statement-breakpoint
ALTER TABLE "admin_user" DROP COLUMN "passkey_blocked_until";--> statement-breakpoint
ALTER TABLE "oauth_flow" DROP COLUMN "purpose";--> statement-breakpoint
ALTER TABLE "oauth_flow" DROP COLUMN "setup_token_hash";--> statement-breakpoint
DROP TYPE "public"."oauth_purpose";--> statement-breakpoint
DROP TYPE "public"."passkey_registered_via";--> statement-breakpoint
DROP TYPE "public"."passkey_status";--> statement-breakpoint
DROP TYPE "public"."session_stage";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
ALTER TABLE "admin_user" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
-- Everyone who exists today is an approved admin.
UPDATE admin_user SET role = 'admin';
