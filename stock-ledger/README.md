# ADR-006: Stock ledger and reservations

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026, revised 18 October 2026 |
| **Scope** | How Vervoro records and holds stock: the append-only ledger and its nightly proof, the four stock numbers per product, batch and spot, reserving on order (batches, shelf life, packs, bundles), packing and deducting on dispatch (one shipment per order), cancellations, returns, orders that wait for a link, marketplace-shipped stock, receiving, counts while picking goes on, adjustments and who may make them, use-by and best-before, recalls, negative stock, concurrency and repeats, and which changes give listings a new figure |
| **Revision** | 18 October 2026, after a design review: a reservation names its batch, not its spot; packing records the batch that left and moves it to a packing spot; counts allow for units on orders being picked, and a counted shortfall leaves sale at once; receipts waiting for a manager enter the ledger quarantined; only the ledger insert changes a balance; each demand states the shelf life it needs; use-by dates; bundles reserve whole sets; short lines refill by ship-by time; more nightly checks |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-002: Data retention and archiving](../data-retention/), [ADR-003: Product model](../product-model/), [ADR-005: Catalogue sync and linking](../catalogue-sync/) |

## Context

Vervoro is the stock master. Every figure a linked listing shows comes from Vervoro's stock, so a wrong stock number is a wrong number on every channel at once. ADR-000 decided the shape: the foundation is the only code that changes stock, stock is an append-only ledger, every stock command takes the company's lock, and the database refuses stock below zero. ADR-003 decided what is counted: whole base units of simple products and packs, never of bundles, with best-before dates and lots where a product needs them. ADR-005 decided how listings are linked to products. This record decides how stock is recorded, held for orders and released.

The design has to meet these requirements:

- **"How many do we have?" has several right answers.** The warehouse needs what is physically there. Picking needs what is promised. Channels need what can still be sold. Using the wrong one oversells or undersells.
- **Two orders for the last unit arrive together.** This is the normal case, not an edge case. Exactly one may get it.
- **Marketplaces repeat themselves.** A notice arrives twice, an order is read again, a phone on patchy Wi-Fi sends the same tap twice. None of these may move stock twice.
- **Food expires.** Food past its use-by date may not be sold at all; food past its best-before date must not be sold as normal stock. The oldest good date should go first, and a recall must find every order of a lot.
- **The lot recorded must be the lot that left.** A product barcode names the product, not the batch, and staff may type instead of scanning. A recall that trusts the plan instead of the parcel misses buyers.
- **Counts happen while picking goes on.** A small warehouse counts a shelf between orders. A jar in a picker's tote is not lost, and must not be written off as lost.
- **Orders arrive before their listing is linked.** ADR-005 leaves unlinked listings to the marketplace, but their orders are still imported, and a link made later must reserve for them.
- **The shelf and the system disagree.** Units are lost, broken, miscounted, misplaced and found. The ledger must record the truth without ever inventing stock or hiding a loss.
- **History must survive archiving.** ADR-002 moves ledger months older than 24 months out of the database, and the nightly proof must still hold.

**Rules outside Vervoro that bind this record:**

| Rule | What it requires | Source |
| --- | --- | --- |
| Use-by and best-before (UK) | Selling food past its use-by date is an offence. Food past its best-before date may be sold if it is still of good quality | [Business Companion: date and lot marking of prepacked food](https://www.businesscompanion.info/en/quick-guides/food-and-drink/date-and-lot-marking-of-prepacked-food) |
| Lot marking (UK) | Most prepacked food carries a lot mark; a date with at least the day and month can serve as one | Food (Lot Marking) Regulations 1996, same page |
| Traceability | A food business can name who supplied it and the businesses it supplied, on demand | [Retained Regulation 178/2002, Article 18](https://www.legislation.gov.uk/eur/2002/178/article/18) |
| Amazon's warehouses | Food sent to Amazon must be lot-controlled and have more than 90 days of shelf life left when Amazon checks it in | [Amazon: Expiration dates on FBA products](https://sellercentral.amazon.com/gp/help/external/201003420) |

## Decision

1. **The ledger is the record of stock.** Every change is one or more append-only entries, each with a reason, a person or process, and a source. **Only the ledger insert changes a balance or a reservation:** the database applies each entry, and nothing else can write them.
2. **Stock is counted per product, batch and spot,** and every balance holds four numbers: **on hand, reserved, held and sellable**. Reserved is kept per batch in each warehouse, not per spot. Sellable is on hand less reserved less held, and only sellable ever reaches a listing. Incoming stock is shown beside them, but it is not stock.
3. **Stock never goes below zero, and is never quietly set to zero.** No number on any balance can be negative, and reserved plus held can never exceed on hand. The database refuses a change that would break this, and the command reports it. A real shortfall is recorded through a count.
4. **One reservation for every kind of demand:** an order line, an Amazon Vendor purchase order line, a shipment to a marketplace's warehouse, a transfer between warehouses. Each reservation names its batch and warehouse, never a spot. Each kind of demand states the shelf life it needs.
5. **An order reserves when it is imported,** in the same transaction, under the company's lock. The batch with the earliest sell-by date that meets the demand's need goes first. A shortage reserves what exists and records what is missing; Vervoro never cancels an order. Short lines are filled by ship-by time.
6. **A pack reserves its own stock; a bundle reserves its components in whole sets.** The order line records the link version it reserved with and, for a bundle, the components and quantities it used.
7. **A line for an unlinked listing reserves nothing.** Making the link reserves for every waiting line of that listing, oldest first, in the link's own transaction.
8. **A line the marketplace ships reserves nothing.** A line whose fulfilment is not yet known reserves as if the seller ships it.
9. **Packing records the batch that left; stock leaves only when a shipment is confirmed.** Packing names the batch of every unit and moves it, still reserved, to the warehouse's packing spot. A shipment carries the whole order, possibly in several boxes, and deducts exactly what was packed for it, once.
10. **A cancellation request is not a cancellation.** A confirmed cancellation before dispatch releases exactly what the line held. After dispatch, nothing moves until goods come back.
11. **Returns go back into the batch they left from, held, until a person inspects them:** restock, keep as damaged, or write off.
12. **Received stock is sellable as soon as the receipt is confirmed.** Put-away to a shelf is a move between spots and changes nothing a channel sees. A receipt that needs a manager (no purchase order, or short-dated) enters the ledger at once, quarantined, until a manager accepts or refuses it.
13. **Counts and adjustments need a role and a reason.** A count compares against the ledger at the moment the figure was saved, and allows for units on orders being picked from that spot. A shortfall beyond that leaves sale at once and is written off when a manager approves.
14. **One stock writer per company at a time.** The company's lock is the first statement of every stock command. The database's checks are the hard stop.
15. **Every stock command is safe to repeat.** Each carries a key, and a repeat returns the first answer without moving stock.
16. **Every night, a check proves the ledger.** Every balance equals its entries since the latest checkpoint, every reserved number equals its open reservations, the sequence has no gaps, no closed line holds a reservation, and every shipped line, handover and return equals its entries. A difference alerts the operator and the seller, and holds raises for that product's listings.
17. **A change to sellable gives the affected listings a new figure in the same transaction.** The figure itself is ADR-008's.
18. **A dated product's date is either a use-by or a best-before date.** A use-by batch is never reserved, packed or dispatched on or after its date, by any route and with no override.

## How stock moves

<!-- DIAGRAM -->

Units arrive by receiving or by a return. Received units are sellable, unless their batch is already past its sell-by date or the receipt waits for a manager. Returned units are held until someone inspects them. An order moves sellable units of a batch to reserved. Packing moves reserved units to the packing spot, naming the batch that left. A confirmed shipment takes them out of the warehouse. Held units come back to sellable only when a person or a date says so, or leave by write-off. Every arrow is a ledger entry under the company's lock.

## Where stock is counted

| Thing | What it is | Rules |
| --- | --- | --- |
| **Warehouse** | A site the seller ships from | Each channel account has a default warehouse. An order is reserved and shipped from one warehouse |
| **Spot** | A place in a warehouse: a shelf, a bench, a dispatch area | Every unit on hand is in exactly one spot. Each warehouse has a default spot, so a seller who does not track shelves never names one. A spot has a kind: `storage`, `packing` or `transit`. The packing and transit spots are made by the system |
| **Batch** | Stock of one product received together | Holds the lot number, the date and its kind (use-by or best-before), supplier, units per box on that delivery, and the landed cost of one unit. A batch is never split; moving part of it moves units between spots of the same batch |
| **Spot balance** | One row per product, batch and spot | Holds on hand, quarantined and damaged, and the ledger sequence that last changed it |
| **Batch position** | One row per product, batch and warehouse | Holds on hand, reserved, quarantined and damaged for the batch in that warehouse: the sums of its spot balances, plus reserved |

- **Spots are optional.** A seller who runs one shelf per warehouse uses the default spot for everything; a seller who adds shelves gets pick lists and counts per shelf. Nothing else changes.
- **Reserved lives on the batch position, not the spot.** A reservation promises units of a batch in a warehouse. Which shelf they come from is decided when picking starts (see "Picking and packing"), so a move between spots never touches a reservation.
- **A batch is one receipt.** Two deliveries of the same lot are two batches, because their cost and supplier may differ. A recall searches by lot across batches. A batch without a lot number is shown by the day it was received.
- **A transit spot** belongs to the destination warehouse of a transfer but to no warehouse's on hand. Its units are in the ledger, so the nightly check balances, and they are shown as incoming at the destination.
- **A bundle has no balance.** A ledger entry against a bundle is refused (ADR-003).

## The ledger

Every change to stock is written as entries in `stock_ledger`, a tenant table (ADR-001) that is append-only: the runtime role cannot update, delete or truncate it. It is partitioned by month.

**Only the ledger insert changes a balance.** The foundation's migration defines one trigger on `stock_ledger` that applies each new entry to its spot balance, its batch position and, for a `reserved`, `released` or `dispatched` entry, its reservation row, and stores the running totals on the entry. The runtime role can read spot balances, batch positions and reservation rows, but not write them. A code path that changes a balance without an entry is therefore impossible, not merely found the next night.

**One entry**

| Field | Meaning |
| --- | --- |
| `sequence`, `line` | A gapless number per company, taken from the company's stock counter row, whose row lock is the company's lock (ADR-001), and the line within that change. Together they give a total order of every change |
| `occurred_at` | Database time when the change was made |
| `product_id`, `batch_id`, `warehouse_id`, `spot_id` | The balance it changes. `spot_id` is empty for an entry that changes only reserved |
| `kind` | The reason, from the table below |
| `on_hand`, `reserved`, `quarantined`, `damaged` | The change to each number, positive or negative. Most entries change one or two |
| `demand` | What the change was for, when it was for something: an order line, a Vendor purchase order line, a shipment to a marketplace warehouse, a transfer |
| `source` | Where the change came from: a receipt line, a packing, a shipment, a count, a return, a repack job, a person's action |
| `actor` | The person, or the named process (import, date pass, archiver) |
| `note` | The reason a person typed, required where the kind says so |
| `command_key` | The key of the command that wrote it (see "Concurrency and repeats") |

**Kinds of entry.** Each kind's allowed changes are a check on the ledger row: an entry whose numbers do not fit its kind is refused.

| Kind | What changes | Typical source |
| --- | --- | --- |
| `received` | On hand up; for a receipt that waits for a manager, quarantined up too | A purchase order receipt, or a receipt without a purchase order (a reason is required) |
| `reserved` | Reserved up | An order line, a Vendor line, a marketplace warehouse shipment, a transfer |
| `released` | Reserved down | A cancellation, a smaller quantity, a reallocation, a link closed for an unshipped line |
| `dispatched` | On hand and reserved down together | A confirmed shipment |
| `returned` | On hand and quarantined up together | A return receipt |
| `inspected` | Quarantined down (restock, or a receipt accepted), or quarantined down and damaged up | Return inspection, a manager accepting a receipt, or any quarantined units looked at |
| `quarantined` | Quarantined up, or down when a recount finds the units | A person sets units aside; a count's shortfall; "not found" at a pick |
| `marked_damaged` | Damaged up | A person finds damaged units on a shelf |
| `restored` | Damaged down | A damaged unit repaired, with a reason |
| `written_off` | On hand down, and quarantined or damaged down, or neither for an expired or blocked batch | A write-off with a reason, or an approved count shortfall |
| `counted` | On hand up | An approved count that finds more |
| `adjusted` | On hand up or down | A manager's correction with a reason |
| `transferred` | On hand down in one spot, up in another, same batch | A move between spots, packing, a put-back, or a transfer between warehouses |
| `transferred_out` | On hand and reserved down together | Handover of a shipment to a marketplace's own warehouse |
| `repacked` | On hand down for one product's batches, up for a new batch of another | A repack or an assembly job (ADR-003) |
| `opening_balance` | Every number, to its total at the checkpoint | The archiver's checkpoint (ADR-002) |

**Bundle components** are not a kind of their own. An order for a bundle writes ordinary `reserved` and `dispatched` entries against each component's batches, and each entry's `demand` names the bundle's order line. That is how a recall of a honey lot finds the gift sets that contained it.

**What is not an entry.** Printing a label or a pick list, starting to pick, holding an order, and telling a marketplace that an order shipped move no stock and write nothing to the ledger.

## The four numbers

Every batch position (product, batch and warehouse) has four numbers, and every spot balance has on hand and the held part of it. A product's numbers in a warehouse are the sums of its batch positions there. A bundle has only a sellable figure, worked out from its components (ADR-003).

| Number | Definition | Who uses it |
| --- | --- | --- |
| **On hand** | Units physically in the warehouse, in any state, per spot and per batch. Transit spots count in no warehouse | The warehouse, counts, stock value |
| **Reserved** | Units of a batch in a warehouse that are promised to a demand: the sum of its open reservations | Picking and packing |
| **Held** | Units on hand that may not be sold: quarantined, plus damaged, plus every other unreserved unit of a batch that is past its sell-by date or blocked | Inspection, write-offs, recalls |
| **Sellable** | On hand − reserved − held. Never below zero | Every channel's figure, through ADR-008 |

**Incoming** is shown beside them: units on open purchase order lines not yet received, and units in transit to the warehouse. It is a promise, not stock. It is never in sellable and never sent to a listing.

**Held, exactly.** `quarantined` and `damaged` are stored on the spot balance and summed on the batch position, and change only by ledger entries. A batch's dates and blocks are not stored as quantities; they decide whether the rest of the batch's unreserved units are held:

- held = quarantined + damaged + (if the batch is expired, short-dated or blocked: on hand − reserved − quarantined − damaged; otherwise 0)

**Quarantined** units wait for a decision: a return not yet inspected, a receipt waiting for a manager, a counted shortfall waiting for approval, or units a person set aside. **Damaged** units are kept, to repair or sell as seconds, but are never sellable and never reserved; they leave only by write-off, or come back by a recorded restore.

**Use-by or best-before.** A product that tracks dates (ADR-003) says which kind its date is. The default is best-before.

- **Sell-by date.** A batch with date D is sellable while the days left (D minus today, in the company's time zone) are at least `min_days_to_sell`. For best-before, a blank `min_days_to_sell` counts as 0, so the batch is sellable until its best-before date and **expired** from the day after. A batch with fewer days left than `min_days_to_sell`, but not yet expired, is **short-dated**: held, still on hand, to be written off, sold off by hand or returned to the supplier.
- **Use-by.** `min_days_to_sell` cannot be blank. It is at least 1 plus the company's delivery days (a company setting, default 1), so 2 by default, because a parcel must reach the buyer before the date. A use-by batch is never reserved, packed or dispatched on or after its date, by any route; a manager cannot override it, and it is never sold off by hand.
- **Past best-before, by hand.** A manager may send units of an expired best-before batch on a manual order, with a recorded reason (selling off clearance stock). It never reaches a listing.

**Blocked.** A manager can block a lot, for a recall or a quality check. Every batch with that lot is held at once, in every warehouse. Unblocking returns its free units to sellable.

**The date pass.** Once a day, just after midnight in the company's time zone, and whenever a product's `min_days_to_sell` changes, a pass finds batches that crossed their sell-by date. In one locked transaction per company it moves their unpacked reservations to other batches (below), and their free units become held. Their listings get new figures.

**Worked example.** One honey product, best-before, with `min_days_to_sell` = 30, on 18 October 2026, in one warehouse.

| Batch | Best-before | Days left | On hand (spots) | Reserved | Quarantined | Damaged | Held | Sellable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 30 Nov 2026 | 43 | 10 (Shelf 1) | 10 | 0 | 0 | 0 | 0 |
| B | 31 Mar 2027 | 164 | 35 (30 on Shelf 2, 5 on the returns bench) | 2 | 5 | 1 | 6 | 27 |
| C | 5 Nov 2026 | 18 | 3 (Shelf 3) | 0 | 0 | 0 | 3 | 0 |
| **Total** | | | **48** | **12** | **5** | **1** | **9** | **27** |

- On hand 48, reserved 12, held 9 (5 returns waiting, 1 damaged, and batch C's 3 units, short-dated with 18 days left).
- Sellable: 48 − 12 − 9 = **27**. A single-jar listing is based on 27. A listing that sells six jars at a time is based on 27 ÷ 6 = 4, rounded down. ADR-008 adds buffers and the low-stock policy.
- A purchase order for 24 jars, not yet received, shows as incoming 24. Sellable stays 27.

## Reserving on order

An order line reserves when the order is imported (ADR-007), in the import's own transaction:

1. Take the company's lock (the first statement).
2. Write or update the order (ADR-007 owns the import rules).
3. Resolve each line: the link that was valid when the buyer bought gives the product, units per sale and fulfilment (ADR-003, ADR-005). Links record when they began and ended, so this is a lookup. The line stores the link version.
4. Work out each line's target: what it still needs (quantity − cancelled − dispatched − shipped outside, × units per sale, per component for a bundle), and compare it with what it holds. Only the difference is reserved or released, so a cancellation and an edit in one read never release twice.
5. Choose batches for it, write `reserved` entries (which also write the reservation rows and positions).
6. Record any shortage on the line.
7. Write new desired figures for every affected listing, with the ledger sequence (ADR-000).
8. Write the outbox event and commit.

**Which units a line takes.** Only sellable units, in the order's warehouse:

- **The demand's shelf life first.** An order takes batches that are sellable by the product's own rule. A shipment to a marketplace's warehouse needs more (see "Stock the marketplace ships"), and a Vendor line needs what its purchase order states (ADR-004.4).
- **Earliest sell-by date first,** among the batches that qualify. Batches sorted by date, then by received date. Expired, short-dated and blocked batches are skipped. Batches with no date (a product that does not track it, or stock from before the switch was turned on, ADR-003) come after dated ones, by received date.
- **No spot is chosen here.** The pick list chooses spots when picking starts.
- **A manager can pin another batch** for a line. The change is a `released` and a `reserved` entry with the manager's name and reason. It must still be sellable and meet the demand's need.

**A shortage reserves what exists.** A line that needs 12 with 7 sellable reserves 7 and records 5 missing. The order shows as short and cannot be shipped in full. Vervoro never cancels it; that is the seller's choice, because marketplaces count seller cancellations against the seller. When units arrive (a receipt, a restock, an accepted receipt, a count that finds more), short lines in that warehouse are filled in the same transaction: **earliest ship-by time first** (ADR-007); orders held for payment or with a cancellation requested last; the oldest purchase breaks a tie. An Amazon order due today comes before an unpaid order from yesterday.

**Quantity changes.** A smaller quantity releases the difference, latest sell-by date first and unpacked units first, so what stays reserved still follows the earliest-first rule. A larger one tries to reserve more by the same rules.

**A batch that crosses its sell-by date or is blocked** while reserved: the date pass, or the block, moves each of its reservations that is not yet packed to the next qualifying batch by the same rules. A line with nowhere to move becomes short. Units already packed stay on their parcel when the batch only became short-dated or expired at best-before, because they were sold in date; units of a blocked lot, or of a use-by batch on or after its date, are refused at dispatch and the packer swaps them.

**Worked example.** Honey batches A (best-before 30 Nov 2026, 10 sellable), B (31 Mar 2027, 30 sellable) and C (5 Nov 2026, short-dated). An order for 12 arrives.

- C is skipped. A gives 10, B gives 2.
- The line holds two reservations: A × 10 and B × 2. The pick list names both lots, and the shelves they are on.
- A second order for 40 arrives. B gives its remaining 28. The line records 12 missing.
- A receipt of 24 jars in batch D arrives the next day. In the receipt's transaction, the second order's line takes 12 from D. Sellable becomes 12.

## Packs and bundles

**A pack reserves its own stock.** A listing linked to a six-pack product reserves six-packs, never singles (ADR-003). With one six-pack sellable and an order for two, the line reserves one and is short by one. Vervoro shows that 6 singles could make the missing pack and offers a repack job; it never repacks on its own, because opening or making packs is physical work.

**A listing with several units per sale** reserves that many units of its product. A listing that sells six loose jars per sale, ordered twice, reserves 12 jars.

**A bundle reserves its components in whole sets,** each component by the rules above, in the same transaction. A line reserves the most whole sets its components can cover, and records the rest as missing on every component alike. It ships whole sets only. A half-reserved set would hold a jar a single-jar buyer could have had, and a packer could send half a gift set. The line records, for each component, the product and the quantity per bundle that it used.

**Repacking and assembly.** A repack between a pack and its singles takes one number, the packs opened or made, and the other side follows from the pack's units per pack (ADR-003), so base units never change. A manager can also assemble a product from several others, for example a gift set built and sealed in advance to send to Amazon's warehouse, which Amazon requires as one labelled unit: the job states every input and the output quantity, and the output batch records every input lot, so a recall of any input finds it. Only free units are repacked or assembled.

**Worked example.** Gift set G is 1 × honey + 2 × jam. Honey batch A has 10 sellable. Jam batch J1 (best-before 31 Dec 2026) has 4, J2 (28 Feb 2027) has 20. A listing linked to G with 1 unit per sale gets an order for 3.

- The line needs 3 honey and 6 jam: 3 whole sets are covered.
- Honey: A × 3. Jam: J1 × 4 and J2 × 2.
- The line records link version 1 of the gift-set listing, and components honey × 1 and jam × 2 per set.
- G's sellable was min(10 ÷ 1, 24 ÷ 2) = 10. It is now min(7 ÷ 1, 18 ÷ 2) = 7.
- Had only 5 jam been sellable, the line would reserve 2 sets (2 honey, 4 jam) and record 1 set missing; the fifth jam stays on sale for single-jar listings.
- Next week the seller changes G to 1 honey + 1 jam + 1 tea. Orders received afterwards use the new list. This order keeps honey × 3 and jam × 6, and ships what it reserved.

## What the order line records

| Field | Meaning |
| --- | --- |
| `link_id` | The link version the line was resolved with (ADR-005). Empty for an unlinked line |
| `product_id`, `units_per_sale`, `fulfilled_by` | Copied from that link version, so a later link change never changes what the line needs |
| `components` | For a bundle: each component's product and quantity per bundle, copied when the line was resolved |
| `needed`, `missing` | Units needed per product, and units not yet reserved (whole sets for a bundle) |

**Reservation rows** (`stock_reservation`) hold the detail: demand, product, batch, warehouse, quantity reserved, quantity packed, quantity dispatched, and when the reservation was closed. A batch position's reserved number is the sum of its open reservation rows, and the nightly check proves it.

**A line's reservation never changes because a link changed.** That is ADR-005's rule. A line's reservation changes only in these recorded ways: a person resolves the line again, a manager pins another batch, the floor packs another eligible batch, or a date pass, block or count moves it.

**Resolving a line again.** When a line was reserved under a wrong link (wrong product, wrong units per sale), a manager can resolve it again against the listing's current link. In one transaction, it releases what the line held and reserves under the new link. A line with any units packed or dispatched cannot be resolved again.

## Orders that wait for a link

A line for an unlinked listing is imported, flagged, and reserves nothing (ADR-003, ADR-005). It waits.

**A waiting line** is a line with no link, on an order that is open, not cancelled and seller-shipped (or of unknown fulfilment).

**Making a link reserves for every waiting line of that listing** in the link's own transaction: oldest order first, by the rules above, each line recording the new link version. ADR-005's link screen says what will happen before the person confirms: "Linking reserves stock for 3 waiting orders." If stock runs out, the remaining lines are short, and the screen says so too. A bulk link (ADR-005, written in chunks of 500 links per transaction) reserves for each chunk's waiting lines in that chunk's transaction.

**A line bought before the link began but imported after it** is a waiting line too. It reserves at import, under the listing's current link, by the same rules.

**Other changes to links:**

- **A link closed** with no new one (the listing is unlinked) leaves open lines as they are. They were reserved under the link that was valid when the buyer bought, and dispatch deducts that product (ADR-005). A person who wants the units back cancels the order, or resolves the line again, which with no current link releases it and leaves it waiting.
- **A new link version** applies to orders received afterwards, and to lines still waiting (ADR-005). Lines already reserved keep theirs.
- **A waiting line already shipped outside Vervoro** (the marketplace says it shipped before anyone linked the listing) reserves nothing when the link is made, because the units are gone. It stays flagged (ADR-007). A person who attaches it to a product deducts the units at once, as a `dispatched` entry whose source is "attached after shipping", earliest sell-by first, marked "batch assumed". A person who leaves it unattached says the units did not come from Vervoro's stock.
- **A seller-shipped line on a listing linked as marketplace-shipped** reserves units per sale of the product, and opens a conflict (ADR-005, ADR-007).

**Worked example.** An unlinked listing gets three orders: O1 for 2 at 09:00, O2 for 1 at 09:30 (cancelled at 10:00), and O3 for 4 at 10:15. At 11:00 a manager links the listing to honey at 1 unit per sale. Honey has 5 sellable.

- The link screen shows: "Linking reserves stock for 2 waiting orders. 1 will be short by 1."
- In the link's transaction: O1 reserves 2. O3 reserves 3 and records 1 missing. O2 is cancelled, so it reserves nothing.
- Every listing of honey gets a new figure in the same transaction, based on 0 sellable.

## Stock the marketplace ships

When the marketplace ships from its own warehouse (Amazon FBA and similar), Vervoro holds none of the units.

- **A marketplace-shipped line reserves nothing.** The order is recorded for reports (ADR-003, ADR-007).
- **A line whose fulfilment is not yet known reserves** as if the seller ships it, the safer default. When the marketplace confirms it ships the order itself, the reservation is released. Holding a unit for a parcel the marketplace ships wastes it for a while; not holding one for a parcel the seller must ship risks overselling.
- **Sending stock to the marketplace's warehouse is a transfer, not a sale.** The shipment's lines reserve when it is ready to pack, by the same rules as an order line, with one difference: for a dated product, only batches with **more than 90 days left at the expected check-in** qualify, that is at least 90 + the account's "days to check-in" (a setting on the Amazon account, default 14) on the day it is reserved, earliest qualifying batch first. Earliest-first alone would send Amazon the stock it refuses: with 48 jars of which 30 have 79 days left at check-in, those 30 would be turned away. Handover deducts them as `transferred_out`, once per shipment. No order is ever created for it, because an order in the list invites a second deduction later.
- **Stock in the marketplace's warehouse is not in the ledger.** Once handed over, it is the marketplace's to count. The figure the marketplace reports for it (ADR-004.2 reads it) is stored as a dated reading per product, shown beside the four numbers, never added to on hand or sellable.
- **A removal shipped back** from the marketplace's warehouse arrives as a receipt with its reason, into a new batch or the batch the label names.

## Other demands

The same reservation serves every demand, so no copy drifts.

| Demand | Reserves | Shelf life it needs | Deducts | Decided in |
| --- | --- | --- | --- | --- |
| Marketplace or website order line | On import, or when its listing is linked | The product's sell-by rule | On a confirmed shipment | This record, ADR-007 |
| Manual or business order line | When the order is confirmed | The product's sell-by rule | On a confirmed shipment | ADR-007 |
| Amazon Vendor purchase order line | When the seller confirms the line | The purchase order's minimum | When the shipment is confirmed | ADR-004.4 |
| Shipment to a marketplace's warehouse | When it is ready to pack | More than 90 days at expected check-in | At handover | This record |
| Transfer between warehouses | When it is sent, the units move to the destination's transit spot | The product's sell-by rule | Received, or written off as lost in transit | This record |

**A count may free part of a marketplace shipment.** When a count finds fewer units than a batch holds, and the shortfall reaches reserved units, a reservation for a shipment to a marketplace warehouse that is not yet handed over gives way first, latest shipment first. The shipment shows what it lacks and cannot be handed over until it is reserved again or reduced.

## Picking and packing

**Picking chooses the spots.** When an order starts picking (ADR-007), a pick task records, for each reservation, the spot to take it from: the spot of that batch with the fewest units first, so part-used spots empty out, less what other open pick tasks already take from it. The pick list names the batch, its lot and date, and the spot. Starting a pick task writes no ledger entry; it is a plan.

**Packing records what left.** Packing (ADR-007's "packed") is a server command. For each unit it records the batch:

- **One eligible batch** of the product in the spot (or the warehouse, without spots): it is implied.
- **Several:** the packer taps the date or lot printed on the unit, or scans a barcode that carries it. A product barcode alone does not name the batch.
- **Another eligible batch than planned** (in date, not blocked, meeting the demand's need): the floor may take it without a manager. The line's reservation follows it; if that batch has no free units, the reservation is exchanged with the newest not yet packed reservation of the same batch on another line, which takes the planned batch instead, and both lines keep their shelf-life needs. Choices of a later date than planned are listed daily for a manager.
- **Nothing can be exchanged** (the tapped batch is fully packed for other orders), or nobody says: the line ships the batch it reserved, marked **"batch assumed"**, and keeps any lot the packer tapped. A recall of either lot lists it.

Packing moves the packed units, still reserved, from their spot to the warehouse's packing spot (a `transferred` entry, source "packing"). Putting a packed order back (ADR-007) moves them back, or leaves them in the packing spot for put-away. Units in the packing spot for more than 24 hours are listed on Home.

**"Not found" at a pick.** A picker who cannot find a planned unit says so: the unit is quarantined with that reason (out of sale at once), the reservation moves to another qualifying batch or the line becomes short, and the spot is put on the count list.

**A unit picked where the books do not show it** (a jar of batch B taken from Shelf 5 when the books hold B only on Shelf 2) is recorded as a move from the spot where the books hold that batch, and both spots go on the count list. The batch and the product total are right at once; only which shelf it left from may be wrong until the count. Only when no spot in the warehouse holds that batch is the unit **found**: it is received with the reason "found at pick" and packed in the same transaction, so it never reaches a channel, and listed for a manager.

## Deducting on dispatch

**Stock leaves when a shipment is confirmed,** and only then. A shipment names an order, the lines and the quantities in the parcel, the carrier and tracking. Confirming it, in one locked transaction:

- writes a `dispatched` entry for each packed reservation it uses, taking on hand (in the packing spot) and reserved down together,
- marks those quantities dispatched on the reservation rows, and records each line's lots and dates, with "batch assumed" where it applies,
- writes the order's new status and the outbox event for the dispatch notice to the marketplace (ADR-000's egress gate).

Sellable does not change on dispatch, because on hand and reserved fall by the same amount. Listings get no new figure from it.

**An order shipped without packing in Vervoro** (a seller who confirms dispatch at the bench without packing on the phone) has its packing done by the dispatch itself: one eligible batch is implied, otherwise the reserved batch is deducted, marked "batch assumed".

**Whole orders.** Vervoro ships an order whole (ADR-007): one shipment, which may be several boxes, carries every unit still to ship and deducts what was packed for it. A line can never ship more than it has reserved, so an order with a short line waits. A bundle line ships whole sets. An order is part shipped only when its marketplace reports part of it shipped outside Vervoro; the rest stays reserved and ships whole.

**Recorded once.** Each shipment has its own id, and confirming it again returns the first answer. Retries, a second tap and tracking updates never deduct twice.

**Shipped outside Vervoro.** A marketplace may report an order as shipped when nobody confirmed a shipment in Vervoro, for example after the seller bought a label in the marketplace's own tools. Vervoro then deducts what the lines held, packed units first, as a `dispatched` entry whose source is "marketplace said shipped", marked "batch assumed" for unpacked units. When the deduction had to choose between two or more eligible batches of a dated product, a task asks the warehouse to tap the lot that left; it never blocks anything. It happens in shadow too, where the old system ships: those entries are marked "lot not traced", and a recall does not rely on their batch. The seller sees these in the daily digest. If the parcel did not come from the warehouse, a manager reverses it with an `adjusted` entry and a reason. Deducting is the safe direction: a wrong deduction shows too little, and a count finds it; a wrong release would offer units that left.

**Worked example.** A line for 5 jars holds A × 3 (30 Nov 2026) and B × 2 (31 Mar 2027). Shelf 1 holds only batch A, so the packer packs 3 jars from it without a tap.

- Packing: A × 3 moves from Shelf 1 to the packing spot, still reserved. The line's record shows batch A × 3.
- The packer packs 2 more from Shelf 2, which holds batches B and E, and taps the date on the jars: 31 Mar 2027, batch B. B × 2 moves to the packing spot.
- The packer confirms one shipment of 5. `dispatched`: A on hand −3 and B on hand −2 (packing spot), reserved −5. The order is shipped.
- A repeat of the first confirmation, with the same shipment id, changes nothing and returns "already confirmed".

## Cancellations

**Before dispatch:**

- **A request is not a cancellation.** A buyer's request keeps the reservation until the marketplace confirms the cancellation. A refused request must not leave an order without stock.
- **A confirmed cancellation releases exactly what each line held,** batch by batch, in one transaction. Listings get new figures at once.
- **Part of an order:** a line cancelled, or a smaller quantity, releases that part only, latest sell-by date first.
- **Already picked, not packed:** the units are in a tote but still on hand in their spot by the books. The release returns them to sellable, and a put-back task stays open until each unit is scanned back (ADR-007).
- **Already packed:** the units are in the packing spot. The release returns them to sellable there, and a put-back task stays open until each unit is scanned away (a move).
- **A held order** keeps its reservation; a confirmed cancellation still cancels it (ADR-007).

**After dispatch:** the units have left. A cancellation moves no stock. If the parcel comes back, it is a return.

**Part shipped** (the marketplace reported part shipped outside Vervoro): the cancellation releases what is still reserved, and the shipped part follows the after-dispatch rule.

## Returns

**A return comes back into the batch it left from.** The returned line names the order line. The units go into one of the batches that line dispatched, in a spot the person chooses (a returns bench, or the warehouse's default spot), as `returned`: on hand and quarantined up together. They are held, never sellable, until inspected.

- **Which batch.** If the product tracks lots, the person scans or picks the lot from those the line received. Otherwise the earliest-dated batch the line received comes first, so a returned unit is never given a later date than it might have.
- **At most what was dispatched.** A line can return at most what it dispatched, less what earlier returns received.
- **A bundle returns by component.** Each component comes back into its own batch.
- **A unit with no dispatch record** (sent before the seller used Vervoro, or from an archived month) is received into a new batch with a reason; a dated product asks for its date.
- **A refund never restocks, and a restock never refunds.** Refunds are done in the channel's own tools; the credit note is ADR-011's.

**Inspection decides, per unit:**

| Decision | Entry | Effect |
| --- | --- | --- |
| Restock | `inspected` (quarantined down), then `transferred` to a storage spot | Sellable again, unless the batch is expired, short-dated or blocked. A use-by unit is restocked only with a manager's reason |
| Keep as damaged | `inspected` (quarantined down, damaged up) | Still on hand, never sellable |
| Write off | `written_off` (on hand and quarantined down), with a reason | Gone |

**Worked example.** An order received 4 jars: A × 3 and B × 1. The buyer sends 3 back.

- Receipt: A × 3 onto the returns bench. On hand +3, quarantined +3. Sellable unchanged.
- Inspection: 1 restocked (quarantined −1, moved to Shelf 1: sellable +1), 1 kept as damaged (quarantined −1, damaged +1), 1 written off with "broken seal" (on hand −1, quarantined −1).
- Net: on hand +2, sellable +1, damaged +1. Listings get a new figure once, from the restock.

## Receiving and put-away

Purchase orders themselves (suppliers, drafting, approving, sending, reorder suggestions, sharing landed cost) are a later purchasing record. This section covers only what a receipt does to stock.

**Goods in against a purchase order.** A warehouse user opens the delivery's purchase order on a phone and counts each line in, by scanning or typing. Confirming a receipt line, in one locked transaction:

- creates a batch for that line: lot, date, supplier, units per box on this delivery, and a provisional landed cost per unit,
- writes `received` into the spot the person chooses, or the warehouse's default spot: on hand up, and sellable up unless the batch is already past its sell-by date,
- fills short order lines in that warehouse, by ship-by time,
- writes new figures for the product's listings, and the outbox event,
- adds the quantity to the purchase order line's received total.

**Checks on each line:**

- A product that tracks dates or lots refuses a receipt without them (ADR-003).
- A receipt with fewer days left than `min_days_on_receipt` is received **quarantined** ("short-dated receipt") until a manager accepts it or refuses it.
- Scanning a box barcode adds the box's units (ADR-003). The ledger only ever holds base units.
- Warehouse users see lines and quantities, never costs.

**Deliveries in parts, and the wrong amount.** A purchase order line can be received over several deliveries; each receipt is its own batch. Fewer units than ordered leave the rest open as incoming until a manager closes the line. More than ordered are received as counted, and the line shows the surplus for a manager to accept or return. What arrived is what the ledger records; the purchase order only says what was expected.

**Received is sellable. Put-away is a move.** Stock is sellable from the moment the receipt is confirmed, and can be picked from where it was received. Moving it to a shelf is an ordinary `transferred` entry between two spots of the same warehouse. Reservations name the batch, not the spot, so units reserved on receipt move with the rest and nothing else changes. Sellable does not change, so listings get no new figure. Nobody has to confirm put-away before stock goes on sale: the goods are in the building and countable, and holding them back would leave listings showing too little and short orders waiting for nothing.

**Cost is not stock.** The landed cost on a batch stays provisional until the supplier's document, freight and duty have arrived. Changing it never touches quantities or the ledger.

**Incoming** (see "The four numbers") is what is still open on purchase order lines, less what has been received.

**Repeats.** Each receipt line has its own key. A second tap, or a phone retrying on patchy Wi-Fi, returns the first answer and receives nothing more.

**Goods without a purchase order.** Gifts, samples, a supplier's extra case, stock found during a move to Vervoro: they happen, and they must be explainable.

- **A manager receives them directly,** with a reason from a short list (supplier extra, sample, opening stock, found, other with a note). The receipt is the same as above, without a purchase order line: a batch and a `received` entry, sellable at once.
- **A warehouse user can record one,** and it is received **quarantined** until a manager accepts it. A mistyped quantity on an unplanned receipt would otherwise go straight to every channel. It is in the ledger from the start, so the units on the shelf are never counted twice.
- **A manager accepts or refuses a quarantined receipt.** Accepting is an `inspected` entry that makes it sellable and fills short lines; refusing is a write-off or a return to the supplier.
- **Cost may be blank.** The batch then has no landed cost until a manager adds one; reports use the product's standard cost meanwhile and say so.
- **Every such receipt is in the activity view and a reconciliation report.** If the purchase order turns up later, a manager attaches the receipt to its line, which counts it as received there. Stock does not move again.

**Worked example.** A purchase order asks for 48 jars of honey. A Monday delivery brings 36 (3 boxes of 12) with best-before 30 Apr 2027; an open order is short by 4.

- The user scans the box barcode three times: 36 jars into batch E, on the "Goods in" shelf. On hand +36. The short order takes 4 of batch E. Sellable +32, and listings get new figures.
- The purchase order line shows 36 of 48 received; incoming is 12.
- In the afternoon all 36 go to Shelf 4: one `transferred` entry, 36 out of "Goods in" and 36 into Shelf 4. Batch E still has 36 on hand and 4 reserved in the warehouse. No new figure.
- Thursday brings the last 12 with a different best-before: batch F. The line is complete; incoming is 0.
- The same week, the supplier sends a free case of 12 jam with no purchase order. A warehouse user records it: batch J3, 12 on hand, 12 quarantined. That evening a count of the shelf finds 12, as the books say. Next morning a manager accepts it as "supplier extra": sellable 12, cost blank.

## Counts and adjustments

**Counts.** Anyone who may count picks a spot or a product and counts; a manager approves. Counts are always blind: the counter is never shown the expected figure, because a visible number pulls counts towards it. Home lists the spots counted least recently, so every shelf gets counted.

- **Counted against the moment the figure was saved.** Each figure stores the ledger sequence at which it was saved; the expected figure is the spot's on hand at that sequence. A sale or a receipt between counting and approval does not read as a difference.
- **Units being picked are allowed for.** The allowance for a spot is the units its open pick tasks take from it for orders not yet packed. A counted figure between (books − allowance) and the books records nothing: those units may be in a tote, and the spot is checked again once those orders are packed. A figure below (books − allowance) records the excess shortfall at once (next point). A figure above the books is a surplus. The allowance never creates stock. A re-check still unsettled after 24 hours is listed on Home.
- **A shortfall leaves sale at once.** When the figure is saved, the shortfall beyond the allowance is quarantined ("counted short"): listings fall now, not when a manager next looks. It comes from the batch's free units first; when it reaches reserved units, a marketplace warehouse shipment's reservation gives way first, then order reservations not yet packed, newest order first, which move to another qualifying batch or leave the line short. Approval writes the quarantined units off; a recount that finds them releases them.
- **A count that finds more** adds the surplus to the counted batch, or to the spot's latest batch when the count did not name one, as `counted` when a manager approves. A unit the books hold in another spot of the same batch is a move from there, not a surplus (see "Picking and packing").
- **Approved all or none.** Approval writes every entry of the count in one transaction. Approving again returns the first answer. A count holds at most 2,000 lines, so its approval keeps the lock briefly; a larger area is counted as several counts.
- **Orders packed outside Vervoro.** For an order dispatched without packing in Vervoro, its units stay on the shelf by the books until dispatch, so a count cannot tell them from a loss. Its reserved units in that spot count in the allowance while the order is picking or packed, and a shortfall that reaches them waits for a recount after dispatch, or for a manager who confirms the units are gone.

**Adjustments.** A manager can correct on hand directly with `adjusted` and a typed reason, for one spot balance. The same limits apply: an adjustment never takes a batch's on hand below its reserved plus held, and never takes units from an order's reservation; a real loss there is recorded through a count.

**Worked example.** Shelf 2 holds batch B: on hand 12. Batch B has 5 reserved in the warehouse: 2 on an order now picking, whose pick task takes them from Shelf 2, and 3 on orders not started. So 7 are free. The ledger is at sequence 9,000.

- A counter finds **9**. The allowance is 2, so 10 to 12 would record nothing. 9 is 1 below: 1 free unit is quarantined at once. Sellable falls by 1. The picking order is packed with 2 jars from Shelf 2: the shelf's books fall to 10, of which 1 quarantined, which matches the 9 seen plus the 2 in the tote less the 1 missing. A manager approves: 1 written off.
- Another day, a counter finds **1**. The shortfall beyond the allowance is 12 − 2 − 1 = 9. The 7 free units are quarantined; the other 2 reach the 3 reservations of orders not started, so the newest order's 2 move to batch D, and 2 more are quarantined. Batch B: on hand 12, reserved 3, quarantined 9.
- The picking order is packed: 2 move to the packing spot. Shelf 2's books: on hand 10, quarantined 9, so 1 jar, which is what is there. The manager approves the count: 9 written off.

**Who may do what.** Roles are ADR-010's.

| Action | Warehouse | Manager | Admin, Owner |
| --- | --- | --- | --- |
| Receive, move between spots, repack between a pack and its singles | Yes | Yes | Yes |
| Count | Yes | Yes | Yes |
| Approve a count; confirm reserved units are gone (orders packed outside Vervoro) | No | Yes | Yes |
| Adjust, write off (reason required) | No | Yes | Yes |
| Record a receipt without a purchase order (received quarantined) | Yes | Yes | Yes |
| Accept or refuse a quarantined receipt; receive one without a purchase order directly | No | Yes | Yes |
| Inspect a return: restock or keep as damaged (a use-by unit: keep or write off only) | Yes | Yes | Yes |
| Inspect a return: write off, or restock a use-by unit with a reason | No | Yes | Yes |
| Mark units damaged or quarantined; "not found" at a pick | Yes | Yes | Yes |
| Restore damaged units | No | Yes | Yes |
| Block or unblock a lot | No | Yes | Yes |
| Take another eligible batch at packing (recorded) | Yes | Yes | Yes |
| Pin a batch for a line, resolve a line again | No | Yes | Yes |
| Assemble a product from several others; send an expired best-before batch on a manual order | No | Yes | Yes |
| Pack, confirm a shipment | Yes | Yes | Yes |
| Reverse a shipment reported outside Vervoro | No | Yes | Yes |

A person limited to some warehouses can act only on their stock. The operator never writes a seller's ledger; a repair after the nightly check only rebuilds a balance from it.

## Recalls

A recall starts from a lot number. One search returns:

- every order line, Vendor purchase order line and marketplace warehouse handover that received a batch of that lot, bundles included, with the buyer's country and the date;
- the lines marked "batch assumed" that may have received it, listed apart;
- the stock of that lot still on hand, per warehouse, which a manager can block at once;
- for units handed over to a marketplace's warehouse, the shipment, so the seller can ask for a removal there;
- archived months, read from the archive (ADR-002), for long-dated lots.

Article 18 asks only for the businesses supplied (a Vendor order, a marketplace's warehouse). The order list goes further, because the seller needs it to reach the buyers, which they do through the marketplace's own messaging with the order id (ADR-009).

## Negative stock

**Never.** Every spot balance and batch position holds these checks in the database:

- spot balance: `on_hand >= 0`, `quarantined >= 0`, `damaged >= 0`, `quarantined + damaged <= on_hand`
- batch position: `reserved >= 0`, `reserved + quarantined + damaged <= on_hand`

A command plans its change, and the checks are the last line if the plan is ever wrong: the transaction fails, nothing is written, and the command returns a typed refusal ("would go negative") that names the product, batch and spot. Nothing is clamped to zero.

When the shelf has fewer units than the system, the way to say so is a count, which takes the units out of sale at once and moves reservations first. When a unit turns up where the books have none, it is a move from where the books hold its batch, or, when none do, a find that a manager reviews. Allowing a negative balance would let one channel sell stock that does not exist and hide the real problem until a later count.

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
| Pack | The packing id |
| Confirm a shipment | The shipment id |
| Receive | The receipt line id |
| Save a count figure, approve a count | The count line, the count id |
| Receive or inspect a return | The return line and the receipt or inspection id |
| Hand over a marketplace warehouse shipment | The shipment reference |
| Any person's action (adjust, move, write off, accept a receipt) | A key the client makes for the tap, kept across retries |

A `stock_command` table holds each key with its answer and the ledger sequence it wrote, with a unique index on company and key. A repeat finds the key under the lock and returns the stored answer. A phone that lost its reply on patchy Wi-Fi can send the same tap again.

**The ledger sequence** is taken from the company's counter row inside the locked transaction, so it is gapless and in commit order. It is the order of every change, and each desired figure records the sequence it was computed from, so a figure from an older sequence never replaces a newer one (ADR-000).

## The nightly check and checkpoints

Every night the sweeper (ADR-001) runs the check for each company, outside the company's lock, on a consistent snapshot:

1. **Balances equal entries.** For every spot balance and batch position, each stored number equals the latest checkpoint plus the sum of the entries after it.
2. **Reserved equals reservations.** Every batch position's reserved number equals the sum of its open reservation rows, and each reservation row equals its `reserved`, `released` and `dispatched` entries.
3. **The sequence has no gaps** since the last check.
4. **No closed line holds stock.** No open reservation remains on a line that is cancelled, fully shipped or resolved again.
5. **Documents equal their entries.** Per day, units on shipped order lines equal their `dispatched` entries, and units dispatched per line equal units shipped × the units per sale of its link version; handed-over marketplace shipments equal their `transferred_out` entries; received return lines equal their `returned` entries. One grouped query per document kind.
6. **Order statuses agree.** Each open order's status is worked out again from its facts and compared with the stored one (ADR-007). A difference here alerts the operator only.

**A difference** alerts the operator and the company's managers, and holds raises on every listing of the affected products (decreases still go). The ledger is the truth: the operator finds the cause, rebuilds the balance from the ledger, records the repair in the activity view, and the hold clears.

**Checkpoints** (ADR-002). Before a ledger month leaves the database, the archiver writes, under the company's lock, one `opening_balance` entry per spot balance and batch position that had entries up to then. It carries each stored number's total and the last sequence it covers, and each open reservation's reserved, packed and dispatched totals. The check sums from it. Reservation rows that are still open are current state and never archived.

**Worked example.** May 2024 is archived. By the end of May, batch B had entries summing to on hand 40 on Shelf 2 and reserved 3 in the warehouse, up to sequence 18,204. The archiver writes `opening_balance` entries: +40 on hand for Shelf 2, +40 on hand and +3 reserved for batch B's position, covering up to 18,204. From then on, the check adds every entry after 18,204 to them.

## What gives listings a new figure

The foundation writes the desired figure of each linked listing in the same transaction as the change (ADR-000). A listing is affected when its product's sellable changes, or a component's sellable when its product is a bundle. How the figure is worked out and sent is ADR-008.

| Change | Sellable changes? | New figure |
| --- | --- | --- |
| Receipt into sellable stock, or a quarantined receipt accepted | Up | Yes |
| Receipt received quarantined (short-dated, or without a purchase order by a warehouse user) | No | No |
| Reserve, release, cancellation, short line filled | Down or up | Yes |
| Packing, a put-back of packed units, a move between spots of one warehouse | No | No |
| Shipment confirmed, handover to a marketplace warehouse | No: on hand and reserved fall together | No |
| Return received | No: held | No |
| Return restocked | Up | Yes |
| Count shortfall quarantined, count approved, count surplus, adjustment of free units | Down or up | Yes |
| Units marked damaged or quarantined, "not found" at a pick, or restored | Down or up | Yes |
| Batch crosses its sell-by date, lot blocked or unblocked | Down or up | Yes |
| Transfer sent to, or received from, another warehouse | Down at the source, up at the destination | Yes |
| Repack or assembly | Down for the inputs, up for the output | Yes |
| Link made, closed or changed (ADR-005) | Only for that listing, and for waiting lines it reserves | Yes. A closed link sends its listing 0 unless the seller chose to leave the marketplace's figure (ADR-005) |
| A bundle's components changed | The bundle's sellable | Yes |
| `min_days_to_sell` or a product's date kind changed | Possibly | Yes, by the date pass |

## Storage

All tables belong to the foundation and are tenant tables (ADR-001): `company_id` on every row and leading every key, under row-level security.

| Table | Holds | Rules |
| --- | --- | --- |
| `warehouse`, `stock_spot` | Warehouses with their default spot, and spots with their kind | Packing and transit spots are made by the system, never by a person |
| `stock_batch` | Product, lot, date and its kind, received at, supplier, units per box, landed unit cost and currency, blocked, and for an assembled batch its input batches | One product per batch. Date and lot required when the product says so |
| `stock_balance` | Per product, batch and spot: on hand, quarantined, damaged, last sequence | The checks under "Negative stock". Written only by the ledger trigger |
| `stock_position` | Per product, batch and warehouse: on hand, reserved, quarantined, damaged, last sequence | The checks under "Negative stock". Written only by the ledger trigger |
| `stock_ledger` | Every entry | Append-only; partitioned by month; each kind's allowed changes are a check |
| `stock_reservation` | Demand, product, batch, warehouse, reserved, packed, dispatched, closed at | Never negative; dispatched never above packed, packed never above reserved. Written only by the ledger trigger |
| `stock_pick` | Per pick task: reservation, spot, quantity, packed | A plan, not stock; read by pick lists and count allowances |
| `stock_command` | Command key, kind, answer, sequence | Unique per company and key |
| `marketplace_stock_reading` | Product, account, the marketplace's figure for its own warehouse, read at | Never in the ledger |

The order line's link and component fields are on the order line table (ADR-007). The date kind and `min_days_to_sell` are on the product (ADR-003). Days to check-in is on the Amazon account (ADR-004.2).

**Rules, each with a test:**

| Rule | Where it is enforced |
| --- | --- |
| No number on a balance is negative; reserved plus held never exceeds on hand | Check constraints on `stock_balance` and `stock_position` |
| The ledger is never updated or deleted by the running system | Runtime role has no update, delete or truncate (ADR-001) |
| Balances, positions and reservations change only through a ledger entry | The trigger; the runtime role has no write right on them; a test tries each |
| An entry's numbers fit its kind | A check on `stock_ledger`; a test per kind |
| Every balance equals its entries; reserved equals open reservations | The nightly check, and the same check after every test |
| Two orders for the last unit reserve it exactly once | Concurrency test on real Postgres |
| The same command twice moves stock once | Unique key in `stock_command`, and a test per command |
| No entry against a bundle; none without a required date or lot | The command, before the write |
| Expired, short-dated, blocked and damaged units are never reserved; a use-by batch never leaves on or after its date | The batch choice, packing and dispatch, and a test per case and route |
| A marketplace warehouse shipment takes only batches with more than 90 days at check-in | The batch choice; a test |
| A bundle reserves and ships whole sets | The command; a test |
| A shipment deducts only what was packed for it, and carries every unit still to ship | The command; a test with a short order and a shipment of several boxes |
| A move between spots never changes a reservation | The schema (reservations have no spot); the receiving example as a test |
| A count during picking never writes off units in the allowance, and never creates stock | The command; a test with an order picking during the count |
| At most 1 % of lines end "batch assumed" on a simulated day | A test on the simulated reference seller |
| A link change never changes an open line's reservation | The command; ADR-005's test |
| A stock command's first statement takes the company's lock | A test that inspects every command |

## Consequences

**What this gives us**

- One record explains every unit: where it came from, where it went, who moved it and why. A recall is one search by lot, bundles and marketplace warehouses included, and the lot recorded is the lot that left.
- Channels only ever see sellable stock, and the database makes it impossible to promise a unit twice, to count one that is not there, or to change a balance without an entry.
- Repeated notices, repeated reads and repeated taps are harmless.
- Counts happen while picking goes on, and a real loss leaves sale the moment it is counted.
- Orders that arrive before their listing is linked are not lost: the link reserves for them, and says so first.
- Expired and nearly expired stock leaves sale on its own, use-by food never ships past its date, and Amazon gets only stock it will accept.
- A shortfall is always visible, either as a short order line or as a counted loss, never as a quiet zero.
- The nightly check catches drift within a day, and archiving does not break it.

**What it costs**

- Every stock change holds the company's lock, so one company's stock writes are serial. Transactions must stay short, and large counts are split.
- Earliest-first is the plan and a daily report, not a lock: the floor may take another eligible batch.
- A reservation promises a batch, not a shelf; the pick task chooses the shelf when picking starts.
- Counts are exact only outside the minutes an order is being picked from that spot; inside them, a small difference waits for packing.
- Some lines ship "batch assumed", and a recall lists them apart.
- Stock logic lives partly in a database trigger, which must behave the same on both database drivers.
- A seller who ships an order from outside the warehouse, but outside Vervoro, must reverse the deduction by hand.
- Reservation rows, pick tasks, reasons and keys for every command are more tables and more writes than one stock number per product.
- The date pass and lot blocks move unpacked reservations between batches, so a pick list can change after it was printed; packing checks every unit.
- Stock held by a marketplace is a reading, not a ledger, so Vervoro cannot prove it the way it proves its own.
- Short lines refill by deadline, not by who ordered first.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A stock counter per product, without a ledger | A counter cannot explain itself; drift is found at year end, not the next morning |
| Incoming as one of the four numbers | A purchase order is a promise; once it sits next to stock, someone sends it to a channel |
| Allow negative stock and fix it later, or a bounded overdraft at pick | One channel sells stock that does not exist, and the real loss hides until a count. A misplaced unit is a move from where its batch is booked, with no negative balance |
| Clamp to zero when a change would go negative | Hides a real problem; the change is refused and flagged instead |
| Reserve at payment, picking or label time instead of import | The gap between order and reservation is exactly when another channel oversells |
| Reserve without naming a batch (the product in a warehouse, batch fixed at pick) | Marketplace warehouse and Vendor demands need a batch anyway, so there would be two shapes of reservation; the database could only check reserved against all units, expired and blocked included; cancellations could not release what was held |
| A reservation that names its spot | Put-away of stock reserved on receipt leaves the reserved units in an empty spot, which the database refuses; every move would have to carry reservations |
| Record every pick as a move at the shelf | Needs the phone to reach the server at every shelf, in chillers and back rooms; packing is already a server step and records what left. Kept for when the phone can queue picks offline |
| Keep counts waiting until every open order of a batch has shipped | Counting the best-selling products would wait all day, and a real loss would stay on sale |
| A count shortfall that waits for a manager before leaving sale | A counted loss stays on every channel for hours |
| Receipts that wait for a manager outside the ledger | The units on the shelf are counted twice: once by a count, once on acceptance |
| Double entry, with an account per order line | "Dispatched never above reserved" already makes a double deduction impossible at write time |
| Quarantined, damaged and packed as spots instead of numbers | Fewer columns, but held would depend on spot kinds and a count of a returns bench would mix states; the stored numbers are proved by the same check |
| A reservation without `reserved` and `released` ledger entries | A reservation left open on a cancelled line would agree with its own row, and no check could find it |
| A date pass at each batch's own cut-off moment | The sell-by rule works in whole days; one pass a night is enough |
| Reserve what each bundle component has | A half-reserved gift set holds units a single-item buyer could have had, and invites a packer to send half a set |
| Short lines filled oldest order first | An Amazon order due today waits while an unpaid order takes the stock |
| Earliest sell-by first for a marketplace warehouse shipment | Amazon refuses food with 90 days or less at check-in |
| Optimistic retries at the strictest isolation level | Retries through a transaction pooler are hard to reason about; one lock is simpler and proved by test |
| A lock per product, or per group of products | A bundle spans products, so commands would need ordered locks and deadlock handling; one company's writes are a small load. Kept for later if lock wait is measured to be a problem |
| Release a line's reservation when its listing is unlinked or relinked | Units promised to a buyer would be offered again; open lines keep what they reserved (ADR-005) |
| Release reservations when a marketplace says "shipped" and Vervoro has no shipment | If the parcel left the warehouse, those units would be offered again and oversold |
| A separate reservation scheme for marketplace warehouse shipments and Vendor orders | Two copies drift and strand stock; one reservation serves every demand |
| An order for each shipment to a marketplace's warehouse | An order in the list invites a second deduction later |
| Return units into a new batch | Loses the date and the lot; refilling the batch they left keeps both |
| Repair a balance by writing it directly | The ledger is the truth; a balance is rebuilt from it and the repair is recorded |

## What later records decide

- **ADR-007: Order ingestion:** importing an order once per marketplace order, its statuses and holds, the ship-by time, cancellation requests, manual and business orders, fulfilment that becomes known later, and the conflict for a seller-shipped line on a marketplace-shipped link.
- **ADR-008: Inventory sync:** the figure each linked listing gets from sellable, buffers and the low-stock policy, which warehouses serve which account, held raises, and how each new figure is sent.
- **Purchasing** (a later record): suppliers and their codes, drafting, approving and sending purchase orders, reorder suggestions, and sharing landed cost across batches.
- **ADR-004.4: Amazon Vendor connector** (planned): when a Vendor purchase order line is confirmed and so reserves, its shelf-life minimum, and when its shipment deducts.
- **Later, when measured or needed:** recording every pick as a move (once the phone can queue picks offline); planned counts assigned to people; changing an order's warehouse after import; a quick count when a pick empties a spot (once shadow shows how often stock is found near zero); a lock per product group (if lock wait is measured to be a problem).
