# Contract: social links (US3, FR-024–FR-026)

## Input

`updateSettings(input: SettingsInput)` (existing Server Action in
`src/app/admin/(protected)/settings/actions.ts`, guarded by `requireAdmin`) accepts three more
optional fields: `socialFacebookUrl`, `socialInstagramUrl`, `socialTiktokUrl`, each `string |
null`. The Settings section sends all three together.

## Normalisation and validation (per field, in this order)

Shared Zod schema in `src/lib/validation/settings.ts`; one helper
`socialUrl(platform)` builds the rule for each platform.

| Step | Rule | On failure: error key (`admin.settings.errors.social.*`) |
|---|---|---|
| 1 | Trim. Empty or `null` → store `NULL` (link removed). | — |
| 2 | No `://` in the text → prefix `https://`. | — |
| 3 | `new URL(text)` succeeds. | `invalid` |
| 4 | Protocol is `https:`. | `notHttps` |
| 5 | No user name, password or port. | `invalid` |
| 6 | Host (lower case) is the platform domain or ends with `.` + the domain. Domains: Facebook `facebook.com`, Instagram `instagram.com`, TikTok `tiktok.com`. | `wrongSite.<platform>` |
| 7 | Path is not empty and not `/`. | `noPage.<platform>` |
| 8 | The normalised address (`url.href`) is at most 300 characters. | `tooLong` |

Stored value: `url.href` after step 2 (for example `instagram.com/aviva` →
`https://instagram.com/aviva`).

A failure returns the existing `fieldErrors` shape for that field only; nothing is saved for any
field in that submission (the section is saved as a whole, as every other Settings section).

## Error messages (plain Hebrew; English mirrors)

Each message is shown under its field (whose label names the platform) and listed in the
`ErrorSummary` when there is more than one.

| Key | Hebrew | English |
|---|---|---|
| `invalid` | "זו לא כתובת של אתר. פתחי את העמוד שלך בדפדפן, העתיקי את הכתובת מהשורה למעלה והדביקי כאן." | "This isn't a web address. Open your page in the browser, copy the address from the bar at the top and paste it here." |
| `notHttps` | "הכתובת צריכה להתחיל ב-https:// (עם s)." | "The address must start with https:// (with an s)." |
| `wrongSite.instagram` | "זו לא כתובת של אינסטגרם. הכתובת צריכה להיות באתר instagram.com." | "This isn't an Instagram address. It must be on instagram.com." |
| `wrongSite.facebook` | "זו לא כתובת של פייסבוק. הכתובת צריכה להיות באתר facebook.com." | "This isn't a Facebook address. It must be on facebook.com." |
| `wrongSite.tiktok` | "זו לא כתובת של טיקטוק. הכתובת צריכה להיות באתר tiktok.com." | "This isn't a TikTok address. It must be on tiktok.com." |
| `noPage.instagram` | "חסר שם העמוד בסוף הכתובת. למשל: https://www.instagram.com/aviva" | "The page name is missing at the end, for example https://www.instagram.com/your-name" |
| `noPage.facebook` | "חסר שם העמוד בסוף הכתובת. למשל: https://www.facebook.com/aviva" | "The page name is missing at the end, for example https://www.facebook.com/your-name" |
| `noPage.tiktok` | "חסר שם העמוד בסוף הכתובת. למשל: https://www.tiktok.com/@aviva" | "The page name is missing at the end, for example https://www.tiktok.com/@your-name" |
| `tooLong` | "הכתובת ארוכה מדי. אפשר עד 300 תווים." | "The address is too long. Up to 300 characters." |

Every message is a complete string with no placeholders, because `SettingsManager`'s `useSaver`
translates field errors with `t(key)` and passes no values (review round 1, W5).

## Admin form

Section in `src/components/admin/SettingsManager.tsx`, after "פרטי העסק":

- Title "הרשתות החברתיות שלי"; hint "אם יש לך עמוד באחת הרשתות, הדביקי כאן את הכתובת שלו.
  כתובת שתישאר ריקה לא תופיע באתר."
- Fields (each `FormField`, `dir="ltr"`, `inputMode="url"`, `autoComplete="url"`,
  `maxLength={300}`, hint per field from `admin.settings.social.example.<platform>`, e.g. "למשל: https://www.instagram.com/aviva", the address only in Latin letters and at the end so it reads correctly in a right-to-left line):
  "כתובת עמוד האינסטגרם", "כתובת עמוד הפייסבוק", "כתובת עמוד הטיקטוק".
- Primary "שמירה"; success toast "ההגדרות נשמרו" (existing `toast.saved`).
- Test ids: `settings-social` (section), `settings-socialInstagramUrl`,
  `settings-socialFacebookUrl`, `settings-socialTiktokUrl`.
- After saving, the field shows the stored (normalised) address.

## Footer output

In `src/components/shop/Footer.tsx`, inside the business column, after the phone:

- When no address is saved: nothing (no empty list, no heading, no gap).
- Otherwise `<ul data-testid="footer-social" aria-label="…">` ("הרשתות החברתיות שלי" / "My social
  pages") with one `<li>` per saved address, order Instagram, Facebook, TikTok.
- Each item: `<a href={storedUrl} data-testid="footer-social-instagram" aria-label="האינסטגרם
  שלי">` (en "My Instagram"; Facebook "הפייסבוק שלי" / "My Facebook"; TikTok "הטיקטוק שלי" / "My
  TikTok"), 44×44 px circle, 1.5 px `ink` border, `ink` icon from `ui/Icon`
  (`instagram` / `facebook` / `tiktok`, `aria-hidden`), hover `sage` fill. Same tab; no
  `target`, no script, no embed, no request to the platform before a click.

## Tests

- Unit `tests/unit/social-links.test.ts`: each row of the validation table, plus
  `https://facebook.com.example.net/x`, `https://notinstagram.com/x`, `javascript:alert(1)`,
  `http://instagram.com/x`, `https://user:pw@instagram.com/x`, `https://instagram.com:444/x`,
  `instagram.com/aviva` (normalised), `https://m.facebook.com/aviva` (accepted).
- Integration `tests/integration/settings.test.ts`: save one, clear it, reject a wrong site (no
  write, field error), activity row written without the address.
- E2E `tests/e2e/admin-settings.spec.ts`: the US3 acceptance scenarios end to end (save →
  footer shows exactly that icon with its name; wrong site → Hebrew error, nothing saved; clear
  → gone).
