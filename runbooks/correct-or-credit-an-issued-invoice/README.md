# Runbook: Correct or credit an issued invoice

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-011](../../invoicing-and-vat/), rules in [SPEC 5](../../invoicing-and-vat/spec/#5-numbering) and [SPEC 9](../../invoicing-and-vat/spec/#9-refunds-and-credit-notes) |
| **Who runs it** | The seller's Manager, Admin or Owner, when a refund is recorded on an order Vervoro invoiced, or an issued invoice is found wrong |
| **Role or credential** | Vervoro as Manager or above. The refund itself is made in the marketplace's own tools |

An issued invoice is never edited or deleted. A refund is credited; a wrong invoice is cancelled by a credit note for all of it and, if one is still needed, replaced by a new invoice with a new number.

## Steps

1. Open the order. Check who issued its invoice: only an invoice Vervoro issued can be credited here. For an order the marketplace invoiced, its own credit note covers the refund; stop.
2. **For a refund:** check the refund shows on the order (Orders records it from the marketplace). The order's screen offers a credit note for the refunded lines and amounts, at the original invoice's rates, and shows the date the law wants it by: 14 days after the refund was paid.
3. **For a wrong invoice** (wrong customer, wrong class, wrong lines): choose "credit all of it" on the invoice. If the cause is a product's VAT class, fix the class first, so the new invoice is right.
4. Read the credit note on screen: the original invoice's number and date, the lines and amounts, the VAT per rate. Confirm it. It takes the next number in the series.
5. If the buyer still needs an invoice, issue a new one from the order. For an eBay order, confirm again that eBay holds none.
6. Download the PDFs and send them to the buyer through the marketplace's messages, or to a business customer directly.

## Verify

- The order lists the original invoice, the credit note naming it, and any new invoice, each with its own number and no gap in the series.
- The VAT summary for the refund's period shows the refund or the correction.

## If it stops halfway

Nothing is stored until a credit note or invoice is confirmed, and a failed confirmation stores nothing and uses no number. Start again from step 1. If the 14-day date passes, issue the credit note anyway and tell the seller's accountant.
