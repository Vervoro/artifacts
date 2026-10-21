# ADR-011: Invoicing and VAT

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026; charge lines added with [ADR-003](../product-model/), and split into ADR, SPEC and RUNBOOK 21 October 2026 |
| **Scope** | The Invoicing module: the invoices and credit notes a seller issues to buyers for marketplace and manual orders, and the VAT record of every sale: who issues, when, what a document holds, numbering, how VAT is worked out, differences from a marketplace's figure, refunds, keeping documents, sales outside the UK and the accounting export. Not how Vervoro bills its own sellers ([ADR-012](../billing-and-plans/)) |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-002](../data-retention/), [ADR-003](../product-model/), [ADR-004](../channel-connectors/) with [ADR-004.1](../ebay-connector/) and [ADR-004.2](../amazon-seller-connector/), [ADR-007](../order-ingestion/), [ADR-009](../buyer-data/), [ADR-010](../users-and-access/), [ADR-014](../fulfilment/) |
| **SPEC** | [The rules to build from, the constraints with their sources and how to check them](spec/) |
| **RUNBOOK** | [The procedures for this record](../runbooks/#adr-011-invoicing-and-vat) |

## Context

- **VAT is due on every sale, but an invoice is needed for only some.** A VAT invoice is required only for standard- or reduced-rated sales to a VAT-registered customer. Most of what the launch sellers sell is zero-rated food to consumers, who need none. A retailer must still give one to anyone who asks.
- **VAT shown on an invoice is owed by whoever issued it,** even when it was not due. A wrong document costs the seller money; a missing one, for a consumer, costs nothing.
- **Marketplaces already invoice.** Amazon's VAT Calculation Service (VCS) can issue every invoice and credit note itself. eBay issues VAT invoices for a UK seller who opts in, and warns that a second set issued elsewhere doubles the VAT owed.
- **The seller stays responsible.** A third party may issue invoices for a business, but the duties for their content and storage stay with the seller. The seller files VAT returns from accounting software under Making Tax Digital (MTD), which needs a digital link, not retyping.

## Decision

1. **The seller is the supplier, and Vervoro issues documents in the seller's name.** Vervoro is never the supplier and never files a VAT return.
2. **One issuer per sale.** Each marketplace account records who invoices its orders, and Vervoro refuses to issue for an account the marketplace invoices. Amazon invoices its own orders through VCS: Vervoro has no tax invoicing role at Amazon and uploads nothing. eBay invoices if the seller opted in to eBay's VAT invoices; otherwise Vervoro does, and each such invoice carries the issuer's confirmation that eBay holds none for the order.
3. **A document is made only when one is needed or asked for.** A manual order to a business gets a full invoice when it is dispatched. Any other order gets one when a person asks for it for a buyer. The seller sends it: Vervoro keeps no buyer email and sends nothing to buyers.
4. **One invoice layout, with an optional customer block.** Filled, it is a full invoice; empty, it is a simplified invoice, which the law allows up to £250 for a consumer who has not asked for their details. The same layout shows no VAT for a zero-rated order or a seller who is not VAT-registered.
5. **Every sale line gets a VAT record when its order is imported,** invoiced or not, because a marketplace order's tax point (the date that fixes its rate and VAT period) is its payment. Charge lines get one too, at their own VAT class. A cancellation writes a reversing record and a change writes a correction; nothing is rewritten. Documents, refunds and the export read these records.
6. **Vervoro works out the VAT itself, and what the buyer paid wins.** The gross is what the marketplace says the buyer paid. VAT comes from the product's class and the rate valid at the tax point. The marketplace's own tax figure sits beside Vervoro's, never in its place. Goods are compared per order and per rate: a difference over 1p flags the order and blocks invoicing until a person settles it. The flag never holds dispatch.
7. **One stated rule for rounding and splits.** VAT is rounded per line to the nearest penny, half up, never down. A bundle whose parts have different classes is split by its components' standard costs. A delivery charge follows the VAT liability of the goods it carries, split by their value on a mixed order. Discounts reduce the lines they apply to.
8. **Documents are numbered, frozen and corrected only by credit note.** Invoices and credit notes share one gap-free series per company, numbered in the transaction that issues them. An issued document, its PDF and its data file never change. A credit note is issued only against an invoice Vervoro issued; other refunds become VAT records only.
9. **The accounting export is a file.** A document register and a VAT summary of every sale, refund and correction, as CSV, which MTD accepts as a digital link. The summary is split by who issued each sale's documents, so a seller who also imports marketplace payouts posts nothing twice. *Later: direct connections to accounting software, when sellers ask.*
10. **UK at launch.** Sales delivered in the UK, Northern Ireland included, use UK rates and UK VAT classes only. A sale delivered outside the UK is a zero-rated export, with the carrier and tracking kept as evidence. A line whose VAT the marketplace collects is recorded as marketplace-collected, and Vervoro issues nothing for it. *Later: per-country VAT classes ([ADR-003](../product-model/)) and selling into the EU, each when a seller needs it.*

## Consequences

**Gives**

- No sale is invoiced twice, and no invoice shows VAT the seller does not owe.
- Every sale and refund has a VAT record in the right period, so the export covers the sales side of the VAT return, invoiced or not.
- Invoice numbers have no gaps and are never reused, even across a restore.
- Mixed baskets, hampers and delivery follow one stated rule, kept with each line.
- Documents holding buyers' names and addresses are only the few that need them, with no new Amazon role and no buyer email.

**Costs**

- A VAT-registered seller must use Amazon's VCS; one who will not cannot invoice Amazon Business orders through Vervoro.
- A buyer who wants an invoice waits for a person to issue and send it.
- A difference from a marketplace's figure blocks invoicing that order until a person settles it.
- Bundles need component costs before they can be split, and a domestic order not priced in pounds cannot be invoiced at launch.
- The seller imports the export file into their accounting software by hand each period.

## Alternatives rejected

- **Upload Vervoro's invoices to Amazon:** needs Amazon's restricted tax invoicing role and buyer tax data, and Amazon rejects totals that differ from its own.
- **An invoice for every order:** keeps buyer names and addresses for years on documents nobody asked for.
- **Take the marketplace's tax figure as the VAT:** a shop set to 20% on zero-rated honey would put VAT the seller does not owe into their records.
- **Recalculate the gross from Vervoro's VAT:** documents would match no payment.
- **Round VAT once per invoice, or down:** lines could not be traced to totals, and retailers may not round down.
- **Split hampers by selling price:** products hold no selling price; cost is always there and fair.
- **Write the VAT record at dispatch:** orders paid on the last weekend of a quarter would fall into the next one.
- **Compare delivery and discounts with the marketplace:** shops tax delivery by their own method, so almost every mixed basket would flag.
- **Drafts, or separate kinds for full and simplified invoices:** drafts need states and leave gaps; the law decides what one layout prints.
- **A self-service invoice link for buyers, or emailing invoices:** a public page, buyer-typed personal data and buyer email, to save a short wait.

## Open items

- **Marketplace and HMRC sources** were checked on 18 October 2026; recheck them before launch.
- **Switching Invoicing on after orders already exist:** the SPEC writes VAT records back to a start date the seller picks ([SPEC 1.4](spec/#1-the-module)); confirm with an accountant that this suits a seller who joins mid-period.
