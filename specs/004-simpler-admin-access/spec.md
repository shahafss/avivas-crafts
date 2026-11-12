# Feature Specification: Simpler Admin Access

**Feature Branch**: `004-simpler-admin-access`

**Created**: 2026-11-11

**Status**: Approved 2026-11-11

**Input**: User description: "004 Simpler admin access (roadmap docs/roadmap.md item 004;
constitution v2.0.0 principle IV). Admin sign-in becomes just 'Sign in with Google'. An admin is a
user whose `role` is `admin` (the other value is `user`, which cannot enter the admin area), set
by the owner directly in the database or deployment; no screens for it. There are two admins: the
owner (developer) and Aviva. Remove passkeys entirely, and with them: recovery codes, setup links,
passkey approval by another admin, the pending-passkey sign-in stage, the passkey fail
counter/lockout, and the fresh passkey re-check before customer export and anonymise from spec
003 (those become normal admin actions). Remove or reduce the admin:add / admin:reset scripts to
setting the role. Do not build admin management screens, a session list, or an activity log
viewer. Keep: Google sign-in, rate-limited sign-in, only admin-role users admitted, sessions that
expire after inactivity and can be revoked (owner can delete them in the database),
security-event logging (sign-in, failures), HTTPS/CSRF/CSP basics. Drop the database tables and
columns that only served passkeys, recovery and setup, with a migration. Update docs (design doc
sign-in screens, quickstart/README) to match. Existing sessions at deploy time may simply be
ended."

## Context

Spec 001 (frozen) built admin sign-in in two steps: Google, then a passkey held by the shop. Around
it sit setup links for a new admin's first passkey, recovery codes, a waiting state for a passkey
added through recovery until the other admin approves it (no screen for that approval exists), a
passkey failure lockout, and maintainer scripts to add or reset an admin. Spec 003 added a fresh
passkey check (within 5 minutes) before exporting or anonymising a customer.

Constitution v2.0.0 (2026-11-11) redefined principle IV: admins sign in with Google only, an admin
is a user whose role is `admin` set by the owner, and no admin management screens, recovery codes
or approval steps are required. This feature brings the shop in line with it by **removing**
machinery. It adds no new screens.

The shop has two admins: the owner (who also maintains the code, settings and deployment) and
Aviva. Both use Google accounts with Google's own 2-step verification.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sign in with Google only (Priority: P1)

Aviva opens the admin area, taps "Sign in with Google", picks her Google account, and lands on the
admin home. No passkey prompt, no setup link, no recovery codes.

**Why this priority**: it is the whole point of the feature, and every admin task starts here.

**Independent Test**: with a user whose role is `admin`, sign in through Google and reach the admin
home in one step; with any other Google account, sign-in is refused.

**Acceptance Scenarios**:

1. **Given** a Google account whose user has role `admin`, **When** it completes Google sign-in,
   **Then** the admin home opens straight away, with no further step.
2. **Given** a signed-out visitor opens an admin page directly, **When** they sign in, **Then**
   they land on the page they first asked for (same-origin admin paths only, as today).
3. **Given** a Google account with no user, or whose user has role `user`, **When** it completes
   Google sign-in, **Then** no session is created and a plain "this account has no access to the
   admin area" message is shown, with no hint about which accounts do.
4. **Given** someone repeats sign-in attempts quickly, **When** they pass the sign-in rate limit,
   **Then** further attempts are refused for a while with a "too many attempts, try again later"
   message.
5. **Given** a signed-in admin, **When** they sign out, **Then** their session ends and admin pages
   send them to sign-in.

---

### User Story 2 - Owner controls who is an admin (Priority: P1)

The owner makes someone an admin, or takes admin access away, by setting the user's role directly
(in the database, or with one small command run against the deployment). There are no screens for
this.

**Why this priority**: without it, nobody can be given or refused access once the old add/reset
tools are gone.

**Independent Test**: set a user's role to `admin` and sign in successfully; set it back to `user`
and confirm the next admin request is refused and sends them to sign-in.

**Acceptance Scenarios**:

1. **Given** a Google email with no user, **When** the owner adds it with role `admin`, **Then** that
   person can sign in with Google on their first try.
2. **Given** a signed-in admin, **When** the owner changes their role to `user`, **Then** their very
   next admin page or action is refused and they are sent to sign-in, and their sessions are
   ended.
3. **Given** a signed-in admin, **When** the owner deletes that admin's sessions in the database,
   **Then** their next admin request sends them to sign-in.
4. **Given** the owner runs the role command with a malformed email or an unknown role value,
   **When** it runs, **Then** it changes nothing and says why.

---

### User Story 3 - Customer data tools without a second check (Priority: P2)

Aviva exports or anonymises a customer's data (from spec 003) as a normal admin action: she
confirms in the existing confirmation dialog, and no passkey prompt appears.

**Why this priority**: these tools currently depend on the passkey re-check that this feature
removes; without this story they would break.

**Independent Test**: as a signed-in admin, export a customer's data and anonymise a customer;
both complete after the usual confirmation, with no extra prompt.

**Acceptance Scenarios**:

1. **Given** a signed-in admin on the customers screen, **When** she exports a customer's data,
   **Then** the file is produced with no extra identity check.
2. **Given** a signed-in admin, **When** she confirms anonymising a customer in the confirmation
   dialog, **Then** it completes with no extra identity check, and is logged as today.

---

### User Story 4 - Old passkey machinery is gone (Priority: P2)

Everything that only existed for passkeys, setup links and recovery is removed: the passkey,
setup and recovery screens and their endpoints, the related stored data, the related wording in
the admin interface, and the maintainer scripts' passkey and setup-link parts. Documentation
matches.

**Why this priority**: dead security code is a maintenance cost and a risk; the recovery path
today leaves a new passkey waiting for an approval screen that does not exist.

**Independent Test**: the old passkey, setup and recovery addresses return "not found"; the stored
data for passkeys, recovery codes and setup links no longer exists; a search of the interface text
and documentation finds no instructions about passkeys, recovery codes or setup links.

**Acceptance Scenarios**:

1. **Given** the feature is deployed, **When** anyone opens a former passkey, setup or recovery
   address, **Then** they get the normal "not found" response.
2. **Given** the database before the upgrade holds passkeys, recovery codes, setup tokens and
   sessions, **When** the upgrade runs, **Then** that data is removed, every existing session is
   ended, and the existing admins (with their history in the activity log) are kept with role
   `admin`.
3. **Given** the owner reads the project's setup notes, design system and privacy documents,
   **When** they look for how admins sign in, **Then** they find "Sign in with Google" and the role
   command, and nothing about passkeys, setup links or recovery codes.

### Edge Cases

- **Google account changes its email**: the user is found by email and must match the Google
  account it first signed in with, as today; after an email change sign-in is refused until the
  owner updates the email in the database.
- **Google says the email is not verified**: sign-in is refused, as today.
- **Last admin set to `user` by mistake**: nobody can enter the admin area until the owner sets a
  role back to `admin`; this is acceptable because the owner controls the database and deployment.
- **Session expiry**: a signed-in admin who is inactive for 30 minutes, or signed in for 12 hours,
  must sign in again (today's limits, unchanged).
- **Sign-in started before the upgrade and finished after it**: the half-finished flow is refused
  and the person simply starts again.
- **Activity log entries from before the upgrade** that mention passkeys or recovery stay as
  history; they are not rewritten.
- **Development and test setups**: local sign-in still works against the mock Google, and the first
  local admin is created with role `admin` without any setup link.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Admin sign-in MUST be a single Google sign-in step. A completed Google sign-in for a
  user with role `admin` MUST create a full admin session directly.
- **FR-002**: Every user MUST have exactly one role, `admin` or `user`. Only `admin` users may
  enter any admin page or perform any admin action; this MUST be checked on every admin request,
  so a role change takes effect on the next request.
- **FR-003**: A Google sign-in for an email with no user, for a user with role `user`, or with an
  unverified email MUST be refused without creating a session, with one generic message that does
  not reveal which accounts have access.
- **FR-004**: Sign-in attempts MUST stay rate-limited as today; when the limit is reached the
  person sees a "too many attempts, try again later" message.
- **FR-005**: Admin sessions MUST keep today's limits (30 minutes of inactivity, 12 hours in all),
  MUST end on sign-out, and MUST stop working once deleted from the database or once the user's
  role is no longer `admin`.
- **FR-006**: Successful sign-ins, refused sign-ins, sign-outs and role-caused refusals MUST be
  written to the activity log without secrets or customers' personal data, as security events are
  today.
- **FR-007**: Passkeys MUST be removed completely: no passkey prompt, registration, approval,
  failure counter or lockout, and no pending sign-in stage.
- **FR-008**: Recovery codes, setup links and the "approve a passkey" step MUST be removed
  completely, including their screens, endpoints, emails and interface text.
- **FR-009**: Exporting and anonymising a customer (spec 003) MUST no longer ask for a fresh
  identity check; they keep their existing confirmation dialog and activity logging.
- **FR-010**: The owner MUST be able to make a Google email an admin, or change a user's role, with
  one command run against the shop's database (locally or on the deployment); the command MUST
  validate the email and role, and setting a role other than `admin` MUST also end that user's
  sessions. The old add-admin and reset-admin commands MUST be replaced by it.
- **FR-011**: An upgrade step MUST remove the stored data that served only passkeys, recovery codes
  and setup links, give every existing admin the role `admin`, and end all existing sessions;
  activity log history MUST be kept.
- **FR-012**: The former passkey, setup and recovery addresses MUST respond as "not found" when signed in; signed out, they redirect to sign-in like any unknown admin address (owner-approved 2026-11-12). The removed API paths always respond "not found".
- **FR-013**: Local development MUST still give the developer a working admin with no manual step:
  the first local admin is created with role `admin`, and the mock Google sign-in admits them.
- **FR-014**: The design system, project setup notes, and the privacy documents (access
  authorisations, security procedure, incident response, database definition, annual review) MUST
  describe Google-only sign-in and the role command, and MUST no longer mention passkeys, recovery
  codes or setup links. The storage table of cookies MUST list only cookies that still exist.
- **FR-015**: No screens for managing admins, sessions or roles, and no activity log viewer, are
  part of this feature.

### Key Entities

- **User**: someone who may sign in with Google; holds their Google email and stable Google
  identifier, a display name, and a role (`admin` or `user`). Replaces the admin-only user record;
  existing admins are kept.
- **Session**: a signed-in admin's session; has only one (full) stage, an inactivity limit and an
  overall limit; can be deleted to sign someone out.
- **Activity log entry**: unchanged; records security events and admin actions.
- **Removed**: passkey, recovery code, setup token, and the pending passkey stage.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An admin goes from the sign-in page to the admin home in one Google sign-in, with no
  further prompt, in under 30 seconds on a phone.
- **SC-002**: 100% of admin pages and actions refuse a user whose role is not `admin`, starting with
  the first request after the role change.
- **SC-003**: Exporting or anonymising a customer takes no step beyond the existing confirmation.
- **SC-004**: After the upgrade, zero passkeys, recovery codes or setup tokens remain stored, and
  every pre-upgrade session is ended.
- **SC-005**: The admin interface text and the project documentation contain no instructions about
  passkeys, recovery codes or setup links.
- **SC-006**: The amount of admin sign-in code shrinks (the passkey, recovery and setup modules are
  gone), and every existing automated check still passes.

## Assumptions

- "User" here means someone who can sign in to the shop; the shop still has no customer accounts
  (guest checkout stays). Role `user` exists so that access can be taken away without deleting the
  person's record and its activity history.
- Google's own 2-step verification protects the admins' Google accounts; the shop does not check
  for it.
- The sign-in rate limit, session limits, sign-in cookie names and CSRF/CSP protections stay as
  today unless removing passkeys makes one unnecessary.
- The owner has direct access to the production database and deployment, so recovering access
  (e.g. if a role is set wrongly) is the owner's job, outside the app.
- Security alert emails that were only about passkeys, recovery or setup are removed; any that are
  about sign-in itself stay as today.
- Spec 001 and spec 003 stay as historical records; this spec supersedes their passkey,
  recovery, setup-link and re-check requirements.
