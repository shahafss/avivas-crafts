# Implementation Plan: Privacy, Consent, Legal and Content Pages

**Branch**: `003-privacy-legal-pages` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-privacy-legal-pages/spec.md` (approved
2026-11-09, clarified FR-011 and at plan review). **Plan approved by the user 2026-11-09**
(Phase B gate, after review round 4).

## Summary

The shop gets its information and legal side: six content pages at `/{locale}/pages/{slug}` and
a Contact page at `/{locale}/contact` (the exact paths already linked from the header, product
page, checkout, order page and emails), rendered from owner-editable Markdown with Hebrew
fallback; supplied Hebrew and English drafts marked "requires legal review", loaded by the seed
without ever overwriting Aviva's edits; a full footer with the seller's business details; a
contact form that emails Aviva with the visitor as Reply-To; admin screens to edit the pages
(with a dated, append-only history of every Terms and Privacy Policy version, FR-011), to find a
customer by email or phone and export, withdraw marketing consent for, or anonymise them, and to
read cookieless visit statistics; daily retention tasks; a consent mechanism that is fully built
but dormant at launch; Data Security Regulations drafts; and the fix for the Terms checkbox whose
link stole taps on the English checkout.

Technical approach: one new table (`content_page_version`, migration `0002` with back-fill) and
no other schema change — every other column exists from 001. Markdown is rendered on the server
by `markdown-it` (installed) with HTML off, images off and an allow-list for links. The consent
registry is a pure module; whether consent is required is decided on the server from code plus
the test-only env switch, and the banner's code is only imported when it is. Statistics use 001
R10's first-party beacon and the existing aggregate tables. Customer tools are Server Actions
(search terms never reach a URL) over one data layer whose anonymisation is shared with the
7-year retention task. Details: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 (strict) on Node.js 24 LTS (unchanged)

**Primary Dependencies**: next 16, react 19, next-intl, drizzle-orm + postgres.js, zod,
markdown-it 15 (already a dependency, unused until now), libphonenumber-js, tailwindcss 4 — all
installed. **No new dependency.**

**Storage**: PostgreSQL 17. New table `content_page_version`; existing `content_page`,
`orders`, `pending_checkout`, `email_outbox`, `consent_record`, `analytics_daily_page`,
`analytics_daily_referrer`, `admin_activity`, `order_event`, `job_run`. Draft files in
`docs/legal-drafts/` read by the seed.

**Testing**: Vitest (unit; integration on PGlite), Playwright (storefront projects incl.
webkit-mobile, phone project for admin specs, the existing `consent` project), existing file-tree
access-control tests, i18n parity test, bundle-size spec.

**Target Platform**: Linux container on Render (single instance); storefront on phone browsers
first; admin on Aviva's Android phone.

**Project Type**: Web application (single full-stack Next.js project).

**Performance Goals**: storefront first-load JS stays ≤ 150 KB gzipped (the beacon is < 1 KB; the
banner is not loaded at launch); `/api/v` answers 204 after at most three small upserts (rate-limit bucket, page counter,
referrer counter);
customer search over a few thousand orders in well under a second (SC-001: a request fulfilled in
< 10 minutes).

**Constraints**: strict nonce CSP (no `style` attribute; no new script host); logical CSS only;
Hebrew RTL admin; WCAG 2.1 AA; 44 px targets; every string in `he.json`/`en.json`; no personal
data in URLs, logs, `admin_activity`, `order_event` or email subjects; only registry items on the
visitor's device.

**Scale/Scope**: 2 new public pages (one dynamic), 6 new admin pages, 8 Server Actions, 1 route
handler + 1 test-only route, 1 email template, 4 daily tasks, 1 migration, 14 draft files + 5
privacy documents, 1 shared UI fix (`Checkbox`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: still passes.*

| Principle | Status | How this plan meets it |
|---|---|---|
| I. Hebrew-first, bilingual | ✅ | Pages, footer, contact, banner, Cookie Policy table and emails in he/en (`common.footer`, `legal`, `consent`, `contact`, `emails.contact`); English content falls back to Hebrew with `lang="he" dir="auto"` (`pick()`, R3); drafts supplied in both languages; admin in Hebrew with English entries; parity test. Language switch itself stays in item 005. |
| II. Non-technical owner | ✅ | Markdown hidden behind four toolbar buttons and a preview (R6); plain Hebrew labels; "supplied draft / edited" badges; confirmation for withdrawal and anonymisation (with the open-order warning); phone-first admin layouts (storefront.md §12.5–§12.8). |
| III. Frictionless guest shopping | ✅ | No banner at launch; checkout unchanged except the Terms box now ticks reliably (FR-028); contact needs no account. |
| IV. Security by design (ASVS L2) | ✅ | See *Security* below. |
| V. Simplicity and low cost | ✅ | No dependency, service or paid tool; first-party statistics (001 R10); one small append-only table; drafts as files loaded by the existing seed; consent built from the existing env switch and CSP slot. Complexity Tracking: none. |
| VI. Tested critical paths | ✅ | Cookie consent behaviour (constitution VI names it) in `consent.spec.ts` + unit + integration; access control on every new admin page and action through the existing file-tree tests; checkout's Terms box in `checkout-terms.spec.ts`; customer tools, retention, statistics, contact and content in integration tests; E2E per story (R18). |
| VII. Privacy and legal (non-negotiable) | ✅ | Only strictly necessary storage before consent, registry-checked in E2E (SC-002); cookieless, identifier-free statistics; consent with equal choices, recorded and changeable; all seven pages in both languages with drafts marked for legal review; business details on every page; find/export/correct/withdraw/anonymise (FR-016–FR-019); retention automated (FR-026, FR-027); every personal-data use has purpose and retention (data-model.md register); processors listed in the Privacy Policy draft; DSR drafts. |

### Security (ASVS 5.0 L2 areas this feature touches)

- **Access control (V8)**: every new admin `page.tsx` and Server Action calls `requireAdmin()`
  first; the existing file-tree tests (`admin-actions-guard.test.ts`, `admin-access.spec.ts`) pick
  the new files up automatically. Export and anonymisation act only on `orderIds ∩ matches(q)`
  re-checked on the server (R8), and both are ⟳ passkey re-check actions (`requireRecentAuth()`,
  5 minutes, existing; the island uses the existing `useReauthGate()` from
  `src/components/admin/ReauthGate.tsx`).
- **Input validation (V1/V2)**: Zod on every action; lengths per data-model; email and phone with
  the checkout rules; the beacon validates path patterns, sizes and referrer hosts and ignores
  everything else; Drizzle parameterised queries only.
- **Output encoding / injection (V1)**: Markdown with `html: false`, no images, link allow-list,
  rendered only through `ui/Markdown` (R2); contact email values through `escapeHtml()`; React
  escaping elsewhere; nonce CSP unchanged, no new script host (the test script is same-origin and
  exists only under the test env, which production refuses).
- **CSRF (V3)**: Server Actions' same-origin check; admin cookie `SameSite=Strict`; the beacon
  `POST /api/v` ignores (still `204`) any request whose `Origin` is not `APP_ORIGIN`
  (`isSameOrigin()`, existing), and is rate-limited.
- **Abuse (V2, constitution IV)**: contact = honeypot + signed form age + 5/hour per IP-hash;
  beacon 60/min; consent saves 30/min; no third-party CAPTCHA (001 R11).
- **Data protection (V14)**: search terms only in POST bodies; export built on demand, never
  stored, `no-store` admin pages; contact bodies blanked after sending; anonymisation removes
  outbox copies too; `consent_record` and analytics hold no identifiers; client IP only as a
  daily-rotating HMAC (001 R17).
- **Logging (V16)**: new `admin_activity` actions carry only allow-listed counts, slugs and
  versions; nothing personal in logs.

## Project Structure

### Documentation (this feature)

```text
specs/003-privacy-legal-pages/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R18
├── data-model.md        # content_page_version + how existing tables are used; register changes
├── quickstart.md        # validation guide
├── contracts/
│   ├── server-actions.md   # submitContact, saveConsent, content, customer actions; export JSON
│   ├── routes.md           # public pages, admin pages, /api/v, /test-optional.js
│   ├── consent.md          # registry, config, ac_consent cookie, components
│   └── emails.md           # contact-message
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
docs/
├── design/storefront.md                     # CHANGED (see Design system updates)
├── legal-drafts/{7 slugs}.{he,en}.md        # NEW: supplied drafts (R7)
└── privacy/                                 # NEW: 5 DSR drafts (R17)

src/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx                       # CHANGED: StatsBeacon, ConsentRoot, nonce to footer/consent
│   │   └── (shop)/
│   │       ├── pages/[slug]/page.tsx        # NEW (§8.9)
│   │       ├── contact/page.tsx + actions.ts   # NEW (§8.10)
│   │       └── consent/actions.ts           # NEW: saveConsent
│   ├── admin/(protected)/
│   │   ├── content/page.tsx                 # NEW list (§12.5)
│   │   ├── content/[slug]/page.tsx + actions.ts           # NEW editor (§12.6)
│   │   ├── content/[slug]/versions/page.tsx               # NEW history
│   │   ├── content/[slug]/versions/[version]/page.tsx     # NEW one version
│   │   ├── customers/page.tsx + actions.ts  # NEW (§12.7)
│   │   ├── stats/page.tsx                   # NEW (§12.8)
│   │   └── orders/[id]/page.tsx             # CHANGED: links to accepted Terms/Privacy versions
│   ├── api/v/route.ts                       # NEW beacon
│   └── test-optional.js/route.ts            # NEW test-only script
├── components/
│   ├── ui/Checkbox.tsx                      # CHANGED: hit area on the box only (FR-028, R15)
│   ├── ui/Markdown.tsx                      # NEW: the one dangerouslySetInnerHTML
│   ├── shop/Footer.tsx                      # CHANGED: full footer (§7.20)
│   ├── shop/StorageTable.tsx                # NEW (§7.25)
│   ├── shop/ContactForm.tsx                 # NEW island
│   ├── shop/StatsBeacon.tsx                 # NEW island
│   ├── shop/ConsentRoot.tsx (server), ConsentLoader.tsx, ConsentBanner.tsx, ConsentGate.tsx,
│   │   CookieSettingsButton.tsx               # NEW (§7.21, contracts/consent.md)
│   ├── admin/SettingsManager.tsx            # CHANGED: comment only (instructions stay plain text, R1)
│   ├── admin/MarkdownEditor.tsx             # NEW island
│   ├── admin/CustomerSearch.tsx             # NEW island
│   ├── admin/OrderBadgesClient.tsx          # NEW client badges
│   ├── admin/order-badge-looks.ts           # NEW: badge looks shared by server and client badges
│   └── admin/StatsChart.tsx                 # NEW server (SVG + table)
├── lib/
│   ├── consent/registry.ts                  # NEW (pure)
│   ├── analytics/normalise-path.ts          # NEW (pure)
│   └── format-date.ts                       # CHANGED: `isoDateInIsrael()`
├── server/
│   ├── db/schema/commerce.ts                # CHANGED: contentPageVersion
│   ├── db/migrations/0002_*.sql (+ meta)    # NEW
│   ├── db/seed.ts                           # CHANGED: loadDrafts via contentDir
│   ├── content/{markdown,pages,drafts,versions,slugs}.ts   # NEW
│   ├── email/sender.ts                      # CHANGED: `failed` rows stamp `next_attempt_at` (R11)
│   ├── orders/admin-orders.ts               # CHANGED: system attribution of `anonymized` events
│   ├── contact/submit.ts                    # NEW
│   ├── consent/{config,consent}.ts          # NEW
│   ├── privacy/{customers,export,consent,anonymize,retention}.ts   # NEW
│   ├── analytics/{beacon,stats}.ts          # NEW
│   ├── email/templates/contact-message.ts   # NEW
│   └── jobs/daily-maintenance.ts            # CHANGED: four retention tasks
└── i18n/messages/{he,en}.json               # CHANGED (R16)

scripts/seed.ts                               # CHANGED: passes contentDir
playwright.config.ts                          # CHANGED: `contact` added to STOREFRONT_SPECS

tests/
├── unit/{consent-registry,markdown,normalise-path,consent-cookie}.test.ts   # NEW
├── integration/{content-pages,contact,privacy-customers,retention,analytics,consent}.test.ts  # NEW
├── integration/seed.test.ts                 # CHANGED (drafts)
├── integration/{outbox,admin-orders,jobs}.test.ts   # CHANGED (give-up stamp, attribution, tasks)
├── unit/format-date.test.ts                 # CHANGED (isoDateInIsrael)
├── e2e/bundle-size.spec.ts                  # CHANGED (new routes)
├── integration/schema.test.ts               # CHANGED if it lists tables
└── e2e/{privacy,consent,contact,checkout-terms,admin-privacy,admin-content,admin-stats}.spec.ts  # NEW
```

**Structure Decision**: the existing single Next.js project. Feature data access lives in new
`src/server/{content,contact,consent,privacy,analytics}/` folders; Server Actions are thin
wrappers in the route folders as in 001/002. No new Playwright project, so
`.github/workflows/ci.yml` needs no matrix change; `consent.spec.ts` runs in the existing
`consent` project (already in the `chromium-desktop` CI job).

## Design system updates (`docs/design/storefront.md`, in this branch)

Written first (task T001), cited by later tasks. Never run prettier on the file.

- **Header note**: "Amended 2026-11-09 by `003-privacy-legal-pages`": content, contact, consent,
  Checkbox, and admin §12.5–§12.8.
- **§7.10 Checkbox**: the input's hit area is a 44×44 square centred on the 24 px box; the label
  text toggles through `<label for>`; links inside the label are normal links, not lifted
  (R15). Replaces "the whole label row is the target".
- **§7.20 Footer**: business column exactly as written; the bottom-row language switch is marked
  "added by roadmap item 005"; "Cookie settings" is a button that opens the consent dialog.
- **§7.21 Consent**: replace "loaded with `next/dynamic`" by the loader of contracts/consent.md:
  the server `ConsentRoot` renders nothing at launch; when consent is required it renders the
  client `ConsentLoader`, which imports `ConsentBanner` and `ConsentGate` with `React.lazy` +
  `Suspense` (a Server Component's dynamic import does not code-split in Next.js 16, and
  `next/dynamic`'s runtime would break the product route's budget); the footer button and the
  `ac:consent-settings` event; pinned test ids; nothing optional loads while a new Cookie Policy
  version awaits a choice.
- **§7.24 Prose / new `ui/Markdown`**: Markdown output only through `ui/Markdown` inside `Prose`;
  `#` renders as h2.
- **§7.25 StorageTable**: admin-scope rows after public rows, labelled "באזור הניהול בלבד".
- **§8.9 Content pages**: `contact` slug is not served here; Hebrew fallback marking.
- **§8.10 Contact**: generic "please reload" Notice for an expired form; the rate-limit Notice
  says "נסו שוב בעוד {minutes} דקות" (user decision Q3).
- **§10 Performance budget**: the island list adds `ConsentLoader`, `ConsentGate` and
  `CookieSettingsButton` (consent ones only when consent is required).
- **§9 States matrix**: rows for content pages (unknown slug → 404), admin content, customers
  (no results; stale), statistics (no data → "עוד אין נתונים").
- **§12.3 Order page**: a new block **8a. "הסכמות"** after block 8 (Payment), not shown today:
  "אישור התקנון: {date and time}" with "תקנון גרסה {n}" and "מדיניות פרטיות גרסה {n}" (plain
  text in US3, links to `/admin/content/{terms|privacy}/versions/{n}` from US4); marketing
  consent as one line: "דיוור: אושר ב-{date}" / "דיוור: אושר ב-{date}, בוטל ב-{date}" / "דיוור: לא
  אושר"; on an anonymised order the marketing line reads "דיוור: —" (the columns are cleared) while
  the Terms line stays. Block 11 (History) gains the `anonymized` entry "פרטי הלקוח נמחקו", shown
  as "המערכת" only for the 7-year task's events (`data.system = true`).
- **§12.5 Content list** (new): card list (white `rounded-card`, `line` border), each: title,
  badge "טיוטה שסופקה עם האתר" (`sun-soft`) or "נערך" (`panel` + `field` border), "עודכן {date}",
  whole card a link; Terms/Privacy add a quiet "גרסאות קודמות" link.
- **§12.6 Content editor and versions** (new): h1 page title; tabs "עברית" / "English" (44 px,
  `role="tablist"`); title `TextField`; toolbar row of four text-labelled `secondary`
  `Button`s, size small but 44 px tall (כותרת, מודגש, רשימה, קישור; no icons — the icon set has
  none for these and words are clearer for Aviva); body `TextArea` 16 rows, `dir` per tab; "תצוגה מקדימה"
  secondary toggle showing a `Prose` panel on `ground`; sticky bottom bar on phones with primary
  "שמירה"; stale → `alert` Notice with "לטעון מחדש". Versions: `<ol>` newest first "גרסה {n} ·
  {date}", each a link; one version renders title + `Prose` with a header line "גרסה {n}, בתוקף
  מ-{date}".
- **§12.7 Customers** (new): h1 "לקוחות"; one-line explanation; search `TextField` ("מייל או
  טלפון", `dir="ltr"`, `inputmode="email"` off) + primary "חיפוש"; result: summary line ("נמצאו 2
  הזמנות, 1 תשלום שלא הושלם, 5 מיילים"), order cards like §12.2 without the customer name; a line "פרטים נוספים שהופיעו בהזמנות
  האלה:" listing the other emails and phones (each a quiet button that searches it); when
  checkouts were left to expire, an `info` Notice after anonymising: "לא נמחקו {count} תשלומים שעדיין בתהליך. הם יימחקו אוטומטית תוך 48 שעות (או 30 יום אם יש פער בסכום). אם הלקוח ישלים תשלום, תופיע הזמנה חדשה עם הפרטים שלו, ולכן כדאי לחפש שוב בעוד שלושה ימים." / "{count} payments still in progress were not erased. They are deleted automatically within 48 hours (or 30 days if the amount did not match). If the customer completes a payment, a new order with their details will appear, so search again in 3 days."; action
  row: secondary "הורדת הנתונים", secondary "הפסקת דיוור" (only when any order has consent), and a
  secondary "מחיקת הפרטים" (existing variants only; no new danger style) opening `ConfirmDialog` (when the search found no orders, only stored emails, the anonymise body
  reads "המיילים השמורים של הלקוח יימחקו. אי אפשר לבטל את הפעולה." / "The customer's stored emails
  will be erased. This cannot be undone."). Dialog texts (Hebrew / English):
  - Withdraw: title "להפסיק דיוור ללקוח?" / "Stop marketing emails to this customer?"; body "הלקוח
    לא יקבל מהחנות מיילים שיווקיים. ההזמנות נשארות כמו שהן, ותאריך ההסכמה המקורי נשמר." / "The
    customer will get no marketing emails from the shop. The orders stay as they are, and the
    original consent date is kept."; confirm "הפסקת דיוור" / "Stop marketing emails".
  - Anonymise: title "למחוק את פרטי הלקוח?" / "Erase this customer's details?"; body "השם, הטלפון,
    המייל והכתובת יימחקו מ-{count} הזמנות. ההזמנות עצמן (סכומים ופריטים) נשמרות לצורכי מס. אי
    אפשר לבטל את הפעולה." / "Name, phone, email and address will be erased from {count} orders.
    The orders themselves (amounts and items) are kept for tax records. This cannot be undone.";
    when an order is open, an `attention` line "יש כאן הזמנה שעוד לא הושלמה. אחרי המחיקה לא תוכלי
    ליצור קשר עם הלקוח לגביה." / "One of these orders is still open. After erasing, you won't be
    able to contact the customer about it."; confirm "מחיקת הפרטים" / "Erase details". No results → `EmptyState` "לא נמצאו לקוחות".
- **§12.8 Statistics** (new): h1 "סטטיסטיקה"; period `ChipRow` 7/30/90 days; "ביקורים ביום" bar
  chart (SVG, bars `ink`, today `sun`, axis labels 13 `ink-2`, `role="img"` with an `aria-label`
  summary) + `Disclosure` "הצגה כטבלה"; two ranked lists "המוצרים הנצפים ביותר" and "מאיפה הגיעו"
  (`(direct)` shown as "כניסה ישירה"); empty → `EmptyState` "עוד אין נתונים".

## Old spec 001 tasks T100–T118 (starting material)

| 001 task | Carries over | Changed / dropped |
|---|---|---|
| T100 registry test | as planned | `itemsFor(config)` replaces a bare `consentRequired()` check |
| T101 privacy E2E | storage/network allow-list, counted visit via DB, footer, he/en pages, cookie table | **dropped**: `language.spec.ts`/`PUBLIC_ROUTES` (item 005) |
| T102 consent E2E | as planned | footer control is a button; re-ask on policy version added |
| T103 customer tools test | search, export, withdraw, anonymise rules | `{q, orderIds}` intersection (R8); `customer.searched` activity (spec FR-019a) |
| T104 retention test | 7 y / 2 y / 2 y / 30 d | failed outbox rows 30 d after the final failure, stamped by the sender in `next_attempt_at` (R11) |
| T105 analytics test | as planned | — |
| T106 content/contact test | renderer, version, fallback, contact rules | split into `markdown` unit + `content-pages` + `contact` integration; history rows (FR-011) |
| T107 admin E2E | as planned | split into `admin-privacy` and `admin-content`; versions page added |
| T108 registry | as planned | config split into server-only `src/server/consent/config.ts` |
| T109 banner + gate + saveConsent + test script | as planned | `ConsentRoot` wrapper; cookie expiry on reject; rate limit |
| T110 Markdown + pages | as planned | `default` preset with rules disabled (R2); same-site paths allowed; `expectedVersion` |
| T111 public pages + admin editor | as planned | **dropped**: `alternates()` / `src/lib/seo.ts` (item 005), offline/pickup Markdown (R1); **added**: versions pages, order-page links |
| T112 drafts + seed | as planned | drafts at `docs/legal-drafts/` (unchanged path); history rows for terms/privacy |
| T113 footer | as planned | **dropped**: language switch (item 005) |
| T114 contact | as planned | **dropped**: `language.spec.ts` entry |
| T115/T116 customer data layer + screen | as planned | Server Action export instead of a download route (R9) |
| T117 statistics | as planned | — |
| T118 DSR drafts | as planned | — |
| (new) | — | FR-028 Checkbox fix; FR-011 `content_page_version` + migration |

## Risks and notes

- **Legal review**: every legal text and DSR document is a draft; the visible notice stays until
  the reviewed text replaces it (item 006 launch checklist). The drafts flag points the reviewer
  must decide (made-to-order cancellation exception, fee cap, accessibility coordinator, whether
  Render routes traffic through Cloudflare).
- **Checkbox is shared**: the fix changes every `Checkbox` (checkout marketing box, admin forms).
  Existing E2E specs that `check()` boxes keep working because `check()` targets the input, now
  at the box. Visual change: none.
- **Seed on deploy reads files**: a missing draft fails the deploy seed loudly by design (R7).
  No deploy configuration exists yet: item 006's launch checklist must include "the deploy seed
  can read `docs/legal-drafts`".
- **Policy version re-ask**: any Cookie Policy save (even a typo fix) asks visitors again — only
  when consent is required, i.e. never at launch.
- **Back-fill**: production has no orders yet; the back-fill makes existing dev/test data
  consistent and costs nothing.
- **`NEXT_LOCALE`** stays in the registry although only item 005 writes it (contract); the E2E
  allow-list tolerates its absence.
- **Statistics accuracy**: bots without a known user agent and visitors blocking scripts are
  miscounted; acceptable for "basic statistics" (001 FR-037).
- At the end of the feature, update 003's status in `docs/roadmap.md` (Phase D).

## Decisions from plan review (user, 2026-11-09)

Recorded in spec.md › Clarifications; the artifacts below follow them.

- **Q1. Anonymising during a payment** (extended in round 3): **no unfinished checkout is
  deleted** — every one that still holds personal data (`awaiting_provider`, `failed`, `mismatch`)
  can still become a real payment, so it is left to expire (48 h / 30 days) with its
  `payment-mismatch` owner email; the result tells Aviva how many (research R10).
- **Q6. A kept checkout paid after erasing** (round 3): Aviva is warned, not protected
  automatically: the notice says a new order with the customer's details will appear if such a
  payment completes, and to search again in 3 days. No change to payment confirmation.
- **Q7. Passkey re-check** (plan gate): `exportCustomer` and `anonymizeCustomer` ask for the
  passkey again unless it was confirmed in the last 5 minutes (FR-019a). Search and marketing
  withdrawal do not.
- **Q2. After a Cookie Policy change**: **nothing optional loads** until the visitor chooses again
  (research R5).
- **Q3. Contact limit**: **only messages actually sent** count, 5 per clock hour per visitor; the
  refusal says how many minutes to wait (research R13).
- **Q4. FR-003** amended: headings, bold, italic, lists, line breaks, written-out web addresses as
  links, and links to the shop's own pages are allowed (research R2).
- **Q5. Anonymisation reach**: only the orders shown and what the searched email or phone finds;
  the result lists the other emails and phones used on those orders so Aviva can search them
  (research R8, R10; SC-007 reworded).

## Complexity Tracking

None. No constitution violations to justify.
