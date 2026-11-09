CREATE TYPE "public"."currency" AS ENUM('ILS', 'USD');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('he', 'en');--> statement-breakpoint
CREATE TYPE "public"."product_state" AS ENUM('draft', 'published', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('shipping', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'in_preparation', 'shipped', 'ready_for_pickup', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('online', 'offline');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('awaiting_payment', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."pending_checkout_state" AS ENUM('awaiting_provider', 'confirmed', 'failed', 'switched_offline', 'mismatch');--> statement-breakpoint
CREATE TYPE "public"."oauth_purpose" AS ENUM('sign_in', 'recovery', 'setup');--> statement-breakpoint
CREATE TYPE "public"."passkey_registered_via" AS ENUM('setup', 'normal', 'recovery');--> statement-breakpoint
CREATE TYPE "public"."passkey_status" AS ENUM('active', 'pending_approval');--> statement-breakpoint
CREATE TYPE "public"."session_stage" AS ENUM('pending_passkey', 'full');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_he" text NOT NULL,
	"name_en" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_slug_unique" UNIQUE("slug"),
	CONSTRAINT "category_slug_format" CHECK ("category"."slug" ~ '^[a-z0-9-]{1,60}$'),
	CONSTRAINT "category_name_he_len" CHECK (char_length("category"."name_he") BETWEEN 1 AND 80),
	CONSTRAINT "category_name_en_len" CHECK ("category"."name_en" IS NULL OR char_length("category"."name_en") <= 80)
);
--> statement-breakpoint
CREATE TABLE "option_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name_he" text NOT NULL,
	"name_en" text,
	"position" integer NOT NULL,
	CONSTRAINT "option_group_name_he_len" CHECK (char_length("option_group"."name_he") BETWEEN 1 AND 60),
	CONSTRAINT "option_group_name_en_len" CHECK ("option_group"."name_en" IS NULL OR char_length("option_group"."name_en") <= 60)
);
--> statement-breakpoint
CREATE TABLE "option_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"label_he" text NOT NULL,
	"label_en" text,
	"delta_ils_minor" bigint DEFAULT 0 NOT NULL,
	"delta_usd_minor" bigint,
	"swatch" text,
	"position" integer NOT NULL,
	CONSTRAINT "option_value_label_he_len" CHECK (char_length("option_value"."label_he") BETWEEN 1 AND 60),
	CONSTRAINT "option_value_label_en_len" CHECK ("option_value"."label_en" IS NULL OR char_length("option_value"."label_en") <= 60),
	CONSTRAINT "option_value_swatch" CHECK ("option_value"."swatch" IS NULL OR "option_value"."swatch" IN ('white','cream','beige','brown','grey','black','red','pink','orange','yellow','green','blue'))
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"category_id" uuid,
	"name_he" text NOT NULL,
	"name_en" text,
	"description_he" text,
	"description_en" text,
	"price_ils_minor" bigint,
	"price_usd_minor" bigint,
	"prep_time_he" text,
	"prep_time_en" text,
	"state" "product_state" DEFAULT 'draft' NOT NULL,
	"orderable" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone,
	"search_text" text GENERATED ALWAYS AS (lower(coalesce(name_he,'') || ' ' || coalesce(name_en,'') || ' ' || coalesce(description_he,'') || ' ' || coalesce(description_en,''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_slug_format" CHECK ("product"."slug" ~ '^[a-z0-9-]{1,60}$'),
	CONSTRAINT "product_name_he_len" CHECK (char_length("product"."name_he") BETWEEN 1 AND 120),
	CONSTRAINT "product_name_en_len" CHECK ("product"."name_en" IS NULL OR char_length("product"."name_en") <= 120),
	CONSTRAINT "product_description_he_len" CHECK ("product"."description_he" IS NULL OR char_length("product"."description_he") <= 5000),
	CONSTRAINT "product_description_en_len" CHECK ("product"."description_en" IS NULL OR char_length("product"."description_en") <= 5000),
	CONSTRAINT "product_price_ils_positive" CHECK ("product"."price_ils_minor" IS NULL OR "product"."price_ils_minor" > 0),
	CONSTRAINT "product_price_usd_positive" CHECK ("product"."price_usd_minor" IS NULL OR "product"."price_usd_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt_he" text,
	"alt_en" text,
	"position" integer,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_page" (
	"slug" text PRIMARY KEY NOT NULL,
	"title_he" text DEFAULT '' NOT NULL,
	"title_en" text,
	"body_he" text DEFAULT '' NOT NULL,
	"body_en" text,
	"version" integer DEFAULT 1 NOT NULL,
	"owner_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_page_slug" CHECK ("content_page"."slug" IN ('about','contact','privacy','terms','cookies','shipping-returns','accessibility')),
	CONSTRAINT "content_page_body_he_len" CHECK (char_length("content_page"."body_he") <= 50000),
	CONSTRAINT "content_page_body_en_len" CHECK ("content_page"."body_en" IS NULL OR char_length("content_page"."body_en") <= 50000)
);
--> statement-breakpoint
CREATE TABLE "order_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"admin_id" uuid,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name_he" text NOT NULL,
	"product_name_en" text,
	"image_key" text,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prep_time_he" text,
	"prep_time_en" text,
	"unit_price_minor" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_minor" bigint NOT NULL,
	CONSTRAINT "order_line_quantity" CHECK ("order_line"."quantity" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" integer DEFAULT nextval('order_number_seq') NOT NULL,
	"public_token_hash" "bytea" NOT NULL,
	"public_token_expires_at" timestamp with time zone NOT NULL,
	"locale" "locale" NOT NULL,
	"zone_id" uuid NOT NULL,
	"currency" "currency" NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"delivery_method" "delivery_method" NOT NULL,
	"address_country" char(2),
	"address_city" text,
	"address_line1" text,
	"address_line2" text,
	"address_postal_code" text,
	"note" text,
	"payment_method" "payment_method" NOT NULL,
	"payment_state" "payment_state" DEFAULT 'awaiting_payment' NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"provider" text,
	"provider_transaction_id" text,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"tracking_number" text,
	"pickup_note" text,
	"subtotal_minor" bigint NOT NULL,
	"delivery_fee_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"terms_version" integer NOT NULL,
	"privacy_version" integer NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"marketing_opt_in_at" timestamp with time zone,
	"marketing_withdrawn_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_public_token_hash_unique" UNIQUE("public_token_hash"),
	CONSTRAINT "orders_provider_transaction_unique" UNIQUE("provider","provider_transaction_id"),
	CONSTRAINT "orders_customer_name_len" CHECK (char_length("orders"."customer_name") BETWEEN 2 AND 100),
	CONSTRAINT "orders_customer_email_len" CHECK ("orders"."customer_email" IS NULL OR char_length("orders"."customer_email") <= 254),
	CONSTRAINT "orders_note_len" CHECK ("orders"."note" IS NULL OR char_length("orders"."note") <= 1000),
	CONSTRAINT "orders_tracking_number_len" CHECK ("orders"."tracking_number" IS NULL OR char_length("orders"."tracking_number") <= 100),
	CONSTRAINT "orders_pickup_note_len" CHECK ("orders"."pickup_note" IS NULL OR char_length("orders"."pickup_note") <= 500),
	CONSTRAINT "orders_contact_present" CHECK ("orders"."anonymized_at" IS NOT NULL OR ("orders"."customer_email" IS NOT NULL AND "orders"."customer_phone" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "pending_checkout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_token_hash" "bytea" NOT NULL,
	"locale" "locale" NOT NULL,
	"zone_id" uuid NOT NULL,
	"currency" "currency" NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"delivery_method" "delivery_method" NOT NULL,
	"address_country" char(2),
	"address_city" text,
	"address_line1" text,
	"address_line2" text,
	"address_postal_code" text,
	"note" text,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"marketing_opt_in_at" timestamp with time zone,
	"terms_version" integer NOT NULL,
	"privacy_version" integer NOT NULL,
	"lines" jsonb,
	"subtotal_minor" bigint NOT NULL,
	"delivery_fee_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"provider" text NOT NULL,
	"provider_page_id" text,
	"state" "pending_checkout_state" DEFAULT 'awaiting_provider' NOT NULL,
	"last_status_check_at" timestamp with time zone,
	"retained_until" timestamp with time zone,
	"order_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_he" text NOT NULL,
	"name_en" text,
	"currency" "currency" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"shipping_enabled" boolean DEFAULT false NOT NULL,
	"pickup_enabled" boolean DEFAULT false NOT NULL,
	"shipping_fee_minor" bigint DEFAULT 0 NOT NULL,
	"free_shipping_threshold_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_zone_code_unique" UNIQUE("code"),
	CONSTRAINT "shipping_zone_fee_nonneg" CHECK ("shipping_zone"."shipping_fee_minor" >= 0),
	CONSTRAINT "shipping_zone_threshold_nonneg" CHECK ("shipping_zone"."free_shipping_threshold_minor" IS NULL OR "shipping_zone"."free_shipping_threshold_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shipping_zone_country" (
	"country_code" char(2) PRIMARY KEY NOT NULL,
	"zone_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"online_payment_enabled" boolean DEFAULT true NOT NULL,
	"offline_payment_enabled" boolean DEFAULT true NOT NULL,
	"offline_instructions_he" text,
	"offline_instructions_en" text,
	"pickup_instructions_he" text,
	"pickup_instructions_en" text,
	"shop_name_he" text NOT NULL,
	"shop_name_en" text,
	"business_name_he" text NOT NULL,
	"business_name_en" text,
	"business_reg_number" text NOT NULL,
	"business_email" text NOT NULL,
	"business_phone" text NOT NULL,
	"business_address_he" text NOT NULL,
	"business_address_en" text,
	"notification_emails" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_settings_single_row" CHECK ("shop_settings"."id" = 1),
	CONSTRAINT "shop_settings_payment_method" CHECK ("shop_settings"."online_payment_enabled" OR "shop_settings"."offline_payment_enabled"),
	CONSTRAINT "shop_settings_notification_emails" CHECK (cardinality("shop_settings"."notification_emails") BETWEEN 1 AND 3),
	CONSTRAINT "shop_settings_business_name_he" CHECK (char_length("shop_settings"."business_name_he") >= 1),
	CONSTRAINT "shop_settings_business_address_he" CHECK (char_length("shop_settings"."business_address_he") >= 1),
	CONSTRAINT "shop_settings_business_reg_number" CHECK (char_length("shop_settings"."business_reg_number") >= 1),
	CONSTRAINT "shop_settings_business_email" CHECK (char_length("shop_settings"."business_email") >= 1),
	CONSTRAINT "shop_settings_business_phone" CHECK (char_length("shop_settings"."business_phone") >= 1),
	CONSTRAINT "shop_settings_shop_name_he" CHECK (char_length("shop_settings"."shop_name_he") BETWEEN 1 AND 60),
	CONSTRAINT "shop_settings_shop_name_en" CHECK ("shop_settings"."shop_name_en" IS NULL OR char_length("shop_settings"."shop_name_en") <= 60)
);
--> statement-breakpoint
CREATE TABLE "admin_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"admin_id" uuid,
	"actor_kind" text NOT NULL,
	"actor_label" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "admin_activity_actor_kind" CHECK ("admin_activity"."actor_kind" IN ('admin','unapproved_account','system'))
);
--> statement-breakpoint
CREATE TABLE "admin_passkey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"credential_id" "bytea" NOT NULL,
	"public_key" "bytea" NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"device_label" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"status" "passkey_status" DEFAULT 'active' NOT NULL,
	"registered_via" "passkey_registered_via" NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_passkey_credential_id_unique" UNIQUE("credential_id"),
	CONSTRAINT "admin_passkey_device_label_len" CHECK (char_length("admin_passkey"."device_label") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "admin_recovery_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_session" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"stage" "session_stage" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent_summary" text DEFAULT '' NOT NULL,
	"webauthn_challenge" text,
	"recovery_verified_at" timestamp with time zone,
	"purpose" text,
	"ended_at" timestamp with time zone,
	"abandon_processed_at" timestamp with time zone,
	"reauth_at" timestamp with time zone,
	"next_path" text
);
--> statement-breakpoint
CREATE TABLE "admin_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"google_email" text NOT NULL,
	"google_sub" text,
	"setup_token_hash" "bytea",
	"setup_token_expires_at" timestamp with time zone,
	"passkey_fail_count" integer DEFAULT 0 NOT NULL,
	"passkey_blocked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_google_email_unique" UNIQUE("google_email"),
	CONSTRAINT "admin_user_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "admin_user_email_lower" CHECK ("admin_user"."google_email" = lower("admin_user"."google_email")),
	CONSTRAINT "admin_user_display_name_len" CHECK (char_length("admin_user"."display_name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "notification_throttle" (
	"kind" text PRIMARY KEY NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_flow" (
	"state_hash" "bytea" PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"purpose" "oauth_purpose" NOT NULL,
	"setup_token_hash" "bytea",
	"next_path" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_daily_page" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_daily_page_day_path_pk" PRIMARY KEY("day","path"),
	CONSTRAINT "analytics_page_views" CHECK ("analytics_daily_page"."views" >= 0)
);
--> statement-breakpoint
CREATE TABLE "analytics_daily_referrer" (
	"day" date NOT NULL,
	"referrer_host" text NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_daily_referrer_day_referrer_host_pk" PRIMARY KEY("day","referrer_host"),
	CONSTRAINT "analytics_referrer_visits" CHECK ("analytics_daily_referrer"."visits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "consent_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"choices" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_version" integer NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"to_address" text NOT NULL,
	"locale" "locale" NOT NULL,
	"subject" text NOT NULL,
	"reply_to" text,
	"html" text DEFAULT '' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"order_id" uuid,
	"dedupe_key" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"locked_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"job" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_result" text,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "option_group" ADD CONSTRAINT "option_group_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_value" ADD CONSTRAINT "option_value_group_id_option_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."option_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_admin_id_admin_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_id_shipping_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."shipping_zone"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_checkout" ADD CONSTRAINT "pending_checkout_zone_id_shipping_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."shipping_zone"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_checkout" ADD CONSTRAINT "pending_checkout_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_zone_country" ADD CONSTRAINT "shipping_zone_country_zone_id_shipping_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."shipping_zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_activity" ADD CONSTRAINT "admin_activity_admin_id_admin_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_passkey" ADD CONSTRAINT "admin_passkey_admin_id_admin_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_passkey" ADD CONSTRAINT "admin_passkey_approved_by_admin_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."admin_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_recovery_code" ADD CONSTRAINT "admin_recovery_code_admin_id_admin_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_admin_id_admin_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "option_group_product_idx" ON "option_group" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "option_value_group_idx" ON "option_value" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "product_category_idx" ON "product" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "product_state_idx" ON "product" USING btree ("state");--> statement-breakpoint
CREATE INDEX "product_image_product_idx" ON "product_image" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_event_order_idx" ON "order_event" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_line_order_idx" ON "order_line" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pending_checkout_expires_idx" ON "pending_checkout" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "pending_checkout_provider_page_idx" ON "pending_checkout" USING btree ("provider_page_id");--> statement-breakpoint
CREATE INDEX "shipping_zone_country_zone_idx" ON "shipping_zone_country" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "admin_activity_at_idx" ON "admin_activity" USING btree ("at");--> statement-breakpoint
CREATE INDEX "admin_passkey_admin_idx" ON "admin_passkey" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_recovery_code_admin_idx" ON "admin_recovery_code" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_session_admin_idx" ON "admin_session" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_session_expires_idx" ON "admin_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rate_limit_bucket_expires_idx" ON "rate_limit_bucket" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_outbox_order_idx" ON "email_outbox" USING btree ("order_id");