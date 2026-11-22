-- 010 (spec decision 5, FR-002): one-time rename of the live products' addresses to the owner's
-- chosen ones. A product that does not exist changes nothing (dev, test and fresh databases), and a
-- rename whose new address is already used by another product is skipped, so a second run is a no-op.
UPDATE product SET slug = 'baby-rattle', updated_at = now() WHERE slug = 'p-35xmobci' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'baby-rattle');
--> statement-breakpoint
UPDATE product SET slug = 'stylish-bunny', updated_at = now() WHERE slug = 'p-7ow5r4uj' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'stylish-bunny');
--> statement-breakpoint
UPDATE product SET slug = 'kofiko-monkey', updated_at = now() WHERE slug = 'p-d6gehfh3' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'kofiko-monkey');
--> statement-breakpoint
UPDATE product SET slug = 'little-elephant', updated_at = now() WHERE slug = 'p-dcqsjfs2' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'little-elephant');
--> statement-breakpoint
UPDATE product SET slug = 'little-bunny', updated_at = now() WHERE slug = 'p-gif5m2wz' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'little-bunny');
--> statement-breakpoint
UPDATE product SET slug = 'kitten', updated_at = now() WHERE slug = 'p-hic726te' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'kitten');
--> statement-breakpoint
UPDATE product SET slug = 'hug-bunny', updated_at = now() WHERE slug = 'p-ioidqaly' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'hug-bunny');
--> statement-breakpoint
UPDATE product SET slug = 'teddy-bear', updated_at = now() WHERE slug = 'p-k2xzyog3' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'teddy-bear');
--> statement-breakpoint
UPDATE product SET slug = 'boy-doll', updated_at = now() WHERE slug = 'p-kqjqza24' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'boy-doll');
--> statement-breakpoint
UPDATE product SET slug = 'giraffe', updated_at = now() WHERE slug = 'p-kxltwwpj' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'giraffe');
--> statement-breakpoint
UPDATE product SET slug = 'boy-doll-2', updated_at = now() WHERE slug = 'p-suzy3jpe' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'boy-doll-2');
--> statement-breakpoint
UPDATE product SET slug = 'sheep', updated_at = now() WHERE slug = 'p-vjvwbxzx' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'sheep');
--> statement-breakpoint
UPDATE product SET slug = 'stylist-bunny', updated_at = now() WHERE slug = 'p-wuxbxcnn' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'stylist-bunny');
--> statement-breakpoint
UPDATE product SET slug = 'little-teddy', updated_at = now() WHERE slug = 'p-zykmhn5l' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'little-teddy');
--> statement-breakpoint
UPDATE product SET slug = 'teddy-girl', updated_at = now() WHERE slug = 'teddy-bear-in-a-dress' AND NOT EXISTS (SELECT 1 FROM product WHERE slug = 'teddy-girl');
