# English copy review (T028)

Owner: please read the table. Every change is to a value in `src/i18n/messages/en.json` (no key, placeholder or Hebrew text changed; `admin` untouched). Voice: Aviva in the first person, customers addressed directly, plain words (storefront §1 › Voice). A string added by this feature (`admin.products.noEnglish`) is not in the table.

**Look at these first**: `checkout.collection` (the data-collection notice, now in the first person, same meaning), `emails.order.cancellationText` (cancellation wording in the customer email), `checkout.payment.offlineHint`.

## Changed strings (21)

| # | Key | Before | After |
|---|---|---|---|
| 1 | `shop.catalog.emptyText` | You can write to me and ask about an order. | Write to me if you'd like to ask about an order. |
| 2 | `shop.product.shippingText` | I make every order after you place it, and then you can have it delivered or collect it. | I make every piece after you order, then ship it to you or hold it for pickup. |
| 3 | `shop.product.returnsText` | You can read the cancellation and return rules on the shipping and returns page. | The cancellation and return rules are on the shipping and returns page. |
| 4 | `shop.notAvailable.text` | Maybe you will find something else here that you like: | Maybe something else here will catch your eye: |
| 5 | `shop.category.emptyText` | You can look at all the pieces. | Have a look at all the pieces instead. |
| 6 | `shop.search.noResultsTitle` | I couldn't find pieces for “<q>{query}</q>” | I couldn't find any pieces for “<q>{query}</q>” |
| 7 | `shop.search.tooLong` | You can search up to 80 characters. | Searches can be up to 80 characters long. |
| 8 | `cart.stepper.atMin` | You can't order fewer than one. | The minimum is one. |
| 9 | `checkout.quoting` | Working it out… | Calculating… |
| 10 | `checkout.payment_unavailable_method` | The payment method you chose isn't available right now. Choose another one. | The payment method you chose isn't available right now. Please choose another one. |
| 11 | `checkout.delivery_unavailable` | The delivery option you chose isn't available right now. Choose another one. | The delivery option you chose isn't available right now. Please choose another one. |
| 12 | `checkout.payment.offlineHint` | After you order you'll get the payment details: transfer, Bit, PayBox or cash on pickup | After you order, you'll get the payment details (bank transfer, Bit, PayBox, or cash on pickup) |
| 13 | `checkout.collection` | The details are needed to handle your order and to contact you about it. You aren't legally required to provide them, but without them an order can't be placed. Who receives them and how they are kept: <privacy>Privacy Policy</privacy>. | I need these details to handle your order and contact you about it. You aren't legally required to provide them, but without them I can't take your order. Who receives them and how they are kept is described in the <privacy>Privacy Policy</privacy>. |
| 14 | `checkout.return.switched` | Your order continues as direct payment to me. All the details were emailed to you. | Your order will continue as a direct payment to me. I've emailed you all the details. |
| 15 | `checkout.return.timeout` | The payment is still being checked. A confirmation will reach you by email. | I'm still checking your payment. You'll get a confirmation by email. |
| 16 | `order.madePaid` | Now I start crocheting. | Now I'll start crocheting. |
| 17 | `emails.order.cancellationText` | You may cancel a purchase as the law and the shop's cancellation policy allow. Pieces made specially for you fall under the exception in the law. Full details on the shipping, returns and cancellation page: | You can cancel a purchase as the law and my cancellation policy allow. Pieces made specially for you are covered by an exception in the law. The full details are on the shipping, returns and cancellation page: |
| 18 | `errors.notFound.text` | The link may be old or the page may have moved. You can search here, or go to all pieces. | The link may be old, or the page may have moved. Try searching, or browse all pieces. |
| 19 | `consent.categories.analytics.description` | Cookies that help us understand how the site is used. | Cookies that help me understand how the site is used. |
| 20 | `consent.errors.invalid` | That choice was not valid. Please try again. | That choice wasn't valid. Please try again. |
| 21 | `consent.errors.failed` | We could not save your choice. Please try again. | I couldn't save your choice. Please try again. |

## Left as they are, and why

- `order.emailSent` and `order.madeAwaiting`: quoted word for word in storefront.md §8.8 (Clarifications 2026-11-09); the Hebrew counterparts are asserted by the order-tracking E2E spec.
- `errors.generic.text`: the same sentence is hard-coded in `src/i18n/global-error-messages.ts` (the fallback when the page cannot render its messages); both stay identical.
- `emails.order.followIntro` and the `emails.order.*` labels: asserted by tests and already natural.
- Owner-facing emails (`emails.newOrder`, `emails.contact`, `emails.paymentMismatch`, `emails.paymentAttention`, `emails.orderEmailFailed`, `emails.securityAlert`): sent to the owner in Hebrew, the English text is never shown.
- `checkout.form_expired`: the server returns it for several causes (bad signature, honeypot, a form sent too fast, an old form), so "expired" would often be untrue; the first-person wording stays.
- `checkout.fakePay.*`: development and test page only.
- `checkout.marketing.label` and `checkout.marketing.hint`, `checkout.terms.label`: consent wording; kept close to the Hebrew legal text.
- `shop.catalog.intro` ("I knit or crochet every piece here by hand…"): already first person and natural; the Hebrew says "every doll and every animal", the English is deliberately broader ("piece").
- Terms such as "piece" and "self-pickup" are already used consistently across the shop and were kept.
