# Feature Specification: Order Handling

**Feature Branch**: `002-order-handling`

**Created**: 2026-11-09

**Status**: Approved (2026-11-09)

**Input**: User description: "Order handling (roadmap item 002). Aviva is notified of every order,
sees and filters orders in the admin area, opens one to see items, options, contact details,
delivery choice and payment state, marks offline payments as received, and moves orders through
New → In preparation → Shipped / Ready for pickup → Completed, or Cancelled (with refund
confirmation). The customer gets the matching email in the language they ordered in. Source: spec
001 › User Story 3, FR-026–FR-030, FR-021, FR-039 (correction on the order page); tasks.md Phase 5
(T088–T094); quickstart.md › US3. Reuse spec 001's settled decisions (status and payment
transitions incl. the new → shipped/ready shortcut, R18; email dedupe; subjects without personal
data; confirmation for destructive actions)."

## Context

Spec 001 (the MVP, frozen) built checkout, payment and the order record. Orders already arrive:
each confirmed order (paid online, or offline and awaiting payment) is stored with its items,
customer details, delivery choice and payment state. The customer gets an "order received" email
(the order confirmation) with a link to their order's page, and Aviva gets a "new order" email with
a link to the order's admin page. What is missing is the admin side: that admin link leads nowhere
yet, and Aviva cannot record payments, move orders forward, or cancel and refund from the shop. The
customer's order page shows the order as it was placed, not how it is progressing, and its link
stops working after 30 days.

This feature builds the admin side and turns the customer's order page into the place where they
follow their order. It reuses spec 001's settled decisions: the order statuses and payment states
(001 FR-021, FR-028), the shortcut from New straight to Shipped / Ready for pickup (001 research
R18), confirmation before destructive actions (constitution II), and the customer order page that
never shows an address or phone number. It deliberately replaces spec 001 FR-029 (customer emails on Shipped / Ready for pickup): besides "order received", the customer gets an email only when the order is cancelled or refunded (Clarifications 2026-11-09).

## Clarifications

### Session 2026-11-09

- Q: Aviva taps the wrong status by mistake. Can she step an order back? → A: Yes, one step back:
  In preparation → New, and Shipped / Ready for pickup → the status it came from (New or In
  preparation). Completed and Cancelled stay final.
- Q: Should the orders list have a box to jump straight to an order by its number (customers quote
  it with offline payments)? → A: Yes. Search by customer email or phone stays in feature 003.
- Q: Which order changes email the customer? → A: None of the progress changes. "Order received"
  (spec 001's order confirmation) links to a page in the shop where the customer follows the
  order's status. This replaces spec 001 FR-029 (shipped / ready-for-pickup emails). (An earlier
  answer in this session chose six status emails; the user withdrew it as too many emails. At the
  plan gate the user added the cancellation and refund emails, see below.)
- Q: Should the customer get an email when the order is cancelled or refunded? → A: Yes: a
  cancellation email when Aviva cancels the order and a refund email when she marks it refunded,
  both in the order's language. Other status and payment changes still send none.
- Q: If the "order received" email cannot be sent, how long does the shop keep trying, and who
  hears about it? → A: It stops retrying after 2 minutes. Aviva is then notified by email (to the
  shop's notification addresses, with a link to the order) and the admin order page shows a
  warning. Bounces after the email provider accepted the email are not detected. (Refined at plan
  approval, 2026-11-09: the shop gives up at the first failed attempt that is the third or later
  and at least 2 minutes after the order, normally 3–5 minutes, so one network blip does not
  trigger an alert.)
- Q: A cash-at-pickup order is In preparation but not yet paid. What does the customer page say?
  → A: That the order is being made (not "I'll start once payment arrives"). A New order that is
  still unpaid gets a neutral line ("I got your order and will start on it soon"), because the
  shop cannot tell cash at pickup from a transfer.
- Q: After giving up on "order received" the customer has no tracking link. Should the shop keep
  retrying the customer email in the background after alerting Aviva? → A: No. It stops after 2
  minutes; Aviva calls the customer.
- Q: An offline order is marked Completed while still awaiting payment (e.g. cash taken at
  pickup). What happens? → A: The Completed confirmation offers "mark paid and complete" or
  "complete without payment". Once Completed, the customer page no longer shows the payment
  instructions.
- Q: Aviva typed a wrong tracking number or pickup note. Can she fix it? → A: Yes, she can edit
  the tracking number on a Shipped order and the pickup note on a Ready for pickup order directly,
  without stepping the order back.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aviva sees and opens her orders (Priority: P1)

Aviva gets the "new order" email on her phone and taps its link, or opens the admin area and goes
to Orders. She sees her orders newest first, each with its number, date, customer name, total,
payment state and status. She narrows the list to, for example, the new orders or the orders still
awaiting payment, or types an order number a customer quoted. She opens an order and sees
everything she needs to make and send it: the items with their photos, chosen options, quantities,
prices and preparation times; the customer's name, phone and email (which she can tap to call or
write); shipping address or self-pickup; the customer's note; the payment method and state with
dates; and the order's history.

**Why this priority**: Without it Aviva cannot run the shop from the admin area at all; every
other story starts from the order list or the order page.

**Independent Test**: With a few orders in different statuses and payment states, sign in, open
the orders list and check order, columns, filters and the order-number box; open one order from the
list and one from the link in its "new order" email and check every detail is shown.

**Acceptance Scenarios**:

1. **Given** a visitor places an order (paid online, or offline awaiting payment), **When** the
   order is confirmed, **Then** Aviva receives a notification email with the order number, items
   and options, total, payment method and state, customer contact details, delivery choice, note,
   and a link to the order's admin page (unchanged from spec 001, now with a working link).
2. **Given** orders exist, **When** Aviva opens the orders list, **Then** she sees each order's
   number, date, customer name, total with currency, payment state and status, newest first.
3. **Given** the orders list, **When** she filters by a status, by a payment state, or both,
   **Then** only matching orders are shown, and she can clear the filter in one tap.
4. **Given** a customer quotes order number 1023, **When** Aviva types 1023 (with or without "#")
   in the order-number box, **Then** that order opens; **When** no order has that number, **Then**
   she sees a plain message saying so and stays on the list.
5. **Given** more orders than fit on one page, **When** she reaches the end of the page, **Then**
   she can move to the next and previous pages, and the filter is kept.
6. **Given** an order, **When** she opens it, **Then** she sees its items (photo as it was at order
   time, name, chosen options, quantity, unit price, line total, preparation time), delivery fee
   and total, customer name, phone and email as tap-to-call and tap-to-email links, delivery method
   with the address or "self-pickup", the customer's note, the payment method and state with the
   date it was paid or refunded, the status, and a history of what changed, when, and by which
   admin.
7. **Given** Aviva is signed out, **When** she taps the link in the "new order" email, **Then**
   she is asked to sign in and lands on that order's page afterwards.
8. **Given** a product was later edited or deleted, **When** she opens an older order containing
   it, **Then** the order still shows the name, photo, options and price as they were when the
   order was placed.

---

### User Story 2 - Aviva moves an order forward (Priority: P1)

Aviva starts making the piece and moves the order to "In preparation". When it is ready she
either ships it, entering the tracking number if there is one, or marks it ready for pickup,
optionally writing a pickup note (for example, a time to come). If she typed the tracking number or
the note wrong, she corrects it on the order. When the customer has the piece, she marks the order
completed. If she taps a wrong status, she steps the order back one step. No email goes to the
customer for any of this; the customer sees it on their order page (User Story 4).

**Why this priority**: This is Aviva's daily work on an order.

**Independent Test**: Place a shipping order and a pickup order. Move the shipping order New → In
preparation → Shipped with a tracking number → Completed, and the pickup order New → Ready for
pickup with a note; step one order back; check that only allowed next steps are offered at each
point, that every change is in the history, and that no customer email is queued.

**Acceptance Scenarios**:

1. **Given** a New order, **When** Aviva opens it, **Then** she is offered only the next steps the
   order allows: In preparation, Shipped (shipping orders) or Ready for pickup (pickup orders), and
   Cancel.
2. **Given** a shipping order that is New or In preparation, **When** Aviva marks it Shipped with
   an optional tracking number, **Then** its status becomes Shipped and the tracking number is
   stored and shown.
3. **Given** a pickup order that is New or In preparation, **When** Aviva marks it Ready for pickup
   with an optional pickup note, **Then** its status becomes Ready for pickup and the note is
   stored and shown.
4. **Given** a shipping order, **Then** "Ready for pickup" is never offered; **given** a pickup
   order, "Shipped" is never offered.
5. **Given** a Shipped or Ready for pickup order, **When** Aviva marks it Completed and confirms,
   **Then** its status becomes Completed and no further status change is offered; **given** the
   order is offline and still awaiting payment, **Then** the confirmation offers "mark paid and
   complete" (both happen together, each in the history) or "complete without payment".
6. **Given** an order that is In preparation, Shipped or Ready for pickup, **When** Aviva chooses
   "step back", **Then** the order returns to the status it had before (In preparation → New;
   Shipped / Ready for pickup → New or In preparation, whichever it came from).
7. **Given** an order that was stepped back from Shipped, **When** Aviva marks it Shipped again,
   **Then** the tracking number field shows the number entered before, and she can change it.
8. **Given** any status change, **Then** it appears in the order's history with the date and the
   admin who made it, and in the admin activity log.
9. **Given** the same change is submitted twice (double tap, or two admins at once), **Then** it
   happens once.
10. **Given** any status change other than Cancel (User Story 5), **Then** no email is sent to
    the customer.
11. **Given** a Shipped order, **When** Aviva edits its tracking number and saves, **Then** the new
    number is stored and shown on the admin and customer order pages, the status stays Shipped,
    and the history records that the tracking number was changed (without the number); **given** a
    Ready for pickup order, the same holds for the pickup note.

---

### User Story 3 - Aviva records payments (Priority: P1)

A customer who chose offline payment sends the money by Bit, PayBox, bank transfer or pays in cash
at pickup. Aviva opens the order and marks it paid. When she refunds a paid order (through the
payment provider's dashboard or the original offline method, outside the shop), she marks the order
refunded, and the customer gets an email saying the refund was made.

**Why this priority**: Offline payments are confirmed only by Aviva; until she can record them,
she cannot tell which orders to start making.

**Independent Test**: Place an offline order, mark it paid and check the state and date; then
mark it refunded and check the state, the date and the customer's refund email; check that an online order cannot be "marked paid"
by hand and that an unpaid order cannot be marked refunded.

**Acceptance Scenarios**:

1. **Given** an order awaiting offline payment, **When** Aviva chooses "mark paid" and confirms,
   **Then** its payment state becomes paid, the date and time are recorded and shown, and the
   change appears in the order's history.
2. **Given** a paid order (online or offline), **When** Aviva chooses "mark refunded" and confirms,
   **Then** the payment state becomes refunded with its date, the change appears in the history,
   and the customer is sent a refund email in the order's language.
3. **Given** an order awaiting payment, **When** Aviva opens it, **Then** "mark refunded" is not
   offered; **given** a paid or refunded order, "mark paid" is not offered.
4. **Given** any payment change, **Then** it is recorded in the admin activity log with which admin
   did it, without customer personal data; marking an order paid sends the customer no email.

---

### User Story 4 - The customer follows their order (Priority: P1)

After ordering, the customer has one email from the shop, "order received" (more come only if the
order is cancelled or refunded). Days later they want to know how their order is doing. They tap the link in that email and see their order's page: what
they ordered, whether the payment has been received, and where the order stands (received, being
made, shipped with its tracking number, ready for pickup with Aviva's note, completed, or
cancelled), in the language they ordered in.

**Why this priority**: With no status emails, this page is the customer's only way to see progress
without calling Aviva; without it they are left guessing.

**Independent Test**: Place an offline shipping order in Hebrew and a pickup order in English. Open
each order's link from its "order received" email after each change Aviva makes (paid, in
preparation, shipped with tracking number / ready for pickup with note, completed, cancelled) and
check the page shows the current state in the order's language; check the link still works more than
30 days after ordering while the order is open.

**Acceptance Scenarios**:

1. **Given** an order was placed, **Then** the customer receives "order received" (spec 001's order
   confirmation), whose link is presented as the place to follow the order, and no further email
   while the order progresses (only a cancellation or refund sends one, User Stories 3 and 5).
2. **Given** the customer opens the link, **Then** the page shows the order number, the current
   status as a simple step-by-step progress (Received → Being made → Shipped / Ready for pickup →
   Completed) in the language of the order, the payment state, and the items with their
   preparation times. An order that is being made but not yet paid (e.g. cash at pickup) is
   described as being made, not as waiting for payment to start.
3. **Given** the order is Shipped with a tracking number, **Then** the page shows the tracking
   number; **given** it is Ready for pickup, **Then** the page shows Aviva's pickup note, or the
   shop's pickup instructions when she wrote none.
4. **Given** an offline order still awaiting payment, **Then** the page shows the payment
   instructions and the order number to quote; **once** Aviva marks it paid, **Then** the
   instructions are replaced by "payment received".
5. **Given** the order is Cancelled, **Then** the page says so plainly (with "refunded" once the
   refund is marked) and links to the shop's contact page.
6. **Given** Aviva steps an order back, **Then** the page shows the order's current status.
7. **Given** the order is still open (not Completed or Cancelled), **Then** the link keeps
   working, however long the making takes; **given** it became Completed or Cancelled, **Then** the
   link keeps working for 30 more days and afterwards shows the existing "this link is no longer
   active" page with a contact link.
8. **Given** anyone opens the page, **Then** it never shows the customer's address, phone or email
   (as in spec 001), and it cannot be found without the link.

---

### User Story 5 - Aviva cancels an order (Priority: P2)

A customer changes their mind, or an offline order is never paid. Aviva cancels the order. The shop
asks her to confirm first. If the order was paid, it reminds her to return the money and lets her
mark the order refunded once she has. The customer gets a cancellation email in the order's
language (and, once Aviva marks the refund, a refund email); the customer's order page shows the
cancellation.

**Why this priority**: Cancellations are rarer than normal fulfilment, but they must be safe and
must not let a paid order be cancelled without the refund being remembered.

**Independent Test**: Cancel an unpaid offline order and check the confirmation and the Cancelled
status; cancel a paid order and check the refund reminder and that it can then be marked refunded; check
that each cancellation sends the customer one cancellation email.

**Acceptance Scenarios**:

1. **Given** an order that is New, In preparation, Shipped or Ready for pickup, **When** Aviva
   chooses Cancel, **Then** she is asked to confirm, and nothing changes unless she confirms.
2. **Given** she confirms, **Then** the order's status becomes Cancelled, it appears in the
   history and activity log, and the customer is sent a cancellation email in the order's language
   saying the order was cancelled (and, if it was paid, that the money will be returned) with the
   shop's contact details.
3. **Given** the cancelled order was paid, **Then** she is clearly reminded to issue the refund
   (through the payment provider for online payments, or by the original offline method) and is
   offered "mark refunded" on the order.
4. **Given** a Completed or Cancelled order, **Then** Cancel is not offered.

---

### User Story 6 - Aviva corrects a customer's details (Priority: P3)

A customer calls to say they typed the wrong phone number or address. Aviva opens the order and
corrects the customer's name, phone, email or (for shipping orders) address. The same checks as at
checkout apply.

**Why this priority**: It is needed occasionally and is the customer's legal right to correction
(001 FR-039), but most orders never need it.

**Independent Test**: Open an order, change the phone and address, save, and check the new values
are shown and the change is in the history; try an invalid email and check a field-specific
message appears and nothing is saved.

**Acceptance Scenarios**:

1. **Given** an order, **When** Aviva edits the customer's name, phone, email or shipping address
   and saves, **Then** the new values are shown on the order.
2. **Given** an invalid value (e.g., malformed email or phone, missing city for a shipping order),
   **When** she saves, **Then** she sees a plain-Hebrew message next to that field and nothing is
   saved.
3. **Given** a correction is saved, **Then** the order's history and the activity log record that
   the customer's details were changed and by whom, without recording the old or new values.

---

### User Story 7 - Aviva sees what needs her attention (Priority: P3)

When Aviva opens the admin area she sees at a glance how many orders are new and how many are
still awaiting payment, and each count takes her to that filtered list. While required shop
settings still hold placeholder values, she also sees which ones to fill in.

**Why this priority**: It saves a few taps each day and surfaces unpaid orders she might forget,
but the orders list alone is enough to work.

**Independent Test**: With 2 new orders and 3 unpaid (not cancelled) orders, open the admin home
and check both counts and that each link opens the matching filtered list; with a placeholder
setting, check the settings notice appears.

**Acceptance Scenarios**:

1. **Given** orders exist, **When** Aviva opens the admin home, **Then** she sees the number of New
   orders and the number of orders awaiting payment that are not Cancelled, each linking to the
   orders list filtered accordingly.
2. **Given** no orders need attention, **Then** the home page says so plainly instead of showing
   zeros only.
3. **Given** a required shop setting still has its placeholder value, **Then** the home page lists
   the settings still to fill and links to the settings page.

---

### Edge Cases

- **Mistaken status change**: Aviva taps the wrong status (e.g., Shipped instead of In
  preparation). She steps the order back one step; the customer's page shows the corrected status.
  Completed and Cancelled cannot be undone, which is why both ask for confirmation.
- **Mistaken payment mark**: payment marks cannot be undone in the shop, so "mark paid" and "mark
  refunded" ask for confirmation first.
- **Two admins act on the same order at once** (Aviva and the family helper): the second change
  is checked against the order's current state; if it is no longer allowed she sees a plain
  message that the order was just changed, and the page shows the current state.
- **An online-paid order**: "mark paid" is never offered; it was marked paid from the payment
  provider's confirmation (constitution IV).
- **Late payment on a cancelled offline order**: the customer pays after the order was cancelled.
  Aviva can still mark it paid and then refunded, so the record matches what happened; the status
  stays Cancelled.
- **"Order received" email cannot be sent** (e.g. the email service refuses the address): the
  customer has no link to follow the order. The shop stops retrying after at least 3 attempts and 2 minutes
  (normally 3–5 minutes after the order), emails Aviva
  that the order email could not be sent (with a link to the order), and the order page warns her
  and shows the customer's phone so she can call. The order still moves forward. An email the
  provider accepted but that later bounces is not detected (no bounce tracking in this feature).
- **Cancellation or refund email cannot be sent**: the change still happens; the email is retried
  like other customer emails, and a final failure is shown on the order page.
- **Customer lost the email**: they contact Aviva, who tells them the status (re-sending the email
  is not part of this feature).
- **Old order links**: links of orders placed before this feature that are already past their 30
  days follow the new rule: they work again while the order is open, and for 30 days after it is
  Completed or Cancelled.
- **Order whose customer details were anonymised** (feature 003): status changes still work; the
  admin order page says the customer can no longer be contacted.
- **The product was deleted after ordering**: the order keeps its own copy of the name, photo,
  options and price (001 US1 #5).
- **Ready for pickup with no pickup note and no pickup instructions in settings**: the customer's
  page asks them to contact the shop to arrange pickup; the settings notice on the admin home
  already flags missing pickup instructions when pickup is enabled.
- **Very long tracking number or note**: tracking numbers over 100 characters and pickup notes over
  500 characters are refused with a message naming the limit (also when edited later).
- **Late payment on a cancelled order, then refunded**: the customer already had the cancellation
  email; marking the refund sends the refund email.
- **Filter with no results**: the list shows a friendly "no orders match" message and a way to clear
  the filter.
- **A link to an order that does not exist** (deleted test data, mistyped address): Aviva sees the
  admin "not found" page, not an error.
- **Signed out**: no order list, order detail, count or action is available or reveals any data
  without both sign-in steps (001 FR-031, SC-007).

## Requirements *(mandatory)*

### Functional Requirements

**Notifications**

- **FR-001**: The owner MUST continue to receive, for every confirmed order, the notification
  email spec 001 defines (001 FR-026), and its link MUST open that order's page in the admin area,
  through sign-in if needed.
- **FR-002**: The customer MUST receive spec 001's order confirmation ("order received") in the
  language of the order, whose link is presented as the place to follow the order. Afterwards the
  customer MUST receive exactly two kinds of email about the order, each in the order's language
  and at most once per order: a **cancellation email** when the order is cancelled (saying whether
  the money will be returned, with the shop's contact details) and a **refund email** when the
  order is marked refunded. No other status or payment change sends the customer an email. This
  replaces spec 001 FR-029.

**Orders list**

- **FR-003**: The admin area MUST list all orders newest first, showing for each: order number,
  date and time (Israel time), customer name, total with currency, payment state and status.
- **FR-004**: The owner MUST be able to filter the list by status (New, In preparation, Shipped,
  Ready for pickup, Completed, Cancelled) and by payment state (Awaiting payment, Paid, Refunded),
  separately or together, and clear the filters. The list MUST be paged (25 orders per page) and
  paging MUST keep the filters.
- **FR-005**: The orders list MUST offer an order-number box: entering a number (with or without
  "#") opens that order; when no order has that number, a plain message says so. Search by customer
  email or phone is feature 003.

**Admin order page**

- **FR-006**: The order page MUST show: order number, date, status, the items (snapshot photo, name,
  chosen options, quantity, unit price, line total, preparation time), subtotal, delivery fee,
  total and currency, customer name, phone and email (as tap-to-call and tap-to-email links),
  delivery method with the address or self-pickup, the customer's note, payment method, payment
  state with paid / refunded dates, any tracking number or pickup note, and the order history
  (each change with date, time and the admin who made it, or "system" for automatic changes).
- **FR-007**: When the "order received" email to the customer could not be sent, the shop MUST
  stop retrying it at the first failed attempt that is the third attempt or later and made at
  least 2 minutes after the order was placed (normally 3–5 minutes after it), send the owner a notification email (to the shop's
  notification addresses, with a link to the order's admin page and no customer details in the
  subject), and the order page MUST show a clear warning telling the owner to contact the
  customer by phone. The order page MUST also show when a cancellation or refund email finally
  failed. Bounces after the email provider accepted an email are out of scope.
- **FR-008**: The order page MUST offer only the actions the order's current status and payment
  state allow (FR-009, FR-013), as large, plainly labelled buttons usable on a phone.

**Status changes**

- **FR-009**: Orders MUST follow exactly these status transitions (001 FR-028, R18, extended by
  Clarifications 2026-11-09):
  - forward: New → In preparation; New or In preparation → Shipped (shipping orders only) or Ready
    for pickup (pickup orders only); Shipped or Ready for pickup → Completed; New, In preparation,
    Shipped or Ready for pickup → Cancelled;
  - one step back: In preparation → New; Shipped or Ready for pickup → the status the order had
    just before it (New or In preparation);
  - Completed and Cancelled are final.
  Any other change MUST be refused by the server with a plain-Hebrew message, whatever the page
  offered. A repeated or simultaneous submission of the same change MUST take effect once.
- **FR-010**: When marking an order Shipped, the owner MAY enter a tracking number (up to 100
  characters); when marking it Ready for pickup, she MAY enter a pickup note (up to 500 characters).
  Both are stored on the order, shown on the admin and customer order pages, and offered again
  pre-filled if the order re-enters that status. While the order is Shipped the owner MUST be able
  to edit the tracking number, and while it is Ready for pickup the pickup note, directly (same
  limits, no status change, recorded in the history without the text).
- **FR-011**: Actions that cannot be undone (Completed, Cancel, mark paid, mark refunded) MUST ask
  for confirmation first (constitution II). Cancelling a paid order MUST remind the owner to issue the refund outside the shop and offer to
  mark the order refunded (001 FR-030). Completing an offline order that still awaits payment
  MUST offer to mark it paid in the same step.

**Payment state**

- **FR-012**: An online order is marked paid only from the payment provider's confirmation
  (constitution IV), never by hand.
- **FR-013**: The owner MUST be able to mark an offline order that is awaiting payment as paid,
  recording the date and time, and mark any paid order as refunded, recording the date and time
  (001 FR-021). Payment can be marked on an order in any status, including Cancelled. Refunds
  themselves happen outside the shop; marking one sends the refund email (FR-002).

**Customer order page**

- **FR-014**: The customer's order page (reached only through the link in the "order received"
  email) MUST show, in the language of the order: the order number; the current status as a simple
  progress (Received → Being made → Shipped or Ready for pickup → Completed), or a plain
  "cancelled" notice with a link to the contact page; the payment state; the tracking number when
  Shipped; the owner's pickup note (or the shop's pickup instructions) when Ready for pickup; the payment instructions only while an offline order awaits payment and is neither Cancelled
  nor Completed; and the
  items with their preparation times. It MUST show the current state each time it is opened and
  MUST NOT show the customer's address, phone or email.
- **FR-015**: The order page link MUST keep working while the order is open, and for 30 days after
  the order becomes Completed or Cancelled; after that it shows the existing "link no longer active"
  page with a contact link.

**Customer details**

- **FR-016**: The owner MUST be able to correct an order's customer name, phone, email and, for
  shipping orders, delivery address (001 FR-039, correction right), with the same validation rules
  and limits as checkout and field-specific plain-Hebrew messages. The delivery method, items and
  amounts of an order cannot be changed.

**Overview**

- **FR-017**: The admin home MUST show the number of New orders and the number of orders awaiting
  payment that are not Cancelled, each linking to the orders list with the matching filter, and,
  while any required shop setting still has its placeholder value, a notice listing those settings
  with a link to the settings page.

**Records, security and language**

- **FR-018**: Every status change, payment change, tracking-number or pickup-note edit and
  customer-details correction MUST be recorded
  in the order's history and in the admin activity log (001 FR-035) with the acting admin and time;
  neither record may contain customer personal data (names, contact details, addresses, notes,
  tracking numbers).
- **FR-019**: Every admin order screen, count and action MUST require a fully signed-in admin (both
  sign-in steps, 001 FR-031) and check it on every request; state-changing actions MUST be
  protected against cross-site requests and validate all input on the server.
- **FR-020**: All admin order screens MUST be in plain Hebrew, right-to-left, mobile-first, with
  clear success and error feedback (constitution II, 001 FR-044). The customer order page MUST be
  available in Hebrew and English, with all wording from the shop's translation files
  (constitution I).

### Key Entities

All entities already exist from spec 001; this feature adds no new personal data.

- **Order**: number, date, language of the order, customer name / phone / email, delivery method
  and address, note, payment method, payment state (awaiting payment, paid, refunded) with paid and
  refunded dates, status (new, in preparation, shipped, ready for pickup, completed, cancelled),
  tracking number, pickup note, amounts and currency, and how long the customer's order-page link
  stays valid.
- **Order line**: the snapshot of each ordered item (name, photo, options, preparation time, unit
  price, quantity, line total).
- **Order history entry**: what changed on an order (status, payment, tracking number or pickup
  note edited, customer details, email delivery failures), when, and by which admin or by the
  system; no personal data.
- **Admin activity entry**: who did what and when in the admin area (001 FR-035).
- **Shop settings**: pickup instructions (fallback on the customer's page), notification addresses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On her phone, Aviva can go from the "new order" email to an order marked Shipped with a
  tracking number in under 1 minute, and record an offline payment in under 30 seconds, without
  help, after a single walkthrough.
- **SC-002**: Each customer receives exactly 1 "order received" email per order, at most 1
  cancellation email and at most 1 refund email, and 0 emails from any other status or payment
  change.
- **SC-003**: 100% of status and payment changes are visible on the customer's order page the next
  time it is opened, in the order's language.
- **SC-004**: 100% of confirmed orders appear at the top of the orders list and trigger the owner
  notification within 1 minute (001 SC-003).
- **SC-005**: 0 disallowed status or payment changes succeed, whether attempted from the page or by
  a crafted request.
- **SC-006**: 0 admin order screens, counts or actions are reachable without completing both admin
  sign-in steps (verified for every new admin page and action while signed out, 001 SC-007).
- **SC-007**: 0 customer order pages, order history entries or activity log entries show a
  customer's address, phone or email.
- **SC-008**: A paid order can never be cancelled without the owner seeing the refund reminder.
- **SC-009**: When the "order received" email cannot be sent, the owner is notified by email and
  sees the warning on the order page within 5 minutes of the order.

## Assumptions

- Spec 001's order record, checkout, payment confirmation, owner notification, "order received"
  email and customer order page are in place; this feature adds the admin order screens, the
  dashboard overview and status tracking on the customer's order page, and changes how long its
  link works. No new personal data is collected.
- The "order received" email stays as spec 001 built it; only its link's wording changes to say
  the customer can follow the order there.
- The cancellation and refund emails are transactional (constitution VII) and carry the seller's
  details; Aviva may still call the customer, but the emails are the written record.
- English storefront pages are feature 005, but orders already store their language and the
  customer order page already exists in both languages.
- Searching customers by email or phone, exporting, and anonymising customer data are feature 003;
  this feature covers only correcting details on a single order.
- Viewing the full admin activity log is feature 004; this feature only writes entries to it.
- Refunds are issued outside the shop (payment provider dashboard or original offline method); the
  shop only records that the order was refunded, always for the full amount. Partial refunds are not
  tracked.
- Payment marks have no undo in the shop; the confirmation step before each mark keeps mistakes
  rare.
- Tracking numbers are free text; the shop does not link to carrier tracking sites.
- The design follows `docs/design/storefront.md`: the admin screens use its tokens, type and `ui/`
  primitives (§12 admin area, which the plan extends), and the customer order page extends §8.8.
- Expected volume is a few hundred orders per month at most (001 Assumptions), so a paged list
  with filters is enough.
