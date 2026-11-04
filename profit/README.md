# ADR-016: Profit

| | |
| --- | --- |
| **Status** | Accepted, 4 November 2026 (the owner, by delegation: decision list of 4 November) |
| **Date** | 2 November 2026, drafted for the owner's approval (ROADMAP 5.6.1, owner delegation); revised the same day after its plan review and completeness review; accepted 4 November 2026 |
| **Scope** | The Profit module: what an order line earned after the marketplace's fees and the labels and advertising the marketplace ties to it; each account's charges that belong to no order; the cost at the time of sale; the figures per product, account and period, and who sees them |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-002](../data-retention/), [ADR-003](../product-model/), [ADR-004](../channel-connectors/) with [ADR-004.1](../ebay-connector/) and [ADR-004.2](../amazon-seller-connector/), [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/), [ADR-010](../users-and-access/), [ADR-011](../invoicing-and-vat/), [ADR-012](../billing-and-plans/), [ADR-014](../fulfilment/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | None yet |

## Context

What the marketplaces give, what sellers expect and what Vervoro already holds (sources in [SPEC 14](spec/#14-research-and-constraints)):

- **Vervoro shows gross margin before fees** ([ADR-003 SPEC 2.4](../product-model/spec/#24-the-products-figures)): revenue without VAT from Orders' sold figures ([ADR-007 SPEC 1.7](../order-ingestion/spec/#1-the-module)) less units sold × the product's standard cost. It says "before fees" because no record holds a marketplace's fees.
- **eBay gives fees per order line.** The Finances API's sale transaction lists each line's fees (final value fee, its fixed per-order part, regulatory fees, the ad fee of a promoted listing); a refund lists the fee credits per line; some fees are billed later as separate charges naming the order. An ad fee can be adjusted for up to 72 hours. UK and EU sellers' Finances calls are signed with Vervoro's own key pair (eBay's digital signatures); the scope is `sell.finances`; only the eBay account's owner can approve it (no team access).
- **Amazon gives fees per SKU within an order.** The Finances API's transactions name the order and the SKU (the older events Amazon withdraws on 27 August 2027); fees post at shipment, up to 48 hours late, and some are held back until released. The role is Finance and Accounting, not restricted. Sponsored Products spend appears only as an account total; spend per SKU needs the Amazon Ads API with its own approval.
- **Postage is mostly not seen.** eBay's labels show as transactions; Vervoro buys no labels ([ADR-014](../fulfilment/): "label on the marketplace" or "own carrier", shipping labels parked in [ADR-000 SPEC 4.7](../system-architecture/spec/)); Amazon Buy Shipping needs a restricted role. The buyer's delivery charge is on the order ([ADR-007 SPEC 5.1](../order-ingestion/spec/)).
- **Some costs belong to no order:** subscriptions, storage, cost-per-click advertising.
- **Profit tools use the cost at the time of sale;** sellers dislike past profit moving when a cost is edited. Vervoro holds a standard cost per product and a landed cost per batch ([ADR-006](../stock-ledger/)), the batch known only at packing and its landed cost provisional until Purchasing's correction ([ADR-015](../purchasing/)).
- **Fees in the UK carry VAT,** which only a VAT-registered seller reclaims ([ADR-011](../invoicing-and-vat/) holds the registration).

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **Profit is a module of its own** (`profit`, switchable, in every plan until Billing sets tiers, [ADR-012](../billing-and-plans/)), the only writer of fee entries, line costs and Profit's day rows. It reads Orders' lines through a line read port and Channels' fee reads; it shows itself through slots (a card on the product and account pages, a column on the Products list, its own page). No module calls Profit.
2. **A line's profit** = revenue (the sold figures' line revenue plus its share of the buyer's delivery charge, without VAT) − fees − marketplace labels − cost − refunds + fee credits. Every part is shown, never only the result. Revenue is the sold figures' own; refunds are their own part.
3. **The cost at sale is the product's standard cost when Profit first sees the line,** never overwritten; a line with no cost takes the product's cost when it is first set. *Later:* the shipped batch's landed cost, trigger: sellers ask for profit on it.
4. **Fees come only from the marketplaces' own figures.** Profit's own daily job asks Channels to read them through each account's connector. A line waiting for fees shows **waiting for fees**, never an estimate, and shows "fees not found" after 60 days; a fee posted late is found by the next daily read. Manual orders and accounts whose connector reads no fees never wait. *Later:* an estimate, trigger: sellers ask for same-day profit.
5. **Advertising the marketplace ties to a line counts on the line;** advertising it gives only as an account total is an **account charge** for its day, never spread over products. *Later:* Amazon's spend per SKU (the Ads API), trigger: the owner approves it and sellers ask.
6. **Account charges** (subscriptions, storage, account advertising, fees on no order) are shown below the products' profit for the account and the company.
7. **Postage:** a label bought on the marketplace is its order's, split by units; a line the seller ships whose postage Vervoro cannot see says **postage not known**, and its profit is before postage; a marketplace-shipped line's postage is in its fulfilment fee. *Later:* labels Vervoro buys (with the shipping-labels record), Amazon Buy Shipping (a restricted role), a postage cost per product (sellers ask).
8. **VAT:** fees count without VAT when the company is VAT-registered on the order's day, with VAT when it is not ([ADR-011](../invoicing-and-vat/)).
9. **Money in another currency** is left out of the sums and counted, as the sold figures do. *Later:* conversion, trigger: a seller sells in a second currency.
10. **The period is the order's day;** a later refund or fee counts on its order's day (the Profit page says the VAT export counts refunds on the refund's day); account charges on the day they post.
11. **Who sees profit:** the costs permission ([ADR-010 SPEC 4](../users-and-access/spec/)): Owner, Admin, Manager, Accountant. The figures are the company's; a scoped Manager sees them whole, as the sold figures. No personal data is read or kept.
12. **Switched on, Profit reads the last 90 days** of lines and fees, their cost at sale taken from today's cost and marked so.
13. **Built in its own phase once approved,** with `sell.finances` granted to Vervoro's eBay keyset and Amazon's Finance and Accounting role on its developer profile before the first seller connects, so no seller approves again for fees ([ADR-004.1 SPEC 1.1](../ebay-connector/spec/)).

## Consequences

- A seller sees what each product and account earned in the marketplace's own figures, with nothing guessed, and every part checkable against the marketplace's statement.
- The newest days show "waiting for fees" until the fees post; most parcels show "postage not known" until Vervoro buys labels.
- Amazon's advertising and every subscription or storage fee stay as account totals.
- Editing a product's cost changes only lines seen afterwards.
- The other records gain: ADR-000 (the module, the parked list), ADR-002 (retention rows), ADR-003 SPEC 2.4 (which card shows which margin), ADR-004 with 004.1 and 004.2 (the fee read, its contract type, the Finances calls, rates and signing key), ADR-007 (the line read port, Profit as a reader of revenue), ADR-010 (row 39 names Profit), ADR-012 (the plan).
