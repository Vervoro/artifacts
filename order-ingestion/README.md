# ADR-007: Order ingestion

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026, revised 18 October 2026 |
| **Scope** | How orders enter Vervoro and move through their life up to dispatch: notices and the backup read, importing each marketplace order once, the order status and how each marketplace's states map to it, when and in what order an import reserves, holds and who clears them, buyer cancellation requests and confirmed cancellations, refunds, orders for unlinked listings, the fulfilment conflict, orders the marketplace ships, the same sale arriving twice, orders shipped outside Vervoro, manual, business and counter orders, buyer data on import, deadlines, and what dispatch is handed |
| **Revision** | 18 October 2026, after a design review: Vervoro never sends a cancellation or an answer to a buyer's request; whole orders only, part shipped only when a marketplace reports it; the status is worked out from the order's facts, with an alarm on any unexpected move; holds come in three kinds that decide who clears them; deadlines come from the warehouse's collection cut-off; a fresh read before an Amazon or Shopify label; Shopify quantities from the fulfilment orders at the warehouse; orders from every marketplace of an Amazon region imported; mirror and duplicate orders; floor stops and put-back tasks; drafts, business fields and counter sales for manual orders |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-003: Product model](../product-model/), [ADR-004: Channel connectors](../channel-connectors/) with [ADR-004.1](../ebay-connector/), [ADR-004.2](../amazon-seller-connector/) and [ADR-004.3](../shopify-connector/), [ADR-005: Catalogue sync and linking](../catalogue-sync/), [ADR-006: Stock ledger and reservations](../stock-ledger/), [ADR-009: Buyer data and privacy](../buyer-data/), [ADR-010: Users, roles and access](../users-and-access/) |

## Context

An order is where a sale turns into work for the warehouse and a change to stock. Earlier records already fixed the pieces around it:

- **ADR-000:** only the foundation changes order status, and importing again updates an order, never duplicates it.
- **ADR-004:** orders arrive by notice; a notice is a hint; the order is fetched; a backup read proves none was missed and is the only thing that moves the order watermark. eBay is read hourly, Amazon and Shopify every 10 minutes, and accounts whose notices go missing more often.
- **ADR-005:** the link that was valid when the buyer bought decides the product. Unlinked listings are left to the marketplace, but their orders are imported.
- **ADR-006:** an order reserves when it is imported, in the same transaction. A cancellation request is not a cancellation. An order marked shipped outside Vervoro deducts by default.
- **ADR-009:** only the fields a label needs are kept, fetched from the marketplace, never from a notice body, and anonymised 30 days after delivery.

This record decides the order itself: how it is imported, what state it is in, what each marketplace's states mean in Vervoro, what stops it for a person and who may unstick it, and what happens at each step until a parcel leaves.

The design has to meet these requirements:

- **Marketplaces repeat themselves and arrive out of order.** A notice comes twice, late, never, or before the order can be read. The backup read finds an order a notice already brought, or the other way round. None of this may make two orders, move stock twice, or leave an order stuck with nobody told.
- **Every marketplace has its own states.** eBay, Amazon and Shopify describe payment, shipping and cancellation differently. The warehouse needs one status it can trust. A wrong status oversells, or ships a cancelled order.
- **A wrong parcel costs more than a late one, and a late one still costs.** Shipping an order that is unpaid, cancelled, refunded or flagged as fraud loses goods. Shipping late costs a metric. When unsure, the order waits, and a person is told in time to act before the van leaves.
- **Cancelling is the seller's act, on the marketplace.** Marketplaces score sellers on cancellations they make, and a cancellation is also a refund. Vervoro shows what the marketplace asks and what it decided; it never cancels or answers for the seller.
- **One order leaves in one shipment.** Vervoro ships whole orders. An order is in part shipped only when a marketplace reports it.
- **Orders also reach the shelf from outside.** Sellers buy labels in the marketplace's own tools, sell at a counter, take orders by phone, or let the marketplace ship. Stock must follow what really left.
- **The warehouse works on phones against a collection time.** Each order needs one time by which it must leave, and a pick list it can follow without asking.

## Decision

1. **Notices first, the backup read behind.** Every order notice is answered by fetching the order and importing it. The backup read runs at the intervals ADR-004.1, 004.2 and 004.3 fix. Both paths end in the same import.
2. **One order per marketplace order.** The key is the account and the marketplace's order id, held in one unpartitioned key table. A fetch older than the stored one is ignored; any other fetch is applied, and applying the same order twice changes nothing.
3. **Facts that end a line only rise.** Units cancelled and units shipped outside Vervoro never go down on a later fetch. A marketplace that seems to undo one holds the order for a person.
4. **The status is worked out from the order's facts,** by one foundation function, inside every transaction that changes them, and stored for lists. The seven statuses are pending, open, picking, packed, part shipped, shipped and cancelled. A move that the expected-moves table does not list is still written, holds the order and alerts the operator; no import is ever refused because of its status.
5. **Holds sit beside the status, in three kinds.** Marketplace holds are cleared only by what the marketplace says. Office holds are cleared by a manager, admin or owner. Floor holds are placed and cleared by anyone in the warehouse. Any hold keeps the reservation, takes the order off the picking list and refuses packing, labels and dispatch. Every hold shows the time by which someone must decide, and escalates.
6. **Each order imports in one transaction that reserves.** Orders found together import oldest purchase first, one transaction each. An import either writes the order, its lines and their reservations, or nothing.
7. **An order that cannot be imported is never dropped.** It is a problem row with its account and the listing and quantity of each line that can be read, never its body. It is retried on every later notice and read; the seller and the operator are told. A value nobody has mapped holds only that order.
8. **An order that is not ready to ship still reserves.** A payment still pending, a pre-order or a scheduled order reserves on import and carries a marketplace hold until the marketplace says it can ship.
9. **Vervoro never sends a cancellation.** A buyer's request holds the order and keeps its stock. The seller answers, or cancels, on the marketplace; the cancellation list links to the order there and shows the marketplace's deadline. Only a cancellation the marketplace confirms releases stock. On Amazon, where shipping is the only way to refuse, a manager may release the hold and ship.
10. **Whole orders only.** An order joins the picking list only when every line it ships is linked and fully reserved. A short order waits with a decision for a person. One shipment may be several boxes.
11. **A refund is recorded, never acted on.** It moves no stock and cancels nothing. A full refund on an order not yet shipped and not cancelled holds it.
12. **An order for an unlinked listing is imported and waits.** Its line reserves nothing. From the order, a person links the listing or attaches just that line to a product.
13. **A seller-shipped line on a marketplace-shipped link reserves and opens a conflict.** The order can ship; the listing's raises wait until the seller answers.
14. **Orders the marketplace ships are recorded, never reserved,** never picked and kept without buyer data.
15. **The same sale is shipped once.** A Shopify order that another connected marketplace's app put into the shop is a mirror: it never reserves or ships while the direct order exists, but its units stay off every figure until then. An unattributed one that matches a direct order is held as a possible duplicate.
16. **Shipped outside Vervoro is a fact on each line,** with the quantity and the marketplace's time. It deducts what the line held, once, in shadow too. A manager can reverse it.
17. **Manual orders are orders.** Phone, email and business orders start as drafts that reserve nothing; confirming reserves. A counter sale, paid and collected at once, is one screen. They follow the same statuses, holds, reservations and dispatch, without a marketplace.
18. **Buyer data comes only from the fetched order** and only for orders the seller ships. Only the fields ADR-009 allows are written, and nothing is written for an order already anonymised.
19. **Dispatch is handed a queue sorted by leave-by:** the last collection at the warehouse that still meets the order's ship-by time. Each order comes with a pick list naming batches and spots, and the packing details ADR-009 lets the warehouse see. Holds are checked again at picking, packing, the label and the confirm, and an Amazon or Shopify order is read fresh before its label.
20. **Amazon orders from every marketplace of the account's region are imported.** The first one the seller ships from a marketplace the account was not set up for asks who ships them.

## How an order comes in

1. **A notice arrives.** The endpoint verifies it, queues the topic, the notice id, the account and the order ids, and answers (ADR-004). Notices for the same order within 30 seconds are merged into one fetch. Correctness never depends on that: the import is idempotent.
2. **The consumer fetches the order** through the binding: eBay's `getOrder`, Amazon's `getOrder` in the 2026 orders API, Shopify's order query with its fulfilment orders. An order not visible yet is fetched again after 30 seconds, doubling, for about half an hour, then left to the backup read (ADR-004).
3. **The connector turns it into the contract's order type.** The host validates it. One that fails is an import problem (below).
4. **The foundation imports it** in one locked transaction (see "Reserving on import").
5. **The backup read** reads the orders changed in its window and imports each one by the same command. It moves the watermark only when every order in the window has committed, or is recorded as an import problem. On Amazon it asks for every marketplace of the account's region in one call.

On eBay, `getOrders` returns the cancellation state but an empty list of requests. When the backup read finds an order whose cancellation state is not `NONE_REQUESTED`, the host fetches that order with `getOrder` to read the request.

**Notices each marketplace sends for an order already imported:** Amazon's order change, eBay's cancellation activity and item marked shipped, and Shopify's order, fulfilment-order and risk topics (ADR-004.1, 004.2, 004.3). Each causes a fetch. Vervoro's own dispatch notices come back as "marked shipped" or "fulfilled" notices: one for an order with a Vervoro shipment sent or on its way is not fetched again.

## One order per marketplace order

**The key.** An order is named by its account and the marketplace's own order id:

| Marketplace | Order id used | Notes |
| --- | --- | --- |
| eBay | The Fulfillment API's `orderId` | eBay changes an order's id when it goes from unpaid to paid. Whether an unpaid order's lines keep their ids across that change is checked in eBay's sandbox before launch (see "Checked before launch") |
| Amazon | `orderId` (3-7-7 digits) | One id across the region's marketplaces |
| Shopify | The order's numeric id | Never the order name (`#1001`), which the seller can change |
| Manual | Vervoro's own order number | From the company's counter (ADR-001) |

**One key table.** Orders and their lines are partitioned by month of purchase (ADR-001). A unique index on a partitioned table must include the month, so it cannot stop the same order arriving twice in two months. So `sales_order_key` is one unpartitioned tenant table, unique on company, account and marketplace order id, holding the order's id and its month. The import looks the key up, under the company's lock, before anything else.

**Which fetch wins.** Every fetched order carries the marketplace's own last change time: eBay's `lastModifiedDate`, Amazon's `lastUpdatedTime`, Shopify's `updatedAt`. The stored order keeps the latest one it applied.

| The fetched order is | What happens |
| --- | --- |
| New | Created, its lines resolved and reserved |
| Newer than the stored one, or with the same change time | Applied. The import works out each line's target and moves only the difference (ADR-006), so applying the same order again changes nothing. The same time is applied because a marketplace may change part of an order, such as a Shopify fulfilment-order hold, without moving the order's own change time |
| Older than the stored one | Ignored |

Only the marketplace's time is compared, never Vervoro's clock.

**Facts that only rise.** On each line, units cancelled and units shipped outside Vervoro (and, on a manual order, units removed by the manager) never go down on a later fetch. A fetch that reports fewer is not applied for that fact; it holds the order "step undone" for a person (see "Late updates").

**Lines.** Each line is named by the marketplace's line id: eBay's `lineItemId`, Amazon's `orderItemId`, Shopify's line item id.

- A line new on a later fetch is added and reserves, as an edit on Shopify can add one.
- A line missing from a later fetch is not removed. Its quantity changes only when the marketplace says so.
- **A line's listing is fixed once it has reserved.** A later fetch that names another listing for the same line id changes nothing. The line keeps its reservation, and the order is held for a person ("line changed after import"). Moving the line would free units promised to a buyer.
- **The quantity is what is still to ship from Vervoro's warehouse.** On eBay and Amazon, the line's quantity less its cancelled units. On Shopify, the remaining quantity of that line on the fulfilment orders assigned to Vervoro's warehouse location, worked out again on every fetch. Shopify's `currentQuantity` is not used: it also drops when units are refunded after they shipped, and does not change when a line moves to another location.

### Duplicates and order of arrival

| What arrives | What happens |
| --- | --- |
| The same notice twice | The second is merged into the first fetch, or fetches and changes nothing |
| Two notices for one order, the later one first | Each causes a fetch. Both fetches return the current order; the second changes nothing |
| A notice before the order can be read | Fetched again with growing delays, then left to the backup read |
| The backup read first, then the notice | The notice's fetch applies the same order again; nothing changes |
| The notice first, then the backup read | The same |
| A notice that never arrives | The backup read imports the order, and the account's notices are marked unreliable (ADR-004) |
| A forged or replayed notice | At most one fetch. A fetch is the marketplace's own truth |
| The same sale as a direct order and as a Shopify order made by that marketplace's app | One ships; see "The same sale twice" |

**Worked example.** An Amazon order `204-0000001-0000001` for 2 jars of honey is placed at 09:00:00.

- 09:00:04: a notice for a new order. The fetch says "not visible yet". The next fetch at 09:00:34 returns it, pending. It is created, reserves 2 jars, and is held "payment pending".
- 09:01:10: a second notice, a status change. The fetch returns it unshipped, changed at 09:01:02. The hold clears; the order is open.
- 09:01:12: the first notice is delivered again by the queue. It is merged into the fetch already made.
- 09:10: the backup read sees the order with change time 09:01:02. Applying it again changes nothing.

### Late updates

Once an order is shipped or cancelled, its status is final. Later news is recorded as a fact on the order:

| Later news | What Vervoro does |
| --- | --- |
| Tracking or delivery from the marketplace | Recorded. A delivery date starts ADR-009's 30 days |
| Our own shipment echoed back | Recognised by the shipment's id, or because the marketplace's shipped quantity is no more than Vervoro's. Nothing moves |
| A refund | Recorded |
| Cancelled after dispatch | Recorded as "cancelled after dispatch". No stock moves (ADR-006). The order shows "expect a return" |
| The marketplace reports fewer units shipped or cancelled than before (a Shopify fulfilment cancelled) | Held "step undone" for a person. Nothing moves until they answer (see "Shipped outside Vervoro") |
| The order is gone from the marketplace (a Shopify order deleted) | Held "order gone". Its reservation stays; a manager can cancel it in Vervoro |
| A changed delivery address before dispatch | Saved. If a label was already bought, the order is held "address changed after label" |

## The order and its lines

**The order holds:** the account (or "manual"), the marketplace order id, the time of purchase, the marketplace's last change time, the status and the version of the function that worked it out, who ships it, the warehouse (the account's default, ADR-006), the ship-by time and the leave-by time, the marketplace it was sold on, where it arrived from (directly, or through a Shopify app, below), whether it is a replacement for an earlier order, the buyer fields of ADR-009, a business buyer's company, VAT number and purchase-order reference when given, its delivery charge as the buyer paid it and any order-level discount (ADR-011), and the times it was shipped, cancelled, delivered and anonymised.

**Each line holds** ADR-006's fields (the link version, product, units per sale, fulfilment, bundle components, units needed and missing) and:

| Field | Meaning |
| --- | --- |
| `marketplace_line_id` | The marketplace's id for the line |
| `listing_id` | The listing it was sold on, by ADR-005's key. Empty when the marketplace names none (a Shopify line with no variant) |
| `sku_sold`, `title` | As the marketplace gave them, for the packer and for matching |
| `quantity` | What is still to ship from Vervoro's warehouse, as above |
| `cancelled` | Units cancelled, confirmed by the marketplace. Only rises |
| `shipped_outside`, `shipped_outside_at` | Units the marketplace says shipped that no Vervoro shipment covers, and when. Only rises |
| `fulfilment` | Who ships this line, from the marketplace: seller, marketplace, or unknown |
| `resolved_by` | Link (the link valid at purchase), person (attached from the order), or none |
| `unit_price`, `currency` | What the line sold for, as the buyer paid it: with VAT included when the marketplace includes it. Money is never added across currencies |
| `discount`, `discount_funded_by` | The line's discount, and whether the seller or the marketplace funded it (ADR-011) |
| `marketplace_tax`, `marketplace_collects` | The marketplace's own tax figure for the line, when it gives one, and whether it collects and pays that tax itself (ADR-011) |
| `vat_country`, `vat_class`, `vat_rate` | The rate the line used (ADR-003) |

Units shipped by Vervoro come from the shipments (ADR-006), so they are not stored twice.

**A line's stock state is worked out, never stored,** from its product and its reservations:

| State | Meaning | Reserves |
| --- | --- | --- |
| **Waiting** | No product yet: the listing is unlinked or unknown | Nothing |
| **Reserved** | Every unit it still needs is reserved | Yes |
| **Short** | Part reserved, the rest recorded as missing (ADR-006) | What exists |
| **Not reserved** | The marketplace ships it, another connection handles it, or it is a mirror | Nothing, ever |
| **Done** | Every unit is shipped or cancelled | Nothing left |

## Statuses

<!-- DIAGRAM -->

Every order has one status. It is not moved step by step: one function in the foundation works it out from the order's facts, inside every transaction that changes one of them, and stores the result so lists can filter by it. The same facts always give the same status, whatever order the notices came in.

| Status | Worked out when | Reserves | Warehouse |
| --- | --- | --- | --- |
| **Cancelled** | Every unit is cancelled and none shipped | Nothing | Final |
| **Shipped** | Every unit is shipped (by Vervoro or outside it) or cancelled, and at least one shipped | Nothing | Final |
| **Part shipped** | The marketplace reports some units shipped outside Vervoro and others still to ship | What remains | The rest is picked and shipped whole |
| **Pending** | The marketplace says the order may not ship yet: payment not complete, a pre-order, a scheduled order | Yes, with a marketplace hold | Not on the picking list |
| **Packed** | Every unit still to ship is in a parcel; packing recorded each unit's batch and moved it, still reserved, to the packing spot (ADR-006) | Yes | Waiting for the shipment to be confirmed |
| **Picking** | A picker has an open pick task for it | Yes | Being picked. Picking moves no stock; its pick task says which spots the units come from, and counts allow for them (ADR-006) |
| **Open** | None of the above | Yes | On the picking list when nothing blocks it |

The rows are checked from the top: an order cancelled while packed is cancelled.

Orders the marketplace ships use only pending, open, part shipped, shipped and cancelled, as the marketplace says.

**Expected moves.** Every change records the old and new status, the fact that caused it, the person or process, and the function's version, in the order's activity view.

| From | To | Caused by |
| --- | --- | --- |
| Pending | Open | The marketplace says the order can ship |
| Any but shipped | Cancelled | The marketplace confirms the whole order cancelled, or a manager cancels a manual order |
| Open | Picking | A picker starts it. Refused while it is blocked or held |
| Picking | Packed | Packing has scanned every unit still to ship |
| Picking, packed | Open | A person puts it back, or the marketplace changed the order (a floor stop, below) |
| Pending, open, picking, packed | Part shipped | The marketplace reports part of the order shipped outside Vervoro |
| Any but cancelled | Shipped | Vervoro's shipment is confirmed, or the marketplace reports the rest shipped or cancelled |

**An unexpected move is an alarm, not a refusal.** A change the table does not list is still written, because the facts are the marketplace's truth and refusing them would stall the account's imports. It holds the order "unexpected status change" and alerts the operator at once. A mapping bug that reads every pre-order as ready to ship is caught on the first order, not after a day of them.

**Checked every night.** ADR-006's nightly check also works out every open order's status again and compares it with the stored one. A difference alerts the operator. A new version of the function is run against every open order before it is deployed, and the moves it would make are reviewed.

- **Shipped and cancelled are final.** Later news is recorded on the order (see "Late updates").
- **A hold never changes the status.** A packed order on hold stays packed and cannot be shipped.
- **Only the foundation writes a status** (ADR-000).

## From each marketplace to Vervoro

The connector maps the marketplace's states onto the contract's order. The foundation works out the status from it. A test covers every row. A value the mapping does not know holds that one order "unknown state" and alerts the operator; only an unknown fulfilment status, which decides what has shipped, makes the order an import problem, scoped to the listings of its lines.

**Amazon, the 2026 orders API.** The connector asks `getOrder` for the fulfilment and cancellation datasets (`includedData` `FULFILLMENT` and `CANCELLATION`), and for the recipient only as ADR-009 allows. The order's `fulfillment.fulfillmentStatus`, `fulfillment.fulfilledBy`, its associated orders and each item's `cancellation`:

| Amazon says | Vervoro |
| --- | --- |
| `PENDING_AVAILABILITY` | Pending, held "not yet due" (a pre-order) |
| `PENDING` | Pending, held "payment pending" |
| `UNSHIPPED` | Open |
| `PARTIALLY_SHIPPED` | Units not covered by a Vervoro shipment are shipped outside; part shipped |
| `SHIPPED` | The same way; shipped |
| `CANCELLED` | Cancelled |
| `UNFULFILLABLE` | Only for Amazon-shipped orders not placed on Amazon: recorded, nothing reserved |
| `fulfilledBy` `AMAZON` | Marketplace-shipped: recorded, never reserved |
| An item's `cancellationRequest` with requester `BUYER` | A buyer's cancellation request: held |
| An item's `cancellationExecution` | That item's units cancelled |
| An associated order of type `REPLACEMENT_ORIGINAL_ID` | A replacement: an ordinary order, marked as one (ADR-012 does not count it) |

**eBay, the Fulfillment API.** The order's `orderFulfillmentStatus`, `orderPaymentStatus`, `cancelStatus` and each line's `lineItemFulfillmentStatus`:

| eBay says | Vervoro |
| --- | --- |
| A new order (eBay returns only orders that completed checkout) | Open |
| `orderPaymentStatus` `PENDING` (the buyer's payment is not complete, as with a delayed payment method) or `FAILED` | Pending, held "payment pending". It reserves: units an unpaid order may still take must not be sold elsewhere |
| `orderFulfillmentStatus` `NOT_STARTED` | Open |
| `orderFulfillmentStatus` `IN_PROGRESS` | Units not covered by a Vervoro shipment are shipped outside; part shipped |
| `orderFulfillmentStatus` `FULFILLED` | The same way; shipped |
| `cancelStatus.cancelState` `IN_PROGRESS` | A buyer's cancellation request: held |
| `cancelStatus.cancelState` `CANCELED` | Cancelled |
| `orderPaymentStatus` `FULLY_REFUNDED` on an order not shipped and not cancelled | Held "refunded, not cancelled" |
| `orderPaymentStatus` `PARTIALLY_REFUNDED` | A refund recorded |

**Shopify.** The order's `cancelledAt`, `displayFinancialStatus`, risk summary, and the fulfilment orders at Vervoro's warehouse location (ADR-004.3). Moving a fulfilment order to another location, holding or releasing it, and a new risk assessment do not reliably raise Shopify's order-updated webhook, so the app also subscribes to their own topics (ADR-004.3), and each causes a fetch:

| Shopify says | Vervoro |
| --- | --- |
| `cancelledAt` set | Cancelled |
| Financial status `PENDING` (a payment that takes time, or a manual payment method) | Pending, held "payment pending" |
| Financial status `VOIDED` or `EXPIRED` on an order not shipped | Pending, held "payment pending". Shopify notes an order can stay open with a voided payment |
| Financial status `AUTHORIZED`, `PAID` or `PARTIALLY_PAID` | Paid enough to ship. Capturing payment is the seller's business in Shopify |
| `REFUNDED` on an order not shipped and not cancelled | Held "refunded, not cancelled" |
| Fulfilment order `OPEN` or `IN_PROGRESS` at the warehouse location | Open |
| Fulfilment order `SCHEDULED` | Pending, held "not yet due" until its `fulfillAt` |
| Fulfilment order `ON_HOLD` | Held "on hold in Shopify" |
| Fulfilment order `CLOSED` with fulfilments Vervoro did not make | Shipped outside, for those units |
| Lines assigned to another location, or to a fulfilment service | Marketplace-shipped lines: recorded, never reserved (ADR-004.3) |
| Risk recommendation `CANCEL` or `INVESTIGATE` | Held "fraud check", unless a manager released that same recommendation before |
| Remaining quantity on the warehouse's fulfilment-order lines lower than before | A smaller quantity: the difference is released (ADR-006); on a picked or packed order, a floor stop |

**Manual orders** have no marketplace. They are confirmed and cancelled in Vervoro.

## Reserving on import

ADR-006 owns how units are chosen and held. This record decides when, in what order, and what happens on failure.

**When.** Every import is one transaction under the company's lock, in ADR-006's steps:

1. Take the company's lock.
2. Look up the order's key. Stop if the fetch is older than the stored order.
3. Write or update the order and its lines; keep the facts that only rise.
4. Resolve each new line with the link valid at the time of purchase (ADR-005), or leave it waiting.
5. Work out each line's target (what it still needs, less what it holds), reserve or release only the difference, and record shortages. A cancellation and an edit in one fetch never release twice.
6. Set or clear the marketplace holds; set floor stops on a picked or packed order that changed.
7. Work out the status, write it if it changed, and raise the alarm on an unexpected move.
8. Write buyer data, and the anonymisation due time when one is known (ADR-009).
9. Write new desired figures for affected listings, and the outbox event. Commit.

**Pending orders reserve too.** A pending order can still become a sale; not holding its units lets another channel sell them. The hold keeps it off the picking list until the marketplace says it can ship. If it is cancelled instead, the units come back.

**In what order.**

- **Orders found together import oldest purchase first.** A backup read page, a burst after an outage, or a notice naming several orders is sorted by time of purchase, then by marketplace order id, so when stock is short the earliest buyer gets it.
- **One transaction per order.** The lock is held for one order at a time (about eight round trips, ADR-006), so a large read never holds one company's stock for long, and orders from other channels interleave.
- **Across channels the lock decides.** Two orders for the last unit from two marketplaces reserve in the order their imports take the lock. Exactly one gets it (ADR-006). The other is short, and the seller sees it.
- **Within an order, lines reserve in the marketplace's line order,** and a bundle's components with it (ADR-006).

**Never half an order.** An import writes the order, every line and every reservation, or none of it.

| What goes wrong | What happens |
| --- | --- |
| Too little stock | Not a failure. The line reserves what exists and is short (ADR-006); the order waits (see "Whole orders") |
| A line's listing is unknown or unlinked | Not a failure. The line waits (below) |
| A state value the mapping does not know | Not a failure. The order is held "unknown state" |
| The database, a lock wait or a timeout | The transaction rolls back. The queue retries with growing delays. After three failed attempts the order is also recorded as an import problem, so the watermark is never stuck behind it, and the operator is alerted (ADR-000) |
| A database check refuses the change ("would go negative") | The transaction rolls back and the refusal is typed (ADR-006). This means a bug, so it alerts the operator at once. The order is retried, and becomes an import problem as above |
| The fetched order fails validation against the contract types | Recorded as an import problem |

**Import problems.** An order that cannot be read into the contract's types (a field missing that the contract needs, a quantity that is not a whole number, an unknown fulfilment status) is never dropped and never guessed (ADR-004).

- A row in `sales_order_problem` holds the account, the marketplace order id, the reason, and when it was first and last seen. Never the order's body, which carries buyer data.
- **It also records the listings the order sold on, as far as they can be read.** For each line whose listing can be read, the row keeps the line's marketplace line id, the listing's key (ADR-005) and the quantity sold, or "quantity not readable". ADR-008 uses the quantity to take those units off the figures it sends until the order imports. A line whose listing cannot be read (its listing field is missing or malformed, or the order cannot be read into lines at all) is recorded as "listing not readable". These are marketplace ids, not buyer data (ADR-009).
- **The listings give the problem its scope,** because the order's units are sold on the marketplace but reserved nowhere in Vervoro. When every line's listing was read, the scope is those listings. When any line's listing could not be read, the scope is the whole account, because any of its listings may have sold those units. ADR-008 decides what a scope holds (raises on those listings or on the account); decreases are never held. The scope ends when the order imports, or when a person marks the problem resolved.
- The seller sees it at the top of the order list, with the marketplace's link to the order. The operator is alerted, because until it imports, the order reserves nothing.
- Every later notice or read of that order tries again. When a fix to the connector ships, the operator retries all open problems at once.
- The backup read counts a window as complete when each of its orders has committed or has a problem row, so one bad order cannot stall the watermark for the account.
- **The same row records a mirror's lines** while its direct order has not arrived (see "The same sale twice"), with the reason "sold there, reserved nowhere".

## Whole orders

Vervoro ships an order in one shipment. One shipment may be several boxes: it has one shipment id and one dispatch notice, and deducts each unit once (ADR-006).

- **An order joins the picking list only when every line it ships is linked and fully reserved,** and nothing blocks or holds it.
- **A short order waits.** "Short" is not a hold: it is worked out from the reservations, and it clears itself when stock arrives and the refill reaches it (ADR-006 refills by ship-by time). The order shows a decision card: wait for stock (with the next expected delivery, if a purchase order names one), or change the order on the marketplace (a link to it). A change made there comes back on the next fetch.
- **A waiting line blocks the same way** until it is linked, attached or cancelled on the marketplace (see "Orders for unlinked listings").
- **Part shipped happens only when the marketplace reports it,** for example when the seller ships part of an order with a label bought in Seller Hub. The rest stays reserved, and Vervoro ships it whole.

Shipping part of a short order from Vervoro ("ship what is here") is not offered at launch. It is reconsidered if a pilot shows that sellers often ship part of an eBay order outside Vervoro (more than ten a week for one seller).

## Holds

A hold pauses an order. It does not release it.

- **An order has a set of hold reasons,** each with who or what set it, when, why, and the time by which someone must decide. Any reason in the set keeps the order off the picking list, and packing, buying a label and confirming a shipment for it are refused.
- **A hold keeps the reservation.** Releasing stock for an order that will probably ship invites overselling.
- **A hold sends nothing to the marketplace.**
- **A confirmed cancellation still cancels a held order** (ADR-006).
- **Every hold and every release** is a row in `sales_order_hold`, an append-only table (ADR-001). The current set is read from it. A release can be undone at once, which holds the order again with its old reason.

**The kind of a hold decides who may clear it.** People are not marked as trusted; reasons are sorted by risk (ADR-010).

| Kind | Who places it | Who clears it |
| --- | --- | --- |
| **Marketplace** | The import | Only the marketplace, through a fetch. Exceptions are named in the table |
| **Office** | The import, or a manager, admin or owner | A manager, admin or owner, with a reason |
| **Floor** | The import, or anyone who works in the warehouse | Anyone who works in the warehouse, or a manager, admin or owner |

| Hold | Kind | Set when | Cleared when |
| --- | --- | --- | --- |
| Payment pending | Marketplace | The marketplace says payment is not complete | The marketplace says it can ship |
| Not yet due | Marketplace | A pre-order, or a Shopify fulfilment order scheduled for later | The marketplace says it can ship |
| Cancellation requested | Marketplace | A buyer asked to cancel | The marketplace confirms or declines it, or the request lapses. On Amazon, a manager may release it to ship (below) |
| On hold in Shopify | Marketplace | The fulfilment order at the warehouse location is on hold | Shopify releases it |
| Location gone | Marketplace | Shopify assigned the order to a location that no longer exists (ADR-004.3) | A person reassigns it in Shopify |
| Address missing | Marketplace | A seller-shipped order that can ship has no complete delivery address, because the marketplace withheld it | A fetch brings it, or a manager enters it |
| Fraud check | Office | Shopify recommends cancelling or investigating | Shopify recommends accepting, or a manager releases it; a released recommendation is not held again until Shopify's changes |
| Refunded, not cancelled | Office | A full refund on an order not shipped and not cancelled | A person decides: cancel it on the marketplace, or ship it |
| Line changed after import | Office | A later fetch names another listing for a line that reserved | A manager resolves the line again (ADR-006), or accepts it as it is |
| Step undone | Office | The marketplace reports fewer units shipped or cancelled than before | A person answers (see "Shipped outside Vervoro") |
| Order gone | Office | The order is gone from the marketplace | A manager cancels it in Vervoro, or keeps it |
| Unknown state | Office | A value the mapping does not know | The mapping learns it, or a manager decides |
| Unexpected status change | Office | A status move the expected-moves table does not list | The operator or a manager checks it |
| Possible duplicate | Office | A Shopify order made by a marketplace app may be a sale already imported directly | A manager confirms it is a separate sale, or marks it a mirror |
| Who ships these? | Office | The first seller-shipped order from an Amazon marketplace the account was not set up for | The seller answers for that marketplace (see the Amazon section) |
| Payment check, customer request, other | Office | A manager holds an order by hand, with a note | A manager, admin or owner |
| Address check | Office before picking; floor once picking starts | A manager holds any order by hand; anyone in the warehouse may hold an order they are picking or packing | Before picking, a manager, admin or owner; from picking on, anyone in the warehouse, or a manager |
| Stock check | Floor | A person holds an order by hand | Anyone in the warehouse |
| Address changed after label | Floor | The delivery address changed after a label was bought | A person checks or replaces the label |
| Order changed: check the parcel | Floor | The marketplace changed a picked or packed order (lines, quantities, address, a new hold) | A person checks the parcel against the order; the put-back task says what to return |
| Label to void | Floor | The order changed or was cancelled after its label was bought | The label is voided, confirmed by a scan or a tap |

**Floor holds never widen who sees buyer data.** The warehouse places or clears an address hold only on an order it is picking or packing, when it already sees the address to prepare the parcel and label (ADR-009). Before picking starts, an address check is an office hold.

**Decide-by and escalation.** Every hold shows the time by which someone must decide: the order's leave-by time, or the marketplace's own deadline when it is sooner (the end of eBay's answer window, below). Two hours before it, the people who may clear that hold are alerted; when it passes, they are alerted again, and the owner too if the owner has switched that on. No hold expires on its own.

**Orders waiting on the marketplace are fetched again.** An order that has had a marketplace hold for more than 24 hours is fetched once a day, so a change whose notice was lost still arrives.

**Worked example.** A Shopify order for 3 jars of jam arrives at 14:00 with payment `PENDING` (a bank transfer). It reserves 3 jars and is held "payment pending" (marketplace). At 16:30 Shopify's risk check recommends investigating; "fraud check" (office) is added. The next morning the payment arrives: "payment pending" clears, but the order is still held. A manager checks the order, releases "fraud check" with the reason "buyer confirmed by phone", and the order joins the picking list. A later fetch with the same recommendation does not hold it again.

## Cancellations

Cancelling an order is the seller's act, on the marketplace. Vervoro never sends a cancellation, and never answers a buyer's request. It shows what is asked, links to the order on the marketplace, holds the stock, and follows what the marketplace confirms.

### A buyer's request

- **eBay:** the order's cancellation state shows a request, and `getOrder` names it. Amazon: an item's `cancellationRequest` names the buyer. Shopify has no buyer request; a buyer asks the seller, who cancels in Shopify.
- **The order is held "cancellation requested".** It keeps its reservation (ADR-006) and leaves the picking list, so nobody packs a parcel the buyer may not want. A picker who has started it is stopped (see "Floor stops").
- **The request is recorded** in `sales_order_cancellation`: who asked, the lines and quantities, when, and the marketplace's answer deadline. Every later change (declined, lapsed, confirmed) is a new row.
- **The cancellation list** is a view of the order list: every open request, sorted by its deadline, each with a link to the order's own page on the marketplace, where the seller accepts or refuses it.
- **eBay's answer window.** On eBay UK the seller has 3 calendar days to answer. A request on a paid order that is not answered is closed by eBay and the order is not cancelled; an unpaid order is cancelled. Vervoro fetches the order again 3 days and 1 hour after the request, so a lapsed request clears the hold even if no notice comes.
- **Amazon: ship anyway.** Amazon has no way to refuse a buyer's request: shipping the order is the refusal. A manager, admin or owner may release the hold with a reason. Vervoro first fetches the order, so it never ships one Amazon has just cancelled. Nothing is sent but the dispatch notice.
- **An answer given on the marketplace** comes back by notice or on the next fetch, which decides: declined clears the hold, confirmed releases the stock.

**Worked example.** An eBay order for 1 honey and 1 jam is placed at 10:00 and reserved. At 10:20 the buyer asks to cancel. The notice's fetch shows the request; the order is held, and the cancellation list shows it with "answer on eBay by 21 Oct, 10:20". A manager opens eBay from the link and accepts. At 10:22 the fetched order is cancelled: both lines release, batch by batch, and the listings get new figures in the same transaction. Had the manager declined on eBay, the next fetch would clear the hold, and the order would rejoin the picking list with its reservation unchanged.

### A cancellation the seller wants

The seller cancels on the marketplace: Seller Hub, Seller Central, or the Shopify admin, where they also choose the refund and the restock. Vervoro's order page links there and names what the marketplace counts against the seller (eBay counts an out-of-stock cancellation as a defect; one the buyer asked for does not). The confirmed cancellation comes back by notice or the backup read. A manual order is the only one cancelled in Vervoro.

Vervoro therefore needs no right to change a marketplace's orders, and spends no shared call allowance on cancelling.

### A confirmed cancellation

- **Before dispatch:** releases exactly what each cancelled line held, in the import's transaction (ADR-006). The line's `cancelled` rises. If every unit is cancelled, the order is cancelled.
- **Already picked or packed:** the release makes the units sellable where the books hold them (the shelf, or the packing spot), and a put-back task is opened for each unit (see "Floor stops"). A label already bought gets "label to void".
- **Part shipped:** releases what is still reserved. If nothing is left to ship, the order is shipped.
- **After dispatch:** recorded as cancelled after dispatch; no stock moves. If the parcel comes back, it is a return (ADR-006).

### Part of an order

A smaller quantity on a line, from an Amazon item cancelled in part or a Shopify edit or move, releases the difference, latest sell-by date first (ADR-006). A larger one reserves more by the usual rules. On a picked or packed order, either sets a floor stop.

**Worked example.** A Shopify order has 6 jars of honey on one line, reserved and picked. The seller edits the order in Shopify to 4. The webhook's fetch shows a remaining quantity of 4 on the warehouse's fulfilment order. In one transaction, 2 jars are released, latest sell-by date first, and listings get new figures. The order is held "order changed: check the parcel", and a put-back task for 2 jars is opened. The packer returns them, scans them back, clears the stop, and packs 4.

### Refunds

- **A refund is recorded:** amount, currency, the lines it names, and when.
- **It moves no stock and cancels nothing.** A refund never restocks, and a restock never refunds (ADR-006).
- **A full refund on an order not shipped and not cancelled holds it,** because shipping goods the buyer has been paid back for loses them. A person decides: cancel it on the marketplace, or ship it anyway.
- **A partial refund** is recorded only. On Shopify a refund that removes units before they ship lowers the remaining quantity on the fulfilment order, which is a smaller quantity, above. A refund after dispatch changes nothing.

## Floor stops

A change that reaches an order the warehouse has already started must reach the person holding the parcel.

- **Any marketplace change to a picked or packed order** (a line added or removed, a smaller or larger quantity, a new address, a new hold, a confirmed cancellation) holds it "order changed: check the parcel". The packer's screen shows a red stop with what changed.
- **Four commands check again on the server:** starting to pick, packing, buying a label and confirming a shipment. Each is refused for an order with any hold, so a stop that arrives between two taps still stops the parcel.
- **Put-back tasks.** Units released from a picked or packed order get a task that names each unit and where it goes. It stays open until each unit is confirmed back in a spot, by a scan or a tap (ADR-006 records the move). Open tasks are listed on the warehouse's home screen until done.
- **Label to void.** A label bought for an order that changed or was cancelled must be voided; the stop clears when the label is confirmed voided, by a scan or a tap.

## Orders for unlinked listings

An unlinked listing is left to the marketplace (ADR-005), but its orders are imported.

- **The line waits.** It reserves nothing and is flagged. The order's other lines reserve as normal.
- **The order does not join the picking list,** because a parcel packed without that line would be wrong. "Waiting line" is worked out, not a hold: it clears itself when the line is linked, attached or cancelled on the marketplace.
- **An unknown listing** (the order names one Vervoro has not read yet) starts a read of that one listing (ADR-005). The line waits meanwhile.
- **A line with no listing at all** (a Shopify line that needs shipping but has no variant and no SKU, ADR-004.3) waits too, and can only be attached.
- **Who is told:** ADR-005 decides it. The first order on an unlinked listing with a strong or medium suggestion alerts the seller; others go to the daily digest.

**From the order, a person has two ways to resolve a waiting line:**

| Choice | What it does | When to use it |
| --- | --- | --- |
| **Link the listing** | Opens ADR-005's link screen. The link reserves for every waiting line of that listing, oldest first, in its own transaction (ADR-006), and the listing starts getting figures | The seller wants Vervoro to manage this listing from now on |
| **Attach this line** | Resolves only this line to a product and units per sale, chosen by the packer holding the item or by a manager. It reserves at once. The listing stays unlinked and gets no figure. The line records `resolved_by` = person | The listing stays with the marketplace, but this parcel ships from the warehouse |

**A waiting line shipped outside Vervoro** reserved nothing, so nothing is deducted. It stays flagged. Attaching it deducts its units at once, earliest sell-by first, as ADR-006 decides. "Not from our stock" closes the flag and moves nothing.

**Worked example.** An eBay order has two lines: 2 jars of honey on a linked listing and 1 "honey dipper" on an unlinked one. The honey reserves 2; the dipper waits, so the order stays off the picking list. The seller has wooden dippers on the shelf, but sells them on eBay only now and then. A manager chooses "Attach this line": dipper, 1 unit per sale. It reserves 1, the order is whole, and it joins the picking list. The dipper listing stays unlinked.

## A seller-shipped order on a marketplace-shipped link

A listing linked as marketplace-shipped (Amazon FBA, ADR-003) gets an order the seller must ship. This happens when a seller switches an offer to ship it themselves while the link still says the marketplace ships.

- **The line's own fulfilment decides** (ADR-005, ADR-006). It reserves units per sale of the product, and the order can ship. Refusing it would leave a buyer with no parcel.
- **A conflict opens on the listing** (ADR-005). Its raises wait. The order is not held.
- **The seller answers once per listing:** "this listing is now seller-shipped" (a new link version, whose first figure waits for the seller's confirm, ADR-005), or "a one-off" (the link stays marketplace-shipped and the conflict closes).
- **The other way round:** a marketplace-shipped line on a seller-shipped link reserves nothing, because the marketplace ships it. The seller is told once per listing. Which way the listing really ships is ADR-005's catalogue read.

## Orders the marketplace ships

Amazon's FBA orders, and Shopify order lines assigned to a location that is not Vervoro's warehouse or to a fulfilment service, leave from someone else's shelf.

- **Recorded for reports:** lines, products through the link, quantities, prices, dates and statuses.
- **Never reserved, never on the picking list, never dispatched by Vervoro.** No hold applies.
- **No buyer data is kept.** Amazon sends none for them (ADR-004.2), and none is asked for.
- **Their status follows the marketplace:** open (or pending), then shipped or cancelled.
- **Fulfilment not yet known:** the line reserves as if the seller ships it, the safer default (ADR-006). When the marketplace says it ships the line, the reservation is released.
- **A Shopify order split across locations** reserves the lines at Vervoro's warehouse and records the rest.

## The same sale twice

A seller may connect eBay or Amazon to Shopify with those marketplaces' own apps (ADR-004.3), so one sale can reach Vervoro twice: directly, and as a Shopify order the app created.

| The Shopify order | Vervoro |
| --- | --- |
| Names a marketplace that is also connected to Vervoro directly | A **mirror**. It never reserves and is never picked: the direct import of that sale does both. Until the direct order arrives, its lines are recorded in the problem row as "sold there, reserved nowhere", scoped to their listings, so ADR-008 keeps those units off every figure. When the direct order imports, the mirror closes and the row ends |
| Names a marketplace that is not connected directly | An ordinary sale: reserved and picked |
| Was created by a marketplace's app but names no marketplace | An ordinary sale. If its SKUs and quantities match a direct order placed within 30 minutes of it, it is held "possible duplicate" for a manager. No buyer data is compared, and orders the shop itself took are never matched |

**A mirror whose direct order never comes.** If a complete backup read of the direct account passes the mirror's purchase time by 30 minutes and no direct order has arrived (a lost notice, or the direct account disconnected), the mirror becomes an ordinary order, reserves, and the seller is alerted. ADR-006's release of announced orders that never arrive does not apply to a mirror's units: the sale is real.

## Shipped outside Vervoro

A marketplace may say units shipped that no Vervoro shipment covers: the seller bought a label in Seller Hub, shipped from elsewhere, or an older system shipped during shadow.

**The fact.** Each line has `shipped_outside`: the units the marketplace says shipped, less those Vervoro's shipments cover, and the marketplace's shipping time. It only rises. eBay reports it by its item-marked-shipped notice (ADR-004.1), Amazon and Shopify by their order notices; the backup read catches any that are missed.

**What it does.**

1. In the import's transaction, the line's reserved units are deducted as `dispatched`, with the source "marketplace said shipped" (ADR-006), packed units first, then earliest sell-by. The status follows: part shipped or shipped.
2. A short line deducts what it held. Its missing units are no longer sought, because the parcel has gone.
3. A waiting line deducts nothing (above).
4. **In shadow too.** While an account is in shadow, the old system ships its orders, and Vervoro deducts them the same way, so the figures Vervoro would send stay true and the comparison with the marketplace means something. These deductions are marked "lot not traced": a recall does not trust the batch they name. At going live the old system's on-hand import sets each product outright (ADR-008), so nothing is counted twice.
5. **Confirm the batch.** When the deduction had to choose between two or more eligible batches of a dated product in that warehouse, a task asks the warehouse to tap the lot that left. It never blocks anything; until it is done the entry stays "batch assumed" (ADR-006).
6. The seller sees these orders in the daily digest. ADR-009's 30 days count from the marketplace's shipping time.

**Telling our own shipment from an outside one.** Vervoro's dispatch notice carries its shipment; the marketplace's reply names a fulfilment or shipment id where it has one, and Vervoro stores it. A shipment the marketplace reports with one of those ids, or a shipped quantity no larger than Vervoro's, is our own coming back, and moves nothing.

**When both happen.** A packer confirms a shipment in Vervoro just after the marketplace's "shipped" was imported. The confirm finds the line's reservations already deducted and is refused with "already shipped outside at 10:00:03". The packer can mark it "this was our parcel": the shipment's carrier and tracking are attached to the order and nothing moves. Each reservation is deducted once.

**Reversing.** A manager who knows the parcel did not come from the warehouse chooses "Not from our stock". The units come back with an `adjusted` entry and a reason (ADR-006), become sellable, and listings get new figures. A line is reversed at most once.

**The marketplace undoes it.** If a marketplace later shows those units as not shipped (a Shopify fulfilment cancelled), Vervoro changes nothing on its own and holds the order "step undone". The person answers: "the parcel did not leave" reverses the deduction and the line reserves again by the usual rules; "it left" closes the hold.

**Worked example.** An eBay order for 3 jars reserves batch A × 3 at 09:00. At 11:00 the seller ships it with a label bought in Seller Hub. eBay's item-marked-shipped notice arrives at 11:00:20 and its fetch finds the order fulfilled.

- Vervoro has no shipment for it, so `shipped_outside` = 3 at 11:00. Batch A: on hand −3, reserved −3. Batch A was the only eligible batch, so no task is raised. The order is shipped.
- At 11:05 a packer, unaware, scans the order. Packing refuses it: "shipped outside Vervoro at 11:00".
- The next morning the seller sees it in the digest. It was their parcel, so nothing more is done.

## Manual orders

They belong here, because they are orders: one list, one status, one way to reserve and dispatch. A seller takes them by phone or email, from a business customer, or at a counter.

- **Who:** anyone who works in the warehouse, or a manager, admin or owner, creates, confirms, edits and cancels phone and email orders, and makes counter sales (below). A business order on account terms, which ships before it is paid, is confirmed by a manager, admin or owner.
- **A draft first.** Lines name products directly (no listing, no link), with quantities, prices and currency, a delivery address, and for a business buyer the company name, VAT number and their purchase-order reference. A draft reserves nothing, so a half-typed order or a quote never takes the last unit a marketplace order needs. A previous order can be copied into a new draft: there is no saved customer list at launch (ADR-011). A manager's copy brings everything; a warehouse user's copy brings the products, quantities and prices but not the buyer's details, which they type in from the caller, so copying never shows them an old customer's address (ADR-009).
- **Confirming reserves,** by ADR-006's rules, in one transaction. Confirming carries a key the client makes, so a double tap confirms once. The order takes the next number from the company's counter.
- **Payment.** A warehouse user confirms an order as paid by entering its payment reference (the card machine's receipt, a bank transfer); without one, the order is held "payment pending" (here an office hold) until a manager releases it. A manager may confirm without payment, for a business customer on account terms, and may hold any manual order until the customer pays. The server checks this on every confirm, so no order a warehouse user confirms ships unpaid.
- **Then it is an ordinary order:** open, holds, picking, packing, dispatch. Nothing goes to a marketplace, so it is never in shadow.
- **Edits before picking** change lines and quantities: a smaller quantity releases, a larger one reserves more. After picking starts, an edit puts the order back to open first, with a put-back task for units taken off.
- **Cancelling** is immediate, because Vervoro is the only party: it releases what the order held.
- **A counter sale** is one screen: the products, the quantities, paid and collected. It is created, reserved and shipped in one transaction with the client's key, with no delivery address and no label. It is in the manager's daily list, and a manager can reverse it.
- **Buyer data:** the recipient's name, address and phone are buyer data under ADR-009. They are kept and anonymised the same way.

## Buyer data on import

ADR-009 decides what is kept and for how long. On import:

- **Only from the fetched order.** The notice body is never read for buyer data and never kept (ADR-004).
- **Only for orders the seller ships.** Marketplace-shipped orders and lines keep none. On Amazon, the recipient is asked for only on seller-shipped orders not yet shipped (ADR-009).
- **Only the allowed fields:** recipient name, delivery address and phone, the order note, the gift message, and a business buyer's company name and VAT number when given. Each is encrypted with the company's key (ADR-001).
- **The eBay buyer's user id** becomes a keyed hash on the order and a row in `buyer_ref` (ADR-009). The id itself is never stored.
- **What a marketplace withholds stays missing.** A later fetch without a field never blanks it. A complete address replaces a stored one; a partial one never does.
- **The anonymisation due time** is set by the import when its start is known: delivery, dispatch, the marketplace's shipping time for an order shipped outside, or a cancellation (ADR-009).
- **An anonymised order** stores nothing personal again, whatever a later fetch brings.
- **No buyer data in a problem row, a log, a queue message or an event** (ADR-009), and none in the duplicate match.

## Handing over to dispatch

Shipping itself (labels, carriers, rates, tracking and delivery) is a later record. This record promises shipping the following.

**The queue.** An order is ready to pick when it is open or part shipped, is shipped by the seller, is in the picker's warehouse, has every line it ships linked and fully reserved, and has no hold. The queue is sorted by leave-by time, then by time of purchase.

**Ship-by: one per order.** It is the earliest of its lines' deadlines:

| Source | Deadline |
| --- | --- |
| eBay | Each line's `shipByDate` |
| Amazon | The end of the order's `shipByWindow` |
| Shopify | The fulfilment order's `fulfillBy`; when Shopify sets none, the time of purchase plus the account's handling time, set by the seller |
| Manual | The date the manager sets |

**Leave-by: when the parcel must go.** A marketplace's ship-by is often 23:59, but the van leaves at 16:00. Each warehouse has one collection cut-off (the earliest collection it must meet), with a list of dated exceptions (a bank holiday with no collection, a day with a different time). An order's leave-by is the last cut-off at or before its ship-by. With no cut-off set, leave-by is the ship-by.

**Worked example.** The warehouse's cut-off is 16:00, with no collection on Monday 31 August (a bank holiday). An eBay order placed on Saturday has a ship-by of Tuesday 23:59. Its leave-by is Tuesday 16:00. An Amazon order placed on Friday morning with ship-by Monday 23:59 has a leave-by of Friday 16:00, because Monday has no collection: it is picked first that Friday, and the eBay order waits for Tuesday.

**Deadlines are watched.** Two hours before an order's leave-by, if it has not shipped, Vervoro fetches it once, and then alerts the people who can unblock it: the warehouse for an open order, a manager for an office hold or a short order. When leave-by passes, they are alerted again (the owner too, if the owner has switched that on), and the order is listed until it ships. The home screen shows each cut-off with the orders that will miss it.

**The pick list** names, for each line still to ship: the product, its image, the quantity in base units and in box sizes where one fits (ADR-003), and each reservation's batch, lot and date, with the spot its pick task takes it from (ADR-006). For a bundle, each component. The pick list always shows the current reservations. Packing records the batch of every unit: implied when the spot holds one eligible batch, otherwise tapped from the date or lot on the unit; another eligible batch may be taken, and is recorded (ADR-006).

**Packing details** are the line titles as the marketplace gave them, the gift message, the order note, and the recipient and address, shown to warehouse users only from picking until shipped, and for label reprints for 24 hours after (ADR-009).

**A fresh read before the label.** When a label is bought for an Amazon or Shopify order, Vervoro first fetches the order and imports it. A cancellation or a new hold whose notice was lost stops the label. The read costs about one call per parcel from the seller's own allowance, under 1 % of it, and about a second. If the marketplace does not answer in time, the label is bought and the screen says the order could not be checked. eBay orders are not read again here, because eBay's order allowance is shared by every seller (ADR-004.1).

**Confirming a shipment** is ADR-006's command: it deducts, works out the status, and writes the dispatch notice through the egress gate (ADR-004.1, 004.2, 004.3). A failed or throttled notice is retried by the gate; the shipment stands. A notice the marketplace has not accepted an hour after the confirm, or by the ship-by time if that is sooner, alerts the seller and the operator.

## Amazon orders from other marketplaces of the region

An Amazon account serves the marketplaces the seller picked (ADR-004.2). Amazon's notices cover the whole region, and an order from another marketplace of that region can arrive.

- **It is imported.** The backup read asks for every marketplace of the region in one call (Amazon's order search takes up to 50 marketplace ids), so such orders are kept up to date at no extra cost.
- **Marketplace-shipped orders** are recorded as usual and take no warehouse stock.
- **The first order the seller ships** from such a marketplace reserves and is held "who ships these?". The seller answers once for that marketplace:
  - **"This warehouse":** the hold clears, and that marketplace's orders reserve and are picked like any other.
  - **"Not us"** (another warehouse or a service abroad ships them): the reservation is released, and that marketplace's seller-shipped orders are recorded like marketplace-shipped ones, never reserved.
- **Lines whose listing is not linked** wait like any unlinked line. A SKU listed only on that marketplace cannot be linked until the seller adds the marketplace to the account (ADR-004.2, ADR-005).

## Storage

All tables belong to the foundation and are tenant tables (ADR-001): `company_id` on every row and leading every key, under row-level security.

| Table | Holds | Rules |
| --- | --- | --- |
| `sales_order` | One row per order: account, marketplace order id, purchase and change times, status and its function's version, who ships it, warehouse, ship-by, leave-by, sold on, arrived from, replacement mark, business fields, buyer fields, and the shipped, cancelled, delivered and anonymised times | Partitioned by month of purchase. Buyer fields tagged `pii` (ADR-009) |
| `sales_order_key` | Company, account, marketplace order id → order id and month | Unpartitioned. Unique. Read first by every import |
| `sales_order_line` | The line fields above and ADR-006's | Partitioned with its order. No stored stock state |
| `sales_order_hold` | Each hold placed and cleared: reason, kind, note, automatic or by whom, decide-by, when | Append-only |
| `sales_order_cancellation` | Each buyer request and each change to it: lines and quantities, the marketplace's id, the answer deadline, state (requested, declined, lapsed, confirmed), times | Append-only |
| `sales_order_refund` | Each refund: amount, currency, lines, time | |
| `sales_order_problem` | Account, marketplace order id, reason, first and last seen, resolved, and per line the marketplace line id, the listing key and the quantity, each or "not readable" | No order body and no buyer data. Its scope is the listings named, or the whole account if any line's listing is not readable. Also holds a mirror's lines until its direct order arrives |
| `sales_order_task` | Put-back, label-to-void and confirm-the-batch tasks: order, line, units, what to confirm, opened and closed | Open until confirmed by a scan or a tap |
| `warehouse_collection` | Each warehouse's collection cut-off and its dated exceptions | |

Settings: whether the owner is told about orders that miss their leave-by, each Shopify account's handling time (used only when Shopify sets no deadline), each warehouse's collection cut-off, and, per Amazon marketplace of a region, who ships its orders.

**Rules, each with a test:**

| Rule | Where it is enforced |
| --- | --- |
| One order per account and marketplace order id, whatever the month | Unique index on `sales_order_key`; a test imports the same order across a month boundary |
| A fetch older than the stored order changes nothing; applying the same order twice changes nothing | The import command; a test per row of "Which fetch wins" |
| Cancelled and shipped-outside counts never go down; a lower report holds the order | The import command; a test |
| Every duplicate and out-of-order case in the table above | The connector contract suite's notice cases, run against every simulator (ADR-004) |
| **Whatever order notices and reads arrive in, the order ends in the same status and stock** | A seeded shuffle test: 10,000 runs per connector of each marketplace's order stories with notices dropped, repeated and reordered. This is the launch proof for order status |
| The status function gives the expected status for every combination of facts | One test per row of the status table; the expected-moves table as its oracle |
| An unexpected move is written, holds the order and alerts | The import command; a test |
| Stored and worked-out statuses agree | ADR-006's nightly check |
| No order the marketplaces have is missing | A nightly census: the day's order ids by creation time from each account, against the imported orders and problem rows |
| An import writes the whole order and its reservations or nothing | A test that fails the transaction at each step |
| Orders found together reserve oldest purchase first | A test with two orders for the last unit in one read |
| An order joins the picking list only when whole and unheld | The queue's query and the pick command; a test per blocker and hold reason |
| A held order cannot be picked, packed, labelled or shipped, and keeps its reservation | The four commands; a test per hold reason |
| Each hold kind is cleared only by those allowed | The release command; a test per role and kind (ADR-010) |
| A cancellation request releases nothing; a confirmed one releases exactly what was held | The import command; a test per marketplace |
| Vervoro sends no cancellation | The connector contract has no cancel operation; a test that the egress gate refuses one |
| A line's listing never changes once it has reserved | The import command; a test |
| A Shopify line's quantity follows the warehouse's fulfilment orders, not `currentQuantity` | The Shopify connector's mapping; a test with a refund after dispatch and a line moved to another location |
| Marketplace-shipped lines and mirrors never reserve and never reach the picking list | The import command and the queue's query; a test |
| A shipment outside Vervoro deducts once, and our own shipment echoed back deducts nothing | The import and dispatch commands; a race test on real Postgres |
| No buyer data on a marketplace-shipped or anonymised order, in a problem row or in the duplicate match | ADR-009's field-tag lint and a test |
| A problem row names the listing and quantity of every readable line, and its scope is the whole account when any line's listing is not readable | The import command; a test with an unreadable line |
| Every marketplace state maps to one Vervoro state; an unknown one holds only its order | The connector's mapping; a test per row of the mapping tables |

## Marketplace constraints

Checked against each marketplace's documentation on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| eBay: which orders | The Fulfillment API includes only orders that completed checkout; `getOrders` reads up to two years back, filtered by last modified date | [getOrders](https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getorders) |
| eBay: cancellation requests | `getOrders` returns the cancellation state but always an empty list of requests; `getOrder` returns them in full; no request is `NONE_REQUESTED` | [getOrder](https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getorder) |
| eBay: order states | `orderFulfillmentStatus` `NOT_STARTED`, `IN_PROGRESS`, `FULFILLED`; `orderPaymentStatus` `PENDING`, `PAID`, `FAILED`, `PARTIALLY_REFUNDED`, `FULLY_REFUNDED`; `cancelStatus.cancelState` `NONE_REQUESTED`, `IN_PROGRESS`, `CANCELED`; each line's `shipByDate` | [getOrders](https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getorders) |
| eBay: answering a buyer's request | A buyer may ask to cancel up to 30 days after the order, until it is dispatched; the seller has 3 calendar days to answer; an unanswered request on a paid order is closed and the order is not cancelled; an unpaid order is cancelled | [Order cancellation policy](https://www.ebay.co.uk/help/policies/member-behavior-policies/order-cancellation-policy?id=5298) |
| eBay: item marked shipped | A notification topic carrying the order id, line item id, tracking, carrier and shipped date; its permission is read with `getTopics` | [ITEM_MARKED_SHIPPED](https://developer.ebay.com/api-docs/master/commerce/notification/asyncapi/item_marked_shipped.yaml) |
| eBay: daily limits | Fulfillment order resource 100,000 calls a day for the application, shared by every seller | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Amazon: order states | `PENDING_AVAILABILITY`, `PENDING`, `UNSHIPPED`, `PARTIALLY_SHIPPED`, `SHIPPED`, `CANCELLED`, `UNFULFILLABLE`; `fulfilledBy` `AMAZON` or `MERCHANT`; the marketplace on `salesChannel`; associated orders of type `REPLACEMENT_ORIGINAL_ID` | [Orders API 2026-01-01 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json) |
| Amazon: cancellations on an item | A request names its requester (`BUYER`); an executed cancellation names who did it (`BUYER`, `MERCHANT`, `AMAZON`) | [Orders API 2026-01-01 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json) |
| Amazon: reading orders | `searchOrders` 0.0056 a second, burst 20, ending at least two minutes before the request, up to 50 marketplace ids a call; `getOrder` 0.5 a second, burst 30; `shipByWindow` on each order | [Orders API 2026-01-01 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json) |
| Amazon: order notices | `ORDER_CHANGE` on status changes and buyer cancellation requests, through the queue; names the marketplace and `MFN` or `AFN`; covers the seller's whole region | [Notification type values](https://developer-docs.amazon/sp-api/docs/notification-type-values) |
| Shopify: payment states | `PENDING`, `AUTHORIZED`, `PARTIALLY_PAID`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `VOIDED`, `EXPIRED`; an order can stay open with a voided payment | [OrderDisplayFinancialStatus](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderDisplayFinancialStatus) |
| Shopify: fulfilment orders | `OPEN`, `IN_PROGRESS`, `SCHEDULED`, `ON_HOLD`, `INCOMPLETE`, `CLOSED`, `CANCELLED`; `fulfillBy` is the deadline | [FulfillmentOrderStatus](https://shopify.dev/docs/api/admin-graphql/latest/enums/FulfillmentOrderStatus), [FulfillmentOrder](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder) |
| Shopify: line quantity | `currentQuantity` excludes refunded and removed units, so it also drops for a refund after shipping; `unfulfilledQuantity` is the units not yet fulfilled | [LineItem](https://shopify.dev/docs/api/admin-graphql/latest/objects/LineItem) |
| Shopify: fraud | The risk summary recommends `ACCEPT`, `CANCEL`, `INVESTIGATE` or `NONE` | [OrderRiskRecommendationResult](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderRiskRecommendationResult) |
| Shopify: webhooks | Duplicates are named by `X-Shopify-Webhook-Id`; no order within a topic; delivery not guaranteed, so reconcile by `updated_at` | [Webhook best practices](https://shopify.dev/docs/apps/build/webhooks/best-practices) |
| Shopify: webhook topics | Separate topics for an order edited, a fulfilment order moved, placed on hold or released, and a new risk assessment | [WebhookSubscriptionTopic](https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic) |

## Checked before launch

Each has a safe default in the design; the check decides whether the default stays.

- **eBay sandbox:** does an unpaid order's id change when it is paid, and do its line ids survive? If the id changes and the line ids survive, a second unique key on (account, marketplace line id) is added before launch, so the same sale cannot arrive as two orders.
- **eBay:** the permission the item-marked-shipped topic needs on the production keyset (`getTopics`); whether a lapsed cancellation request sends a notice or changes the order's change time (the 3-day fetch covers it either way); whether a cancelled listing is relisted with stock.
- **Shopify development store:** whether `updatedAt` moves on fulfilment-order holds, moves and risk changes (equal times are applied either way); whether marketplace apps write the marketplace's order id on the orders they create (the possible-duplicate hold covers it either way).
- **Amazon:** that no call refuses a buyer's cancellation request; how linking works for an account whose listings are shared across the region's marketplaces.
- **Measured in shadow:** how often notices are lost, how many orders are short, how long holds wait, and how often a seller ships part of an eBay order outside Vervoro.

## Consequences

**What this gives us**

- A notice, a read, a repeat or a late update can never make a second order or move stock twice, and the same facts always give the same status.
- One status for every channel, with every marketplace state mapped and tested, so the warehouse never has to know where an order came from. A mapping bug alarms on its first order.
- An order that may not ship (unpaid, requested to cancel, refunded, flagged, changed under the packer) still holds its stock and cannot reach a parcel.
- Vervoro never cancels an order, never answers for the seller, and never releases stock for a cancellation the marketplace has not confirmed. It needs no right to change a marketplace's orders.
- Whole orders: one shipment per order, unless the marketplace says otherwise.
- Deadlines measured against the van, with the right person told in time.
- Orders for unlinked listings, orders the marketplace ships, the same sale arriving twice and orders shipped elsewhere each have one rule, and stock follows what really left, in shadow too.
- An order that cannot be read is visible within minutes, not lost.

**What it costs**

- Every cancellation and every answer to a buyer is made on the marketplace: about 8 to 10 trips a day for the reference seller. An eBay request left for 3 days closes unanswered and the order ships.
- A short order waits for stock or for a change on the marketplace; Vervoro never ships part of it.
- Holds stop orders that may have been fine to ship; a seller with many risk-flagged or pending orders has more to release.
- Pending orders hold stock that may never sell, until the marketplace cancels them.
- About a second and one call per Amazon or Shopify label.
- A shipment outside Vervoro is trusted to have left the warehouse until a manager says otherwise; in shadow, its batch is not traced.
- A lost eBay notice still leaves an order unreserved until the backup read: up to an hour, longer on a quiet account.
- The first order from each other Amazon marketplace of a region waits for one answer.
- One more table, the order key, is read first by every import, because the order table is partitioned.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Poll orders as the main path | The owner's rule: notices are the way orders come in; polling spends shared allowances and brings orders late (ADR-004) |
| Import the notice body | It may be older than the order, carries buyer data, and some carry only ids (ADR-004) |
| A unique index on the partitioned order table | Postgres requires the partition key in it, so the same order in two months would not be caught |
| Use Vervoro's receive time to order updates | Notices and reads arrive out of order; only the marketplace's change time says which is newer |
| Ignore a fetch with the same change time | A marketplace can change part of an order without moving the order's change time |
| A content hash, or a change time per part of the order | Applying the same order again already changes nothing, and the facts that only rise cover the rest |
| A status moved step by step, with a table that refuses other moves | A refused import stalls the account's watermark; a status stored as "packed" stays packed when the order changes underneath it |
| Statuses copied from each marketplace | The warehouse would need three lists; one function over mapped facts is testable |
| Holds as statuses ("on hold") | An order can be on hold for several reasons at once, and releasing one must not hide another |
| A per-person "trusted" mark for releasing holds | The kind of the hold gives the same safety; fixed roles stay testable (ADR-010) |
| Release stock when an order is held | Units promised to a buyer who will probably get them would be sold again |
| Reserve only paid orders | Pending orders can become sales, and the units would be sold elsewhere meanwhile |
| Send cancellations and answers to buyers from Vervoro | The owner's rule: cancelling is the seller's act on the marketplace. It would also need the right to change a marketplace's orders, and on eBay a call pool shared by every seller |
| Release on a cancellation request | A refused request would leave an order without stock (ADR-006) |
| Cancel short orders automatically | Marketplaces count it against the seller |
| Let a short order ship what it holds, or "ship what is here" | The owner's rule: whole orders. Parked until a pilot shows the need |
| Alerts against the marketplace's ship-by | Ship-by is often 23:59; the van leaves at 16:00 |
| A collection calendar per carrier | One cut-off per warehouse, with dated exceptions, sorts orders early, never late |
| Release stock for orders shipped outside during shadow | The figures Vervoro would send would be too high, hiding the oversells shadow exists to find |
| Ignore orders from other Amazon marketplaces of the region | Their units would be shipped from the warehouse without being reserved, and ADR-008 counts on their import |
| Match possible duplicates by the buyer's postcode | Compares buyer data across orders (ADR-009) |
| Import orders in the order they arrive | When stock is short, a later buyer could take the earliest buyer's unit; oldest purchase first is fairer and costs nothing |
| One transaction per read page | Holds the company's lock for a whole page; one order per transaction keeps it short |
| Drop an order that fails validation | The order would reserve nothing and nobody would know; a problem row keeps it visible |
| Skip unlinked lines, or the whole order | Contradicts ADR-005: the order is real and the seller must see it |
| Release reservations when the marketplace says "shipped" with no Vervoro shipment | If the parcel left the warehouse, those units would be offered again (ADR-006) |
| Manual orders as a separate module with its own reservations | Two ways to reserve drift apart (ADR-006); one order model serves both |
| Manual orders that reserve as soon as they are saved | A half-typed order or a quote would take the last unit a marketplace order needs |

## What later records decide

- **[ADR-008: Inventory sync](../inventory-sync/)**: the figure each linked listing gets, which orders count as sales out of a figure already sent (an Amazon account serving several marketplaces, a Shopify order split across locations, a mirror), and how long a raise waits for the order watermark.
- **ADR-004.4: Amazon Vendor connector** (planned): Vendor purchase orders, which are demand of their own (ADR-006), not marketplace orders.
- **Shipping** (a later record): labels, carriers and rates, tracking and delivery dates, the dispatch notice's carrier codes, and marketplace returns.
- **[ADR-011: Invoicing and VAT](../invoicing-and-vat/):** invoices, credit notes and the VAT on every sale. Business customers as saved records remain a later record.
- **Parked:** shipping part of a short order from Vervoro, if a pilot shows the need; per-account notice reliability ratings, if telemetry shows notices getting lost.
