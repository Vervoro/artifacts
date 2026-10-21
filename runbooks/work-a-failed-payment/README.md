# Runbook: Work a failed payment

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-012](../../billing-and-plans/), rules in [SPEC 7](../../billing-and-plans/spec/#7-company-states), [SPEC 12](../../billing-and-plans/spec/#12-payment) and [SPEC 15](../../billing-and-plans/spec/#15-failed-payments) |
| **Who runs it** | Nobody, in the usual case: Stripe retries and emails, and the state follows the dates. The operator steps in when alerted: a bounced billing notice, a lost dispute, a cancelled mandate with no other method, a payment that cannot settle before closing, or a dead letter from Stripe's events |
| **Role or credential** | The operator console (read the company's billing dates and state). Stripe's dashboard with the operator's own login and second factor, read-only except for credit notes |

Dunning (chasing a failed payment) runs by itself: days 0–14 active with a banner, day 14 restricted, day 30 closed. This page is for the cases above. A company that reaches day 30 goes to [Close and reopen a company for non-payment](../close-and-reopen-a-company/).

## Steps

1. **Read the company in the console:** its state, the date its oldest unpaid invoice first failed, whether a payment is processing, and its closing date.
2. **Compare with Stripe's dashboard:** the open invoice, its payment attempts and the subscription status. If they differ, an event was missed: replay it ([Replay dead letters](../replay-dead-letters/)). Never edit the dates by hand.
3. **A bounced notice:** the banner already shows to every user. Check the billing contact's and the Owners' addresses; ask an Owner, through the banner, to correct them.
4. **A lost dispute:** confirm Vervoro issued a new invoice for the amount and that the failed-payment days started from it. After erasure, record the write-off in the platform security log.
5. **A cancelled mandate with no other method:** confirm the Owner was asked for a new method before the next charge.
6. **A payment that cannot settle in time** through no fault of the seller (a Stripe outage, a disputed charge near day 30): pause the closing date once, by up to 14 days, with a reason. The Owners see the reason.

## Verify

- The console's state matches what Stripe shows, and the next dated step (restriction or closing) is the one the dates give.
- Any pause shows its reason to the Owners and ends on its date.

## If it stops halfway

Nothing here changes stock or orders. Re-reading Stripe and replaying events are safe to repeat. The closing and erasure jobs re-read Stripe before acting, so a missed "payment succeeded" event cannot close a company that paid.
