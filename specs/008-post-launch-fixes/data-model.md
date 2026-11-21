# Data model changes: Post-launch fixes (008)

The whole data model's source of truth stays the Drizzle schema in `src/server/db/schema/`. This
feature changes one column.

## `shop_settings.business_reg_number`

|                                               | Before (001/003)                                           | After (008)                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Type                                          | `text NOT NULL`                                            | `text NULL`                                                                                  |
| Check                                         | `shop_settings_business_reg_number`: `char_length >= 1`    | same name: `business_reg_number IS NULL OR char_length(business_reg_number) >= 1`            |
| Validation (`src/lib/validation/settings.ts`) | `required('businessRegNumber', 40)`                        | `optionalText('businessRegNumber', 40)`: trimmed; empty → `null`; max 40                     |
| Seed value                                    | `'000000000'` (`SEED_PLACEHOLDERS`)                        | unchanged (still listed by the admin home until replaced or cleared)                         |
| Shown on the website                          | footer, contact page, checkout seller line                 | **nowhere**                                                                                  |
| Shown in emails                               | seller block of order confirmation / cancellation / refund | same emails, only when "set" (below), label "מספר עוסק: {number}" / "Business no.: {number}" |

**"Set"** (spec FR-005): not `NULL`, not blank after trimming, not equal to
`SEED_PLACEHOLDERS.businessRegNumber`. One pure helper decides it (research R3).

**Migration** `src/server/db/migrations/0007_optional_business_number.sql` (generated with
`pnpm db:generate`, then checked by hand): drop the check, `ALTER COLUMN business_reg_number DROP
NOT NULL`, add the check back with the new condition. Forward-only and safe on the live row (the
existing `'000000000'` satisfies the new check). No data is rewritten.

**Purpose and retention** (constitution VII): unchanged from 001: the seller's identifying detail,
kept while the shop runs; it is the owner's own data, not a customer's.

## No other changes

- The business phone doubles as the WhatsApp number (no new field).
- The logo, favicon and preview image are build outputs in `public/` with a manifest in
  `src/lib/brand/` (contracts/brand-assets.md); nothing is stored in the database.
