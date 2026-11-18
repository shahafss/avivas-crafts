# Contract: emails (003)

One new email. Everything else about the outbox (dedupe, retries, give-up, blanking bodies after
sending) is unchanged from 001 and 002.

## `contact-message` (owner, Hebrew)

- **Queued by** `submitContact` (contracts/server-actions.md), one row per address in
  `shop_settings.notification_emails` (lower-cased, de-duplicated, sorted), in one transaction.
- **To**: each notification address. **Reply-To**: the visitor's email (`email_outbox.reply_to`).
  **From**: the usual sender (`formatFrom(shop name, EMAIL_FROM)`).
- **Locale**: `he` (owner email; strings `emails.contact.*` with a real English entry, like
  `emails.newOrder.*`).
- **Subject**: `הודעה חדשה מהאתר · {shop name}` — never the visitor's name, email or message.
- **Body** (through the existing `renderEmail()` in `src/server/email/layout.ts`, HTML plus plain text): heading "הודעה חדשה
  מהאתר"; "שם:" name; "מייל:" email (as text, not a link); "שפת האתר:" עברית / English;
  "הודעה:" the message as escaped text with line breaks kept; footer line "כדי לענות, השיבו למייל
  הזה." All visitor values go through `escapeHtml()`.
- **dedupeKey**: `contact:<random uuid>:<index>`.
- **Personal data**: name, email and message exist only in this row until it is sent (then the
  sender blanks `html`, `text_body`, `reply_to`); a finally failed row is deleted 30 days after the
  final failure (data-model.md).
