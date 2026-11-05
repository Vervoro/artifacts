# Runbook: Set up the Stripe account

| | |
| --- | --- |
| **Built** | At launch (ruled by delegation, 5 November 2026, for the owner's confirmation) |
| **Record** | [ADR-012](../../billing-and-plans/), rules in [SPEC 11](../../billing-and-plans/spec/#11-notices), [SPEC 12](../../billing-and-plans/spec/#12-payment), [SPEC 15](../../billing-and-plans/spec/#15-failed-payments), [SPEC 17](../../billing-and-plans/spec/#17-vervoros-invoices-and-vat) and [SPEC 22](../../billing-and-plans/spec/#22-constraints) |
| **Who runs it** | The owner, once for each Stripe account (the sandbox staging uses, then the live account), before the first company subscribes there; again after any change to these settings |
| **Role or credential** | Stripe's dashboard with the owner's own login and second factor. The app's Worker configuration for each environment, changed through a reviewed deploy |

Vervoro's code relies on these account settings and never makes them itself: Stripe holds them. Every step names what to check afterwards. Run them in order on the sandbox first.

## Steps

1. **Failed payments end in "unpaid".** In Stripe's billing settings for failed payments, choose to mark the subscription unpaid after the last retry, never to cancel it ([SPEC 15.3](../../billing-and-plans/spec/#15-failed-payments)).
   Verify: the setting reads "mark the subscription as unpaid"; in the sandbox, a test subscription whose retries all fail shows the status `unpaid`, and its open invoice can still be paid.
2. **Retries.** Turn on Smart Retries over a 2-week window, with retries for Direct Debit payments on ([SPEC 15.1](../../billing-and-plans/spec/#15-failed-payments)).
   Verify: the retry schedule reads Smart Retries within 2 weeks, and Direct Debit retries are on.
3. **Stripe's own emails.** Turn on the customer emails for a trial ending, a failed payment, a card expiring, and a payment that needs authentication ([SPEC 11.1](../../billing-and-plans/spec/#11-notices)).
   Verify: each of the four is on in the email settings; a sandbox customer with a test card that needs authentication receives the email.
4. **The customer portal.** Turn the portal on for changing the payment method and billing details and reading invoices, with plan switching and cancelling off ([SPEC 12](../../billing-and-plans/spec/#12-payment)).
   Verify: a sandbox customer's portal shows the payment method, billing details and invoices, and offers no plan change and no cancel.
5. **Invoices in Vervoro's name.** Set Vervoro's registered name, address and VAT number on invoices, with one invoice prefix and numbering across the whole account, never reset ([SPEC 17.1, 17.2](../../billing-and-plans/spec/#17-vervoros-invoices-and-vat)).
   Verify: a sandbox invoice shows Vervoro's name, address and VAT number, and its number carries the prefix and follows the account's last.
6. **The VAT rate.** Create one tax rate: VAT, GB, 20 %, exclusive (not included in the price). Set its id (`txr_…`) as the Worker variable `STRIPE_VAT_RATE` in that environment's configuration, and deploy ([SPEC 17.4](../../billing-and-plans/spec/#17-vervoros-invoices-and-vat)). Until it is set, subscribing is refused and the operator alerted; no invoice is ever made without VAT.
   Verify: Stripe shows the rate active, 20 %, exclusive, jurisdiction GB; after the deploy, a sandbox subscription's first invoice adds 20 % VAT on top of the plan's price.

## Verify

- Every step's own check has passed on this account.
- In the sandbox, one test company runs end to end: Checkout, a subscription at the trial's end with VAT on its invoice, a failed payment retried then left unpaid, and the portal offering no plan change or cancel.

## If it stops halfway

Each step is a setting that can be set again; none charges anyone. Until step 6's variable is deployed, subscribing is refused, so no seller is charged without VAT. Finish the steps before telling the operator the account is ready.
