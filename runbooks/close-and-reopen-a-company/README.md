# Runbook: Close and reopen a company for non-payment

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-012](../../billing-and-plans/), rules in [SPEC 9](../../billing-and-plans/spec/#9-closing-a-company) and [SPEC 10](../../billing-and-plans/spec/#10-reopening-a-closed-company); decrease-only in [ADR-008 SPEC 10](../../inventory-sync/spec/#10-listing-modes-and-stopping) |
| **Who runs it** | Closing: the closing job, on the closing date; the operator watches it. Reopening: the seller's Owner pays, then an Owner or Admin takes each account live again; the operator checks the result |
| **Role or credential** | The operator console. Owner (to pay) and Owner or Admin (to go live) in the app |

## Steps: closing

1. **The closing job** re-reads the company's subscription and invoices from Stripe. If it has paid, or a payment is processing, it stops.
2. It publishes `company.closed`. Channels carries out each live connection's stop choice: "send zero" sends zero to every linked listing and waits for each to be confirmed; "leave the figures" changes nothing. Each connection becomes decrease-only.
3. The closing notice goes to every Owner, the billing contact and the stock contact, with the file of last figures, the export link and the erasure date.
4. **The operator checks** in the console that every connection shows decrease-only and every zero chosen is confirmed. An unconfirmed zero is settled by [ADR-004's rule for unknown writes](../../channel-connectors/spec/#5-retries-and-outcomes), never by resending blind.
5. **30 days after closing,** with no payment processing, erasure runs: Channels disconnects every account, then [Erase a company](../erase-a-company/).

## Steps: reopening

1. **The Owner pays** on the billing page: the open invoice, or a new subscription through Checkout if the company cancelled or never paid.
2. The company is active on the next request and its erasure date is cancelled. Billing publishes `company.reopened`; Channels returns every account to shadow.
3. **The seller reads the closed-weeks screen:** what was sent, the orders imported and shipped by hand, and what Vervoro could not see.
4. **The seller records goods received** while closed, by receiving or counting them.
5. **Each account goes live again** on the listing check: [Take a company live](../take-a-company-live/), steps 4–7.

## Verify

- Closing: every connection is decrease-only; no figure has risen since the closing date; the closing notice was delivered.
- Reopening: the company is active, no erasure date is set, every account showed shadow until its go-live confirm, and no marketplace asked for approval again.

## If it stops halfway

- **Closing:** the job is safe to repeat; a connection already decrease-only is left as it is, and a zero already confirmed is not sent again.
- **Reopening before going live:** accounts stay in shadow and send nothing. Carry on from step 3 at any time.
- **Erasure started:** there is nothing to reopen; the seller signs up as a new company, with no trial.
