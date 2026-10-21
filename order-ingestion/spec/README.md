# ADR-007 SPEC: Order ingestion

| | |
| --- | --- |
| **Decision** | [ADR-007: Order ingestion](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-007-order-ingestion) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-007 from: the Orders module, core and always on, needing Products, Listings, Inventory and Buyer data ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| Shopify orders: the state mapping, quantities from the fulfilment orders at Vervoro's location, Shopify's holds (on hold, location gone, fraud check), the handling time, lines split across locations | The Shopify connector is built ([ADR-004.3](../../shopify-connector/), owner ruling, 21 October 2026) | [3](#3-one-order-per-marketplace-order), [7.3](#7-from-each-marketplace), [11](#11-holds), [15](#15-marketplace-shipped-lines-and-conflicts), [20](#20-deadlines-and-the-handover) |
| Mirrors and possible duplicates: one sale reaching Vervoro directly and as a Shopify order a marketplace's app made | The same | [16](#16-the-same-sale-twice) |
| Shipping labels in Vervoro: a fresh read before each label, the holds "address changed after label" and "label to void" | The shipping record (labels are parked, [ADR-000 SPEC 4.7](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)) | [11](#11-holds), [20](#20-deadlines-and-the-handover) |
| Shipping part of a short order from Vervoro ("ship what is here") | A pilot shows a seller shipping part of an eBay order outside Vervoro more than ten times a week | [10](#10-whole-orders) |
| Amazon Vendor purchase orders, a demand of their own | The Vendor connector (ADR-004.4, not written) | None here |
| Saved business customers | [ADR-011](../../invoicing-and-vat/) gives them a record | [18](#18-manual-orders) |

## 1. The module

1. **Orders writes** orders, lines, statuses, holds, cancellation requests, refunds, import problems and manual orders. No other module writes them.
2. **Channels hands orders in.** The consumer and the completeness check fetch through the connector and call Orders' import port with the contract's order type ([ADR-004 SPEC 1](../../channel-connectors/spec/#1-the-connector-contract)). Orders never sees a marketplace payload.
3. **Orders asks for a fetch by event.** A core module never calls Channels, so a re-fetch (section 2.5) is an event Channels hears after commit.
4. **Orders calls core ports inside its transaction:** Listings to resolve a line to the link valid at purchase, report an unknown listing and open a fulfilment conflict ([ADR-005 SPEC 1](../../catalogue-sync/spec/#1-who-does-what)); Inventory to reserve, release and deduct ([ADR-006 SPEC 5.3](../../stock-ledger/spec/#53-reserving-an-order-line), [7](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call)); Buyer data to store the allowed fields ([ADR-009](../../buyer-data/)).
5. **Orders announces by event:** an order imported or changed, a problem opened or closed, a floor stop, an order shipped or refunded. Stock sync ([ADR-008](../../inventory-sync/)), Fulfilment ([ADR-014](../../fulfilment/)) and Invoicing ([ADR-011](../../invoicing-and-vat/)) act on them.
6. **Fulfilment calls Orders' ports** to start picking, record packed and record a shipment ([ADR-014 SPEC 4](../../fulfilment/spec/#4-shipments)). Orders sends nothing to a marketplace except the dispatch notice it records for a shipment through the egress gate ([ADR-000 SPEC 7](../../system-architecture/spec/#7-the-egress-gate)); an unknown outcome follows [ADR-004 SPEC 5](../../channel-connectors/spec/#5-retries-and-outcomes).

## 2. How an order comes in

1. **Notices first.** A verified notice is queued with ids only and answered; the consumer fetches each order it names and hands it in ([ADR-004 SPEC 8](../../channel-connectors/spec/#8-notices-in)). Notices for the same order within 30 seconds share one fetch; correctness never depends on it.
2. **The completeness check** reads the orders changed since the watermark at the interval ADR-004 sets per marketplace ([SPEC 9](../../channel-connectors/spec/#9-the-completeness-check)) and imports each by the same port. On Amazon it asks for every marketplace of the region in one call (section 21).
3. **The watermark moves only after a complete window:** every order in it has committed or has a problem row (section 9). One bad order never stalls the account. Channels keeps the watermark; this rule is Orders'.
4. **A fetch that cannot see the order yet** is retried by Channels, then left to the completeness check (ADR-004 SPEC 8.6).
5. **Re-fetches Orders asks for:** an order held by the marketplace for more than 24 hours, once a day; an eBay order at the end of the buyer's answer window plus 1 hour (section 12.2); an unshipped order 2 hours before its leave-by (section 20.4); an Amazon order before a manager releases its cancellation hold (section 12.3).
6. **eBay's order list** returns the cancellation state but no requests: an order whose state is not `NONE_REQUESTED` is fetched singly to read the request ([ADR-004.1](../../ebay-connector/)).
7. **Vervoro's own dispatch comes back** as a "marked shipped" or "fulfilled" notice; one for an order whose Vervoro shipment is sent or on its way is not fetched again.

## 3. One order per marketplace order

1. **The key** is the account and the marketplace's order id: eBay's `orderId`, Amazon's `orderId` (one id across the region), *Later:* Shopify's numeric order id, never its editable name. A manual order takes the next number from the company's counter ([ADR-001](../../database-architecture/)).
2. **One unpartitioned key table.** Orders and lines are partitioned by month of purchase, and a unique index on a partitioned table must include the month. So `sales_order_key` is unique on company, account and marketplace order id, and every import reads it first, under the company's lock.
3. **Which fetch wins,** by the marketplace's own change time (eBay's `lastModifiedDate`, Amazon's `lastUpdatedTime`, *Later:* Shopify's `updatedAt`), never Vervoro's clock:

| The fetched order is | What happens |
| --- | --- |
| New | Created; its lines resolved and reserved |
| Newer, or with the same change time | Applied. Only the difference moves (target, not delta), so applying it again changes nothing. The same time is applied because a marketplace can change part of an order without moving the order's time |
| Older | Ignored |

4. **Facts that only rise.** Units cancelled and units shipped outside Vervoro (and, on a manual order, units removed by a manager) never go down. A fetch that reports fewer is not applied for that fact; it holds the order "step undone".
5. **Lines** are named by the marketplace's line id. A line new on a later fetch is added and reserves. A missing line is never removed; its quantity changes only when the marketplace says so.
6. **A line's listing is fixed once it has reserved.** A later fetch naming another listing for the same line id changes nothing and holds the order "line changed after import". Moving it would free units promised to a buyer.
7. **A line's quantity is what is still to ship from Vervoro's warehouse:** on eBay and Amazon, the quantity less cancelled units. *Later:* on Shopify, the remaining quantity on the fulfilment orders at Vervoro's location, worked out on every fetch, never `currentQuantity`, which also drops for a refund after shipping and ignores a move to another location.
8. **Repeats and disorder change nothing.** A notice twice, notices out of order, a read before or after its notice, a forged or replayed notice: each causes at most a fetch, and the import is idempotent. The contract suite's notice cases prove it against every simulator ([ADR-004 SPEC 17](../../channel-connectors/spec/#17-tests-that-prove-each-rule)).

## 4. Late updates

Once shipped or cancelled, the status is final; later news is a fact on the order.

| Later news | What happens |
| --- | --- |
| Tracking or delivery | Recorded; a delivery date starts ADR-009's retention clock |
| Our own shipment echoed back | Recognised by its shipment id, or a shipped quantity no larger than Vervoro's; nothing moves |
| A refund | Recorded (section 12.5) |
| Cancelled after dispatch | Recorded; no stock moves; the order shows "expect a return" |
| Fewer units shipped or cancelled than before | Held "step undone"; nothing moves until a person answers (section 17.6) |
| The order is gone from the marketplace | Held "order gone"; the reservation stays; a manager may cancel it in Vervoro |
| A changed delivery address before dispatch | Saved; on a picked or packed order, a floor stop (section 13) |

## 5. The order and its lines

1. **The order** holds the account (or "manual"), the marketplace order id, purchase and change times, status and the function's version, who ships it, the warehouse (the account's default, [ADR-006 SPEC 1](../../stock-ledger/spec/#1-where-stock-is-counted)), ship-by and leave-by, the marketplace it was sold on, where it arrived from, a replacement mark (ADR-012 does not count replacements), a business buyer's company, VAT number and purchase-order reference, the delivery charge and any order discount as paid ([ADR-011](../../invoicing-and-vat/)), and the shipped, cancelled, delivered and anonymised times.
2. **A line** holds the marketplace line id, the listing key ([ADR-005 SPEC 2](../../catalogue-sync/spec/#2-listings-and-keys)), the SKU and title as given, quantity, cancelled, shipped outside and when, fulfilment (seller, marketplace or unknown), how it was resolved (link, person or none), price, currency, discount and who funded it, the marketplace's tax figure and whether it collects it, the VAT rate used ([ADR-003](../../product-model/)), and the stock fields of [ADR-006 SPEC 5.3](../../stock-ledger/spec/#53-reserving-an-order-line). Money is never added across currencies. Units shipped by Vervoro come from Fulfilment's shipments, not a second copy.
3. **A line's stock state is worked out, never stored:**

| State | Meaning | Reserves |
| --- | --- | --- |
| Waiting | No product yet: the listing is unlinked or unknown | Nothing |
| Reserved | Every unit it still needs is reserved | Yes |
| Short | Part reserved, the rest recorded missing | What exists |
| Not reserved | Marketplace-shipped, a mirror, or a charge line | Nothing, ever |
| Done | Every unit shipped or cancelled | Nothing left |

## 6. Statuses

One function works the status out from the order's facts, inside every transaction that changes one, and stores it for lists. The rows are checked from the top: an order cancelled while packed is cancelled.

| Status | When | Reserves |
| --- | --- | --- |
| Cancelled | Every unit cancelled, none shipped | Nothing |
| Shipped | Every unit shipped (by Vervoro or outside it) or cancelled, at least one shipped | Nothing |
| Part shipped | The marketplace reports some units shipped outside Vervoro, others still to ship | What remains |
| Pending | The marketplace says it may not ship yet: payment incomplete, a pre-order, a scheduled order | Yes, with a marketplace hold |
| Packed | Every unit still to ship is in a parcel | Yes |
| Picking | A picker has an open pick task for it | Yes |
| Open | None of the above | Yes |

**Expected moves** (each recorded in the activity view with the old and new status, the fact, the person or process and the function's version):

| From | To | Caused by |
| --- | --- | --- |
| Pending | Open | The marketplace says it can ship |
| Any but shipped | Cancelled | The marketplace confirms the whole order cancelled, or a manager cancels a manual order |
| Open | Picking | A picker starts it; refused while blocked or held |
| Picking | Packed | Packing has every unit still to ship |
| Picking, packed | Open | A person puts it back, or the marketplace changed it (section 13) |
| Pending, open, picking, packed | Part shipped | The marketplace reports part shipped outside Vervoro |
| Any but cancelled | Shipped | Vervoro's shipment is confirmed, or the marketplace reports the rest shipped or cancelled |

1. **An unexpected move is an alarm, not a refusal.** It is written, because refusing the marketplace's facts would stall the account; it holds the order "unexpected status change" and alerts the operator at once, so a mapping bug is caught on its first order.
2. **Checked every night.** ADR-006's nightly check works every open order's status out again; a difference alerts the operator. A new version of the function is run against every open order before deploy, and its moves reviewed.
3. **A hold never changes the status.** Shipped and cancelled are final (section 4).
4. **Orders the marketplace ships** use only pending, open, part shipped, shipped and cancelled.

## 7. From each marketplace

The connector maps the marketplace's states onto the contract's order; Orders works out the status. A test covers every row. An unknown value holds that one order "unknown state" and alerts the operator; only an unknown fulfilment status, which decides what has shipped, makes the order an import problem.

### 7.1 eBay (Fulfillment API)

| eBay says | Vervoro |
| --- | --- |
| A new order (only orders that completed checkout are returned) | Open |
| `orderPaymentStatus` `PENDING` or `FAILED` | Pending, held "payment pending"; it reserves |
| `orderFulfillmentStatus` `NOT_STARTED` | Open |
| `IN_PROGRESS` / `FULFILLED` | Units no Vervoro shipment covers are shipped outside; part shipped / shipped |
| `cancelStatus.cancelState` `IN_PROGRESS` | A buyer's cancellation request: held |
| `cancelState` `CANCELED` | Cancelled |
| `FULLY_REFUNDED`, not shipped or cancelled | Held "refunded, not cancelled" |
| `PARTIALLY_REFUNDED` | A refund recorded |

### 7.2 Amazon (Orders API 2026)

`getOrder` asks for the fulfilment and cancellation datasets, and the recipient only as ADR-009 allows.

| Amazon says | Vervoro |
| --- | --- |
| `PENDING_AVAILABILITY` | Pending, held "not yet due" |
| `PENDING` | Pending, held "payment pending" |
| `UNSHIPPED` | Open |
| `PARTIALLY_SHIPPED` / `SHIPPED` | Units no Vervoro shipment covers are shipped outside; part shipped / shipped |
| `CANCELLED` | Cancelled |
| `UNFULFILLABLE` | Only for Amazon-shipped orders placed elsewhere: recorded, nothing reserved |
| `fulfilledBy` `AMAZON` | Marketplace-shipped: recorded, never reserved |
| An item's `cancellationRequest` from `BUYER` | A buyer's cancellation request: held |
| An item's `cancellationExecution` | That item's units cancelled |
| Associated order `REPLACEMENT_ORIGINAL_ID` | An ordinary order, marked as a replacement |

### 7.3 *Later:* Shopify

| Shopify says | Vervoro |
| --- | --- |
| `cancelledAt` set | Cancelled |
| Financial status `PENDING`; or `VOIDED` or `EXPIRED` on an unshipped order | Pending, held "payment pending" (an order can stay open with a voided payment) |
| `AUTHORIZED`, `PAID`, `PARTIALLY_PAID` | Paid enough to ship; capture is the seller's business |
| `REFUNDED`, not shipped or cancelled | Held "refunded, not cancelled" |
| Fulfilment order at the warehouse `OPEN`, `IN_PROGRESS` / `SCHEDULED` / `ON_HOLD` | Open / pending, held "not yet due" until `fulfillAt` / held "on hold in Shopify" |
| Fulfilment order `CLOSED` with fulfilments Vervoro did not make | Shipped outside, for those units |
| Lines at another location or a fulfilment service | Marketplace-shipped: recorded, never reserved |
| Risk `CANCEL` or `INVESTIGATE` | Held "fraud check", unless a manager released that same recommendation |
| Lower remaining quantity at the warehouse | The difference released; on a picked or packed order, a floor stop |

Moves, holds and risk changes do not reliably raise the order-updated webhook, so each has its own topic ([ADR-004.3 SPEC 3](../../shopify-connector/spec/#3-webhooks-and-orders)).

## 8. Reserving on import

ADR-006 owns which units are chosen; this section owns when, in what order and what a failure does.

1. **One transaction, in these steps:** take the company's lock; read the key and stop if the fetch is older; write the order and lines, keeping the facts that only rise; resolve each new line with the link valid at purchase, or leave it waiting; reserve or release only the difference from each line's target, recording shortages; set or clear marketplace holds and floor stops; work out the status and alarm on an unexpected move; write buyer data and the anonymisation due time; write the outbox note with the ledger sequence. Commit. Stock sync works out the affected listings' figures after commit ([ADR-008 SPEC 1](../../inventory-sync/spec/#1-the-figure-per-listing)).
2. **Never half an order:** the order, every line and every reservation, or nothing.
3. **Pending orders reserve,** because they can still become sales; the hold keeps them off the picking list.
4. **Orders found together import oldest purchase first,** then by marketplace order id, so when stock is short the earliest buyer gets it.
5. **One transaction per order,** never per page, so the lock is held briefly and other channels' orders interleave. Across channels the lock decides who gets the last unit; the other line is short.
6. **Within an order,** lines reserve in the marketplace's line order, a bundle's components with them.

| What goes wrong | What happens |
| --- | --- |
| Too little stock | Not a failure: the line is short (section 10) |
| A listing unknown or unlinked | Not a failure: the line waits (section 14) |
| An unknown state value | Not a failure: held "unknown state" |
| The database, a lock wait or a timeout | Rolled back and retried with growing delays; after three failed attempts also recorded as an import problem and the operator alerted |
| A database check refuses ("would go negative") | Rolled back with a typed refusal: a bug, so the operator is alerted at once; retried, then an import problem as above |
| The fetched order fails the contract types | An import problem |

## 9. Import problems

An order that cannot be read into the contract's types (a missing field the contract needs, a quantity that is not whole, an unknown fulfilment status) is never dropped and never guessed.

1. **A row in `sales_order_problem`:** account, marketplace order id, reason, first and last seen, resolved. Never the order's body.
2. **Per line, as far as it can be read:** the marketplace line id, the listing key and the quantity, or "quantity not readable", or "listing not readable". These are marketplace ids, not buyer data.
3. **Its scope** is those listings, or the whole account when any line's listing could not be read. Stock sync takes the units off the figures for the scope until the order imports ([ADR-008 SPEC 1](../../inventory-sync/spec/#1-the-figure-per-listing)); decreases are never held. The scope ends when the order imports, or when a person marks the problem resolved.
4. **Seen at once:** top of the order list for the seller, with the marketplace's link to the order; an alert to the operator.
5. **Retried** on every later notice or read of that order; after a connector fix the operator retries every open problem at once. Procedure: [Work the problem-orders list](../../runbooks/work-the-problem-orders-list/).

## 10. Whole orders

1. **One shipment per order,** possibly several boxes ([ADR-014 SPEC 4](../../fulfilment/spec/#4-shipments)).
2. **Ready to pick:** open or part shipped, shipped by the seller, every line it ships linked and fully reserved, and no hold.
3. **A short order waits.** Short is worked out, not a hold, and clears itself when stock arrives and the refill reaches it ([ADR-006 SPEC 5.3](../../stock-ledger/spec/#53-reserving-an-order-line)). The order shows a decision: wait for stock (with the next expected delivery, when a purchase order names one) or change the order on the marketplace.
4. **A waiting line blocks the same way** until linked, attached or cancelled on the marketplace.
5. **Part shipped happens only when the marketplace reports it;** the rest stays reserved and ships whole.

## 11. Holds

A hold pauses an order. It does not release it.

1. **A set of reasons,** each with who or what set it, when, why and a decide-by time. Any reason keeps the order off the picking list; starting to pick, packing and confirming a shipment are refused.
2. **A hold keeps the reservation** and sends nothing to the marketplace. A confirmed cancellation still cancels a held order.
3. **Append-only.** Every hold and release is a row in `sales_order_hold`; the current set is read from it. A release can be undone at once, restoring the old reason.
4. **The kind decides who clears it,** not a mark on the person ([ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what)):

| Kind | Placed by | Cleared by |
| --- | --- | --- |
| Marketplace | The import | Only the marketplace, through a fetch, except where the table below says |
| Office | The import, or a manager, admin or owner | A manager, admin or owner, with a reason |
| Floor | The import, or anyone in the warehouse | Anyone in the warehouse, or a manager, admin or owner |

| Hold | Kind | Set when | Cleared when |
| --- | --- | --- | --- |
| Payment pending | Marketplace (office on a manual order) | Payment not complete | The marketplace says it can ship; on a manual order, a manager |
| Not yet due | Marketplace | A pre-order or scheduled order | The marketplace says it can ship |
| Cancellation requested | Marketplace | A buyer asked to cancel | Confirmed, declined or lapsed; on Amazon a manager may release it (section 12.3) |
| Address missing | Marketplace | A seller-shipped order that can ship has no complete address | A fetch brings it, or a manager enters it |
| Refunded, not cancelled | Office | A full refund on an order not shipped or cancelled | A person cancels it on the marketplace, or ships it |
| Line changed after import | Office | A later fetch names another listing for a reserved line | A manager resolves the line again ([ADR-006 SPEC 5.3](../../stock-ledger/spec/#53-reserving-an-order-line)) or accepts it |
| Step undone | Office | Fewer units shipped or cancelled than before | A person answers (section 17.6) |
| Order gone | Office | The order is gone from the marketplace | A manager cancels it in Vervoro, or keeps it |
| Unknown state | Office | An unmapped value | The mapping learns it, or a manager decides |
| Unexpected status change | Office | A move the expected list does not name | The operator or a manager checks it |
| Who ships these? | Office | First seller-shipped order from an Amazon marketplace the account was not set up for | The seller answers (section 21) |
| Payment check, customer request, other | Office | A manager, with a note | A manager, admin or owner |
| Address check | Office before picking; floor from picking on | A manager on any order; anyone in the warehouse on an order they are picking or packing | Before picking, a manager; after, anyone in the warehouse |
| Stock check | Floor | A person, by hand | Anyone in the warehouse |
| Order changed: check the parcel | Floor | The marketplace changed a picked or packed order | The parcel is checked against the order (section 13) |
| *Later:* on hold in Shopify; location gone; fraud check | Marketplace; marketplace; office | Shopify holds the fulfilment order; assigns a missing location; recommends cancel or investigate | Shopify releases; a person reassigns in Shopify; Shopify accepts or a manager releases (not held again for the same recommendation) |
| *Later:* possible duplicate | Office | Section 16 | A manager confirms a separate sale, or marks it a mirror |
| *Later:* address changed after label; label to void | Floor | The address changed, or the order changed or was cancelled, after a label was bought in Vervoro | The label is checked, replaced or voided, confirmed by a scan or a tap |

5. **Floor holds never widen who sees buyer data.** The warehouse holds or clears an address check only on an order it is picking or packing, when it already sees the address ([ADR-009](../../buyer-data/)).
6. **Decide-by and escalation.** Decide-by is the leave-by, or the marketplace's deadline when sooner. Two hours before it, those who may clear the hold are alerted; when it passes, again, and the owner too if they switched that on. No hold expires on its own.

## 12. Cancellations and refunds

This section owns "Vervoro never sends a cancellation"; other records link here. The connector contract has no cancel operation, and Vervoro needs no right to change a marketplace's orders.

1. **A buyer's request** (eBay's cancellation state, read with a single fetch; an Amazon item's request from the buyer) holds the order "cancellation requested", keeps its reservation and stops a picker who has started (section 13). It is a row in `sales_order_cancellation` with the lines, quantities, time and the marketplace's answer deadline; each later change (declined, lapsed, confirmed) is a new row. *Later:* Shopify has no buyer request; the buyer asks the seller.
2. **eBay's answer window** is 3 calendar days. An unanswered request on a paid order is closed and the order is not cancelled; on an unpaid one, the order is cancelled. Orders asks for a fetch 3 days and 1 hour after the request, so a lapsed request clears the hold without a notice.
3. **Amazon: ship anyway.** Amazon offers no refusal; shipping is the refusal. A manager, admin or owner may release the hold with a reason, after a fresh fetch shows the order not cancelled. Nothing is sent but the dispatch notice.
4. **The seller decides on the marketplace.** The cancellation list (every open request, by deadline) and each order page link to the order there and name what the marketplace counts against the seller (eBay counts an out-of-stock cancellation as a defect, not a buyer's request). The answer, or a cancellation the seller makes, comes back by notice or the completeness check. Only a manual order is cancelled in Vervoro. Procedure: [Handle a buyer's cancellation request](../../runbooks/handle-a-buyers-cancellation-request/).
5. **A confirmed cancellation** releases exactly what each cancelled line held, in the import's transaction ([ADR-006 SPEC 7.6](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call)), and raises the line's cancelled units. Picked or packed: the units become sellable where the books hold them, a floor stop is set, and Fulfilment opens put-back tasks ([ADR-014 SPEC 5](../../fulfilment/spec/#5-cancellations-on-the-floor)). Part shipped: it releases what remains. After dispatch: recorded, nothing moves; a parcel that comes back is a return.
6. **Part of an order.** A smaller quantity releases the difference, latest sell-by first; a larger one reserves more. On a picked or packed order, either sets a floor stop.
7. **Refunds are recorded,** never acted on: amount, currency, lines, time, in `sales_order_refund`. A refund never restocks and cancels nothing. A full refund on an order not shipped or cancelled holds it, because shipping goods the buyer has been paid back for loses them. A partial refund is recorded only.

## 13. Floor stops

1. **Any marketplace change to a picked or packed order** (a line added or removed, a quantity changed, a new address, a new hold, a confirmed cancellation) holds it "order changed: check the parcel" and is announced to Fulfilment, whose screen shows a red stop with what changed.
2. **Fulfilment's commands check holds again on the server** (start picking, pack, confirm a shipment), so a stop that arrives between two taps still stops the parcel.
3. **Units released** from a picked or packed order go back through Fulfilment's put-back tasks ([ADR-014 SPEC 5](../../fulfilment/spec/#5-cancellations-on-the-floor)). The stop clears when the warehouse confirms the parcel matches the order.

## 14. Orders for unlinked listings

1. **The line waits:** it reserves nothing and is flagged; the order's other lines reserve as normal; the order stays off the picking list. "Waiting" is worked out, not a hold.
2. **An unknown listing** starts a read of that one listing through Listings' port; the line waits meanwhile.
3. **A line with no listing at all** waits and can only be attached.
4. **A not-stock listing's lines are charge lines:** they never wait, reserve nothing and never block the picking list ([ADR-005 SPEC 12](../../catalogue-sync/spec/#12-unlinked-listings-and-going-live), owner ruling, 21 October 2026).
5. **Who is told** is ADR-005's: the first order on an unlinked listing with a strong or medium suggestion alerts the seller; others go to the daily digest.
6. **Link the listing:** opens ADR-005's link screen. Right after the link commits, Orders reserves every waiting line of that listing, oldest first, in its own transaction ([ADR-006 SPEC 6.5](../../stock-ledger/spec/#6-what-a-line-reserves)).
7. **Attach this line:** a manager, or the packer holding the item, resolves only that line to a product and units per sale. It reserves at once; the listing stays unlinked and gets no figure; the line records "resolved by person".
8. **A waiting line shipped outside Vervoro** deducts nothing and stays flagged. Attaching it deducts at once ([ADR-006 SPEC 6.7](../../stock-ledger/spec/#6-what-a-line-reserves)); "Not from our stock" closes the flag and moves nothing.

## 15. Marketplace-shipped lines and conflicts

1. **A seller-shipped line on a marketplace-shipped link** reserves units per sale and can ship: refusing it leaves a buyer without a parcel.
2. **It opens a conflict on the listing** through Listings' port ([ADR-005 SPEC 16](../../catalogue-sync/spec/#16-conflicts)); the listing's raises wait; the order is not held. The seller answers once per listing.
3. **The other way round,** a marketplace-shipped line on a seller-shipped link reserves nothing; the seller is told once per listing.
4. **Lines the marketplace ships** (Amazon FBA; *Later:* Shopify lines at another location or a fulfilment service) are recorded for reports with lines, products through the link, quantities, prices, dates and statuses.
5. **Never reserved, picked or dispatched;** no hold applies.
6. **No buyer data** is kept or asked for.
7. **Fulfilment not yet known:** the line reserves as if the seller ships it, and releases when the marketplace says it ships it ([ADR-006 SPEC 6.8](../../stock-ledger/spec/#6-what-a-line-reserves)).
8. *Later:* **a Shopify order split across locations** reserves the lines at Vervoro's warehouse and records the rest.

## 16. The same sale twice

*Later,* with ADR-004.3. A seller may connect eBay or Amazon to Shopify with those marketplaces' own apps, so one sale can arrive directly and as a Shopify order ([ADR-004.3 SPEC 4](../../shopify-connector/spec/#4-orders-other-marketplaces-put-into-the-shop)).

1. **Names a marketplace also connected directly:** a mirror. It never reserves or ships. Until the direct order arrives, its lines sit in a problem row as "sold there, reserved nowhere", scoped to their listings, so their units stay off every figure; the mirror closes when the direct order imports.
2. **Names a marketplace not connected directly:** an ordinary sale.
3. **Made by a marketplace's app, naming none:** an ordinary sale; if its SKUs and quantities match a direct order placed within 30 minutes, held "possible duplicate". No buyer data is compared; orders the shop itself took are never matched.
4. **A mirror whose direct order never comes:** when a complete read of the direct account passes the mirror's purchase time by 30 minutes, the mirror becomes an ordinary order, reserves, and the seller is alerted.

## 17. Shipped outside Vervoro

1. **The fact.** `shipped_outside` on a line is the units the marketplace says shipped, less those Vervoro's shipments cover, with the marketplace's time. It only rises.
2. **It deducts in the import's transaction** through Inventory's port, source "marketplace said shipped", packed units first, then earliest sell-by ([ADR-006 SPEC 7.5](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call)). The status follows. A short line deducts what it held and stops seeking the rest. A waiting line deducts nothing (section 14.8).
3. **In shadow too,** so the figures Vervoro would send stay true; these entries are "lot not traced". At going live the on-hand import sets each product outright ([ADR-008 SPEC 14](../../inventory-sync/spec/#14-shadow-and-going-live)), so nothing counts twice.
4. **Ours or theirs.** Vervoro stores the fulfilment or shipment id the marketplace returns for its dispatch notice. A report with one of those ids, or a shipped quantity no larger than Vervoro's, is our own and moves nothing. A shipment confirmed in Vervoro after the outside one is refused "already shipped outside"; "this was our parcel" attaches its carrier and tracking and moves nothing.
5. **Reversing.** A manager who knows the parcel did not leave the warehouse chooses "Not from our stock": the units come back as an adjustment with a reason and become sellable. A line is reversed at most once.
6. **The marketplace undoes it.** Fewer units shipped than before holds the order "step undone". "The parcel did not leave" reverses the deduction and the line reserves again; "it left" closes the hold.
7. **The seller sees** these orders in the daily digest; the batch task is Fulfilment's ([ADR-014 SPEC 4](../../fulfilment/spec/#4-shipments)). Procedure: [Settle an order shipped outside Vervoro](../../runbooks/settle-an-order-shipped-outside-vervoro/).

## 18. Manual orders

1. **Who:** anyone in the warehouse, or a manager, admin or owner, creates, confirms, edits and cancels phone and email orders and makes counter sales. A business order on account terms is confirmed by a manager, admin or owner.
2. **A draft first.** Lines name products directly, with quantities, prices and currency, a delivery address, and for a business buyer the company, VAT number and purchase-order reference. A draft reserves nothing.
3. **Copying a previous order** starts a draft (no saved customer list at launch). A manager's copy brings everything; a warehouse user's brings products, quantities and prices but no buyer details ([ADR-009](../../buyer-data/)).
4. **Charge lines:** a name, an amount with currency and a VAT class ([ADR-003 SPEC 1.1](../../product-model/spec/#11-charge-lines-and-listings-that-are-not-stock), owner ruling, 21 October 2026). They never reserve, move stock or reach the pick list. Delivery is not a charge line: it stays the order's delivery charge, its VAT following the goods ([ADR-011](../../invoicing-and-vat/)).
5. **Confirming reserves** in one transaction, with a key the client makes so a double tap confirms once, and takes the next number from the company's counter.
6. **Payment.** A warehouse user confirms an order as paid with its payment reference; without one it is held "payment pending" (office) until a manager releases it. A manager may confirm unpaid for account terms, and hold any manual order until paid. The server checks this on every confirm.
7. **Then an ordinary order:** holds, picking, packing, dispatch; never in shadow, nothing sent to a marketplace.
8. **Edits before picking** release or reserve the difference; after picking starts, an edit puts the order back to open, with put-back for units taken off.
9. **Cancelling** is immediate and releases what the order held.
10. **A counter sale** is one screen: products, quantities, paid and collected, created, reserved and shipped in one transaction with the client's key, with no address or label. It is in the manager's daily list; a manager can reverse it.
11. **The recipient's name, address and phone** are buyer data under ADR-009.

## 19. Buyer data on import

ADR-009 decides what is kept and for how long. On import:

1. **Only from the fetched order;** a notice body is never read for buyer data.
2. **Only for orders the seller ships;** on Amazon the recipient is asked for only on seller-shipped orders not yet shipped ([ADR-004.2 SPEC 8](../../amazon-seller-connector/spec/#8-buyer-data)).
3. **Only the allowed fields:** recipient name, delivery address and phone, order note, gift message, a business buyer's company name and VAT number, each encrypted with the company's key.
4. **The eBay buyer's user id** becomes a keyed hash; the id is never stored.
5. **What a marketplace withholds stays missing.** A later fetch without a field never blanks it; a partial address never replaces a complete one.
6. **The anonymisation due time** is set when its start is known: delivery, dispatch, the outside shipping time, or a cancellation.
7. **An anonymised order** stores nothing personal again, whatever a fetch brings.
8. **No buyer data** in a problem row, log, queue message, event or duplicate match.

## 20. Deadlines and the handover

1. **Ship-by, one per order:** the earliest of its lines' deadlines. eBay: each line's `shipByDate`. Amazon: the end of `shipByWindow`. Manual: the date a manager sets. *Later:* Shopify: the fulfilment order's `fulfillBy`, else purchase plus the account's handling time.
2. **Leave-by:** the last collection cut-off at or before the ship-by. Each warehouse has one cut-off with dated exceptions (a holiday with no collection, a different time). With none set, leave-by is the ship-by.
3. **The picking list** holds the orders ready to pick (section 10.2) in the picker's warehouses, sorted by leave-by, then purchase time. Pick lists, packing and shipments are [ADR-014's](../../fulfilment/); what the warehouse may see while packing is [ADR-009's](../../buyer-data/).
4. **Deadlines are watched.** Two hours before leave-by, an unshipped order is fetched once, then those who can unblock it are alerted: the warehouse for an open order, a manager for an office hold or a short order. When it passes they are alerted again (the owner too, if switched on) and the order is listed until it ships. Home shows each cut-off with the orders that will miss it.
5. **The dispatch notice.** Recording a shipment writes the notice through the egress gate; the gate retries a failed or throttled send, and the shipment stands. A notice not accepted an hour after the confirm, or by the ship-by if sooner, alerts the seller and the operator.
6. *Later:* **a fresh read before a label** for an Amazon or Shopify order, so a cancellation whose notice was lost stops the label; never for eBay, whose allowance is shared.

## 21. Amazon orders from the region's other marketplaces

1. **Imported:** the completeness check names every marketplace of the region in one search ([ADR-004.2 SPEC 2](../../amazon-seller-connector/spec/#2-regions-and-marketplaces)).
2. **Marketplace-shipped ones** are recorded as usual.
3. **The first seller-shipped order** from a marketplace the account was not set up for reserves and is held "who ships these?". The seller answers once for that marketplace: "this warehouse" (the hold clears; its orders reserve and are picked) or "not us" (the reservation is released; that marketplace's seller-shipped orders are recorded like marketplace-shipped ones).
4. **Lines whose listing is not linked** wait; a SKU listed only there cannot be linked until the seller adds the marketplace ([ADR-005](../../catalogue-sync/)).

## 22. What people see

1. **The seller:** problem orders at the top of the order list; the cancellation list; each order's holds with decide-by; short and waiting orders with their decision; shipped-outside orders in the daily digest.
2. **The warehouse:** the picking list by leave-by, red stops on changed orders, and Home's cut-offs with the orders that will miss them.
3. **The operator:** import problems, unexpected status changes, unknown states, nightly status differences, and dispatch notices not accepted. The order watermark more than 60 minutes behind pages per marketplace ([ADR-008 SPEC 16](../../inventory-sync/spec/#16-what-the-seller-and-the-operator-see)). Procedure: [Order ingestion stalled](../../runbooks/order-ingestion-stalled/).

## 23. Storage

Orders' tables carry the `sales_` prefix, are declared through `tenantTable()` and queried through the typed query builder; modules write no SQL ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)). Schema changes expand, then contract ([ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying)).

| Table | Holds |
| --- | --- |
| `sales_order` | The order fields of section 5; partitioned by month of purchase; buyer fields tagged `pii` |
| `sales_order_key` | Company, account, marketplace order id → order id and month; unpartitioned, unique, read first |
| `sales_order_line` | The line fields of section 5, partitioned with its order; a charge line has no product, link or reservation; no stored stock state |
| `sales_order_hold` | Each hold placed and cleared: reason, kind, note, by whom, decide-by, when; append-only |
| `sales_order_cancellation` | Each buyer request and change: lines, quantities, marketplace id, deadline, state, times; append-only |
| `sales_order_refund` | Amount, currency, lines, time |
| `sales_order_problem` | Section 9; no order body and no buyer data |
| `sales_cutoff` | Each warehouse's collection cut-off and dated exceptions, by warehouse id |

Settings: whether the owner is told about missed leave-bys; per Amazon marketplace of a region, who ships its orders; *Later:* each Shopify account's handling time.

## 24. Constraints

Checked against each marketplace's documentation on 18 October 2026. Limits and notice topics are in each connector's SPEC ([ADR-004.1 SPEC 10](../../ebay-connector/spec/#10-constraints), [ADR-004.2 SPEC 12](../../amazon-seller-connector/spec/#12-constraints), [ADR-004.3 SPEC 11](../../shopify-connector/spec/#11-constraints)).

| Constraint | Figure | Source |
| --- | --- | --- |
| eBay: which orders | Only orders that completed checkout; `getOrders` reads up to two years back by last modified date | [getOrders](https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getorders) |
| eBay: order states | `orderFulfillmentStatus` `NOT_STARTED`, `IN_PROGRESS`, `FULFILLED`; `orderPaymentStatus` `PENDING`, `PAID`, `FAILED`, `PARTIALLY_REFUNDED`, `FULLY_REFUNDED`; `cancelState` `NONE_REQUESTED`, `IN_PROGRESS`, `CANCELED`; each line's `shipByDate` | [getOrders](https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getorders) |
| eBay: cancellation requests | `getOrders` returns the state but an empty request list; `getOrder` returns them in full | [getOrder](https://developer.ebay.com/develop/api/sell/fulfillment_api/order/getorder) |
| eBay: answering a request | A buyer may ask up to 30 days after the order, until dispatch; 3 calendar days to answer; unanswered on a paid order closes without cancelling; an unpaid order is cancelled | [Order cancellation policy](https://www.ebay.co.uk/help/policies/member-behavior-policies/order-cancellation-policy?id=5298) |
| Amazon: order states | `PENDING_AVAILABILITY`, `PENDING`, `UNSHIPPED`, `PARTIALLY_SHIPPED`, `SHIPPED`, `CANCELLED`, `UNFULFILLABLE`; `fulfilledBy` `AMAZON` or `MERCHANT`; `salesChannel`; `REPLACEMENT_ORIGINAL_ID`; `shipByWindow` | [Orders API 2026-01-01 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json) |
| Amazon: item cancellations | A request names its requester (`BUYER`); an execution names who cancelled (`BUYER`, `MERCHANT`, `AMAZON`) | [Orders API 2026-01-01 model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json) |
| *Later:* Shopify: payment states | `PENDING`, `AUTHORIZED`, `PARTIALLY_PAID`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `VOIDED`, `EXPIRED`; an order can stay open with a voided payment | [OrderDisplayFinancialStatus](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderDisplayFinancialStatus) |
| *Later:* Shopify: fulfilment orders | `OPEN`, `IN_PROGRESS`, `SCHEDULED`, `ON_HOLD`, `INCOMPLETE`, `CLOSED`, `CANCELLED`; `fulfillBy` is the deadline | [FulfillmentOrderStatus](https://shopify.dev/docs/api/admin-graphql/latest/enums/FulfillmentOrderStatus) |
| *Later:* Shopify: line quantity | `currentQuantity` drops for a refund after shipping; `unfulfilledQuantity` is units not yet fulfilled | [LineItem](https://shopify.dev/docs/api/admin-graphql/latest/objects/LineItem) |
| *Later:* Shopify: fraud | Risk recommends `ACCEPT`, `CANCEL`, `INVESTIGATE` or `NONE` | [OrderRiskRecommendationResult](https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderRiskRecommendationResult) |

## 25. Tests that prove each rule

Pure rules (the status function, the mappings, leave-by) run as unit tests; ports, keys and transactions on real Postgres; marketplace behaviour on the simulators and the contract suite ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)).

| Test | Proves |
| --- | --- |
| Writer | Only Orders writes `sales_` tables; Channels and Fulfilment reach them only through Orders' ports |
| Key | One order per account and marketplace order id, across a month boundary |
| Which fetch wins | One test per row of 3.3; applying the same order twice changes nothing |
| Only rise | Lower cancelled or shipped-outside counts are not applied and hold the order |
| Listing fixed | A reserved line's listing never changes; the order is held |
| Shuffle | Whatever order notices and reads arrive in, dropped, repeated or reordered, the order ends in the same status and stock: 10,000 seeded runs per connector. The launch proof for order status |
| Status | One test per row of the status table; the expected-moves table as oracle; an unexpected move is written, holds and alerts |
| Mapping | One test per row of section 7; an unknown value holds only its order |
| Whole or nothing | Failing the import at each step leaves nothing written |
| Oldest first | Two orders for the last unit in one read: the older gets it |
| Watermark | A window with an unimported order moves the watermark only once that order commits or has a problem row |
| Problem row | It names every readable line's listing and quantity, scopes the whole account when one is unreadable, and holds no buyer data |
| Census | Nightly: each account's day of order ids against imported orders and problem rows |
| Picking list | An order joins only when whole and unheld; a test per blocker and hold reason |
| Holds | A held order cannot be picked, packed or shipped and keeps its reservation; each kind is cleared only by those allowed, per role |
| Cancellations | A request releases nothing; a confirmed one releases exactly what was held, per marketplace |
| Never cancels | The contract has no cancel operation; the egress gate refuses one |
| Not reserved | Marketplace-shipped lines and charge lines never reserve or reach the picking list |
| Shipped outside | Deducts once; our own echo deducts nothing; a race with a Vervoro confirm on real Postgres deducts once |
| Buyer data | None on a marketplace-shipped or anonymised order, in a problem row or an event (ADR-009's field-tag lint) |
| Manual | A draft reserves nothing; confirming twice with one key reserves once; a warehouse user cannot confirm unpaid |
| Leave-by | The last cut-off at or before ship-by, with dated exceptions |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **One writer:** only Orders' code writes `sales_` tables; Channels and Fulfilment import only its port.
- [ ] **No marketplace in the core:** Orders imports nothing from Channels or any connector; re-fetches are asked by event.
- [ ] **No SQL:** every query uses the typed query builder; no `sql` or `raw` import in the module.
- [ ] **Key first:** the import reads `sales_order_key` under the company's lock before anything else.
- [ ] **Target, not delta:** one function works out each line's target; nothing adds or subtracts reservations directly.
- [ ] **One status function,** versioned, called in every transaction that changes an order fact; no code sets a status directly.
- [ ] **Holds:** read from the append-only table; the release command checks kind against role in one place.
- [ ] **No cancel path:** no connector, port or screen sends a cancellation or an answer to a buyer.
- [ ] **Watermark:** Channels moves it only from a window whose orders all committed or have problem rows.
- [ ] **Problem rows:** no column holds an order body or buyer data.
- [ ] **Stock calls:** every reservation, release and deduction is an Inventory port call inside the import's transaction.
- [ ] **Events after commit:** Stock sync, Fulfilment and Invoicing act on Orders' events, never inside its transaction.
- [ ] **Later parts:** no Shopify order path, mirror, duplicate match or label code at launch.
