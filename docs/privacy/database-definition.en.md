**טיוטה — נדרשת בדיקה משפטית / Draft — requires legal review.**

# Database definition document

Aviva's Crafts online shop. Prepared under the Privacy Protection Regulations (Data Security), 2017,
for a database at the **basic** security level. Related documents: [security procedure](security-procedure.en.md),
[access authorizations](access-authorizations.en.md), [incident response](incident-response.en.md),
[annual review checklist](annual-review-checklist.en.md).

## 1. The database

| Item                               | Value                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner and controller               | The business owner (VAT-registered, עוסק מורשה). Name, ע.מ. number and address: [to be completed from the shop settings; shown in the site footer] |
| Database                           | One PostgreSQL database for the shop, hosted by Render (Europe)                                                                                    |
| Purpose                            | Taking and fulfilling orders, contacting customers about them, keeping the legal record of sales, proof of consent, running the shop's admin area  |
| Registration                       | [to be completed: legal reviewer to confirm whether registration with the Privacy Protection Authority is required]                                |
| Security level                     | **Basic**: no special-sensitivity data (card data never reaches the shop), at most 3 authorised users, see section 5                               |
| Information of special sensitivity | None collected                                                                                                                                     |

## 2. Data kept (personal data register)

This is the register of the 001 data model plus the changes of feature 003. The source of truth for
the structure is the Drizzle schema in `src/server/db/schema/`.

| Data                                                                 | Where                                                               | Purpose                                                                | Retention                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer name, phone, email                                          | `orders`, `pending_checkout`                                        | Fulfil and contact about the order; legal record of sale               | Order: anonymised 7 years after the order date by the daily task, or earlier on request. Unfinished checkout: deleted after 48 hours, at most 24 hours later if the payment provider cannot be reached for the final status check (30 days if the payment amount did not match) |
| Delivery address                                                     | `orders`, `pending_checkout`                                        | Deliver the order                                                      | As above                                                                                                                                                                                                                                                                        |
| Note to seller                                                       | `orders`, `pending_checkout`                                        | Fulfil special requests                                                | As above                                                                                                                                                                                                                                                                        |
| Marketing consent, its date, withdrawal date                         | `orders`, `pending_checkout`                                        | Proof of consent and withdrawal (Communications Law)                   | With the order; cleared on anonymisation                                                                                                                                                                                                                                        |
| Terms acceptance time, Terms and Privacy versions                    | `orders`, `pending_checkout`                                        | Proof of acceptance (consumer law)                                     | With the order                                                                                                                                                                                                                                                                  |
| Order language                                                       | `orders`                                                            | Send emails in the customer's language                                 | With the order                                                                                                                                                                                                                                                                  |
| Tracking number, pickup note                                         | `orders`                                                            | Tell the customer how to receive the order                             | With the order; cleared on anonymisation                                                                                                                                                                                                                                        |
| Email address and message body                                       | `email_outbox`                                                      | Deliver order emails and contact messages                              | Body erased when sent; a row that finally failed keeps its body; rows deleted 30 days after sending or after the final failure; deleted with the person on anonymisation                                                                                                        |
| Contact-form visitor name, email, message                            | `email_outbox` (body and `reply_to`)                                | Let the owner reply                                                    | Blanked as soon as sent; as above if it failed                                                                                                                                                                                                                                  |
| Unresolved payment mismatch contact details                          | `pending_checkout` (`mismatch`)                                     | Let the owner contact the customer                                     | 30 days                                                                                                                                                                                                                                                                         |
| Admin name, Google email, Google subject id, role (`admin`/`user`)   | `admin_user`                                                        | Admin access control                                                   | Kept while the account exists; delete the row by hand when it is no longer needed; the display name stays in the activity log for its 2-year period                                                                                                                             |
| Admin session summary                                                | `admin_session`                                                     | Session management                                                     | Until expiry (12 hours at most)                                                                                                                                                                                                                                                 |
| Admin activity log                                                   | `admin_activity`                                                    | Security audit                                                         | 2 years, then deleted by the daily task                                                                                                                                                                                                                                         |
| IP address                                                           | Not stored; only a daily-rotating keyed hash in `rate_limit_bucket` | Abuse protection                                                       | 24 hours at most                                                                                                                                                                                                                                                                |
| Cookie choice (no identifier)                                        | `consent_record`, `ac_consent` cookie                               | Prove and remember the choice (only when optional cookies are enabled) | 2 years (record), 12 months (cookie)                                                                                                                                                                                                                                            |
| Page-view counters                                                   | `analytics_daily_page`, `analytics_daily_referrer`                  | Basic statistics                                                       | No personal data; kept without limit                                                                                                                                                                                                                                            |
| Terms and Privacy versions                                           | `content_page_version`                                              | Prove what a customer accepted                                         | No personal data; kept without limit                                                                                                                                                                                                                                            |
| Notification email addresses                                         | `shop_settings`                                                     | Deliver order and security notifications                               | Until removed in settings                                                                                                                                                                                                                                                       |
| Business details (may be the owner's personal phone, email, address) | `shop_settings`                                                     | Legally required seller identification, shown publicly                 | While the shop operates                                                                                                                                                                                                                                                         |
| Customer export file                                                 | Produced on demand, never stored by the shop                        | Answer an access request                                               | On the owner's device only until she sends it; then deleted (see the security procedure)                                                                                                                                                                                        |
| Cart, language choice, checkout form inputs                          | Visitor's own device                                                | Strictly necessary functions                                           | Cart 90 days; language 1 year; checkout inputs for the browser tab session                                                                                                                                                                                                      |
| Visitor IP addresses and request paths                               | Hosting provider request logs (not the app's logs)                  | Hosting operations and abuse diagnosis                                 | The hosting plan's limited log period                                                                                                                                                                                                                                           |
| All of the above except device data                                  | Encrypted backups (`ac-backups`)                                    | Disaster recovery                                                      | 30 daily and 12 monthly copies, up to 12 months; anonymisation and deletion reach backups only as old copies expire                                                                                                                                                             |

## 3. Sources of the data

The data subjects themselves (checkout, contact form), and the shop's administrators (corrections,
notes). Nothing is bought or received from other databases.

## 4. Processors and locations

| Processor  | Role                                                           | Location        | Data it sees                                                                                  |
| ---------- | -------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| Render     | Hosting of the site and the database                           | Europe          | Everything in the database                                                                    |
| Cloudflare | DNS, storage and delivery of product images, encrypted backups | European region | Product images (visitor IP addresses when images load); encrypted backup files it cannot read |
| PayPlus    | Card payment processing                                        | Israel          | Card details (entered on its own page) and order amount                                       |
| Resend     | Sending emails about orders and contact messages               | Europe          | Recipient address and email content while sending                                             |
| Google     | Sign-in of the shop administrators only                        | -               | Administrators' accounts; no customer data                                                    |

[to be completed: check Render's sub-processor list to see whether Cloudflare also carries the site's traffic, as in the Privacy Policy draft.]

## 5. Authorised users and level

Three people at most: the two shop administrators (the owner and a family helper, identical
permissions) and the maintainer who runs the hosting. Details in
[access-authorizations.en.md](access-authorizations.en.md). Three or fewer authorised users, no data of
special sensitivity, and no database held for sale or for others: **basic security level**.

## 6. Where the data may be copied

Backups only (section 2). Customer exports go to the customer and nowhere else.

## 7. Retention automation

Four daily maintenance tasks run once per UTC day, each safe to run again:

| Task                   | Rule                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `anonymize-old-orders` | Orders older than 7 years are anonymised (at most 500 per run) and their outbox rows deleted; an activity row `customer.anonymized` is written by the system |
| `delete-old-activity`  | Admin activity older than 2 years is deleted                                                                                                                 |
| `delete-old-consent`   | Cookie-choice records older than 2 years are deleted                                                                                                         |
| `delete-old-outbox`    | Sent emails 30 days after sending, and failed emails 30 days after the final failure, are deleted; pending emails are never deleted                          |

Unfinished checkouts are removed by their own expiry task (48 hours, plus up to 24 hours if the provider
cannot be reached for the final status check; or 30 days for a payment mismatch), not by anonymisation on request.

## 8. Document control

Version 1 (draft). Reviewed: [date]. Next review: see the [annual review checklist](annual-review-checklist.en.md).
