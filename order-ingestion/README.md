# ADR-007: Order ingestion

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026 |
| **Scope** | How orders enter Vervoro and move through their life up to dispatch: notices and the backup read, importing each marketplace order once, the order and line statuses and how each marketplace's states map to them, when and in what order an import reserves, holds, cancellation requests and confirmed cancellations, refunds, orders for unlinked listings, the fulfilment conflict, orders the marketplace ships, orders shipped outside Vervoro, manual orders, buyer data on import, and what dispatch is handed |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-003: Product model](../product-model/), [ADR-004: Channel connectors](../channel-connectors/) with [ADR-004.1](../ebay-connector/), [ADR-004.2](../amazon-seller-connector/) and [ADR-004.3](../shopify-connector/), [ADR-005: Catalogue sync and linking](../catalogue-sync/), [ADR-006: Stock ledger and reservations](../stock-ledger/), [ADR-009: Buyer data and privacy](../buyer-data/) |

## Context

An order is where a sale turns into work for the warehouse and a change to stock. Earlier records already fixed the pieces around it:

- **ADR-000:** only the foundation changes order status, and importing again updates an order, never duplicates it.
- **ADR-004:** orders arrive by notice; a notice is a hint; the order is fetched; a backup read proves none was missed and is the only thing that moves the order watermark. eBay is read hourly, Amazon and Shopify every 10 minutes.
- **ADR-005:** the link that was valid when the buyer bought decides the product. Unlinked listings are left to the marketplace, but their orders are imported.
- **ADR-006:** an order reserves when it is imported, in the same transaction. A cancellation request is not a cancellation. An order marked shipped outside Vervoro deducts by default.
- **ADR-009:** only the fields a label needs are kept, fetched from the marketplace, never from a notice body, and anonymised 30 days after delivery.

This record decides the order itself: how it is imported, what states it and its lines can be in, what each marketplace's states mean in Vervoro, and what happens at each step until a parcel leaves.

The design has to meet these requirements:

- **Marketplaces repeat themselves and arrive out of order.** A notice comes twice, late, or before the order can be read. The backup read finds an order a notice already brought, or the other way round. None of this may make two orders or move stock twice.
- **Every marketplace has its own states.** eBay, Amazon and Shopify describe payment, shipping and cancellation differently. The warehouse needs one list it can trust.
- **A wrong parcel costs more than a late one.** Shipping an order that is unpaid, cancelled, refunded or flagged as fraud loses goods. Shipping late costs a metric. When unsure, the order waits and a person is told.
- **A seller's cancellation counts against them.** Marketplaces score sellers on cancellations they start, so Vervoro never cancels on its own.
- **Orders also reach the shelf from outside.** Sellers buy labels in the marketplace's own tools, ship from a shop counter, or let the marketplace ship. Stock must follow what really left.
- **The warehouse works on phones against deadlines.** Each order needs one ship-by time and a pick list it can follow without asking.

## Decision

1. **Notices first, the backup read behind.** Every order notice is answered by fetching the order and importing it. The backup read runs at the intervals ADR-004.1, 004.2 and 004.3 fix. Both paths end in the same import.
2. **One order per marketplace order.** The key is the account and the marketplace's order id, held in one unpartitioned key table. A fetched order older than the stored one is ignored; one with the same change time changes no state.
3. **Vervoro has one status list for every order:** pending, open, picking, packed, part shipped, shipped and cancelled. Each marketplace's states map onto it by a fixed table. Statuses only move forward, with one exception: a person may put a picked order back.
4. **Holds sit beside the status, never in it.** An order has a set of hold reasons. Any hold keeps its reservation, takes it off the picking list and refuses dispatch. Automatic holds clear themselves when their cause clears.
5. **Each order imports in one transaction that reserves.** Orders found together import oldest purchase first, one transaction each. An import either writes the order, its lines and their reservations, or nothing.
6. **An order that cannot be imported is never dropped.** It is recorded as an import problem, with its account and the listing of each line that can be read, never its body, and retried on every later notice and read. The seller and the operator are told.
7. **An order that is not ready to ship still reserves.** A payment still pending, a pre-order or a scheduled order reserves on import and carries a hold until the marketplace says it can ship.
8. **A cancellation request holds the order and keeps its stock.** Only a cancellation the marketplace confirms releases it. The seller answers a request in Vervoro or on the marketplace.
9. **Vervoro cancels only when a person asks,** on eBay and Amazon, through the egress gate. A sent cancellation also keeps the stock until the marketplace confirms it. On Shopify, the seller cancels in Shopify.
10. **A refund is recorded, never acted on.** It moves no stock and cancels nothing. A full refund on an order not yet shipped and not cancelled holds it.
11. **An order for an unlinked listing is imported and held.** Its line waits and reserves nothing. From the order, a person links the listing or attaches just that line to a product.
12. **A seller-shipped line on a marketplace-shipped link reserves and opens a conflict.** The order can ship; the listing's raises wait until the seller answers.
13. **Orders the marketplace ships are recorded, never reserved,** never picked and kept without buyer data. Shopify orders that another connected marketplace put into the shop are recorded once, on the path ADR-004.3 decides.
14. **Shipped outside Vervoro is a flag on each line,** with the quantity and the marketplace's time. It deducts what the line held, once. A manager can reverse it.
15. **Manual orders are orders.** A manager enters them in Vervoro, and they follow the same statuses, holds, reservations and dispatch, without a marketplace.
16. **Buyer data comes only from the fetched order** and only for orders the seller ships. Only the fields ADR-009 allows are written, and nothing is written for an order already anonymised.
17. **Dispatch is handed a queue, not a list of orders:** open orders with no hold and something reserved, each with one ship-by time, a pick list naming batches and spots, and the packing details ADR-009 lets the warehouse see.
18. **An Amazon order from a marketplace the account does not serve is not imported** (ADR-004.2). Its notice warns the seller once per marketplace when the seller ships it.

## How an order comes in

1. **A notice arrives.** The endpoint verifies it, queues the topic, the notice id, the account and the order ids, and answers (ADR-004). The host keeps each notice id for 24 hours and drops a repeat before it costs a fetch. Correctness never depends on that: the import is idempotent.
2. **The consumer fetches the order** through the binding: eBay's `getOrder`, Amazon's `getOrder` in the 2026 orders API, Shopify's order query. An order not visible yet is fetched again after 30 seconds, doubling, for about half an hour, then left to the backup read (ADR-004).
3. **The connector turns it into the contract's order type.** The host validates it. One that fails is an import problem (below).
4. **The foundation imports it** in one locked transaction (see "Reserving on import").
5. **The backup read** reads the orders changed in its window and imports each one by the same command. It moves the watermark only when every order in the window has committed, or is recorded as an import problem.

On eBay, `getOrders` returns the cancellation state but an empty list of requests. When the backup read finds an order whose cancellation state is not `NONE_REQUESTED`, the host fetches that order with `getOrder` to read the request.

## One order per marketplace order

**The key.** An order is named by its account and the marketplace's own order id:

| Marketplace | Order id used | Notes |
| --- | --- | --- |
| eBay | The Fulfillment API's `orderId` | eBay changes an order's id when it goes from unpaid to paid. The Fulfillment API shows only orders that completed checkout, so its id is the paid one |
| Amazon | `orderId` (3-7-7 digits) | One id across the region's marketplaces |
| Shopify | The order's numeric id | Never the order name (`#1001`), which the seller can change |
| Manual | Vervoro's own order number | From the company's counter (ADR-001) |

**One key table.** Orders and their lines are partitioned by month of purchase (ADR-001). A unique index on a partitioned table must include the month, so it cannot stop the same order arriving twice in two months. So `sales_order_key` is one unpartitioned tenant table, unique on company, account and marketplace order id, holding the order's id and its month. The import looks the key up, under the company's lock, before anything else.

**Which fetch wins.** Every fetched order carries the marketplace's own last change time: eBay's `lastModifiedDate`, Amazon's `lastUpdatedTime`, Shopify's `updatedAt`. The stored order keeps the latest one it applied.

| The fetched order is | What happens |
| --- | --- |
| New | Created, its lines resolved and reserved |
| Newer than the stored one | Applied: statuses, lines, quantities, cancellations, refunds, shipments outside Vervoro |
| The same change time | No state changes. Buyer fields the stored order lacks may be filled in (ADR-009: a masked value never erases a kept one) |
| Older than the stored one | Ignored |

Only the marketplace's time is compared, never Vervoro's clock. And even a newer fetch never moves a status backwards: a marketplace that seems to undo a step is flagged for a person (see "Late updates").

**Lines.** Each line is named by the marketplace's line id: eBay's `lineItemId`, Amazon's `orderItemId`, Shopify's line item id.

- A line new on a later fetch is added and reserves, as an edit on Shopify can add one.
- A line missing from a later fetch is not removed. Its quantity changes only when the marketplace says so.
- **A line's listing is fixed once it has reserved.** A later fetch that names another listing for the same line id changes nothing. The line keeps its reservation, and the order is held for a person ("line changed after import"). Moving the line would free units promised to a buyer.
- **The quantity is the current one.** On Shopify that is `currentQuantity`, which leaves out units refunded or removed by an edit.

### Duplicates and order of arrival

| What arrives | What happens |
| --- | --- |
| The same notice twice | The second is dropped by notice id, or fetches and finds nothing newer |
| Two notices for one order, the later one first | Each causes a fetch. Both fetches return the current order; the second changes nothing |
| A notice before the order can be read | Fetched again with growing delays, then left to the backup read |
| The backup read first, then the notice | The notice's fetch finds the same change time; nothing changes |
| The notice first, then the backup read | The same |
| A notice that never arrives | The backup read imports the order, and the account's notices are marked unreliable (ADR-004) |
| A forged or replayed notice | At most one fetch. A fetch is the marketplace's own truth |

**Worked example.** An Amazon order `204-0000001-0000001` for 2 jars of honey is placed at 09:00:00.

- 09:00:04: a notice for a new order. The fetch says "not visible yet". The next fetch at 09:00:34 returns it, pending. It is created, reserves 2 jars, and is held "payment pending".
- 09:01:10: a second notice, a status change. The fetch returns it unshipped, changed at 09:01:02. The hold clears; the order is open.
- 09:01:12: the first notice is delivered again by the queue. It is dropped by its notice id.
- 09:10: the backup read sees the order with change time 09:01:02. Nothing changes.

### Late updates

Once an order is shipped or cancelled, its status is final. Later news is recorded as a fact on the order, never as a new status:

| Later news | What Vervoro does |
| --- | --- |
| Tracking or delivery from the marketplace | Recorded. A delivery date starts ADR-009's 30 days |
| Our own shipment echoed back | Recognised by the shipment's id, or because the marketplace's shipped quantity is no more than Vervoro's. Nothing moves |
| A refund | Recorded |
| Cancelled after dispatch | Recorded as "cancelled after dispatch". No stock moves (ADR-006). The order shows "expect a return" |
| The marketplace undoes a shipment Vervoro did not make (a Shopify fulfilment cancelled) | Flagged for a person. Nothing moves until they answer (see "Shipped outside Vervoro") |
| The order is gone from the marketplace (a Shopify order deleted) | Flagged for a person. Its reservation stays; a manager can cancel it in Vervoro |
| A changed delivery address before dispatch | Saved. If a label was already bought, the order is held "address changed after label" |

## The order and its lines

**The order holds:** the account (or "manual"), the marketplace order id, the time of purchase, the marketplace's last change time, the status, the hold reasons, who ships it, the warehouse (the account's default, ADR-006), the ship-by time, the marketplace it was sold on, where it arrived from (directly, or through a Shopify app, below), the buyer fields of ADR-009, its delivery charge as the buyer paid it and any order-level discount (ADR-011), and the times it was shipped, cancelled, delivered and anonymised.

**Each line holds** ADR-006's fields (the link version, product, units per sale, fulfilment, bundle components, units needed and missing) and:

| Field | Meaning |
| --- | --- |
| `marketplace_line_id` | The marketplace's id for the line |
| `listing_id` | The listing it was sold on, by ADR-005's key. Empty when the marketplace names none (a Shopify line with no variant) |
| `sku_sold`, `title` | As the marketplace gave them, for the packer and for matching |
| `quantity` | The current quantity ordered |
| `cancelled` | Units cancelled, confirmed by the marketplace |
| `shipped_outside`, `shipped_outside_at` | Units the marketplace says shipped that no Vervoro shipment covers, and when |
| `fulfilment` | Who ships this line, from the marketplace: seller, marketplace, or unknown |
| `resolved_by` | Link (the link valid at purchase), person (attached from the order), or none |
| `stock_state` | Waiting, reserved, short, not reserved, or done (below) |
| `unit_price`, `currency` | What the line sold for, as the buyer paid it: with VAT included when the marketplace includes it. Money is never added across currencies |
| `discount`, `discount_funded_by` | The line's discount, and whether the seller or the marketplace funded it (ADR-011) |
| `marketplace_tax`, `marketplace_collects` | The marketplace's own tax figure for the line, when it gives one, and whether it collects and pays that tax itself (ADR-011) |
| `vat_country`, `vat_class`, `vat_rate` | The rate the line used (ADR-003) |

Units shipped by Vervoro come from the shipments (ADR-006), so they are not stored twice.

**A line's stock state:**

| State | Meaning | Reserves |
| --- | --- | --- |
| **Waiting** | No product yet: the listing is unlinked or unknown | Nothing |
| **Reserved** | Every unit it still needs is reserved | Yes |
| **Short** | Part reserved, the rest recorded as missing (ADR-006) | What exists |
| **Not reserved** | The marketplace ships it, or another connection handles it | Nothing, ever |
| **Done** | Every unit is shipped or cancelled | Nothing left |

## Statuses

<!-- DIAGRAM -->

Every order has one status. Seller-shipped and manual orders can use all of them. Orders the marketplace ships skip picking and packing: they go from open (or pending) to shipped or cancelled, as the marketplace says.

| Status | Meaning | Reserves | Warehouse |
| --- | --- | --- | --- |
| **Pending** | The marketplace has the order, but it may not ship yet: payment not complete, a pre-order, a scheduled order | Yes, with a hold | Not on the picking list |
| **Open** | Ready to ship | Yes | On the picking list if no hold and something is reserved |
| **Picking** | A picker has started it | Yes | Being picked. Picking moves no stock (ADR-006) |
| **Packed** | Every unit to ship is scanned into a parcel | Yes | Waiting for the shipment to be confirmed |
| **Part shipped** | Some units have left, by Vervoro or outside it; the rest are still to ship | What remains | The rest is on the picking list again |
| **Shipped** | Every unit is shipped or cancelled, and at least one shipped | Nothing | Final |
| **Cancelled** | Every unit is cancelled, none shipped | Nothing | Final |

**Allowed transitions.** Anything not in this table is refused, and a test covers each row.

| From | To | When |
| --- | --- | --- |
| Pending | Open | The marketplace says the order can ship |
| Pending, open, picking, packed | Cancelled | The marketplace confirms the whole order cancelled, or a manager cancels a manual order |
| Open | Picking | A picker starts it. Refused while it has a hold or reserves nothing |
| Picking | Packed | Packing has scanned every unit it ships now |
| Picking, packed | Open | A person puts it back. The warehouse is told to return the units to their spots |
| Open, picking, packed | Part shipped | A shipment of part of the order is confirmed, or the marketplace says part shipped outside Vervoro |
| Pending, open, picking, packed, part shipped | Shipped | The last units are shipped or the rest cancelled |

- **Shipped and cancelled are final.** Later news is recorded on the order (see "Late updates").
- **The marketplace can skip steps.** An order the marketplace reports shipped goes straight to shipped from any earlier status.
- **A hold never changes the status.** A packed order on hold stays packed and cannot be shipped.
- **Only the foundation writes a status** (ADR-000). Every change is in the order's activity view, with the person or process and the reason.

## From each marketplace to Vervoro

The connector maps the marketplace's states onto the contract's order. The foundation decides the status from it. A test covers every row. A state that would move an order backwards (a payment voided after the order was open, a fulfilment order rescheduled) adds its hold and leaves the status as it is.

**Amazon, the 2026 orders API.** The connector asks `getOrder` for the fulfilment and cancellation datasets (`includedData` `FULFILLMENT` and `CANCELLATION`), and for the recipient only as ADR-009 allows. The order's `fulfillment.fulfillmentStatus`, `fulfillment.fulfilledBy` and each item's `cancellation`:

| Amazon says | Vervoro |
| --- | --- |
| `PENDING_AVAILABILITY` | Pending, held "not yet due" (a pre-order) |
| `PENDING` | Pending, held "payment pending" |
| `UNSHIPPED` | Open |
| `PARTIALLY_SHIPPED` | Part shipped. Units not covered by a Vervoro shipment are shipped outside |
| `SHIPPED` | Shipped, the same way |
| `CANCELLED` | Cancelled |
| `UNFULFILLABLE` | Only for Amazon-shipped orders not placed on Amazon: recorded, nothing reserved |
| `fulfilledBy` `AMAZON` | Marketplace-shipped: recorded, never reserved |
| An item's `cancellationRequest` with requester `BUYER` | A buyer's cancellation request: held |
| An item's `cancellationExecution` | That item's units cancelled |

**eBay, the Fulfillment API.** The order's `orderFulfillmentStatus`, `orderPaymentStatus`, `cancelStatus` and each line's `lineItemFulfillmentStatus`:

| eBay says | Vervoro |
| --- | --- |
| A new order (eBay returns only orders that completed checkout) | Open |
| `orderPaymentStatus` `PENDING` (the buyer's payment is not complete, as with a delayed payment method) or `FAILED` | Pending, held "payment pending" |
| `orderFulfillmentStatus` `NOT_STARTED` | Open |
| `orderFulfillmentStatus` `IN_PROGRESS` | Part shipped. Units not covered by a Vervoro shipment are shipped outside |
| `orderFulfillmentStatus` `FULFILLED` | Shipped, the same way |
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
| Lines assigned to another location | Marketplace-shipped lines: recorded, never reserved (ADR-004.3) |
| Risk recommendation `CANCEL` or `INVESTIGATE` | Held "fraud check" |
| Line `currentQuantity` lower than before | A smaller quantity: the difference is released (ADR-006) |

**Manual orders** have no marketplace. A manager confirms them (open) and cancels them (cancelled) in Vervoro.

## Reserving on import

ADR-006 owns how units are chosen and held. This record decides when, in what order, and what happens on failure.

**When.** Every import is one transaction under the company's lock, in ADR-006's steps:

1. Take the company's lock.
2. Look up the order's key. Compare change times; stop if the fetch is not newer.
3. Write or update the order and its lines.
4. Resolve each new line with the link valid at the time of purchase (ADR-005), or leave it waiting.
5. Reserve what each line needs, release what a smaller quantity or a cancellation frees, and record shortages.
6. Set or clear the automatic holds.
7. Write buyer data, and the anonymisation due time when one is known (ADR-009).
8. Write new desired figures for affected listings, and the outbox event. Commit.

**Pending orders reserve too.** A pending order can still become a sale; not holding its units lets another channel sell them. The hold keeps it off the picking list until the marketplace says it can ship. If it is cancelled instead, the units come back.

**In what order.**

- **Orders found together import oldest purchase first.** A backup read page, a burst after an outage, or a notice naming several orders is sorted by time of purchase, then by marketplace order id, so when stock is short the earliest buyer gets it.
- **One transaction per order.** The lock is held for one order at a time (about eight round trips, ADR-006), so a large read never holds one company's stock for long, and orders from other channels interleave.
- **Across channels the lock decides.** Two orders for the last unit from two marketplaces reserve in the order their imports take the lock. Exactly one gets it (ADR-006). The other is short, and the seller sees it.
- **Within an order, lines reserve in the marketplace's line order,** and a bundle's components with it (ADR-006).

**Never half an order.** An import writes the order, every line and every reservation, or none of it.

| What goes wrong | What happens |
| --- | --- |
| Too little stock | Not a failure. The line reserves what exists and is short (ADR-006) |
| A line's listing is unknown or unlinked | Not a failure. The line waits (below) |
| The database, a lock wait or a timeout | The transaction rolls back. The queue retries with growing delays, then the dead-letter queue alerts the operator (ADR-000). The backup read cannot move the watermark past it |
| A database check refuses the change ("would go negative") | The transaction rolls back and the refusal is typed (ADR-006). This means a bug, so it alerts the operator at once. The order is retried as above |
| The fetched order fails validation against the contract types | Recorded as an import problem |

**Import problems.** An order that cannot be read into the contract's types (a field missing that the contract needs, a quantity that is not a whole number) is never dropped and never guessed (ADR-004).

- A row in `sales_order_problem` holds the account, the marketplace order id, the reason, and when it was first and last seen. Never the order's body, which carries buyer data.
- **It also records the listings the order sold on, as far as they can be read.** For each line whose listing can be read, the row keeps the line's marketplace line id, the listing's key (ADR-005) and the quantity sold, or "quantity not readable". ADR-008 uses the quantity to take those units off the figures it sends until the order imports. A line whose listing cannot be read (its listing field is missing or malformed, or the order cannot be read into lines at all) is recorded as "listing not readable". These are marketplace ids, not buyer data (ADR-009).
- **The listings give the problem its scope,** because the order's units are sold on the marketplace but reserved nowhere in Vervoro. When every line's listing was read, the scope is those listings. When any line's listing could not be read, the scope is the whole account, because any of its listings may have sold those units. ADR-008 decides what a scope holds (raises on those listings or on the account); decreases are never held. The scope ends when the order imports, or when a person marks the problem resolved.
- The seller sees it at the top of the order list, with the marketplace's link to the order. The operator is alerted, because until it imports, the order reserves nothing.
- Every later notice or read of that order tries again. When a fix to the connector ships, the operator retries all open problems at once.
- The backup read counts a window as complete when each of its orders has committed or has a problem row, so one bad order cannot stall the watermark for the account.

## Holds

A hold pauses an order. It does not release it.

- **An order has a set of hold reasons,** each with who or what set it, when and why. Any reason in the set keeps the order off the picking list, and confirming a shipment for it is refused.
- **A hold keeps the reservation.** Releasing stock for an order that will probably ship invites overselling.
- **A hold sends nothing to the marketplace.**
- **A confirmed cancellation still cancels a held order** (ADR-006).
- **Every hold and every release** is a row in `sales_order_hold`, an append-only table (ADR-001). The current set is read from it.

**Automatic holds** are set and cleared by the import or by the event that causes them:

| Hold | Set when | Cleared when | A manager may release it |
| --- | --- | --- | --- |
| Payment pending | The marketplace says payment is not complete | The marketplace says it can ship | No: the marketplace has not been paid |
| Not yet due | A pre-order, or a Shopify fulfilment order scheduled for later | The marketplace says it can ship | No |
| Cancellation requested | A buyer asked to cancel | The marketplace decides, or the seller answers (below) | Yes, by refusing the request |
| Cancellation sent | Vervoro sent a seller cancellation | The marketplace confirms or refuses it | No |
| Waiting line | A line has no product | The line is linked, attached or cancelled | Yes: "ship the rest" |
| Fraud check | Shopify recommends cancelling or investigating | Shopify recommends accepting, or no action | Yes, with a reason |
| Refunded, not cancelled | A full refund on an order not shipped and not cancelled | A person decides: cancel it, or ship it | Yes, with a reason |
| Address missing | A seller-shipped order that can ship has no complete delivery address, because the marketplace withheld it | A fetch brings it, or a manager enters it | No |
| Address changed after label | The delivery address changed after a label was bought | A person checks the label | Yes |
| On hold in Shopify | The fulfilment order at the warehouse location is on hold | Shopify releases it | No: release it in Shopify |
| Line changed after import | A later fetch names another listing for a line that reserved | A manager resolves the line again (ADR-006), or accepts it as it is | Yes |
| Location gone | Shopify assigned the order to a location that no longer exists (ADR-004.3) | A person reassigns it in Shopify | No |
| Shipment undone | A marketplace undid a shipment made outside Vervoro | A person answers (below) | Yes |

**Manual holds.** A manager, admin or owner can hold any order the seller ships that has not shipped yet, one or many at once, with a reason: address check, payment check, customer request, stock check, or other with a note. Releasing one needs the same roles. Holding an order already held adds the reason; the first hold stands.

**A short order is not held.** It may ship what it holds (ADR-006), and the warehouse sees which lines are short. An order with nothing reserved is not offered for picking, because there is nothing to pick.

**Worked example.** A Shopify order for 3 jars of jam arrives at 14:00 with payment `PENDING` (a bank transfer). It reserves 3 jars and is held "payment pending". At 16:30 Shopify's risk check recommends investigating; "fraud check" is added. The next morning the payment arrives: "payment pending" clears, but the order is still held. A manager checks the order, releases "fraud check" with the reason "buyer confirmed by phone", and the order joins the picking list.

## Cancellations

Cancelling an order is the seller's decision, never Vervoro's. Marketplaces count seller cancellations against the seller.

### A buyer's request

- **eBay:** the order's cancellation state shows a request, and `getOrder` names it. Amazon: an item's `cancellationRequest` names the buyer. Shopify has no buyer request; a buyer asks the seller, who cancels in Shopify.
- **The order is held "cancellation requested".** It keeps its reservation (ADR-006) and leaves the picking list, so nobody packs a parcel the buyer may not want. A picker who has started it is told to stop.
- **The seller answers in Vervoro or on the marketplace.** Vervoro offers the answers the marketplace has:

| Marketplace | Accept | Refuse |
| --- | --- | --- |
| eBay | Approve the request, through the gate | Reject the request, through the gate |
| Amazon | Cancel the requested items, with the reason `BuyerCanceled`, through the gate | Clear the hold and ship. Amazon has no call to refuse a request; shipping is the answer |

- **Nothing is released until the marketplace confirms.** An accepted request is sent, held "cancellation sent", and the next fetch decides. A refused request clears the hold; the order ships as normal.
- **An answer given on the marketplace** comes back on the next fetch, which decides as above.
- **In shadow** nothing is sent. The screen says so and asks the seller to answer on the marketplace.

**Worked example.** An eBay order for 1 honey and 1 jam is placed at 10:00 and reserved. At 10:20 the buyer asks to cancel. The notice's fetch shows the request; the order is held. A manager taps Approve. Vervoro sends the approval and holds the order "cancellation sent". At 10:22 the fetched order is cancelled: both lines release, batch by batch, and the listings get new figures in the same transaction. Had the manager tapped Reject, the hold would clear and the order would rejoin the picking list with its reservation unchanged.

### A cancellation the seller starts

- **Who:** a manager, admin or owner, on an order not yet shipped. The screen names the marketplace's reasons and says which ones count against the seller (eBay counts an out-of-stock cancellation as a defect; one the buyer asked for does not).
- **Sent through the egress gate,** with the order and the attempt as its idempotency key (ADR-000). Cancelling is a capability a connector declares (ADR-004).
- **The order is held "cancellation sent"** and keeps its reservation. The marketplace may refuse: eBay refuses an order that is no longer eligible. A refusal clears the hold and tells the seller why.
- **An unknown outcome** is read back by fetching the order before anything is sent again (ADR-004).

| Marketplace | How | Part of an order | Limits |
| --- | --- | --- | --- |
| eBay | Post-Order API cancellation; eBay refunds the buyer | Not possible: eBay cancels whole orders only. To send less, ship the rest and refund the difference in eBay's tools | Up to 30 days after the sale. 5,000 calls a day for the whole application, shared by every seller: an ADR-004 shared pool. Every call is a person's action, so the pool has one lane; at 90 % the operator is alerted. When it is spent, the cancellation waits and the seller is told it can be done in Seller Hub at once |
| Amazon | The order acknowledgement feed, with each item and quantity to cancel and a reason from Amazon's list (`NoInventory`, `BuyerCanceled` and the others). The 2026 orders API only reads; this feed is how a seller-shipped order is cancelled | Yes, item by item and by quantity | A feed is processed later: read back by fetching the order. Feed creation refills slowly (ADR-004.2), so cancellations waiting together go in one feed |
| Shopify | Not from Vervoro. The seller cancels in Shopify, where they also choose the refund and whether to restock | In Shopify, by editing the order | Vervoro sees the result by webhook or the backup read |

Shopify cancellations stay in Shopify because cancelling there is also a refund decision, and refunds are done in the channel's own tools (ADR-006). It also means Vervoro asks for no right to change a shop's orders.

### A confirmed cancellation

- **Before dispatch:** releases exactly what each cancelled line held, in the import's transaction (ADR-006). The line's `cancelled` rises. If every unit is cancelled, the order is cancelled.
- **Already picked:** the units are still on hand in their spots. The release makes them sellable, and the warehouse is told to put them back.
- **Part shipped:** releases what is still reserved. If nothing is left to ship, the order is shipped.
- **After dispatch:** recorded as cancelled after dispatch; no stock moves. If the parcel comes back, it is a return (ADR-006).

### Part of an order

A smaller quantity on a line, from an Amazon item cancelled in part or a Shopify edit, releases the difference, latest sell-by date first (ADR-006). A larger one reserves more by the usual rules.

**Worked example.** A Shopify order has 6 jars of honey on one line, reserved and picked. The seller edits the order in Shopify to 4. The webhook's fetch shows `currentQuantity` 4. In one transaction, 2 jars are released, latest sell-by date first, and listings get new figures. The order stays picking, and the packer's screen says "2 jars to put back".

### Refunds

- **A refund is recorded:** amount, currency, the lines it names, and when.
- **It moves no stock and cancels nothing.** A refund never restocks, and a restock never refunds (ADR-006).
- **A full refund on an order not shipped and not cancelled holds it,** because shipping goods the buyer has been paid back for loses them. A person decides: cancel it, or ship it anyway.
- **A partial refund** is recorded only. If it also lowers a line's quantity (a Shopify refund that removes units), that is a smaller quantity, above.

## Orders for unlinked listings

An unlinked listing is left to the marketplace (ADR-005), but its orders are imported.

- **The line waits.** It reserves nothing and is flagged. The order's other lines reserve as normal.
- **The order is held "waiting line",** because a parcel packed without that line would be wrong. A manager may release the hold to ship the rest; the waiting line stays open.
- **An unknown listing** (the order names one Vervoro has not read yet) starts a read of that one listing (ADR-005). The line waits meanwhile.
- **A line with no listing at all** (a Shopify line that needs shipping but has no variant and no SKU, ADR-004.3) waits too, and can only be attached.
- **Who is told:** ADR-005 decides it. The first order on an unlinked listing with a strong or medium suggestion alerts the seller; others go to the daily digest.

**From the order, a person has two ways to resolve a waiting line:**

| Choice | What it does | When to use it |
| --- | --- | --- |
| **Link the listing** | Opens ADR-005's link screen. The link reserves for every waiting line of that listing, oldest first, in its own transaction (ADR-006), and the listing starts getting figures | The seller wants Vervoro to manage this listing from now on |
| **Attach this line** | Resolves only this line to a product and units per sale, chosen by a manager. It reserves at once. The listing stays unlinked and gets no figure. The line records `resolved_by` = person | The listing stays with the marketplace, but this parcel ships from the warehouse |

**A waiting line shipped outside Vervoro** reserved nothing, so nothing is deducted. It stays flagged. Attaching it deducts its units at once, earliest sell-by first, as ADR-006 decides. "Not from our stock" closes the flag and moves nothing.

**Worked example.** An eBay order has two lines: 2 jars of honey on a linked listing and 1 "honey dipper" on an unlinked one. The honey reserves 2; the dipper waits, and the order is held "waiting line". The seller has wooden dippers on the shelf, but sells them on eBay only now and then. A manager chooses "Attach this line": dipper, 1 unit per sale. It reserves 1, the hold clears, and the order joins the picking list. The dipper listing stays unlinked.

## A seller-shipped order on a marketplace-shipped link

A listing linked as marketplace-shipped (Amazon FBA, ADR-003) gets an order the seller must ship. This happens when a seller switches an offer to ship it themselves while the link still says the marketplace ships.

- **The line's own fulfilment decides** (ADR-005, ADR-006). It reserves units per sale of the product, and the order can ship. Refusing it would leave a buyer with no parcel.
- **A conflict opens on the listing** (ADR-005). Its raises wait. The order is not held.
- **The seller answers once per listing:** "this listing is now seller-shipped" (a new link version, whose first figure waits for the seller's confirm, ADR-005), or "a one-off" (the link stays marketplace-shipped and the conflict closes).
- **The other way round:** a marketplace-shipped line on a seller-shipped link reserves nothing, because the marketplace ships it. The seller is told once per listing. Which way the listing really ships is ADR-005's catalogue read.

## Orders the marketplace ships

Amazon's FBA orders, and Shopify order lines assigned to a location that is not Vervoro's warehouse, leave from someone else's shelf.

- **Recorded for reports:** lines, products through the link, quantities, prices, dates and statuses.
- **Never reserved, never on the picking list, never dispatched by Vervoro.** No hold applies.
- **No buyer data is kept.** Amazon sends none for them (ADR-004.2), and none is asked for.
- **Their status follows the marketplace:** open (or pending), then shipped or cancelled.
- **Fulfilment not yet known:** the line reserves as if the seller ships it, the safer default (ADR-006). When the marketplace says it ships the line, the reservation is released.
- **A Shopify order split across locations** reserves the lines at Vervoro's warehouse and records the rest.

**Orders other marketplaces put into the shop.** A seller may connect eBay or Amazon to Shopify with those marketplaces' own apps (ADR-004.3). Such an order is decided once, at import, and keeps its decision:

| The order | Vervoro |
| --- | --- |
| Names a marketplace that is also connected to Vervoro directly | Recorded as having arrived through the shop. Not reserved, not picked: the direct import of that marketplace's order does both |
| Names a marketplace that is not connected directly | An ordinary sale: reserved and picked |
| Cannot be attributed to a marketplace | An ordinary sale, and the seller is warned when any marketplace is also connected directly (ADR-004.3) |

## Shipped outside Vervoro

A marketplace may say units shipped that no Vervoro shipment covers: the seller bought a label in Seller Hub, shipped from a shop counter, or an older system shipped during shadow.

**The flag.** Each line has `shipped_outside`: the units the marketplace says shipped, less those Vervoro's shipments cover, and the marketplace's shipping time.

**What it does.**

1. In the import's transaction, the line's reserved units are deducted as `dispatched`, with the source "marketplace said shipped" (ADR-006), earliest sell-by first. The status moves to part shipped or shipped.
2. A short line deducts what it held. Its missing units are no longer sought, because the parcel has gone.
3. A waiting line deducts nothing (above).
4. The seller sees these orders in the daily digest. ADR-009's 30 days count from the marketplace's shipping time.

**Telling our own shipment from an outside one.** Vervoro's dispatch notice carries its shipment; the marketplace's reply names a fulfilment or shipment id where it has one, and Vervoro stores it. A shipment the marketplace reports with one of those ids, or a shipped quantity no larger than Vervoro's, is our own coming back, and moves nothing.

**When both happen.** A packer confirms a shipment in Vervoro just after the marketplace's "shipped" was imported. The confirm finds the line's reservations already deducted and is refused with "already shipped outside at 10:00:03". A manager can mark it "this was our parcel": the shipment's carrier and tracking are attached to the order and nothing moves. Each reservation is deducted once.

**Reversing.** A manager who knows the parcel did not come from the warehouse chooses "Not from our stock". The units come back with an `adjusted` entry and a reason (ADR-006), become sellable, and listings get new figures. A line is reversed at most once.

**The marketplace undoes it.** If a marketplace later shows those units as not shipped (a Shopify fulfilment cancelled), Vervoro changes nothing on its own and holds the order "shipment undone". The person answers: "the parcel did not leave" reverses the deduction and the line reserves again by the usual rules; "it left" closes the hold.

**Worked example.** An eBay order for 3 jars reserves batch A × 3 at 09:00. At 11:00 the seller ships it with a label bought in Seller Hub. eBay sends no notice for that (ADR-004.1); the backup read at 11:40 finds the order fulfilled.

- Vervoro has no shipment for it, so `shipped_outside` = 3 at 11:00. Batch A: on hand −3, reserved −3. The order is shipped.
- At 11:45 a packer, unaware, scans the order. Packing refuses it: "shipped outside Vervoro at 11:00".
- The next morning the seller sees it in the digest. It was their parcel, so nothing more is done.

## Manual orders

They belong here, because they are orders: one list, one status table, one way to reserve and dispatch. A seller takes them by phone, email or at a counter, or from a business customer.

- **Who:** a manager, admin or owner creates, confirms, edits and cancels them.
- **A draft first.** Lines name products directly (no listing, no link), with quantities, prices and currency, and a delivery address. A draft reserves nothing.
- **Confirming reserves,** by ADR-006's rules, in one transaction. Confirming carries a key the client makes, so a double tap confirms once. The order takes the next number from the company's counter.
- **Then it is an ordinary order:** open, holds, picking, packing, dispatch. Nothing goes to a marketplace, so it is never in shadow.
- **Edits before picking** change lines and quantities: a smaller quantity releases, a larger one reserves more. After picking starts, an edit puts the order back to open first.
- **Cancelling** is immediate, because Vervoro is the only party: it releases what the order held.
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
- **No buyer data in a problem row, a log, a queue message or an event** (ADR-009).

## Handing over to dispatch

Shipping itself (labels, carriers, rates, tracking and delivery) is a later record. This record promises shipping the following.

**The queue.** An order is ready to pick when it is open or part shipped, has no hold, is shipped by the seller, has at least one reserved unit, and is in the picker's warehouse. The queue is sorted by ship-by time, then by time of purchase.

**One ship-by time per order.** It is the earliest of its lines' deadlines:

| Source | Deadline |
| --- | --- |
| eBay | Each line's `shipByDate` |
| Amazon | The end of the order's `shipByWindow` |
| Shopify | The fulfilment order's `fulfillBy`; when Shopify sets none, the time of purchase plus the account's handling time, set by the seller |
| Manual | The date the manager sets |

**The pick list** names, for each line still to ship: the product, its image, the quantity in base units and in box sizes where one fits (ADR-003), and each reservation's batch, spot, lot and best-before date (ADR-006). For a bundle, each component. The pick list always shows the current reservations; packing checks every scan against them (ADR-006).

**Packing details** are the line titles as the marketplace gave them, the gift message, the order note, and the recipient and address, shown to warehouse users only from picking until shipped, and for label reprints for 24 hours after (ADR-009).

**Deadlines are watched.** An order still not shipped two hours before its ship-by time alerts the seller, held orders included, because a hold is the usual reason. One past its time is listed until it ships.

**Confirming a shipment** is ADR-006's command: it deducts, moves the status, and writes the dispatch notice through the egress gate (ADR-004.1, 004.2, 004.3). A failed or throttled notice is retried by the gate; the shipment stands.

## Amazon orders from a marketplace the account does not serve

An Amazon account serves the marketplaces the seller picked (ADR-004.2). Amazon's notices cover the whole region, so an order from another marketplace of that region can arrive.

- **It is not imported,** as ADR-004.2 decides. The backup read asks only for the served marketplaces, so an imported order would never be updated.
- **The notice names the marketplace and who ships it** (`MarketplaceID`, `FulfillmentType`). For an order the seller ships, the seller is warned once per marketplace: "You have orders on a marketplace Vervoro does not serve for this account. Their units are not reserved. Add the marketplace to the account, or ship them knowing Vervoro's stock does not include them." No fetch is made.
- **Adding the marketplace** starts serving it from then on. Orders from before are not imported; a seller who shipped them from the warehouse records the loss with a count (ADR-006).
- **Amazon-shipped orders** from an unserved marketplace are ignored without a warning: they take no warehouse stock.

## Storage

All tables belong to the foundation and are tenant tables (ADR-001): `company_id` on every row and leading every key, under row-level security.

| Table | Holds | Rules |
| --- | --- | --- |
| `sales_order` | One row per order: account, marketplace order id, purchase and change times, status, who ships it, warehouse, ship-by, sold on, arrived from, buyer fields, and the shipped, cancelled, delivered and anonymised times | Partitioned by month of purchase. Buyer fields tagged `pii` (ADR-009) |
| `sales_order_key` | Company, account, marketplace order id → order id and month | Unpartitioned. Unique. Read first by every import |
| `sales_order_line` | The line fields above and ADR-006's | Partitioned with its order |
| `sales_order_hold` | Each hold placed and cleared: reason, note, automatic or by whom, when | Append-only |
| `sales_order_cancellation` | Each request or sent cancellation: who started it, the marketplace's id, lines and quantities, reason, state (requested, sent, confirmed, refused), times | |
| `sales_order_refund` | Each refund: amount, currency, lines, time | |
| `sales_order_problem` | Account, marketplace order id, reason, first and last seen, resolved, and per line the marketplace line id, the listing key and the quantity, each or "not readable" | No order body and no buyer data. Its scope is the listings named, or the whole account if any line's listing is not readable |

**Rules, each with a test:**

| Rule | Where it is enforced |
| --- | --- |
| One order per account and marketplace order id, whatever the month | Unique index on `sales_order_key`; a test imports the same order across a month boundary |
| A fetch older than the stored order changes nothing; the same time changes no state | The import command; a test per row of "Which fetch wins" |
| Every duplicate and out-of-order case in the table above | The connector contract suite's notice cases, run against every simulator (ADR-004) |
| Only the allowed transitions happen | The status function; one test per row, and a test that every other pair is refused |
| An import writes the whole order and its reservations or nothing | A test that fails the transaction at each step |
| Orders found together reserve oldest purchase first | A test with two orders for the last unit in one read |
| A held order cannot be picked or shipped, and keeps its reservation | The commands; a test per hold reason |
| A cancellation request releases nothing; a confirmed one releases exactly what was held | The import command; a test per marketplace |
| A line's listing never changes once it has reserved | The import command; a test |
| Marketplace-shipped lines never reserve and never reach the picking list | The import command and the queue's query; a test |
| A shipment outside Vervoro deducts once, and our own shipment echoed back deducts nothing | The import and dispatch commands; a race test on real Postgres |
| No buyer data on a marketplace-shipped or anonymised order, or in a problem row | ADR-009's field-tag lint and a test |
| A problem row names the listing and quantity of every readable line, and its scope is the whole account when any line's listing is not readable | The import command; a test with an unreadable line |
| Every marketplace state maps to one Vervoro state | The connector's mapping; a test per row of the mapping tables |

## Marketplace constraints

Checked against each marketplace's documentation on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| eBay: which orders | The Fulfillment API includes only orders that completed checkout; `getOrders` reads up to two years back, filtered by last modified date | [getOrders](https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getorders) |
| eBay: cancellation requests | `getOrders` returns the cancellation state but always an empty list of requests; `getOrder` returns them in full; no request is `NONE_REQUESTED` | [getOrder](https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getorder) |
| eBay: order states | `orderFulfillmentStatus` `NOT_STARTED`, `IN_PROGRESS`, `FULFILLED`; `orderPaymentStatus` `PENDING`, `PAID`, `FAILED`, `PARTIALLY_REFUNDED`, `FULLY_REFUNDED`; `cancelStatus.cancelState` `NONE_REQUESTED`, `IN_PROGRESS`, `CANCELED`; each line's `shipByDate` | [getOrders](https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getorders) |
| eBay: seller cancellation | Whole orders only; up to 30 days after the sale; an out-of-stock cancellation can be a defect, one the buyer asked for is not; buyers' requests are approved or rejected; an order's id changes when it is paid | [Create cancellation](https://developer.ebay.com/Devzone/post-order/post-order_v2_cancellation__post.html) |
| eBay: daily limits | Post-Order cancellation 5,000 calls a day; Fulfillment order resource 100,000; both for the application | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Amazon: order states | `PENDING_AVAILABILITY`, `PENDING`, `UNSHIPPED`, `PARTIALLY_SHIPPED`, `SHIPPED`, `CANCELLED`, `UNFULFILLABLE`; `fulfilledBy` `AMAZON` or `MERCHANT`; the marketplace on `salesChannel` | [Orders API 2026-01-01 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json) |
| Amazon: cancellations on an item | A request names its requester (`BUYER`); an executed cancellation names who did it (`BUYER`, `MERCHANT`, `AMAZON`) | [Orders API 2026-01-01 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json) |
| Amazon: reading orders | `searchOrders` 0.0056 a second, burst 20, ending at least two minutes before the request; `getOrder` 0.5 a second, burst 30; `shipByWindow` on each order | [Orders API 2026-01-01 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json) |
| Amazon: order notices | `ORDER_CHANGE` on status changes and buyer cancellation requests, through the queue; names the marketplace and `MFN` or `AFN` | [Notification type values](https://developer-docs.amazon/sp-api/docs/notification-type-values) |
| Amazon: seller cancellation | The order acknowledgement feed acknowledges or cancels, by order item and quantity, with a reason from the schema's list, which includes `NoInventory` and `BuyerCanceled`; not marked deprecated. The 2026 orders API has only `getOrder` and `searchOrders` | [Order feed types](https://developer-docs.amazon/sp-api/docs/order-feed-type-values) |
| Shopify: payment states | `PENDING`, `AUTHORIZED`, `PARTIALLY_PAID`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `VOIDED`, `EXPIRED`; an order can stay open with a voided payment | [OrderDisplayFinancialStatus](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderDisplayFinancialStatus) |
| Shopify: fulfilment orders | `OPEN`, `IN_PROGRESS`, `SCHEDULED`, `ON_HOLD`, `INCOMPLETE`, `CLOSED`, `CANCELLED`; `fulfillBy` is the deadline | [FulfillmentOrderStatus](https://shopify.dev/docs/api/admin-graphql/latest/enums/FulfillmentOrderStatus), [FulfillmentOrder](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder) |
| Shopify: line quantity | `currentQuantity` leaves out refunded and removed units | [LineItem](https://shopify.dev/docs/api/admin-graphql/latest/objects/LineItem) |
| Shopify: cancelling | `orderCancel` cancels a whole order, runs as a job, and decides refund and restock | [orderCancel](https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderCancel) |
| Shopify: fraud | The risk summary recommends `ACCEPT`, `CANCEL`, `INVESTIGATE` or `NONE` | [OrderRiskRecommendationResult](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderRiskRecommendationResult) |
| Shopify: webhooks | Duplicates are named by `X-Shopify-Webhook-Id`; no order within a topic; delivery not guaranteed, so reconcile by `updated_at` | [Webhook best practices](https://shopify.dev/docs/apps/build/webhooks/best-practices) |
| Shopify: webhook topics | Separate topics for an order edited, a fulfilment order moved, placed on hold or released, and a new risk assessment | [WebhookSubscriptionTopic](https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic) |

## Consequences

**What this gives us**

- A notice, a read, a repeat or a late update can never make a second order or move stock twice.
- One status list for every channel, with every marketplace state mapped and tested, so the warehouse never has to know where an order came from.
- An order that may not ship (unpaid, requested to cancel, refunded, flagged) still holds its stock and cannot reach a parcel.
- Vervoro never cancels an order on its own, and never releases stock for a cancellation the marketplace has not confirmed.
- Orders for unlinked listings, orders the marketplace ships and orders shipped elsewhere each have one rule, and stock follows what really left.
- An order that cannot be read is visible within minutes, not lost.
- The warehouse gets one queue, sorted by deadline, with every lot and spot named.

**What it costs**

- Holds stop orders that may have been fine to ship; a seller with many risk-flagged or pending orders has more to release by hand.
- Pending orders hold stock that may never sell, until the marketplace cancels them.
- A Shopify cancellation, and part of an eBay order, must be done in the marketplace's own tools.
- eBay's cancellation pool is shared by every seller; past about 5,000 a day across the platform, it needs eBay's Growth Check, as the Trading pool does.
- A shipment outside Vervoro is trusted to have left the warehouse until a manager says otherwise, so a seller who ships from elsewhere has reversals to make.
- An Amazon order from a marketplace the account does not serve reserves nothing; the seller is warned, not protected.
- One more table, the order key, is read first by every import, because the order table is partitioned.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Poll orders as the main path | The owner's rule: notices are the way orders come in; polling spends shared allowances and brings orders late (ADR-004) |
| Import the notice body | It may be older than the order, carries buyer data, and some carry only ids (ADR-004) |
| A unique index on the partitioned order table | Postgres requires the partition key in it, so the same order in two months would not be caught |
| Use Vervoro's receive time to order updates | Notices and reads arrive out of order; only the marketplace's change time says which is newer |
| Statuses copied from each marketplace | The warehouse would need three lists; one table mapped per marketplace is testable |
| Holds as statuses ("on hold") | An order can be on hold for several reasons at once, and releasing one must not hide another; a set of reasons beside the status keeps both |
| Release stock when an order is held | Units promised to a buyer who will probably get them would be sold again |
| Reserve only paid orders | Pending orders can become sales, and the units would be sold elsewhere meanwhile |
| Release on a cancellation request | A refused request would leave an order without stock (ADR-006) |
| Cancel short orders automatically | Marketplaces count it against the seller; cancelling is the seller's choice (ADR-006) |
| Cancel Shopify orders from Vervoro | Cancelling there is also a refund and restock decision, which belongs in Shopify; it would also need the right to change a shop's orders |
| Import orders in the order they arrive | When stock is short, a later buyer could take the earliest buyer's unit; oldest purchase first is fairer and costs nothing |
| One transaction per read page | Holds the company's lock for a whole page; one order per transaction keeps it short |
| Drop an order that fails validation | The order would reserve nothing and nobody would know; a problem row keeps it visible |
| Skip unlinked lines, or the whole order | Contradicts ADR-005: the order is real and the seller must see it |
| Release reservations when the marketplace says "shipped" with no Vervoro shipment | If the parcel left the warehouse, those units would be offered again (ADR-006) |
| Manual orders as a separate module with its own reservations | Two ways to reserve drift apart (ADR-006); one order model serves both |
| Import Amazon orders from marketplaces the account does not serve | The backup read would never update them, so their status would go stale (ADR-004.2) |

## What later records decide

- **ADR-008: Inventory sync** (planned): the figure each linked listing gets, which orders count as sales out of a figure already sent (an Amazon account serving several marketplaces, a Shopify order split across locations), and how long a raise waits for the order watermark.
- **ADR-004.4: Amazon Vendor connector** (planned): Vendor purchase orders, which are demand of their own (ADR-006), not marketplace orders.
- **Shipping** (a later record): labels, carriers and rates, tracking and delivery dates, the dispatch notice's carrier codes, and marketplace returns.
- **[ADR-011: Invoicing and VAT](../invoicing-and-vat/):** invoices, credit notes and the VAT on every sale. Business customers as saved records remain a later record.
