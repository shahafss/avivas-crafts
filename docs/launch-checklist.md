# Launch checklist: Aviva's Crafts

Do these steps in order. Everything that lives in the repository is already built; what is left is
accounts, DNS, secrets and checks that only the owner can do. Each step has **Where** (the screen
or command), **Do**, and **Check** (how to see that it worked). Tick a step only after its Check
passes.

The shop launches with **offline payment only** (bank transfer, Bit, PayBox, cash on pickup). Card
payment is not a launch step; see **Later** at the end.

Names used below come from `render.yaml`: web service `avivas-crafts`, cron job
`avivas-crafts-backup`, database `avivas-crafts-db`, all in Frankfurt.

## 0. `<shop domain>` fill-in table

There is no domain yet. Wherever this checklist, the roadmap or a script says `<shop domain>`,
use the real domain once it is bought (step 1). Fill in this table first, then copy the values.

| Where it is needed                                       | Value to use                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Render web service, `APP_ORIGIN`                         | `https://<shop domain>` with **no trailing slash and no path** (the app refuses to start otherwise). **Set it before the first build**: it is fixed into the build (CSP, allowed origin, HSTS). A later change needs **Save, rebuild, and deploy**, not a restart. |
| Render web service, `IMAGE_PUBLIC_ORIGIN`                | `https://img.<shop domain>` (no trailing slash, no path, same reason)                                                                                                                                                                                              |
| Render web service, `EMAIL_FROM`                         | `<shop name> <orders@<shop domain>>` (an address on the domain verified in Resend)                                                                                                                                                                                 |
| Google OAuth client, authorised redirect URI             | `https://<shop domain>/api/auth/google/callback` (source: `docs/roadmap.md` > 006, which gives the same address)                                                                                                                                                   |
| Resend, sending domain                                   | `<shop domain>`                                                                                                                                                                                                                                                    |
| Cloudflare R2, custom domain of the public images bucket | `img.<shop domain>`                                                                                                                                                                                                                                                |
| Cloudflare DNS                                           | the shop domain (DNS only) and `img.<shop domain>`                                                                                                                                                                                                                 |
| `scripts/zap-baseline.sh`                                | `https://<shop domain>/he` (the script's usage comment shows the same example; nothing to fill in the file)                                                                                                                                                        |
| The post-deploy checks in section 15                     | every `curl` line uses `<shop domain>`                                                                                                                                                                                                                             |

Files that mention the placeholder as a rule or an example, with nothing to fill in:
`render.yaml` (header comment: no `<shop domain>` value ever goes in that file) and
`tests/unit/render-blueprint.test.ts` (the test that enforces that rule).

## 1. Domain

1. **Where**: a domain registrar (for example the one for a `.co.il` or `.com` name).
   **Do**: buy the domain. Decide the final name before anything else: Google, Resend, Render and
   Cloudflare all hold it. **Check**: you can open the registrar's DNS or nameserver settings for it.
2. **Where**: the registrar's nameserver settings.
   **Do**: point the domain's nameservers to Cloudflare (Cloudflare gives the two names when you
   add the site in step 4.1: **do step 4.1 first** to get the two names, then come back here).
   **Check**: `dig NS <shop domain> +short` lists two `*.ns.cloudflare.com`
   names (can take up to a day).

## 2. Two-step verification on every account

1. **Where**: Render, Cloudflare, GitHub and Resend, each under account or security settings.
   **Do**: turn on 2FA (an authenticator app, not SMS, where offered). Do it for every person who
   has access to the account. **Check**: signing out and in again asks for the second factor on
   each of the four.
2. **Where**: myaccount.google.com > Security, on **both** admins' Google accounts (Aviva's and
   the second admin's).
   **Do**: turn on 2-Step Verification. The shop cannot enforce it or see it (threat model, residual
   risk R1), so this step is the only protection. **Check**: the page shows "2-Step Verification:
   On" for each account.

## 3. GitHub repository connected to Render

1. **Where**: GitHub > the shop's repository, and render.com > Account settings > GitHub.
   **Do**: make sure the repository is on GitHub, the default branch for production is `main`, and
   CI (`.github/workflows/ci.yml`) is green on `main`. In Render, connect your GitHub account and
   give it access to this repository only. **Check**: Render lists the repository when you choose
   New > Blueprint (step 10).

## 4. Cloudflare DNS

1. **Where**: dash.cloudflare.com > Add a site.
   **Do**: add `<shop domain>` on the Free plan, and follow the steps until Cloudflare shows
   its two nameservers. Then do step 1.2 with them (step 1.2 needs these two names, so this step
   comes first). **Check**: the site shows "Active".
2. **Where**: Cloudflare > the domain > DNS > Records (the records themselves are added in step
   11, once Render shows the target).
   **Do**: for the shop domain, every record must be **DNS only** (grey cloud), **not proxied**.
   The shop runs with `TRUSTED_PROXY_HOPS=1`, which counts only Render's own hop; a proxied
   record would add a second hop and break IP-based rate limits (and needs research R19 and the
   Privacy Policy first, see **Later**). **Check**: after step 11, Cloudflare > DNS > Records shows
   Proxy status **DNS only** (grey cloud) for the shop-domain record.

## 5. R2 buckets and the three tokens

1. **Where**: Cloudflare > R2 object storage > Create bucket.
   **Do**: create three buckets in the **EU jurisdiction**: `ac-images-private`,
   `ac-images-public` and `ac-backups` (names are examples; use the same names in the Render
   variables). **Check**: each bucket's Settings page shows Jurisdiction: European Union.
2. **Where**: R2 > Manage API tokens > Create API token (S3 credentials). Make three tokens:

   | Token         | Permission            | Buckets                                         | Goes to (Render)                                                   |
   | ------------- | --------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
   | app           | Object Read and Write | `ac-images-private` and `ac-images-public` only | web service: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`            |
   | backup        | Object Read and Write | `ac-backups` only                               | cron job: `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` |
   | backup images | Object Read           | `ac-images-private` and `ac-images-public` only | cron job: `IMAGES_R2_ACCESS_KEY_ID`, `IMAGES_R2_SECRET_ACCESS_KEY` |

   Also note the **account ID** (R2 overview page): it is `R2_ACCOUNT_ID` on both services.
   **Do**: copy each token's two values into a password manager right away; the secret is shown once.
   **Check**: each token's page lists exactly the buckets above. None has "All buckets" or Admin.

3. **Where**: `ac-backups` > Settings > Object lifecycle rules (`ops/backup/README.md` > One-time setup, 4).
   **Do**: prefix `db/daily/`: delete after 30 days; prefix `db/monthly/`: delete after 365 days;
   nothing on `images/` or `images-public/`. **Check**: the rules list shows those two rules only.

## 6. Image domain and the `nosniff` rule

1. **Where**: R2 > `ac-images-public` > Settings > Custom domains.
   **Do**: connect `img.<shop domain>` (Cloudflare adds the DNS record). Do not turn on the
   public `r2.dev` URL. **Check**: the domain's status is "Active".
2. **Where**: Cloudflare > the domain > Rules > Transform Rules > Modify Response Header.
   **Do**: create a rule for hostname `img.<shop domain>` that **sets** the header
   `X-Content-Type-Options` to `nosniff`. **Check** (after the first photo is published, section
   15; before that, upload any test file): `curl -sI https://img.<shop domain>/<public image>`
   (`<public image>` is the photo's path: on a product page, long-press or right-click the photo >
   Copy image address, and keep the part after `https://img.<shop domain>/`)
   shows `x-content-type-options: nosniff` and `content-type: image/webp`.

## 7. Resend (email)

1. **Where**: resend.com > Domains > Add domain, then your DNS in Cloudflare.
   **Do**: add `<shop domain>` (region EU, Ireland or Frankfurt). Add the SPF, DKIM and DMARC records Resend lists to Cloudflare DNS (as DNS only). A DMARC record
   such as `v=DMARC1; p=none; rua=mailto:<owner email>` is enough to start. **Check**: the domain
   shows "Verified" in Resend, and `dig TXT _dmarc.<shop domain> +short` returns the DMARC record.
2. **Where**: Resend > API Keys.
   **Do**: create a key with "Sending access" for this domain only. This is `RESEND_API_KEY`.
   **Check**: it is shown in the list, and you have it in your password manager.

## 8. Google OAuth client (admin sign-in)

Source: `docs/roadmap.md` > 006 > Google OAuth client.

1. **Where**: console.cloud.google.com.
   **Do**: create a project. Under APIs & Services > OAuth consent screen: user type **External**,
   publishing status **Testing**, **test users = the two admins' Gmail addresses**, basic scopes
   only (`openid`, `email`). **Check**: the consent screen says "Testing", and lists
   exactly the two test users.
2. **Where**: APIs & Services > Credentials > Create credentials > OAuth client ID.
   **Do**: type "Web application"; authorised redirect URI exactly
   `https://<shop domain>/api/auth/google/callback` (add
   `http://localhost:3001/api/auth/google/callback` only if you want to try it locally).
   Copy the client ID and secret: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   **Check**: the redirect URI in the list has no trailing slash and matches step 11's domain.

## 9. Backup key pair

Source: `ops/backup/README.md` > One-time setup, 1.

1. **Where**: your own computer (`brew install age`).
   **Do**: `age-keygen -o backup-key.txt`. Put **only the `age1…` public key** in Render as
   `BACKUP_AGE_RECIPIENT`. Keep `backup-key.txt` offline in two separate places (for example a USB
   stick at home and a copy with a family member); it never goes to Render, GitHub or email.
   **Check**: `grep -c "AGE-SECRET-KEY" backup-key.txt` prints `1`, and the two copies exist.

## 10. Render Blueprint and secrets

1. **Where**: render.com > New > Blueprint > pick the repository, branch `main`.
   **Do**: Render reads `render.yaml` and lists the web service, the cron job and the database,
   all in Frankfurt. Fill in every `sync: false` value now. **`APP_ORIGIN` must be set before the
   first build** (it is fixed into the build; later you need **Save, rebuild, and deploy**, not a
   restart). **Check**: the Blueprint page shows three resources and no empty required value.

   Web service `avivas-crafts`:

   | Key                                        | Value                                                    |
   | ------------------------------------------ | -------------------------------------------------------- |
   | `APP_ORIGIN`                               | `https://<shop domain>` (no trailing slash, no path)     |
   | `IMAGE_PUBLIC_ORIGIN`                      | `https://img.<shop domain>` (no trailing slash, no path) |
   | `EMAIL_FROM`                               | `<shop name> <orders@<shop domain>>`                     |
   | `R2_ACCOUNT_ID`                            | the account ID (step 5.2)                                |
   | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | the **app** token                                        |
   | `R2_BUCKET_PRIVATE`, `R2_BUCKET_PUBLIC`    | `ac-images-private`, `ac-images-public`                  |
   | `RESEND_API_KEY`                           | step 7.2                                                 |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | step 8.2                                                 |

   Already written in the blueprint, do not change: `APP_ENV=production`, `STORAGE_DRIVER=r2`,
   `EMAIL_DRIVER=resend`, `PAYMENT_PROVIDER=none`, `R2_JURISDICTION=eu`, `TRUSTED_PROXY_HOPS=1`,
   `OIDC_ISSUER=https://accounts.google.com`, `DATABASE_URL` (from the database), `SECRET_HMAC_KEY`
   (generated).

   Cron job `avivas-crafts-backup`:

   | Key                                                      | Value                                   |
   | -------------------------------------------------------- | --------------------------------------- |
   | `BACKUP_AGE_RECIPIENT`                                   | the `age1…` public key (step 9)         |
   | `R2_ACCOUNT_ID`                                          | the account ID                          |
   | `BACKUP_BUCKET`                                          | `ac-backups`                            |
   | `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` | the **backup** token                    |
   | `IMAGES_BUCKET_PRIVATE`, `IMAGES_BUCKET_PUBLIC`          | `ac-images-private`, `ac-images-public` |
   | `IMAGES_R2_ACCESS_KEY_ID`, `IMAGES_R2_SECRET_ACCESS_KEY` | the **backup images** token             |

   Do not set `CONSENT_TEST_CATEGORY`, `LOCAL_DATA_DIR` or any card-provider variable.

2. **Where**: Render > Account Settings > Notifications (and the cron job's own page).
   **Do**: turn on failure emails for the cron job `avivas-crafts-backup` (workspace owner).
   **Check**: the cron job's notification setting reads "Failed" or "All" and your email is the
   recipient.
3. **Where**: Render > `avivas-crafts` > Settings, and the Blueprint page.
   **Do**: if Render rejects a field name in `render.yaml`, fix the file in the repository and
   sync the Blueprint again before the first deploy. **Check**: the Blueprint shows "Synced".

## 11. First deploy

1. **Where**: GitHub Actions, then Render > `avivas-crafts` > Events.
   **Do**: merge to `main`. Wait for CI to turn green on `main` (Render deploys only after checks
   pass, `autoDeployTrigger: checksPass`). **Record the time from CI turning green on `main` to the
   new version being live**: the target is under 15 minutes (spec SC-001). Write it here:
   `____ minutes`. **Check**: the deploy event says "Live", and
   `curl -s https://<service>.onrender.com/api/health` prints `{"ok":true}` (the health check
   Render uses, `healthCheckPath: /api/health`). `<service>.onrender.com` is the address shown at
   the top of the `avivas-crafts` service page in Render. To see only the status code:
   `curl -s -o /dev/null -w '%{http_code}\n' https://<service>.onrender.com/api/health` prints `200`.
2. **The pre-deploy migration.** **Where**: Render > `avivas-crafts` > Events > the deploy's log.
   **Do**: read the pre-deploy step (`pnpm db:migrate && pnpm db:seed`). It connects to the
   internal Postgres with `ssl: 'require'` (`scripts/migrate.ts`). If it fails on SSL, **stop and
   ask for the follow-up code change**: this was an accepted risk (clarified 2026-11-14), not a
   mistake in your setup. **Check**: the log shows "Migrations applied" and the seed finishing.
3. **Where**: Render > `avivas-crafts` > Settings > Custom Domains, then Cloudflare DNS.
   **Do**: add `<shop domain>` (and `www` if you want it); add the DNS record Render shows
   (CNAME or A) in Cloudflare as **DNS only**; wait for Render's certificate. **Check**:
   `curl -sI https://<shop domain>/he` returns `200` and `strict-transport-security`.

## 12. The two admins

1. **Where**: Render > `avivas-crafts` > Shell.
   **Do**: for **each** admin, run `pnpm admin:role <gmail> admin`. (To give a display name:
   `pnpm admin:role <gmail> admin "Aviva"`.) **Check**: the command prints "Created: … now has
   role admin." (or "Updated"), and each admin can sign in at `https://<shop domain>/admin/sign-in`
   with "כניסה עם Google" and lands on the dashboard.
2. **If an admin loses a phone** (or a Google account may be taken over). **Where**: the same
   Render shell. **Do**: run
   `pnpm admin:role <gmail> user`, which removes the role and **deletes that user's sessions**, then
   secure the Google account, then `pnpm admin:role <gmail> admin` again. **Check**: the admin's
   open session no longer works; after the second command a new Google sign-in works.

## 13. Shop settings and business details

1. **Where**: `https://<shop domain>/admin/settings` (the admin menu: "הגדרות").
   **Do**: in the "פרטי העסק" section fill in "שם העסק (חוקי) בעברית", "שם העסק באנגלית (לא חובה)",
   "מספר עוסק (ע.מ.)", "טלפון", "אימייל", "כתובת בעברית" and "כתובת באנגלית (לא חובה)". Under
   "אימיילים להתראות" fill in 1 to 3 addresses ("כתובת 1" and so on), and under "איסוף עצמי" fill
   in "הוראות איסוף בעברית". The two English fields show "(לא חובה)" (optional) but still count in
   the dashboard notice until the starting text ("Business name (to be completed)", "Business
   address (to be completed)") is replaced with your own English text. **Check**: the admin dashboard's "needs attention"
   notice ("כדאי להשלים בהגדרות:") lists at most "הוראות לתשלום ישיר בעברית", which is filled in
   step 14. The full "list is empty" check is at the end of step 14.

## 14. Offline payment details

1. **Where**: "הגדרות" > "אופני תשלום".
   **Do**: fill in "הוראות לתשלום ישיר, בעברית" and "הוראות לתשלום ישיר, באנגלית (לא חובה)" with
   the bank transfer, Bit and PayBox details. Card payment shows as not set up; leave it.
   **Check**: place a test order on the live site choosing offline payment; the details appear on
   the order page and in the order email (the email reaches the address you used). Keep this order
   for step 18. Then reload the admin dashboard: the "needs attention" notice ("כדאי להשלים
   בהגדרות:") is gone and its list is empty (this is step 13's check, which can only pass here).

## 15. Post-deploy checks (before announcing)

Run each on the live site. Record results in the boxes.

1. **Response headers.** **Where**: your terminal.
   **Do**: `curl -sI https://<shop domain>/he` and `curl -sI https://<shop domain>/admin/sign-in`.
   **Check**: both have `strict-transport-security: max-age=63072000; includeSubDomains`; the
   `/he` CSP has `form-action 'self'` only; the `/admin/sign-in` CSP has `form-action 'self'
https://accounts.google.com`. Spot check: `curl -sI https://<shop domain>/he | grep -i
"content-security-policy"`.
2. **No cookie on the storefront.** **Where**: your terminal, then a browser. **Do**: `curl -sI https://<shop domain>/he | grep -i set-cookie`.
   **Check**: prints nothing. Then open the storefront in a **fresh browser profile**: DevTools >
   Application > Cookies shows **no cookie** before any consent choice, and in particular no
   `__cf_bm` (the shop domain is not proxied, so there is no Cloudflare cookie).
3. **Admin cookies.** **Where**: your browser, DevTools. **Do**: sign in at `/admin/sign-in`; in DevTools > Application > Cookies
   check `__Host-ac_admin` and, during the sign-in redirect, `__Host-ac_oauth`. **Check**:
   `__Host-ac_admin` is `Secure; HttpOnly; SameSite=Strict; Path=/`; `__Host-ac_oauth` is
   `Secure; HttpOnly; SameSite=Lax`.
4. **ZAP baseline scan.** **Where**: your computer, Docker running. **Do**: run `docker pull ghcr.io/zaproxy/zaproxy:2.17.0` once first (the tag pinned in
   `scripts/zap-baseline.sh`), then `scripts/zap-baseline.sh https://<shop domain>/he`. **Check**: exit code 0, "High: 0". The
   script prints counts per risk level and writes `test-results/zap/report.json`; read the Medium
   alerts and decide about each. Exit 2 means the scan did not run (Docker, 15-minute timeout).
5. **Dependency audit.** **Where**: your terminal, in the repository. **Do**: `pnpm run audit` in the repository (not `pnpm audit`).
   **Check**: it ends with no High or Critical findings.
6. **Image metadata.** **Where**: `/admin` ("מוצרים") and your terminal. **Do**: publish one product photo. To get `<public image>`: open
   the product page in the shop, long-press (phone) or right-click (computer) the photo and choose
   Copy image address; it is the part after `https://img.<shop domain>/`. Then run
   `pnpm check:image-metadata https://img.<shop domain>/<public image>`. **Check**: it prints
   `clean: <name>` and exits 0.
7. **Link previews.** **Where**: WhatsApp and Telegram on your phone. **Do**: paste a product link into WhatsApp and Telegram. **Check**: the
   photo, name and price show. Record the 800 px variant's file size: `____ KB` (WhatsApp drops
   preview images over about 300 KB). If WhatsApp does not show the WebP photo, record that here.
8. **Upload memory.** **Where**: `/admin` ("מוצרים") and Render > `avivas-crafts` > Metrics. **Do**: in `/admin`, upload an 8160×6144 JPEG, then a HEIC of at most 16
   megapixels, watching Render > `avivas-crafts` > Metrics > Memory. Record the peak: `____ MB`
   of 512. Then upload a larger HEIC (for example 48 MP). **Check**: both uploads work; the larger
   HEIC is refused with the size message (`HEIC_MAX_PIXELS`, `src/server/images/process.ts`) and
   the service does **not** restart (Events shows no restart).
9. **Trusted proxy count.** **Where**: `/admin/sign-in`. **Do**: `TRUSTED_PROXY_HOPS=1` means the shop takes the **last**
   entry of Render's `X-Forwarded-For` as the visitor's address (`src/server/security/client-ip.ts`).
   Confirm it behaves that way: on `/admin/sign-in`, press "כניסה עם Google" and come back, 11
   times in a row from your computer (the limit is 10 per 15 minutes per visitor). **Check**: the
   11th time shows "יותר מדי ניסיונות כניסה. נסו שוב בעוד כמה דקות.", while your phone on mobile
   data can still start the sign-in. If the phone is blocked too, or your computer is never
   blocked, the hop count is wrong: stop and ask for a fix. Wait 15 minutes before the admins
   sign in. Record: `____`.
10. **Cloudflare Bot Fight Mode.** **Where**: Cloudflare > Security > Bots. **Do**: switch Bot Fight
    Mode off if it is on. **Check**: Bot Fight
    Mode is **off** (it sets `__cf_bm`, a non-essential cookie).
11. **Backup run and restore test.** **Where**: Render and your computer. **Do**: Render > `avivas-crafts-backup` > Trigger run. Check
    the six step lines in the log (`dump ok`, `encrypt ok`, `upload daily ok`, `upload monthly ok`
    or `monthly skipped`, `images ok`, `public images ok`). Then restore the dump into a scratch
    database following `ops/backup/README.md` > Restore, and compare the counts with the admin
    area. **Check**: counts match. Record the date: `____`.
12. **Lighthouse mobile.** **Where**: Chrome DevTools on the live site. **Do**: Chrome DevTools > Lighthouse > Mobile, Slow 4G, on the catalog
    page and on one product page. **Check**: usable within about 3 seconds (spec 001 SC-005).
    Record the scores: catalog `____`, product `____`.
13. **HSTS preload decision.** **Do**: decide whether to submit the domain to the HSTS preload
    list later (see **Later**). The shop sends `max-age=63072000; includeSubDomains` without
    `preload` until you decide. Record: `____`.

## 16. Stopwatch runs (Aviva and a first-time visitor)

**Where**: `docs/owner-guide-he.md` (the walkthrough scripts at the end).
**Do**: Aviva publishes a product with 3 photos from her phone (under 5 minutes); someone who has
not seen the shop orders from a product link on a phone (under 3 minutes); Aviva handles a
customer data request (under 10 minutes). Copy each result into
`specs/006-launch-readiness/checklists/validation.md` (empty rows are waiting there).
**Check**: all three rows have a date, a time and a yes/no.

## 17. Legal review

**Where**: a qualified legal professional (a lawyer who knows Israeli e-commerce and privacy law).
**Do**: give them the pages (seeded from `docs/legal-drafts/`, editable in `/admin` under "תוכן"):
terms, privacy, cookies, shipping & returns, accessibility, about and contact, and the documents
in `docs/privacy/` (database definition, security procedure, access authorisations, incident
response, annual review checklist). Mention the places marked "[להשלמה]" / "[to be completed]".
Tell them also that two pieces of wording were kept on purpose although the shop has **no payment
provider at launch**: the retention text for unfinished payments in the privacy documents, and
the "payment page" wording on the cookies page. They decide whether to keep or remove them. (This
note is for the lawyer only; it is not customer text.)
**Check**: you have the lawyer's written changes, applied in `/admin` > "תוכן", and the lawyer
agrees the pages match how the shop really works.

## 18. Test-data cleanup

**Where**: `/admin` > "הזמנות" and "מוצרים".
**Do**: cancel every test order ("ביטול ההזמנה"), then remove or unpublish every test product.
**Check**: the orders list shows no test orders in an open state; the storefront catalog shows
only real products.

## 19. Announce

**Do**: share the shop's link. **Check**: the first real order arrives with its email, and
appears in the admin.

## Running cost

About **₪60 per month**: Render web service Starter (~₪26), Postgres Basic-256mb (~₪23), the backup cron job (~₪4),
domain (~₪5 per month), plus Render bandwidth overage if any. R2, Cloudflare and Resend are on
their free tiers. Source: spec 001's plan > Cost, without the card provider's fee.

---

## Later (not launch blockers)

- **Card payment.** Choose a provider in a **separate discussion** first. Then, for PayPlus:
  the sandbox checks, the production keys, the callback URL and the `PAYPLUS_*` variables from
  001's T130 (`specs/001-online-crafts-shop/tasks.md`: callback HMAC input format, IPN response
  fields, whether _Disable Payment Link_ exists and stops an open page from being paid, page
  expiry, retry on a declined page); set `PAYMENT_PROVIDER=payplus`; re-add the processor and
  the card-payment wording to the documents updated in this feature (`docs/legal-drafts/privacy.*`,
  `terms.*`, `docs/privacy/database-definition.*`, `annual-review-checklist.*`,
  `security-procedure.*`) and to the threat model; confirm the running cost against the provider's
  monthly fee (spec SC-011: under about ₪100 in total, excluding per-transaction fees).
- **Cloudflare proxying of the shop domain.** Needs research R19 and the Privacy Policy updated
  first (threat model, residual risk R5).
- **HSTS preload submission** (hstspreload.org), once you are sure every subdomain is https-only.
- **Yearly: bump the pinned image tags.** Alpine in `ops/backup/Dockerfile` and ZAP in
  `scripts/zap-baseline.sh` (Renovate does not see the ZAP tag in a shell script). Re-run the
  backup test and a ZAP scan after bumping.
