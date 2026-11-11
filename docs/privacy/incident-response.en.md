**טיוטה — נדרשת בדיקה משפטית / Draft — requires legal review.**

# Severe security incident procedure

A severe incident is one where personal data in the database was, or may have been, accessed,
copied, changed, lost or made unavailable without authorisation, for example a stolen admin
device or passkey, an unapproved sign-in, a leaked backup or key, a provider breach, or data sent to
the wrong person. [to be completed: legal reviewer to confirm the exact notification duties and
deadlines of the Privacy Protection Law and its regulations for this database.]

## 1. Who

The owner leads. The maintainer carries out technical steps. Contact details: [to be completed].

## 2. Steps

1. **Detect and report.** Anyone who notices something odd (a security alert email, an unfamiliar
   sign-in or activity-log entry, a lost device, a message from a provider) tells the owner and the
   maintainer at once. Note the time.
2. **Contain.** Stop further harm first: sign out of all devices; remove the affected passkeys or
   admin; rotate the affected secrets (provider keys, the HMAC key, database credentials); block
   the affected account at Google; for a lost device remove its passkeys. Do not delete evidence
   (logs, the activity log, provider logs).
3. **Assess.** Decide what happened: which data, whose, how many people, since when, whether it
   left the system, whether it is still happening, and the likely harm. Use the activity log, the
   provider logs and the backups. Write the assessment down.
4. **Decide on notification.** If the incident is severe, **notify the Privacy Protection
   Authority** (without delay, in the form and time the law requires) and, when the law requires or
   the risk to people is high, **notify the affected people**: what happened, which data, what we
   did, what they can do, who to contact. EU customers may also be covered by GDPR (72-hour
   notification to the authority). Use the legal reviewer's guidance.
5. **Recover.** Fix the cause, restore from backup if data was lost or changed (see the security
   procedure), check that access is clean, bring the shop back.
6. **Record.** Fill in the incident record below, keep it at least 5 years [to be completed: legal
   reviewer to confirm]. It holds no more personal data than needed.
7. **Learn.** Within two weeks decide what to change and update the security procedure, access list
   and this document.

## 3. Incident record

| Field                                    | Entry |
| ---------------------------------------- | ----- |
| Date and time detected                   |       |
| Reported by                              |       |
| What happened                            |       |
| Data and number of people affected       |       |
| Containment steps and times              |       |
| Notified the Authority (date, reference) |       |
| Notified people (date, how)              |       |
| Cause                                    |       |
| Fix and follow-up                        |       |
| Closed on                                |       |

## 4. Practice

The owner and the maintainer read this procedure once a year and agree who does what (annual review
checklist). Minor events (a failed sign-in, one wrong email) are not severe incidents; record them
in the incident record anyway if personal data was involved.
