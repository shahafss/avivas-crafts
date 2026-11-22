ALTER TABLE "product" DROP CONSTRAINT "product_slug_format";--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "slug" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_slug_when_public" CHECK ("product"."state" = 'draft' OR "product"."slug" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_slug_format" CHECK ("product"."slug" IS NULL OR "product"."slug" ~ '^[a-z0-9-]{1,60}$');