CREATE TABLE "content_page_version" (
	"slug" text NOT NULL,
	"version" integer NOT NULL,
	"title_he" text NOT NULL,
	"title_en" text,
	"body_he" text NOT NULL,
	"body_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_page_version_slug_version_pk" PRIMARY KEY("slug","version"),
	CONSTRAINT "content_page_version_slug" CHECK ("content_page_version"."slug" IN ('terms','privacy')),
	CONSTRAINT "content_page_version_version" CHECK ("content_page_version"."version" >= 1),
	CONSTRAINT "content_page_version_body_he_len" CHECK (char_length("content_page_version"."body_he") <= 50000),
	CONSTRAINT "content_page_version_body_en_len" CHECK ("content_page_version"."body_en" IS NULL OR char_length("content_page_version"."body_en") <= 50000)
);
--> statement-breakpoint
ALTER TABLE "content_page_version" ADD CONSTRAINT "content_page_version_slug_content_page_slug_fk" FOREIGN KEY ("slug") REFERENCES "public"."content_page"("slug") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Back-fill: the current Terms and Privacy Policy become version rows (fresh databases have none; the seed writes them).
INSERT INTO "content_page_version" ("slug", "version", "title_he", "title_en", "body_he", "body_en", "created_at") SELECT "slug", "version", "title_he", "title_en", "body_he", "body_en", "updated_at" FROM "content_page" WHERE "slug" IN ('terms','privacy') ON CONFLICT DO NOTHING;
