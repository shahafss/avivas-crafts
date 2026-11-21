ALTER TABLE "shop_settings" DROP CONSTRAINT "shop_settings_business_reg_number";--> statement-breakpoint
ALTER TABLE "shop_settings" ALTER COLUMN "business_reg_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_business_reg_number" CHECK ("shop_settings"."business_reg_number" IS NULL OR char_length("shop_settings"."business_reg_number") >= 1);