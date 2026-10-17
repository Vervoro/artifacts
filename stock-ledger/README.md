# ADR-006: Stock ledger and reservations

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026 |
| **Scope** | How Vervoro records and holds stock: the append-only ledger and its nightly proof, the four stock numbers per product, batch and spot, reserving on order (batches, packs, bundles), deducting on dispatch (including part of an order), cancellations, returns, orders that wait for a link, marketplace-shipped stock, counts and adjustments and who may make them, negative stock, concurrency and repeats, and which changes give listings a new figure |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-002: Data retention and archiving](../data-retention/), [ADR-003: Product model](../product-model/), [ADR-005: Catalogue sync and linking](../catalogue-sync/) |

## Context

Vervoro is the stock master. Every figure a linked listing shows comes from Vervoro's stock, so a wrong stock number is a wrong number on every channel at once. ADR-000 decided the shape: the foundation is the only code that changes stock, stock is an append-only ledger, every stock command takes the company's lock, and the database refuses stock below zero. ADR-003 decided what is counted: whole base units of simple products and packs, never of bundles, with best-before dates and lots where a product needs them. ADR-005 decided how listings are linked to products. This record decides how stock is recorded, held for orders and released.

The design has to meet these requirements:

- **"How many do we have?" has several right answers.** The warehouse needs what is physically there. Picking needs what is promised. Channels need what can still be sold. Using the wrong one oversells or undersells.
- **Two orders for the last unit arrive together.** This is the normal case, not an edge case. Exactly one may get it.
- **Marketplaces repeat themselves.** A notice arrives twice, an order is read again, a phone on patchy Wi-Fi sends the same tap twice. None of these may move stock twice.
- **Food expires.** Expired or nearly expired stock must never be sold, the oldest date must go first, and a recall must find every buyer of a lot.
- **Orders arrive before their listing is linked.** ADR-005 leaves unlinked listings to the marketplace, but their orders are still imported, and a link made later must reserve for them.
- **The shelf and the system disagree.** Units are lost, broken, miscounted and found. The ledger must record the truth without ever inventing stock or hiding a loss.
- **History must survive archiving.** ADR-002 moves ledger months older than 24 months out of the database, and the nightly proof must still hold.

## Decision

1. **The ledger is the record of stock.** Every change is one or more append-only entries, each with a reason, a person or process, and a source. A balance is a running total of entries and must always equal their sum.
2. **Stock is counted per product, batch and spot,** and every balance holds four numbers: **on hand, reserved, held and sellable**. Sellable is on hand less reserved less held, and only sellable ever reaches a listing. Incoming stock is shown beside them, but it is not stock.
3. **Stock never goes below zero, and is never quietly set to zero.** No number on any balance can be negative, and reserved plus held can never exceed on hand. The database refuses a change that would break this, and the command reports it. A real shortfall is recorded through a count.
4. **One reservation for every kind of demand:** an order line, an Amazon Vendor purchase order line, a shipment to a marketplace's warehouse, a transfer between warehouses. Each reservation names its batch and spot.
5. **An order reserves when it is imported,** in the same transaction, under the company's lock. The batch with the earliest sell-by date goes first. A shortage reserves what exists and records what is missing; Vervoro never cancels an order.
6. **A pack reserves its own stock; a bundle reserves its components.** The order line records the link version it reserved with and, for a bundle, the components and quantities it used.
7. **A line for an unlinked listing reserves nothing.** Making the link reserves for every waiting line of that listing, oldest first, in the link's own transaction.
8. **A line the marketplace ships reserves nothing.** A line whose fulfilment is not yet known reserves as if the seller ships it.
9. **Stock leaves only when a shipment is confirmed.** A shipment may carry part of an order. Each shipment deducts exactly the batches its lines held, once.
10. **A cancellation request is not a cancellation.** A confirmed cancellation before dispatch releases exactly what the line held. After dispatch, nothing moves until goods come back.
11. **Returns go back into the batch they left from, held, until a person inspects them:** restock, keep as damaged, or write off.
12. **Received stock is sellable as soon as the receipt is confirmed.** Put-away to a shelf is a move between spots and changes nothing a channel sees. Goods received without a purchase order need a reason and a manager.
13. **Counts and adjustments need a role and a reason.** A count compares against the moment it was counted. A count that finds fewer units than are reserved does not take them from orders until a manager confirms they are gone.
14. **One stock writer per company at a time.** The company's lock is the first statement of every stock command. The database's checks are the hard stop.
15. **Every stock command is safe to repeat.** Each carries a key, and a repeat returns the first answer without moving stock.
16. **Every night, a check proves the ledger.** Every balance equals its entries since the latest checkpoint, every reserved number equals its open reservations, and the sequence has no gaps. A difference alerts the operator and the seller, and holds raises for that product's listings.
17. **A change to sellable gives the affected listings a new figure in the same transaction.** The figure itself is ADR-008's.

## How stock moves

<!-- DIAGRAM -->

Units arrive by receiving or by a return. Received units are sellable, unless their batch is already past its sell-by date. Returned units are held until someone inspects them. An order moves sellable units to reserved. A confirmed shipment takes reserved units out of the warehouse. Held units come back to sellable only when a person or a date says so, or leave by write-off. Every arrow is a ledger entry under the company's lock.

## Where stock is counted

| Thing | What it is | Rules |
| --- | --- | --- |
| **Warehouse** | A site the seller ships from | Each channel account has a default warehouse. An order is reserved and shipped from one warehouse |
| **Spot** | A place in a warehouse: a shelf, a returns bench, a dispatch area | Every unit on hand is in exactly one spot. A spot has a kind: `goods_in`, `storage`, `returns` or `transit` |
| **Batch** | Stock of one product received together | Holds the lot number, best-before date, supplier, units per box on that delivery, and the landed cost of one unit. A batch is never split; moving part of it moves units between spots of the same batch |
| **Balance** | One row per product, batch and spot | Holds on hand, reserved, quarantined and damaged, and the ledger sequence that last changed it |

- **A batch is one receipt.** Two deliveries of the same lot are two batches, because their cost and supplier may differ. A recall searches by lot across batches.
- **A batch without a lot number** is named after the day it was received, year first, so names sort by date: `20261018-00`, then `20261018-01`.
- **A transit spot** belongs to the destination warehouse of a transfer but to no warehouse's on hand. Its units are in the ledger, so the nightly check balances, and they are shown as incoming at the destination.
- **A bundle has no balance.** A ledger entry against a bundle is refused (ADR-003).

## The ledger

Every change to stock is written as entries in `stock_ledger`, a tenant table (ADR-001) that is append-only: the runtime role cannot update, delete or truncate it. It is partitioned by month.

**One entry**

| Field | Meaning |
| --- | --- |
| `sequence`, `line` | A gapless number per company, taken under the company's lock, and the line within that change. Together they give a total order of every change |
| `occurred_at` | Database time when the change was made |
| `product_id`, `batch_id`, `spot_id` | The balance it changes |
| `kind` | The reason, from the table below |
| `on_hand`, `reserved`, `quarantined`, `damaged` | The change to each number, positive or negative. Most entries change one or two |
| `demand` | What the change was for, when it was for something: an order line, a Vendor purchase order line, a shipment to a marketplace warehouse, a transfer |
| `source` | Where the change came from: a receipt line, a shipment, a count, a return, a repack job, a person's action |
| `actor` | The person, or the named process (import, date pass, archiver) |
| `note` | The reason a person typed, required where the kind says so |
| `command_key` | The key of the command that wrote it (see "Concurrency and repeats") |

**Kinds of entry**

| Kind | What changes | Typical source |
| --- | --- | --- |
| `received` | On hand up | A purchase order receipt, or a receipt without a purchase order (a reason is required) |
| `reserved` | Reserved up | An order line, a Vendor line, a marketplace warehouse shipment, a transfer |
| `released` | Reserved down | A cancellation, a smaller quantity, a reallocation, a link closed for an unshipped line |
| `dispatched` | On hand and reserved down together | A confirmed shipment |
| `returned` | On hand and quarantined up together | A return receipt |
| `inspected` | Quarantined down (restock), or quarantined down and damaged up | Return inspection, or any quarantined units looked at |
| `quarantined` | Quarantined up | A person sets units aside for a decision |
| `marked_damaged` | Damaged up | A person finds damaged units on a shelf |
| `restored` | Damaged down | A damaged unit repaired, with a reason |
| `written_off` | On hand down, and quarantined or damaged down, or neither for an expired or blocked batch | A write-off with a reason |
| `counted` | On hand up or down | An approved count |
| `adjusted` | On hand up or down | A manager's correction with a reason |
| `transferred` | On hand down in one spot, up in another, same batch | A move between spots or warehouses |
| `transferred_out` | On hand and reserved down together | Handover of a shipment to a marketplace's own warehouse |
| `repacked` | On hand down for one product's batches, up for a new batch of another | A repack job (ADR-003) |
| `opening_balance` | Every number, to its total at the checkpoint | The archiver's checkpoint (ADR-002) |

**Bundle components** are not a kind of their own. An order for a bundle writes ordinary `reserved` and `dispatched` entries against each component's batches, and each entry's `demand` names the bundle's order line. That is how a recall of a honey lot finds the gift sets that contained it.

**What is not an entry.** Printing a label or a pick list, starting to pick, holding an order, and telling a marketplace that an order shipped move no stock and write nothing to the ledger.

## The four numbers

Every balance (product, batch and spot) has four numbers. A product's numbers in a warehouse are the sums of its balances there. A bundle has only a sellable figure, worked out from its components (ADR-003).

| Number | Definition | Who uses it |
| --- | --- | --- |
| **On hand** | Units physically in the spot, in any state. Transit spots count in no warehouse | The warehouse, counts, stock value |
| **Reserved** | Units on hand that are promised to a demand: the sum of the open reservations on this balance | Picking |
| **Held** | Units on hand that may not be sold: quarantined, plus damaged, plus every other unreserved unit of a batch that is past its sell-by date or blocked | Inspection, write-offs, recalls |
| **Sellable** | On hand − reserved − held. Never below zero | Every channel's figure, through ADR-008 |

**Incoming** is shown beside them: units on open purchase order lines not yet received, and units in transit to the warehouse. It is a promise, not stock. It is never in sellable and never sent to a listing.

**Held, exactly.** `quarantined` and `damaged` are stored on the balance and change only by ledger entries. A batch's dates and blocks are not stored as quantities; they decide whether the rest of the batch's unreserved units are held:

- held = quarantined + damaged + (if the batch is expired, short-dated or blocked: on hand − reserved − quarantined − damaged; otherwise 0)

**Quarantined** units wait for a decision: a return not yet inspected, or units a person set aside. **Damaged** units are kept, to repair or sell as seconds, but are never sellable and never reserved; they leave only by write-off, or come back by a recorded restore.

**Sell-by date.** For a product that tracks best-before, a batch with best-before date D is sellable while the days left (D minus today, in the company's time zone) are at least `min_days_to_sell`. A blank `min_days_to_sell` counts as 0, so the batch is sellable until its best-before date and **expired** from the day after. A batch with fewer days left than `min_days_to_sell`, but not yet expired, is **short-dated**: held, still on hand, to be written off, sold off by hand or returned to the supplier.

**Blocked.** A manager can block a lot, for a recall or a quality check. Every batch with that lot is held at once, in every warehouse. Unblocking returns its free units to sellable.

**The date pass.** Once a day, just after midnight in the company's time zone, and whenever a product's `min_days_to_sell` changes, a pass finds batches that crossed their sell-by date. In one locked transaction per company it moves their reservations to other batches (below), and their free units become held. Their listings get new figures.

**Worked example.** One honey product, with `min_days_to_sell` = 30, on 18 October 2026.

| Batch | Best-before | Days left | Spot | On hand | Reserved | Quarantined | Damaged | Held | Sellable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 30 Nov 2026 | 43 | Shelf 1 | 10 | 10 | 0 | 0 | 0 | 0 |
| B | 31 Mar 2027 | 164 | Shelf 2 | 30 | 2 | 0 | 1 | 1 | 27 |
| B | 31 Mar 2027 | 164 | Returns | 5 | 0 | 5 | 0 | 5 | 0 |
| C | 5 Nov 2026 | 18 | Shelf 3 | 3 | 0 | 0 | 0 | 3 | 0 |
| **Total** | | | | **48** | **12** | **5** | **1** | **9** | **27** |

- On hand 48, reserved 12, held 9 (5 returns waiting, 1 damaged, and batch C's 3 units, short-dated with 18 days left).
- Sellable: 48 − 12 − 9 = **27**. A single-jar listing is based on 27. A listing that sells six jars at a time is based on 27 ÷ 6 = 4, rounded down. ADR-008 adds buffers and the low-stock policy.
- A purchase order for 24 jars, not yet received, shows as incoming 24. Sellable stays 27.

## Reserving on order

An order line reserves when the order is imported (ADR-007), in the import's own transaction:

1. Take the company's lock (the first statement).
2. Write or update the order (ADR-007 owns the import rules).
3. Resolve each line: the link that was valid when the buyer bought gives the product, units per sale and fulfilment (ADR-003, ADR-005). Links record when they began and ended, so this is a lookup. The line stores the link version.
4. Work out what the line needs: quantity × units per sale of the product, or of each component for a bundle.
5. Choose batches and spots for it, write `reserved` entries and reservation rows, and update balances.
6. Record any shortage on the line.
7. Write new desired figures for every affected listing, with the ledger sequence (ADR-000).
8. Write the outbox event and commit.

**Which units a line takes.** Only sellable units, in the order's warehouse, in goods-in and storage spots:

- **Earliest sell-by date first.** Batches sorted by best-before date, then by received date. Expired, short-dated and blocked batches are skipped. Batches with no best-before date (a product that does not track it, or stock from before the switch was turned on, ADR-003) come after dated ones, by received date.
- **Within a batch,** the spot with the fewest free units first, so part-used spots empty out.
- **A manager can choose another batch** for a line. The change is a `released` and a `reserved` entry with the manager's name and reason. It must still be sellable.

**A shortage reserves what exists.** A line that needs 12 with 7 sellable reserves 7 and records 5 missing. The order shows as short and cannot be shipped in full. Vervoro never cancels it; that is the seller's choice, because marketplaces count seller cancellations against the seller. When units arrive (a receipt, a restock, a found count), short lines in that warehouse are filled in the same transaction, oldest order first.

**Quantity changes.** A smaller quantity releases the difference, latest sell-by date first, so what stays reserved still follows the earliest-first rule. A larger one tries to reserve more by the same rules.

**Changing an order's warehouse** before picking releases every reservation in the old warehouse and reserves in the new one, in one transaction. It may leave the order short.

**A batch that crosses its sell-by date or is blocked** while reserved: the date pass, or the block, moves each of its reservations to the next sellable batch by the same rules. A line with nowhere to move becomes short. The pick list always shows the current batches, and packing refuses a scanned unit from an expired, short-dated or blocked batch.

**Worked example.** Honey batches A (best-before 30 Nov 2026, 10 sellable), B (31 Mar 2027, 30 sellable) and C (5 Nov 2026, short-dated). An order for 12 arrives.

- C is skipped. A gives 10, B gives 2.
- The line holds two reservations: A × 10 and B × 2. The pick list names both lots.
- A second order for 40 arrives. B gives its remaining 28. The line records 12 missing.
- A receipt of 24 jars in batch D arrives the next day. In the receipt's transaction, the second order's line takes 12 from D. Sellable becomes 12.

## Packs and bundles

**A pack reserves its own stock.** A listing linked to a six-pack product reserves six-packs, never singles (ADR-003). With one six-pack sellable and an order for two, the line reserves one and is short by one. Vervoro shows that 6 singles could make the missing pack and offers a repack job; it never repacks on its own, because opening or making packs is physical work.

**A listing with several units per sale** reserves that many units of its product. A listing that sells six loose jars per sale, ordered twice, reserves 12 jars.

**A bundle reserves its components,** each by the rules above, in the same transaction. The line records, for each component, the product and the quantity per bundle that it used.

**Worked example.** Gift set G is 1 × honey + 2 × jam. Honey batch A has 10 sellable. Jam batch J1 (best-before 31 Dec 2026) has 4, J2 (28 Feb 2027) has 20. A listing linked to G with 1 unit per sale gets an order for 3.

- The line needs 3 honey and 6 jam.
- Honey: A × 3. Jam: J1 × 4 and J2 × 2.
- The line records link version 1 of the gift-set listing, and components honey × 1 and jam × 2 per set.
- G's sellable was min(10 ÷ 1, 24 ÷ 2) = 10. It is now min(7 ÷ 1, 18 ÷ 2) = 7.
- Next week the seller changes G to 1 honey + 1 jam + 1 tea. Orders received afterwards use the new list. This order keeps honey × 3 and jam × 6, and ships what it reserved.

## What the order line records

| Field | Meaning |
| --- | --- |
| `link_id` | The link version the line was resolved with (ADR-005). Empty for an unlinked line |
| `product_id`, `units_per_sale`, `fulfilled_by` | Copied from that link version, so a later link change never changes what the line needs |
| `components` | For a bundle: each component's product and quantity per bundle, copied when the line was resolved |
| `needed`, `missing` | Units needed per product, and units not yet reserved |

**Reservation rows** (`stock_reservation`) hold the detail: demand, product, batch, spot, quantity reserved, quantity dispatched, and when the reservation was closed. A balance's reserved number is the sum of its open reservation rows, and the nightly check proves it.

**A line's reservation never changes because a link changed.** That is ADR-005's rule. There are three ways a line's reservation does change, each recorded: a person resolves the line again, a manager chooses another batch, or a date pass or block moves it.

**Resolving a line again.** When a line was reserved under a wrong link (wrong product, wrong units per sale), a manager can resolve it again against the listing's current link. In one transaction, it releases what the line held and reserves under the new link. A line with any units dispatched cannot be resolved again.

## Orders that wait for a link

A line for an unlinked listing is imported, flagged, and reserves nothing (ADR-003, ADR-005). It waits.

**A waiting line** is a line with no link, on an order that is open, not cancelled and seller-shipped (or of unknown fulfilment).

**Making a link reserves for every waiting line of that listing** in the link's own transaction: oldest order first, by the rules above, each line recording the new link version. ADR-005's link screen says what will happen before the person confirms: "Linking reserves stock for 3 waiting orders." If stock runs out, the remaining lines are short, and the screen says so too. A bulk link (ADR-005, written in chunks of 500 links per transaction) reserves for each chunk's waiting lines in that chunk's transaction.

**A line bought before the link began but imported after it** is a waiting line too. It reserves at import, under the listing's current link, by the same rules.

**Other changes to links:**

- **A link closed** with no new one (the listing is unlinked) leaves open lines as they are. They were reserved under the link that was valid when the buyer bought, and dispatch deducts that product (ADR-005). A person who wants the units back cancels the order, or resolves the line again, which with no current link releases it and leaves it waiting.
- **A new link version** applies to orders received afterwards, and to lines still waiting (ADR-005). Lines already reserved keep theirs.
- **A waiting line already shipped outside Vervoro** (the marketplace says it shipped before anyone linked the listing) reserves nothing when the link is made, because the units are gone. It stays flagged (ADR-007). A person who attaches it to a product deducts the units at once, as a `dispatched` entry whose source is "attached after shipping", earliest sell-by first. A person who leaves it unattached says the units did not come from Vervoro's stock.
- **A seller-shipped line on a listing linked as marketplace-shipped** reserves units per sale of the product, and opens a conflict (ADR-005, ADR-007).

**Worked example.** An unlinked listing gets three orders: O1 for 2 at 09:00, O2 for 1 at 09:30 (cancelled at 10:00), and O3 for 4 at 10:15. At 11:00 a manager links the listing to honey at 1 unit per sale. Honey has 5 sellable.

- The link screen shows: "Linking reserves stock for 2 waiting orders. 1 will be short by 1."
- In the link's transaction: O1 reserves 2. O3 reserves 3 and records 1 missing. O2 is cancelled, so it reserves nothing.
- Every listing of honey gets a new figure in the same transaction, based on 0 sellable.

## Stock the marketplace ships

When the marketplace ships from its own warehouse (Amazon FBA and similar), Vervoro holds none of the units.

- **A marketplace-shipped line reserves nothing.** The order is recorded for reports (ADR-003, ADR-007).
- **A line whose fulfilment is not yet known reserves** as if the seller ships it, the safer default. When the marketplace confirms it ships the order itself, the reservation is released. Holding a unit for a parcel the marketplace ships wastes it for a while; not holding one for a parcel the seller must ship risks overselling.
- **Sending stock to the marketplace's warehouse is a transfer, not a sale.** The shipment's lines reserve when it is ready to pack, by the same rules as an order line, including earliest sell-by first. Handover deducts them as `transferred_out`, once per shipment. No order is ever created for it, because an order in the list invites a second deduction later.
- **Stock in the marketplace's warehouse is not in the ledger.** Once handed over, it is the marketplace's to count. The figure the marketplace reports for it is stored as a dated reading per product, shown beside the four numbers, never added to on hand or sellable.
- **A removal shipped back** from the marketplace's warehouse arrives as a receipt with its reason, into a new batch or the batch the label names.

## Other demands

The same reservation serves every demand, so no copy drifts.

| Demand | Reserves | Deducts | Decided in |
| --- | --- | --- | --- |
| Marketplace or website order line | On import, or when its listing is linked | On a confirmed shipment | This record, ADR-007 |
| Manual or business order line | When the order is confirmed | On a confirmed shipment | ADR-007 |
| Amazon Vendor purchase order line | When the seller confirms the line | When the shipment is confirmed | ADR-004.4 |
| Shipment to a marketplace's warehouse | When it is ready to pack | At handover | This record |
| Transfer between warehouses | When it is sent, the units move to the destination's transit spot | Received, or written off as lost in transit | This record |

**A count may free part of a marketplace shipment.** When a count finds fewer units than a batch holds, and the shortfall reaches reserved units, a reservation for a shipment to a marketplace warehouse that is not yet handed over gives way first, latest shipment first. The shipment shows what it lacks and cannot be handed over until it is reserved again or reduced. An order's reservation is never freed this way (see "Counts and adjustments").

## Deducting on dispatch

**Stock leaves when a shipment is confirmed,** and only then. A shipment names an order, the lines and the quantities in the parcel, the carrier and tracking. Confirming it, in one locked transaction:

- writes a `dispatched` entry for each reservation it uses, taking on hand and reserved down together,
- marks those quantities dispatched on the reservation rows, and records each line's lots and best-before dates,
- writes the order's new status and the outbox event for the dispatch notice to the marketplace (ADR-000's egress gate).

Sellable does not change on dispatch, because on hand and reserved fall by the same amount. Listings get no new figure from it.

**Part of an order.** A shipment may carry part of a line or some lines only. Within a line, it uses the reservations with the earliest sell-by dates first, unless the packer scanned other batches the line holds. What is not shipped stays reserved. A line can never ship more than it has reserved; a short line ships what it holds, or waits.

**Recorded once.** Each shipment has its own id, and confirming it again returns the first answer. Retries, a second tap and tracking updates never deduct twice.

**Shipped outside Vervoro.** A marketplace may report an order as shipped when nobody confirmed a shipment in Vervoro, for example after the seller bought a label in the marketplace's own tools. Vervoro then deducts what the lines held, as a `dispatched` entry whose source is "marketplace said shipped". The seller sees these in the daily digest. If the parcel did not come from the warehouse, a manager reverses it with an `adjusted` entry and a reason. Deducting is the safe direction: a wrong deduction shows too little, and a count finds it; a wrong release would offer units that left.

**Worked example.** A line for 5 jars holds A × 3 (30 Nov 2026) and B × 2 (31 Mar 2027). The packer has only 3 jars ready and confirms a shipment of 3.

- `dispatched`: A on hand −3, reserved −3. The line's lot record shows batch A × 3.
- B × 2 stays reserved. The order is part shipped.
- The second shipment of 2 deducts B. The order is shipped.
- A repeat of the first confirmation, with the same shipment id, changes nothing and returns "already confirmed".

## Cancellations

**Before dispatch:**

- **A request is not a cancellation.** A buyer's request keeps the reservation until the marketplace confirms the cancellation. A refused request must not leave an order without stock.
- **A confirmed cancellation releases exactly what each line held,** batch by batch, in one transaction. Listings get new figures at once.
- **Part of an order:** a line cancelled, or a smaller quantity, releases that part only, latest sell-by date first.
- **Already picked:** the units are on a trolley but still on hand in their spot, because picking moves nothing. The release returns them to sellable, and the warehouse is told to put them back.
- **A held order** keeps its reservation; a confirmed cancellation still cancels it (ADR-007).

**After dispatch:** the units have left. A cancellation moves no stock. If the parcel comes back, it is a return.

**Part shipped:** the cancellation releases what is still reserved, and the shipped part follows the after-dispatch rule.

## Returns

**A return comes back into the batch it left from.** The returned line names the order line. The units go into one of the batches that line dispatched, in the warehouse's returns spot, as `returned`: on hand and quarantined up together. They are held, never sellable, until inspected.

- **Which batch.** If the product tracks lots, the person scans or picks the lot from those the line received. Otherwise the earliest best-before batch the line received comes first, so a returned unit is never given a later date than it might have.
- **At most what was dispatched.** A line can return at most what it dispatched, less what earlier returns received.
- **A bundle returns by component.** Each component comes back into its own batch.
- **A unit with no dispatch record** (sent before the seller used Vervoro, or from an archived month) is received into a new batch with a reason; a dated product asks for its best-before date.
- **A refund never restocks, and a restock never refunds.** Refunds are done in the channel's own tools.

**Inspection decides, per unit:**

| Decision | Entry | Effect |
| --- | --- | --- |
| Restock | `inspected` (quarantined down), then `transferred` to a storage spot | Sellable again, unless the batch is expired, short-dated or blocked |
| Keep as damaged | `inspected` (quarantined down, damaged up) | Still on hand, never sellable |
| Write off | `written_off` (on hand and quarantined down), with a reason | Gone |

**Worked example.** An order received 4 jars: A × 3 and B × 1. The buyer sends 3 back.

- Receipt: A × 3 into the returns spot. On hand +3, quarantined +3. Sellable unchanged.
- Inspection: 1 restocked (quarantined −1, moved to Shelf 1: sellable +1), 1 kept as damaged (quarantined −1, damaged +1), 1 written off with "broken seal" (on hand −1, quarantined −1).
- Net: on hand +2, sellable +1, damaged +1. Listings get a new figure once, from the restock.

## Receiving and put-away

Purchase orders themselves (suppliers, drafting, approving, sending, reorder suggestions, sharing landed cost) are a later purchasing record. This section covers only what a receipt does to stock.

**Goods in against a purchase order.** A warehouse user opens the delivery's purchase order on a phone and counts each line in, by scanning or typing. Confirming a receipt line, in one locked transaction:

- creates a batch for that line: lot, best-before, supplier, units per box on this delivery, and a provisional landed cost per unit,
- writes `received` into a goods-in spot of the warehouse: on hand up, and sellable up unless the batch is already past its sell-by date,
- fills short order lines in that warehouse, oldest order first,
- writes new figures for the product's listings, and the outbox event,
- adds the quantity to the purchase order line's received total.

**Checks on each line:**

- A product that tracks best-before or lots refuses a receipt without them (ADR-003).
- A receipt with fewer days left than `min_days_on_receipt` waits, outside the ledger, until a manager accepts it or refuses it.
- Scanning a box barcode adds the box's units (ADR-003). The ledger only ever holds base units.
- Warehouse users see lines and quantities, never costs.

**Deliveries in parts, and the wrong amount.** A purchase order line can be received over several deliveries; each receipt is its own batch. Fewer units than ordered leave the rest open as incoming until a manager closes the line. More than ordered are received as counted, and the line shows the surplus for a manager to accept or return. What arrived is what the ledger records; the purchase order only says what was expected.

**Received is sellable. Put-away is a move.** Stock is sellable from the moment the receipt is confirmed, in the goods-in spot, and can be picked from there. Moving it to a shelf is an ordinary `transferred` entry between two spots of the same warehouse. Sellable does not change, so listings get no new figure. Nobody has to confirm put-away before stock goes on sale: the goods are in the building and countable, and holding them back would leave listings showing too little and short orders waiting for nothing. A goods-in spot that still holds stock a day later is listed for the warehouse to put away.

**Cost is not stock.** The landed cost on a batch stays provisional until the supplier's document, freight and duty have arrived. Changing it never touches quantities or the ledger.

**Incoming** (see "The four numbers") is what is still open on purchase order lines, less what has been received.

**Repeats.** Each receipt line has its own key. A second tap, or a phone retrying on patchy Wi-Fi, returns the first answer and receives nothing more.

**Goods without a purchase order.** Gifts, samples, a supplier's extra case, stock found during a move to Vervoro: they happen, and they must be explainable.

- **A manager receives them directly,** with a reason from a short list (supplier extra, sample, opening stock, found, other with a note). The receipt is the same as above, without a purchase order line: a batch, a `received` entry into a goods-in spot, sellable at once.
- **A warehouse user can record one,** but it waits, outside the ledger and not sellable, until a manager accepts it. A mistyped quantity on an unplanned receipt would otherwise go straight to every channel.
- **Cost may be blank.** The batch then has no landed cost until a manager adds one; reports use the product's standard cost meanwhile and say so.
- **Every such receipt is in the activity view and a reconciliation report.** If the purchase order turns up later, a manager attaches the receipt to its line, which counts it as received there. Stock does not move again.

**Worked example.** A purchase order asks for 48 jars of honey. A Monday delivery brings 36 (3 boxes of 12) with best-before 30 Apr 2027; an open order is short by 4.

- The user scans the box barcode three times: 36 jars into batch E, in the goods-in spot. On hand +36. The short order takes 4. Sellable +32, and listings get new figures.
- The purchase order line shows 36 of 48 received; incoming is 12.
- In the afternoon the boxes go to Shelf 4: one `transferred` entry, 36 out of goods-in and 36 into Shelf 4. No new figure.
- Thursday brings the last 12 with a different best-before: batch F. The line is complete; incoming is 0.
- The same week, the supplier sends a free case of 12 jam with no purchase order. A warehouse user records it; it waits. A manager accepts it as "supplier extra": batch J3, sellable 12, cost blank.

## Counts and adjustments

**Counts.** A count is planned for spots or products. A person counts, a manager approves.

- **Counted against the moment of counting.** The expected figure is on hand when the spot was counted. A sale or a receipt between counting and approval does not read as a difference.
- **Blind if the manager chooses.** The counter is not shown the expected figure.
- **Approved all or none.** Approval writes one `counted` entry per difference in one transaction. Approving again returns the first answer. A count holds at most 2,000 lines, so its approval keeps the lock briefly; a larger area is counted as several counts.
- **A count that finds more** adds the surplus to the counted batch, or to the spot's latest batch when the count did not name one.
- **A count that finds fewer** takes the shortfall from units that are not reserved, quarantined or damaged first, then from quarantined and damaged units, then from reservations for marketplace warehouse shipments not yet handed over.
- **Never from an order's reservation without a manager.** Picking moves nothing in the ledger, so a unit on a trolley still counts as on hand in its spot. A count cannot tell a picked unit from a lost one. A shortfall that reaches an order's reserved units waits: either the spot is counted again after its open orders are shipped, or a manager confirms the units are gone. Confirming moves those reservations to other batches by the usual rules (or leaves the lines short), then writes the `counted` entry.

**Adjustments.** A manager can correct on hand directly with `adjusted` and a typed reason, for one balance. The same limits apply: an adjustment never takes on hand below reserved plus held, and never takes units from an order's reservation.

**Worked example.** Shelf 2 holds batch B: on hand 12, reserved 5 for open orders, so 7 free.

- A counter finds 9. The shortfall of 3 comes from free units. On hand 9, reserved 5, sellable 4.
- Another day, a counter finds 3. The shortfall is 9: 7 from free units, and 2 that would reach reserved units. The 7 are approved. The 2 wait with "count again after dispatch". A manager confirms the 2 are gone. Those 2 reserved units move to batch D, which has free stock, and the count writes −2. On hand 3, reserved 3, sellable 0.

**Who may do what.** Roles are the seller's roles.

| Action | Warehouse | Manager | Admin, Owner |
| --- | --- | --- | --- |
| Receive, move between spots, repack | Yes | Yes | Yes |
| Count | Yes | Yes | Yes |
| Approve a count, confirm reserved units are gone | No | Yes | Yes |
| Adjust, write off (reason required) | No | Yes | Yes |
| Record a receipt without a purchase order (waits for a manager) | Yes | Yes | Yes |
| Accept a short-dated receipt, receive or accept one without a purchase order | No | Yes | Yes |
| Inspect a return: restock or keep as damaged | Yes | Yes | Yes |
| Inspect a return: write off | No | Yes | Yes |
| Mark units damaged or quarantined | Yes | Yes | Yes |
| Restore damaged units | No | Yes | Yes |
| Block or unblock a lot | No | Yes | Yes |
| Choose another batch for a line, resolve a line again | No | Yes | Yes |
| Confirm a shipment | Yes | Yes | Yes |
| Reverse a shipment reported outside Vervoro | No | Yes | Yes |

A person limited to some warehouses can act only on their stock. The operator never writes a seller's ledger; a repair after the nightly check only rebuilds a balance from it.

## Negative stock

**Never.** Every balance holds these checks in the database:

- `on_hand >= 0`, `reserved >= 0`, `quarantined >= 0`, `damaged >= 0`
- `reserved + quarantined + damaged <= on_hand`

A command plans its change, and the checks are the last line if the plan is ever wrong: the transaction fails, nothing is written, and the command returns a typed refusal ("would go negative") that names the product, batch and spot. Nothing is clamped to zero.

When the shelf has fewer units than the system, the way to say so is a count, which records the loss with a reason and moves reservations first. A seller who sells something Vervoro does not know they have receives it first. Allowing a negative balance would let one channel sell stock that does not exist and hide the real problem until a later count.

## Concurrency and repeats

**One writer per company.** The first statement of every stock command takes the company's lock, held until commit (ADR-000). Batch choice reads and then writes, so two commands must not plan at the same time. With one lock per company:

- two orders for the last unit run one after the other, and exactly one gets it,
- a bundle that reserves several products needs no lock order, so no deadlock is possible,
- other companies never wait.

The transaction is short: about eight round trips next to the database for an order, counted by a test. Each stock command reads and writes only what it touches, in statements that work on whole sets of rows, so a 2,000-line count approval or a 500-link chunk holds the lock for a few round trips, not one per row. No marketplace call ever runs inside a stock transaction. Other modules change stock only through the foundation's command ports, so their writes take the same lock.

**Every command is safe to repeat.** Each command carries a key:

| Command | Key |
| --- | --- |
| Import an order | The marketplace's order id on that account; a state no newer than the stored one changes nothing (ADR-007) |
| Confirm a shipment | The shipment id |
| Receive | The receipt line id |
| Approve a count | The count id |
| Receive or inspect a return | The return line and the receipt or inspection id |
| Hand over a marketplace warehouse shipment | The shipment reference |
| Any person's action (adjust, move, write off) | A key the client makes for the tap, kept across retries |

A `stock_command` table holds each key with its answer and the ledger sequence it wrote, with a unique index on company and key. A repeat finds the key under the lock and returns the stored answer. A phone that lost its reply on patchy Wi-Fi can send the same tap again.

**The ledger sequence** is taken from the company's counter row inside the locked transaction, so it is gapless and in commit order. It is the order of every change, and each desired figure records the sequence it was computed from, so a figure from an older sequence never replaces a newer one (ADR-000).

## The nightly check and checkpoints

Every night the sweeper (ADR-001) runs the check for each company, outside the company's lock, on a consistent snapshot:

1. **Balances equal entries.** For every balance, each of the four stored numbers equals the latest checkpoint plus the sum of the entries after it.
2. **Reserved equals reservations.** Every balance's reserved number equals the sum of its open reservation rows.
3. **The sequence has no gaps** since the last check.

**A difference** alerts the operator and the company's managers, and holds raises on every listing of the affected products (decreases still go). The ledger is the truth: the operator finds the cause, rebuilds the balance from the ledger, records the repair in the activity view, and the hold clears.

**Checkpoints** (ADR-002). Before a ledger month leaves the database, the archiver writes, under the company's lock, one `opening_balance` entry per balance that had entries up to then. It carries each stored number's total and the last sequence it covers. The check sums from it. Reservation rows that are still open are current state and never archived.

**Worked example.** May 2024 is archived. By the end of May, batch B in Shelf 2 had entries summing to on hand 40, reserved 3, quarantined 0, damaged 0, up to sequence 18,204. The archiver writes one `opening_balance` entry: +40 on hand, +3 reserved, covering up to 18,204. From then on, the check adds every entry after 18,204 to it.

## What gives listings a new figure

The foundation writes the desired figure of each linked listing in the same transaction as the change (ADR-000). A listing is affected when its product's sellable changes, or a component's sellable when its product is a bundle. How the figure is worked out and sent is ADR-008.

| Change | Sellable changes? | New figure |
| --- | --- | --- |
| Receipt into sellable stock | Up | Yes |
| Receipt waiting for a manager (short-dated) | No | No |
| Reserve, release, cancellation, short line filled | Down or up | Yes |
| Shipment confirmed, handover to a marketplace warehouse | No: on hand and reserved fall together | No |
| Return received | No: held | No |
| Return restocked | Up | Yes |
| Count or adjustment of free units | Down or up | Yes |
| Units marked damaged or quarantined, or restored | Down or up | Yes |
| Batch crosses its sell-by date, lot blocked or unblocked | Down or up | Yes |
| Move between spots of one warehouse | No | No |
| Transfer sent to, or received from, another warehouse | Down at the source, up at the destination | Yes |
| Repack | Down for one product, up for the other | Yes |
| Link made, closed or changed (ADR-005) | Only for that listing, and for waiting lines it reserves | Yes. A closed link sends its listing 0 unless the seller chose to leave the marketplace's figure (ADR-005) |
| A bundle's components changed | The bundle's sellable | Yes |
| `min_days_to_sell` changed | Possibly | Yes, by the date pass |

## Storage

All tables belong to the foundation and are tenant tables (ADR-001): `company_id` on every row and leading every key, under row-level security.

| Table | Holds | Rules |
| --- | --- | --- |
| `warehouse`, `stock_spot` | Warehouses, and spots with their kind | A transit spot is made by the system, never by a person |
| `stock_batch` | Product, name, lot, best-before, received at, supplier, units per box, landed unit cost and currency, blocked | One product per batch. Best-before and lot required when the product says so |
| `stock_balance` | Per product, batch and spot: on hand, reserved, quarantined, damaged, last sequence | The checks under "Negative stock" |
| `stock_ledger` | Every entry | Append-only; partitioned by month |
| `stock_reservation` | Demand, product, batch, spot, reserved, dispatched, closed at | Reserved and dispatched never negative; dispatched never above reserved |
| `stock_command` | Command key, kind, answer, sequence | Unique per company and key |
| `marketplace_stock_reading` | Product, account, the marketplace's figure for its own warehouse, read at | Never in the ledger |

The order line's link and component fields are on the order line table (ADR-007).

**Rules, each with a test:**

| Rule | Where it is enforced |
| --- | --- |
| No number on a balance is negative; reserved plus held never exceeds on hand | Check constraints on `stock_balance` |
| The ledger is never updated or deleted by the running system | Runtime role has no update, delete or truncate (ADR-001) |
| Every balance equals its entries; reserved equals open reservations | The nightly check, and the same check after every test |
| Two orders for the last unit reserve it exactly once | Concurrency test on real Postgres |
| The same command twice moves stock once | Unique key in `stock_command`, and a test per command |
| No entry against a bundle; none without a required date or lot | The command, before the write |
| Expired, short-dated, blocked and damaged units are never reserved | The batch choice, and a test per case |
| A shipment deducts only what its lines held | The command; a test with part shipments |
| A link change never changes an open line's reservation | The command; ADR-005's test |
| A count never takes an order's reserved units without a manager | The command; a test |
| A stock command's first statement takes the company's lock | A test that inspects every command |

## Consequences

**What this gives us**

- One record explains every unit: where it came from, where it went, who moved it and why. A recall is one search by lot, bundles included.
- Channels only ever see sellable stock, and the database makes it impossible to promise a unit twice or to count one that is not there.
- Repeated notices, repeated reads and repeated taps are harmless.
- Orders that arrive before their listing is linked are not lost: the link reserves for them, and says so first.
- Expired and nearly expired stock leaves sale on its own, and the oldest good date always goes first.
- A shortfall is always visible, either as a short order line or as a counted loss, never as a quiet zero.
- The nightly check catches drift within a day, and archiving does not break it.

**What it costs**

- Every stock change holds the company's lock, so one company's stock writes are serial. Transactions must stay short, and large counts are split.
- A picked unit is still on hand in its spot, so a count of a spot with open orders may have to wait for dispatch or a manager.
- A seller who ships an order from outside the warehouse, but outside Vervoro, must reverse the deduction by hand.
- Reservation rows, reasons and keys for every command are more tables and more writes than one stock number per product.
- The date pass and lot blocks move reservations between batches, so a pick list can change after it was printed; packing checks every scan.
- Stock held by a marketplace is a reading, not a ledger, so Vervoro cannot prove it the way it proves its own.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A stock counter per product, without a ledger | A counter cannot explain itself; drift is found at year end, not the next morning |
| Incoming as one of the four numbers | A purchase order is a promise; once it sits next to stock, someone sends it to a channel |
| Allow negative stock and fix it later | One channel sells stock that does not exist, and the real loss hides until a count |
| Clamp to zero when a change would go negative | Hides a real problem; the change is refused and flagged instead |
| Reserve at payment, picking or label time instead of import | The gap between order and reservation is exactly when another channel oversells |
| Reserve without naming a batch | Pick lists cannot name lots, a cancellation cannot release what it held, and recalls cannot find buyers |
| Reserve a pack's contents (singles) for a pack order | A sealed pack on the shelf is counted on its own; mixing them double-counts (ADR-003) |
| Record a bundle's own stock movements | A bundle is not on the shelf; its components are |
| A lock per product, or per group of products | A bundle spans products, so commands would need ordered locks and deadlock handling; one company's writes are a small load. Kept for later if lock wait is measured to be a problem |
| Optimistic retries at the strictest isolation level | Retries through a transaction pooler are hard to reason about; one lock is simpler and proved by test |
| Count shortfalls taken from reservations at once | A unit on a trolley would be written off on its way to a buyer |
| Release a line's reservation when its listing is unlinked or relinked | Units promised to a buyer would be offered again; open lines keep what they reserved (ADR-005) |
| Release reservations when a marketplace says "shipped" and Vervoro has no shipment | If the parcel left the warehouse, those units would be offered again and oversold |
| A separate reservation scheme for marketplace warehouse shipments and Vendor orders | Two copies drift and strand stock; one reservation serves every demand |
| An order for each shipment to a marketplace's warehouse | An order in the list invites a second deduction later |
| Return units into a new batch | Loses the best-before date and the lot; refilling the batch they left keeps both |
| Repair a balance by writing it directly | The ledger is the truth; a balance is rebuilt from it and the repair is recorded |

## What later records decide

- **ADR-007: Order ingestion** (planned): importing an order once per marketplace order, its statuses and holds, cancellation requests, manual and business orders, fulfilment that becomes known later, and the conflict for a seller-shipped line on a marketplace-shipped link.
- **ADR-008: Inventory sync** (planned): the figure each linked listing gets from sellable, buffers and the low-stock policy, which warehouses serve which account, held raises, and how each new figure is sent.
- **Purchasing** (a later record): suppliers and their codes, drafting, approving and sending purchase orders, reorder suggestions, and sharing landed cost across batches.
- **ADR-004.4: Amazon Vendor connector** (planned): when a Vendor purchase order line is confirmed and so reserves, and when its shipment deducts.
