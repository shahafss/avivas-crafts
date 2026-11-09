-- Drizzle's schema builder cannot declare DEFERRABLE, so these two constraints live here.
ALTER TABLE "category" ADD CONSTRAINT "category_sort_order_unique" UNIQUE ("sort_order") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_product_position_unique" UNIQUE ("product_id", "position") DEFERRABLE INITIALLY DEFERRED;
