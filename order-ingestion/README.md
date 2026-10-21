# ADR-007: Order ingestion

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026, revised after a design review the same day; split into ADR, SPEC and RUNBOOK, with Orders as the core module that alone writes orders, 21 October 2026 |
| **Scope** | The Orders module: importing each order once, the order watermark, the status and the marketplace mappings, reserving on import, import problems, holds, cancellations and refunds, unlinked, marketplace-shipped and shipped-outside lines, manual orders, and the deadlines handed to Fulfilment |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-003](../product-model/), [ADR-004](../channel-connectors/) with [ADR-004.1](../ebay-connector/), [ADR-004.2](../amazon-seller-connector/) and [ADR-004.3](../shopify-connector/), [ADR-005](../catalogue-sync/), [ADR-006](../stock-ledger/), [ADR-009](../buyer-data/), [ADR-010](../users-and-access/); used by [ADR-008](../inventory-sync/), [ADR-011](../invoicing-and-vat/) and [ADR-014](../fulfilment/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The procedures for this record](../runbooks/#adr-007-order-ingestion) |

## Context

- **Marketplaces repeat themselves and arrive out of order.** A notice comes twice, late, never, or before the order can be read, and the backup read finds orders a notice already brought. None of it may make two orders, move stock twice or leave an order stuck with nobody told.
- **Every marketplace has its own states** for payment, shipping and cancellation. The warehouse needs one status it can trust: a wrong one oversells, or ships a cancelled order.
- **A wrong parcel costs more than a late one, and a late one still costs.** Shipping an unpaid, cancelled, refunded or flagged order loses goods; shipping late costs a metric. When unsure, the order waits, and a person is told in time to act before the van leaves.
- **Cancelling is the seller's act, on the marketplace.** Marketplaces score sellers on the cancellations they make, and a cancellation is also a refund.
- **Orders also reach the shelf from outside.** Sellers buy labels in the marketplace's own tools, take orders by phone, sell at a counter, or let the marketplace ship. Stock must follow what really left.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **Orders is a core module, the only writer of orders, lines, statuses, holds, cancellations, refunds and manual orders** ([ADR-000](../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). Channels fetches each order and hands it to Orders' port; Orders knows no marketplace protocol, and reserves through Inventory's port in its own transaction ([ADR-006](../stock-ledger/)).
2. **Orders arrive by webhook; the scheduled read is only the completeness check,** at the interval [ADR-004](../channel-connectors/spec/#9-the-completeness-check) sets per marketplace. Both end in the same import. **Only a complete read moves the order watermark:** every order in its window has committed or is an import problem.
3. **One order per marketplace order,** keyed by account and marketplace order id. An older fetch changes nothing; the same fetch twice changes nothing. Cancelled and shipped-outside units only rise, and a reserved line keeps its listing; a fetch that seems to undo either holds the order.
4. **Each import is one transaction that reserves:** the order, its lines and their reservations, or nothing, oldest purchase first. An order not ready to ship still reserves, with a marketplace hold. **An order that cannot be imported is never dropped:** it becomes a problem row naming its listings, retried on every notice and read, and the seller and operator are told. Buyer data comes only from the fetched order, and only the fields [ADR-009](../buyer-data/) allows.
5. **The status is worked out from the order's facts** by one function: pending, open, picking, packed, part shipped, shipped or cancelled. A move nobody expected is written, holds the order and alerts the operator; no import is refused for its status.
6. **Holds sit beside the status, in three kinds that decide who clears them:** the marketplace's, a manager's (office) and the warehouse's (floor). A hold keeps the reservation, sends nothing to the marketplace, stops picking, packing and dispatch, and escalates before its decide-by time.
7. **Vervoro never sends a cancellation.** This record owns the rule. A buyer's request holds the order and keeps its stock; the seller answers or cancels on the marketplace; only a confirmed cancellation releases stock. On Amazon, where shipping is the only refusal, a manager may release the hold and ship. A refund is recorded, never acted on.
8. **Whole orders only.** An order is picked only when every line it ships is linked, fully reserved and unheld; a short order waits for a person's decision. A line is part shipped only when a marketplace reports it. A line for an unlinked listing reserves right after its link commits ([ADR-006](../stock-ledger/spec/#6-what-a-line-reserves), [ADR-005](../catalogue-sync/)), or when a person attaches that line to a product. Each order's leave-by comes from the warehouse's collection cut-off; the floor work is [ADR-014's](../fulfilment/).
9. **Stock follows what really left.** Marketplace-shipped lines are recorded, never reserved. A seller-shipped line on a marketplace-shipped link reserves and opens a conflict on the listing. Units the marketplace reports shipped outside Vervoro deduct what the line held, once, in shadow too; a manager can reverse it. Amazon orders from every marketplace of the region are imported. *Later: mirrors, Shopify orders a marketplace's app made, ship once, with ADR-004.3.*
10. **Manual orders are orders.** Phone, email and business orders start as drafts that reserve nothing; confirming reserves. A counter sale is one screen. Charge lines carry a name, an amount with currency and a VAT class, and never touch stock ([ADR-003](../product-model/spec/#11-charge-lines-and-listings-that-are-not-stock)); delivery stays the order's own charge.

## How an order moves

<!-- DIAGRAM -->

Channels fetches the order on a notice or the completeness check and hands it to Orders. In one transaction Orders writes it, resolves each line with the link valid at purchase, reserves through Inventory, sets its holds and works out its status. After commit Stock sync recomputes the listings' figures ([ADR-008](../inventory-sync/)). A whole, unheld order joins the picking list by leave-by, and Fulfilment ships it.

## Consequences

**Gives**

- A notice, a read, a repeat or a late update never makes a second order or moves stock twice, and the same facts always give the same status.
- One status for every channel, with every marketplace state mapped and tested; a mapping bug alarms on its first order.
- An order that may not ship (unpaid, asked to cancel, refunded, changed under the packer) keeps its stock and cannot reach a parcel.
- Vervoro needs no right to change a marketplace's orders and never releases stock for a cancellation the marketplace has not confirmed.
- An order that cannot be read is visible within minutes, and its units stay off the figures until it imports.

**Costs**

- Every cancellation and every answer to a buyer is made on the marketplace. An eBay request left for 3 days closes unanswered and the order ships.
- A short order waits for stock or for a change on the marketplace; Vervoro never ships part of it.
- Holds stop some orders that were fine to ship; a seller with many pending orders has more to release.
- A shipment outside Vervoro is trusted to have left the warehouse until a manager says otherwise; in shadow its batch is not traced.
- A lost eBay notice leaves an order unreserved until the completeness check, up to an hour.

## Alternatives rejected

- **Poll orders as the main path:** the owner's rule is webhooks; polling spends shared allowances and brings orders late.
- **Import the notice body:** it may be older than the order, carries buyer data, and some carry only ids.
- **A unique index on the partitioned order table:** it must include the month, so the same order in two months would not be caught.
- **A status moved step by step, refusing other moves:** a refused import stalls the watermark, and a stored "packed" stays packed when the order changes underneath.
- **Holds as statuses:** an order can be held for several reasons, and releasing one must not hide another.
- **A per-person "trusted" mark for releasing holds:** the kind of the hold gives the same safety with fixed roles ([ADR-010](../users-and-access/)).
- **Send cancellations and answers from Vervoro:** cancelling is the seller's act; it would also need write rights and eBay's shared pool.
- **Ship what is here from a short order:** whole orders; parked until a pilot shows the need.
- **Release reservations when the marketplace says "shipped" with no Vervoro shipment:** if the parcel left the warehouse, the units would be sold again.
- **Manual orders as a separate module:** two ways to reserve drift apart.

## Open items

- **eBay sandbox:** does an unpaid order's id change when it is paid, and do its line ids survive? If so, a second unique key on (account, marketplace line id) is added before launch.
- **eBay:** whether a lapsed cancellation request sends a notice or moves the order's change time (the fetch at the end of the answer window covers it either way).
- **Amazon:** confirm that no call refuses a buyer's cancellation request, and how linking works when listings are shared across the region's marketplaces.
- **Measured in shadow:** how often notices are lost, how many orders are short, how long holds wait, and how often a seller ships part of an eBay order outside Vervoro (the trigger for "ship what is here").
- **Thresholds are proposals:** the 30-second notice merge window, 3 failed attempts before a problem row, 2 hours' warning before leave-by and decide-by, and the daily re-fetch of orders held by the marketplace over 24 hours.
- **Marketplace constraints** were checked on 18 October 2026; recheck them before launch.
