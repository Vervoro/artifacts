# Runbook: Refund a seller

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-012](../../billing-and-plans/), rules in [SPEC 16](../../billing-and-plans/spec/#16-cancellation-export-erasure-and-refunds) and [SPEC 17](../../billing-and-plans/spec/#17-vervoros-invoices-and-vat) |
| **Who runs it** | The operator, when a seller reports a charge made by Vervoro's mistake (a double charge, a wrong plan) |
| **Role or credential** | Stripe's dashboard with the operator's own login and second factor; the operator console to read the company's plan history and `audit_log` |

Part periods are never refunded on cancellation or downgrade. A charge the seller simply regrets is not this procedure.

## Steps

1. **Confirm the mistake.** Compare the invoice with the company's plan history and its billing entries in `audit_log`. Record the case in the platform security log: the company, the invoice number, what went wrong.
2. **Choose refund or credit.** A credit against the next invoice suits a seller who stays; a refund suits one who has left or asks for the money.
3. **Issue a credit note at Stripe** against the invoice, for the wrong amount only. Never edit or void an issued invoice.
4. **For a refund to a card,** refund the payment against that credit note.
5. **For a refund of a Bacs payment,** check that the original payment has settled. Tell the seller first, by email to the billing contact, that the refund is coming and that they should not also claim it from their bank under the Direct Debit Guarantee. Then refund against the credit note.
6. **Where needed,** issue a correct new invoice.

## Verify

- The credit note appears in the company's invoices in Vervoro and in Vervoro's accounting software.
- The refund shows as succeeded at Stripe, and the security log entry is closed.

## If it stops halfway

A credit note without its refund leaves a credit on the account: refund against it, or leave it to the next invoice and tell the seller. A refund is never made without a credit note. If the seller also claimed under the Direct Debit Guarantee, the claim arrives as a dispute, which makes the amount owed again ([SPEC 12](../../billing-and-plans/spec/#12-payment)); do not refund a second time, and follow [Work a failed payment](../work-a-failed-payment/).
