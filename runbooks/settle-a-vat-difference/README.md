# Runbook: Settle a VAT difference

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-011](../../invoicing-and-vat/), rules in [SPEC 7](../../invoicing-and-vat/spec/#7-working-out-the-vat) and [SPEC 8](../../invoicing-and-vat/spec/#8-differences-from-the-marketplace) |
| **Who runs it** | The seller's Manager, Admin or Owner, when the account's alerts show a VAT difference, or an invoice is refused because the order is flagged |
| **Role or credential** | Vervoro as Manager or above; issuing on Vervoro's figure needs Admin or Owner. Fixing a tax code at the marketplace needs the seller's own marketplace account |

A flag means the marketplace's tax on an order's goods differs from Vervoro's by more than 1p at one rate. The order ships as normal; only invoicing waits. VAT shown on an invoice is owed by whoever issues it, so the flag is settled before a document is issued.

## Steps

1. Open the alert. Flags are grouped by product, with the VAT at stake and the orders affected.
2. Read the product's VAT class against what it is. The class is the seller's decision; the screen says what each class means.
3. **The class is wrong:** change it on the product. Vervoro writes a correction record for each flagged order's lines, and the flags clear when the figures match. If the class was set for a period already exported, tell the seller's accountant: the export shows the correction in its own section.
4. **The class is right, the marketplace is wrong:** fix the tax setting at the marketplace (an Amazon product tax code, a shop's tax setting), so new orders match.
   - For an Amazon order, Amazon's own invoice already stated its figure, so the record keeps it; tell the seller's accountant.
   - For an order Vervoro must invoice, an Admin or Owner issues on Vervoro's figure and types the reason. The reason is kept on the document.
5. **A bundle component has no cost:** enter the component's standard cost; the next record written splits the line.
6. **The order is not priced in pounds:** it cannot be invoiced at launch. Tell the buyer, and the seller's accountant.

## Verify

- The alert no longer lists the product, or lists only orders still waiting for a person's decision.
- The order's invoice action is offered again, or the issued invoice shows the override reason.

## If it stops halfway

A class change and its correction records are one command: it either happened or it did not. Reopen the alert; whatever is still flagged is still to do. Never change a product's class to make a flag go away when the class was right.
