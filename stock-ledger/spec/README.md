# ADR-006 SPEC: Stock ledger and reservations

| | |
| --- | --- |
| **Decision** | [ADR-006: Stock ledger and reservations](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-006-stock-ledger-and-reservations) |
| **Date** | 21 October 2026; amended by owner rulings of 25 October 2026: a Warehouse user's receipt quarantined only when unusual (8.4), the batch-assumed target for use-by and business-buyer lines (18); amended by owner rulings of 27 October 2026 (ADR-015): the `delivery` reason and the daily-list sentence dropped (8.4), the batch's supplier id and name (1, 15), incoming from purchase orders as a slot (3.2), the purchase order trigger (0, 8.5); amended by the owner's sign-off of 25 October 2026 (the developer's review): checkpoints *Later* (0), each account's warehouse (1), transfers and transit (1.2, 2.3, 5.1, 13), `sequence` and `line` (2.2), the relabel (2.3), sellable never clamped (3), the date pass's triggers (4.6), pinning an expired best-before batch (5.2.4), short lines' queue facts (5.3), attaching a line shipped outside (6.7), the marketplace's reading (6.9), callers (7), the lot task (7.5), the daily list (8.4), the ledger number (12.1), command timing (12.3), the note's bundles (13.1), the nightly check (14), roles (16), tests (18); amended by owner rulings of 29 October 2026: a Warehouse user may use any receipt reason (8.4), command keys kept 30 days (12.4), a quiet night skips the check but not the monthly sum (14, 18); SPEC batch of 29 October 2026 (owner approval): the `inventory_` prefix (15), a block whatever the manager's scope (4.5), what moves a sell-by date (4.6), transit balances (1.2), running totals, moves in one statement, reasons and write-offs (2), set-aside units' way back (3.1), a reason in the person's words (9.8), the refusal's names (11.2), the lock wait's log line (12.3), keys' edges (12.4), the note's and figure's sequence (13), repeatable read (14), scope of reads and Settings › Warehouses (16), receipts held per line, the waiting list and count, the first receipt, costs in another currency (8.4), dispatched before packing (11.1) |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-006 from: the Inventory module. Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/). Picking, packing, shipments, put-back and returns inspection are the Fulfilment module's ([ADR-014 SPEC](../../fulfilment/spec/)); this page defines the Inventory ports they call.

## 0. At launch and later

Everything below is built at launch except these parts, which keep their rules here and are built only when their trigger arrives.

| Later part | Trigger | Rules |
| --- | --- | --- |
| Shipments into a marketplace's warehouse (a reservation that needs more than 90 days at check-in, handover as `transferred_out`) | FBA shipments get their record ([ADR-000 SPEC 4.7](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)) | [5.1](#51-demands), [5.2](#52-which-batch-a-demand-takes) |
| Amazon Vendor purchase order lines as a demand | The Vendor connector (ADR-004.4, not written) | [5.1](#51-demands) |
| Receipts against a purchase order | Purchasing step 2 is built ([ADR-015 SPEC 12](../../purchasing/spec/#12-step-2-purchase-orders-outline), ROADMAP 5.5.1) | [8](#8-receiving) |
| Serial numbers | ADR-003's serial tracking is built; the stock side goes to [ADR-014](../../fulfilment/) | None here |
| A lock finer than the company's | Measured lock wait passes its threshold ([12](#12-the-lock-keys-and-the-sequence)) | A new record |
| Checkpoints (`opening_balance`) and reading archived months in a lot trace | The archiver ([ADR-002](../../data-retention/spec/#0-at-launch-and-later)) | [10.1](#10-lot-trace-and-recalls), [14](#14-the-nightly-check-and-checkpoints) |

## 1. Where stock is counted

| Thing | Rules |
| --- | --- |
| **Warehouse** | A site the seller ships from. Each channel account names a default warehouse, kept by Channels ([ADR-004](../../channel-connectors/)), which hands it to Orders with each order. An order is reserved and shipped from one warehouse |
| **Spot** | A place in a warehouse. Every unit on hand is in exactly one spot. Each warehouse has a default spot, so a seller who does not track shelves never names one. Kinds: `storage`, `packing`, `transit`; the system makes the packing and transit spots |
| **Batch** | Stock of one product received together: lot, date and its kind, supplier (a plain id and a copy of the name, [ADR-015 SPEC 1.4](../../purchasing/spec/#1-what-purchasing-is)), units per box on that delivery, landed unit cost. Two deliveries of one lot are two batches. A batch is never split; moving part of it moves units between spots |
| **Spot balance** | Per product, batch and spot: on hand, quarantined, damaged, and the last ledger sequence |
| **Batch position** | Per product, batch and warehouse: the sums of its spot balances, plus reserved |

1. **Reserved lives on the batch position, never on a spot,** so a move between spots never touches a reservation.
2. **A transit spot** belongs to the destination warehouse of a transfer. Its balances form that warehouse's in-transit positions, which hold no reservation and count in no warehouse's on hand, reserved or sellable; their units show as incoming at the destination. A transit spot's balances add to no batch position.
3. **A bundle has no balance.** An entry against a bundle is refused ([ADR-003 SPEC 6.3](../../product-model/spec/#63-bundle)).

## 2. The ledger

`inventory_ledger` is a tenant table ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)), append-only (the runtime role cannot update, delete or truncate it) and partitioned by month.

1. **Only the ledger insert changes a balance.** A trigger, defined by Inventory's migration, applies each entry to its spot balance, its batch position and, for `reserved`, `released` and `dispatched`, its reservation row, and stores the running totals on the entry. The runtime role can read balances, positions and reservations but never write them. The trigger is not module SQL ([ADR-001 SPEC 6](../../database-architecture/spec/#6-guard-rails)); every other Inventory query goes through the typed query builder.
2. **An entry holds:** `sequence` and `line` (gapless per company, section 12), `occurred_at` (database time), `product_id`, `batch_id`, `warehouse_id`, `spot_id` (empty when only reserved changes), `kind`, the change to `on_hand`, `reserved`, `quarantined` and `damaged`, `demand` (what it was for), `source` (where it came from), `actor` (a person or a named process), `note` (required where the kind says so) and `command_key`. `sequence` is the transaction's ledger number (section 12.5); `line` numbers its entries from 1. `running_*` is the spot balance after the entry (an entry with no spot carries its batch position's); `running_reserved` is the position's.
3. **Each kind's allowed changes are a check on the row;** an entry whose numbers do not fit its kind is refused.

| Kind | What changes |
| --- | --- |
| `received` | On hand up; quarantined up too for a receipt waiting for a manager. Also into a transit spot when a transfer is sent, in the same batch, skipping section 8.2's receipt checks |
| `reserved` / `released` | Reserved up / down |
| `dispatched` | On hand and reserved down together |
| `returned` | On hand and quarantined up together |
| `inspected` | Quarantined down; or quarantined down and damaged up |
| `quarantined` | Quarantined up, or down when a recount finds the units; setting aside may carry a reason |
| `marked_damaged` / `restored` | Damaged up / down (marking damaged may carry a reason; a restore needs one) |
| `written_off` | On hand down, with quarantined or damaged down, or neither for an expired or blocked batch or from a transit spot (reason "lost in transit"); a reason is required, such as "returned to supplier" for a refused receipt (section 8.4). The row check allows neither quarantined nor damaged down; the command refuses it unless the batch is expired or blocked or the spot is transit |
| `counted` | On hand up (an approved surplus) |
| `adjusted` | On hand up or down; a reason is required |
| `transferred` | On hand down in one spot and up in another of the same warehouse, same batch, including from a transit spot to storage when a transfer is received; the lines of one move are written in one statement |
| `transferred_out` | On hand and reserved down together (*Later*, section 0) |
| `repacked` | On hand down for inputs, up for a new batch of the output |
| `relabelled` | On hand down for a batch of a product, up for a new batch of its copy with the same lot, date, supplier and landed cost; a manager, only between a product and its copy ([ADR-003 SPEC 3.5](../../product-model/spec/#3-sku)) |
| `opening_balance` | Every number, to its total at a checkpoint (section 14) |

4. **A bundle's components** use ordinary entries whose `demand` names the bundle's order line, so a lot trace finds gift sets.
5. **Not an entry:** printing a label or pick list, starting to pick, holding an order, telling a marketplace an order shipped.

## 3. The four numbers

| Number | Definition |
| --- | --- |
| **On hand** | Units physically in the warehouse, in any state. Transit spots count in no warehouse |
| **Reserved** | The sum of the batch position's open reservations |
| **Held** | quarantined + damaged + (if the batch is expired, short-dated or blocked: on hand − reserved − quarantined − damaged; otherwise 0) |
| **Sellable** | On hand − reserved − held, never below zero by the checks of section 11; nothing clamps it. Only sellable reaches Stock sync |

1. **Quarantined** units wait for a decision: an uninspected return, a receipt waiting for a manager, a counted shortfall, units set aside. Set-aside units go back on sale (`inspected`) or are marked damaged or written off, except a held receipt's, which leave only by the manager's decision on it (section 8.4). **Damaged** units are never sellable or reserved; they leave by write-off or come back by a recorded restore.
2. **Incoming** (open purchase order quantity not yet received, units in transit) is shown beside the four numbers, never added to sellable, never sent. Inventory stores and reads no purchase order: it keeps a slot on the product and stock screens that Purchasing fills with the purchase order part ([ADR-015 SPEC 10.4](../../purchasing/spec/#10-ports-events-and-tables)); units in transit are Inventory's own.
3. A product's numbers in a warehouse are the sums of its batch positions. A bundle has only a sellable figure, worked out from its components ([ADR-003 SPEC 6.3](../../product-model/spec/#63-bundle)).

## 4. Dates, blocks and the date pass

1. **A dated product's date is use-by or best-before** (default best-before), on the product ([ADR-003 SPEC 12](../../product-model/spec/#12-best-before-lot-and-serial-numbers)).
2. **Sell-by.** A batch with date D is sellable while D − today (company time zone) ≥ `min_days_to_sell`. Below that but not past D it is **short-dated**; past D it is **expired**. Both are held.
3. **Best-before:** a blank `min_days_to_sell` counts as 0. A manager may send units of an expired best-before batch on a manual order with a reason; they never reach a listing.
4. **Use-by:** `min_days_to_sell` is required and at least 1 + the company's delivery days (setting, default 1). A use-by batch is never reserved, packed or dispatched on or after its date, by any route, with no override, and never sold off by hand. An undated batch of a use-by product (stock on hand when use-by was switched on, [ADR-003 SPEC 12.5](../../product-model/spec/#12-best-before-lot-and-serial-numbers)) counts as past its date until its date is entered.
5. **Blocking a lot** (a manager) holds every batch of that lot in every warehouse at once, whatever the manager's warehouse scope (a recall is company-wide; owner ruling, 28 October 2026); unblocking frees them.
6. **The date pass** runs just after midnight in the company's time zone, and whenever `min_days_to_sell`, the date kind or whether the product tracks dates change, and when the company's delivery days change; a change of time zone is taken at the next pass. In one locked transaction per company, it moves each unpacked reservation off a batch that crossed its sell-by date to the next qualifying batch (section 5.2); a line with nowhere to go becomes short. A block does the same at once.
7. **Already packed units** stay on their parcel when the batch only became short-dated or expired at best-before. Units of a blocked lot, or of a use-by batch on or after its date, are refused at dispatch.

## 5. Reservations

### 5.1 Demands

One reservation shape serves every demand.

| Demand | Reserves | Shelf life it needs | Deducts |
| --- | --- | --- | --- |
| Marketplace or website order line | On import, or when its listing is linked | The product's sell-by rule | On a confirmed shipment |
| Manual or business order line | When the order is confirmed ([ADR-007](../../order-ingestion/spec/#18-manual-orders)) | The product's sell-by rule | On a confirmed shipment |
| Transfer between warehouses | When confirmed, at the source | The product's sell-by rule | When sent: packed to the source's packing spot and `dispatched` there, with `received` into the destination's transit spot in the same transaction (section 1.2) |
| *Later:* shipment into a marketplace's warehouse | When ready to pack | More than 90 days left at the expected check-in: at least 90 + the account's days to check-in (default 14) on the day it reserves | At handover, as `transferred_out`, once per shipment; never an order |
| *Later:* Amazon Vendor purchase order line | When the seller confirms the line | The purchase order's minimum (ADR-004.4) | When its shipment is confirmed |

### 5.2 Which batch a demand takes

1. **Sellable units only, in the demand's warehouse,** from batches that meet the demand's shelf life.
2. **Earliest sell-by date first,** then earliest received. Expired, short-dated and blocked batches are skipped. Undated batches come after dated ones, by received date.
3. **No spot is chosen;** picking chooses spots ([ADR-014 SPEC 2](../../fulfilment/spec/#2-picking)).
4. **A manager can pin another batch** that is sellable and meets the need: a `released` and a `reserved` entry with name and reason. On a manual order line a manager may also pin an expired best-before batch, with a reason (section 4.3); the date pass leaves that reservation where it is.

### 5.3 Reserving an order line

Orders calls Inventory's reserve port inside its import transaction ([ADR-007](../../order-ingestion/spec/#8-reserving-on-import)), after the company's lock:

1. The line's link version, valid when the buyer bought, gives product, units per sale and fulfilment ([ADR-005](../../catalogue-sync/)). The line stores it.
2. **Target, not delta:** what the line still needs is (quantity − cancelled − dispatched − shipped outside) × units per sale, per component for a bundle. Only the difference from what it holds is reserved or released, so one read with a cancellation and an edit never releases twice.
3. **A shortage reserves what exists** and records the rest as missing. Vervoro never cancels the order; that is the seller's choice.
4. **Short lines fill when units arrive** (receipt, restock, accepted receipt, count surplus), in the same transaction, in that warehouse: earliest ship-by time first ([ADR-007](../../order-ingestion/spec/#20-deadlines-and-the-handover)); orders held for payment or with a cancellation requested last; oldest purchase breaks a tie.
5. **A smaller quantity releases** latest sell-by first and unpacked units first; a larger one reserves more by 5.2.
6. **A line's reservation never changes because a link changed** ([ADR-005](../../catalogue-sync/)). It changes only when a manager resolves the line again, pins a batch, the floor packs another eligible batch, or a date pass, block or count moves it.
7. **Resolving again** (a manager, for a line reserved under a wrong link) releases and reserves under the current link in one transaction. A line with units packed or dispatched cannot be resolved again.

The order line's `link_id`, `product_id`, `units_per_sale`, `fulfilled_by` and `components` are Orders' fields ([ADR-007](../../order-ingestion/spec/#5-the-order-and-its-lines)). Inventory keeps each demand's need, what it is missing, and its place in the queue (ship-by, held, purchased at), which Orders passes with every reserve call and whenever they change, a person's hold included ([ADR-007 SPEC 11](../../order-ingestion/spec/#11-holds)); Orders reads `missing` through Inventory's port and hears an event when a receipt, date pass, block or count changes it (Inventory needs only Products, so it never asks Orders). `inventory_reservation` holds demand, product, batch, warehouse, reserved, packed, dispatched and closed at.

## 6. What a line reserves

1. **A pack reserves its own stock,** never singles. When singles could make a missing pack, the screen offers a repack job; Vervoro never repacks on its own.
2. **Units per sale multiply:** six loose jars per sale, ordered twice, reserve 12 jars.
3. **A bundle reserves its components in whole sets:** the most whole sets every component can cover, with the rest missing on every component alike. It ships whole sets only. The line records each component and quantity per bundle it used; a later bundle edit does not change it.
4. **Repack and assembly** use free units only. A repack takes one number (packs opened or made), so base units never change. An assembly (a manager) states every input and the output quantity, and the output batch records every input lot.
5. **A line for an unlinked listing reserves nothing.** It is a **waiting line** while its order is open, not cancelled and seller-shipped (or of unknown fulfilment). Orders hears Listings' link event and, right after the link commits, reserves every waiting line of that listing in one transaction, oldest order first, each recording the new link version. ADR-005's link screen says beforehand how many will be reserved and how many will be short. A bulk link's chunks each reserve their own waiting lines. A line bought before the link began but imported after it reserves at import under the current link.
6. **A closed link** leaves open lines as they are; dispatch deducts the product they reserved. A person who wants the units back cancels the order or resolves the line again.
7. **A waiting line already shipped outside Vervoro** reserves nothing. Attaching it to a product reserves, packs and dispatches in one transaction, source "attached after shipping", marked "batch assumed": from free units of eligible batches first, earliest sell-by first (never a use-by batch on or after its date, section 4.4); beyond them, unpacked reservations give way, newest order first (as in section 9.4); units still not found are not deducted, and the product goes on the count list.
8. **A marketplace-shipped line reserves nothing.** A line whose fulfilment is unknown reserves as if the seller ships it, and releases when the marketplace confirms it ships the line. A seller-shipped line on a listing linked as marketplace-shipped reserves and opens a conflict ([ADR-005](../../catalogue-sync/)).
9. **Stock the marketplace holds is a reading,** not a ledger: kept by Channels per product and account, read by ADR-004.2, shown beside the four numbers through a slot on the product's stock screen and never added to them.

## 7. Ports Fulfilment and Orders call

Each port is a command under the company's lock with its key (section 12). The floor rules around them are [ADR-014](../../fulfilment/). Orders calls the reserve port (on import, link, attach, resolving again and a pin: 5.2.4, 5.3, 6.5, 6.7), release (7.6), shipped outside (7.5) and, for a counter sale, dispatch without packing (7.4). Fulfilment calls claim, pack, put back, dispatch, not found, found and the return ports (7.1–7.4, 7.7–7.10).

1. **Claim spots for a pick.** Records, per reservation, the spot and quantity a pick task will take, with no ledger entry. Counts read these claims as their allowance (section 9).
2. **Pack.** For each unit, the batch that left: moves it, still reserved, to the warehouse's packing spot (`transferred`, source "packing"). Another eligible batch than planned (in date, not blocked, meeting the demand's need) moves the reservation with it; if that batch has no free units, the reservation is exchanged with the newest unpacked reservation of the same batch on another line. With nothing to exchange, the line keeps its reserved batch, marked "batch assumed", with any lot the packer tapped.
3. **Put back.** Moves packed units back to a storage spot, or leaves them in the packing spot for put-away.
4. **Dispatch.** Writes `dispatched` for each packed reservation the shipment uses (on hand in the packing spot and reserved down together), marks them dispatched, and records each line's lots. A reservation can never dispatch more than it packed, nor pack more than it reserved. An order dispatched without packing in Vervoro is packed by the dispatch itself: one eligible batch is implied, otherwise the reserved batch, marked "batch assumed".
5. **Shipped outside Vervoro.** When the marketplace reports a line shipped with no shipment in Vervoro, except a label bought on the marketplace ([ADR-007 SPEC 17.8](../../order-ingestion/spec/#17-shipped-outside-vervoro)), Orders calls dispatch with source "marketplace said shipped": packed units first, unpacked marked "batch assumed"; in shadow, marked "lot not traced". When it had to choose between eligible batches of a use-by product, or for a business buyer's line, a task asks the warehouse to tap the lot; it never blocks. Inventory marks the entry "lot to confirm", and Fulfilment lists those entries; in shadow no task is raised and the entry stays "lot not traced". Any other line stays "batch assumed" ([ADR-014 SPEC 3](../../fulfilment/spec/#3-packing), owner ruling, 25 October 2026). A manager reverses a wrong one with `adjusted` and a reason.
6. **Release.** A confirmed cancellation releases exactly what each line held, batch by batch. A request releases nothing ([ADR-007](../../order-ingestion/spec/#12-cancellations-and-refunds)). After dispatch, a cancellation moves nothing.
7. **Quarantine at a pick ("not found").** Quarantines the unit with that reason, moves the reservation to another qualifying batch or leaves the line short, and puts the spot on the count list.
8. **A unit picked where the books do not show it** is a move from the spot where the books hold that batch, and both spots go on the count list. Only when no spot holds that batch is it **found**: received with reason "found at pick" and packed in one transaction, listed for a manager.
9. **Receive a return.** Into one of the batches the line dispatched (the lot scanned, or else the earliest-dated), as `returned`: held until inspected. At most what the line dispatched, less earlier returns. A bundle returns by component. A unit with no dispatch record goes into a new batch with a reason; a dated product asks for its date.
10. **Inspect.** Restock (`inspected`, then a move to storage; a use-by unit only with a manager's reason), keep as damaged, or write off with a reason.

## 8. Receiving

1. **A confirmed receipt line,** in one locked transaction, creates a batch (lot, date, supplier id and name, units per box, provisional landed cost), writes `received` into the chosen spot or the default spot, and fills short lines in that warehouse.
2. **Checks:** a product that tracks dates or lots refuses a receipt without them; fewer days left than `min_days_on_receipt` is received quarantined ("short-dated receipt") until a manager accepts or refuses it; a box barcode adds its units ([ADR-003 SPEC 7](../../product-model/spec/#7-box-and-pallet-sizes)); warehouse users never see costs.
3. **Put-away is a move** (`transferred` between spots). Nobody confirms put-away before stock goes on sale.
4. **Without a purchase order:** a manager receives directly, with a reason from a short list (delivery, supplier extra, sample, opening stock, found, other with a note), sellable at once. `delivery` ("Delivery, no purchase order") is the ordinary receipt of a seller who buys by phone or message and uses no purchase order ([ADR-015 SPEC 1.3](../../purchasing/spec/#1-what-purchasing-is)); it is open to every role that may receive. A Warehouse user may use any reason on the list (owner ruling, 29 October 2026); only the usual-size check below applies to them, so an unusual line is quarantined until a manager accepts it. Opening stock in bulk (a spreadsheet of SKU, warehouse, quantity, lot, date and optional unit cost, previewed and written as one receipt per line, in the pattern of [ADR-003 SPEC 14](../../product-model/spec/#14-spreadsheet-import-and-bulk-edit)) is Inventory's to build. A Warehouse user's receipt is sellable at once unless it looks unusual: more units than 3 times the product's largest earlier receipt in that warehouse that a manager made or accepted, or, for its first receipt there (no receipt there that a manager made or accepted), more than the company's first-receipt limit (a setting, default 100 units). The check is per receipt line, and a held line is decided once. An unusual receipt enters quarantined until a manager accepts it (owner ruling, 25 October 2026, replacing the ruling of 21 October 2026 that quarantined every one). A manager accepts (`inspected`) or refuses (write-off or return to supplier). Cost may be blank; reports then use the product's standard cost and say so; a batch cost or standard cost in a currency other than the company's counts as no cost. Each such receipt is in the activity view and in the stock movements report, with its reason. The list of receipts waiting for a manager shows each held line's reason with its numbers, and Today's widget and the Stock banner count receipts with a held line.
5. *Later (Purchasing, [ADR-015 SPEC 12](../../purchasing/spec/#12-step-2-purchase-orders-outline)):* **against a purchase order,** each delivery is its own batch; fewer than ordered leave the rest incoming until a manager closes the line; more are received as counted and the surplus is shown for a manager. A receipt made without one can be attached to its line later; stock does not move again.
6. **Cost is not stock.** Changing a landed cost never touches quantities or the ledger.

## 9. Counts and adjustments

1. **Blind.** The counter never sees the expected figure. Home lists the spots counted least recently.
2. **Against the saved moment.** Each figure stores the ledger sequence when it was saved; the expected figure is the spot's on hand at that sequence.
3. **The allowance** is the units open pick claims take from that spot for orders not yet packed (section 7.1). A figure between books − allowance and books records nothing, and the spot is checked again once those orders are packed; a re-check unsettled after 24 hours is listed on Home. The allowance never creates stock.
4. **A shortfall beyond the allowance is quarantined at once** ("counted short"). It comes from free units first; when it reaches reserved units, unpacked order reservations give way, newest order first, moving to another qualifying batch or leaving the line short. Approval writes them off; a recount that finds them releases them.
5. **A surplus** goes to the counted batch, or the spot's latest batch, as `counted` on approval. A unit the books hold in another spot of the same batch is a move, not a surplus.
6. **All or none:** approval writes every entry in one transaction; approving again returns the first answer. A count holds at most 2,000 lines.
7. **Orders dispatched without packing in Vervoro:** their reserved units in the spot count in the allowance while the order is picking or packed; a shortfall reaching them waits for a recount after dispatch or a manager who confirms the units are gone.
8. **Adjustments** (a manager, a reason in the person's words, one spot balance) never take a batch below its reserved plus held, and never take units from a reservation; a real loss there is a count.

## 10. Lot trace and recalls

1. **One search by lot** returns every demand that received a batch of that lot (bundles included), the lines that may have received it (apart: every line of that product marked "batch assumed" or "lot not traced" in a warehouse that held a batch of that lot when the line was packed or dispatched, whichever batch it records), the stock of that lot on hand per warehouse, and archived months read from the archive ([ADR-002 SPEC 5](../../data-retention/spec/#5-reading-archived-data)). Entries marked "lot not traced" are listed as unknown.
2. **The recall list** joins those demands with order details; it is a Fulfilment screen ([ADR-014 SPEC 7](../../fulfilment/spec/#7-the-recall-list)). A manager blocks the lot from it at once.
3. Procedure: [Run a recall](../../runbooks/run-a-recall/).

## 11. Negative stock

1. **Database checks.** Spot balance: on hand ≥ 0, quarantined ≥ 0, damaged ≥ 0, quarantined + damaged ≤ on hand. Batch position: reserved ≥ 0, reserved + quarantined + damaged ≤ on hand. Reservation: packed ≤ reserved, dispatched ≤ packed (until packing is built, a reservation's dispatched is not checked against packed).
2. A command plans its change; the checks are the last line. A breach fails the transaction and returns a typed refusal ("would go negative") naming product, batch and spot; when the database check itself refused, the plan's entry that lowered that number names them (row-level security hides the check's own detail). Nothing is clamped. A refusal means a bug and alerts the operator ([runbook](../../runbooks/a-stock-change-refused-as-negative/)).
3. Fewer units than the books say is a count; a unit where the books have none is a move or a find (section 7.8).

## 12. The lock, keys and the sequence

1. **The company's lock is the first statement** of every stock command: the update of the company's stock counter row, which locks it ([ADR-001 SPEC 2](../../database-architecture/spec/#2-keys-and-identifiers)). Held until commit. The first entry of the transaction takes the next ledger number from that row, so a transaction that writes no entry spends none; a command that needs a sequence without writing (a count figure, 9.2; Orders' outbox note; a recompute) reads the last number taken.
2. **Short transactions:** about eight round trips for an order import, counted by a test. Statements work on sets of rows, so a 2,000-line count or a 500-link chunk takes a few round trips. No outside call runs inside a stock transaction ([ADR-000 SPEC 10](../../system-architecture/spec/#10-runtime)).
3. **Revisit thresholds.** Every stock command records its time and its lock wait in the logs or statement statistics, never in a row written inside the stock transaction. The lock wait is logged per command as `{at: company-lock, module, waitMs}`. The decision is revisited by a new record when, for the busiest company, either the p95 command time or the p95 share spent waiting passes its threshold for 7 days running. Both numbers come from the load test before launch. *Proposed, until the load test:* a p95 command time of 250 ms, and a p95 share spent waiting of 25 %.
4. **Keys.** `inventory_command` holds each key with its answer and ledger sequence, unique per company and key; a repeat finds it under the lock and returns the answer. A key stored by another command is a defect; a refused command keeps no key. Keys are kept 30 days, as operational state ([ADR-002 SPEC 2](../../data-retention/spec/#2-the-retention-schedule)), then deleted by the date pass; the jobs' own rows are kept (owner ruling, 29 October 2026).

| Command | Key |
| --- | --- |
| Import an order | No key in `inventory_command`: an order changes over time, so the import is safe to repeat by its targets under the lock. The same state moves nothing, a newer one moves only the difference, an older one is ignored ([ADR-007 SPEC 3](../../order-ingestion/spec/#3-one-order-per-marketplace-order)) |
| Pack, confirm a shipment | The packing id, the shipment id |
| Receive | The receipt line id |
| Save a count figure, approve a count | The count line, the count id |
| Receive or inspect a return | The return line and the receipt or inspection id |
| Any person's action | A key the client makes for the tap, kept across retries |

5. **The ledger sequence** is gapless and in commit order. Stock sync records the sequence each figure came from (section 13).

## 13. Telling Stock sync

Inventory never writes a listing's figure. The rule is [ADR-008 SPEC 1](../../inventory-sync/spec/#1-the-figure-per-listing) (owner ruling, 21 October 2026, [ADR-000 SPEC 4.6](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)).

1. **Every stock command that changes sellable** writes, in its own transaction, an outbox note naming the company, the products whose sellable changed, the bundles that use them (from Products' port) and the ledger sequence: the transaction's ledger number, or the last number taken when the change wrote no entry (a block).
2. **Inventory's read port** gives Stock sync a product's sellable per warehouse with the last ledger sequence that changed that product.

| Change | Sellable | Note |
| --- | --- | --- |
| Receipt into sellable stock; a quarantined receipt accepted | Up | Yes |
| Receipt received quarantined | No | No |
| Reserve, release, cancellation, short line filled | Down or up | Yes |
| Packing, put-back, a move between spots of one warehouse | No | No |
| Shipment confirmed; handover to a marketplace's warehouse | No: on hand and reserved fall together | No |
| Return received / restocked | No / up | No / yes |
| Count shortfall, approval, surplus; adjustment of free units | Down or up | Yes |
| Units damaged, quarantined, "not found", restored | Down or up | Yes |
| A batch crosses its sell-by date; a lot blocked or unblocked | Down or up | Yes |
| Transfer confirmed; sent; received | Down at the source (the reserve); no change; up at the destination | Yes; no; yes |
| Repack or assembly | Down for inputs, up for the output | Yes |

Link changes reach Stock sync from Listings, and a bundle's new components from Products, by their own events.

## 14. The nightly check and checkpoints

The sweeper runs it per company, outside the lock, on a consistent snapshot (the job's transaction runs at repeatable read; [ADR-001 SPEC 9](../../database-architecture/spec/#9-background-work-and-the-outbox)):

1. Every spot balance and batch position equals the running total on its latest entry, and each entry since the last check equals the one before it plus its change. Once a month the check adds up every balance from the latest checkpoint (from the first entry until the archiver writes one).
2. Every batch position's reserved equals its open reservations, and each reservation equals its `reserved`, `released` and `dispatched` entries.
3. The sequence has no gaps since the last check.

A night with no ledger entry since a clean check writes only its next due row; the monthly sum in 1 still runs (owner ruling, 29 October 2026).

The checks that read order lines are Orders' own nightly check ([ADR-007 SPEC 6.2](../../order-ingestion/spec/#6-statuses)), reading reservations through Inventory's port; the returns check is Fulfilment's ([ADR-014 SPEC 6](../../fulfilment/spec/#6-returns)). Inventory needs only Products, so it never reads them.

A difference in 1–3 alerts the operator and the company's managers, and Stock sync holds raises on every listing of the affected products while decreases go ([ADR-008 SPEC 7](../../inventory-sync/spec/#7-held-raises)). The operator rebuilds the balance with the rebuild command, a recorded repair that runs as a system actor ([ADR-010 SPEC 7](../../users-and-access/spec/#7-operator-access-to-a-company)), never the owner role (owner ruling, 22 October 2026). It rebuilds the balance from the ledger: [Settle a stock check difference](../../runbooks/settle-a-stock-check-difference/). The operator never writes a seller's ledger.

**Checkpoints** ([ADR-002 SPEC 3](../../data-retention/spec/#3-archiving-a-month)): before a ledger month leaves the database, the archiver writes under the lock one `opening_balance` per spot balance and batch position with entries up to then, carrying each total and the last sequence covered, and each open reservation's totals. Open reservations are never archived.

## 15. Storage

Every table is Inventory's, a tenant table with the `inventory_` prefix (a module's tables carry its id, [ADR-000 SPEC 2.1](../../system-architecture/spec/#2-tables)), declared through `tenantTable()` and queried through the typed query builder ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)). No foreign key crosses modules.

| Table | Holds |
| --- | --- |
| `inventory_warehouse`, `inventory_spot` | Warehouses with their default spot; spots and their kind |
| `inventory_batch` | Product, lot, date and kind, received at, supplier id (plain, no foreign key) and supplier name (a copy at receipt), units per box, landed unit cost and currency, blocked, input batches of an assembly |
| `inventory_balance`, `inventory_position` | Spot balances and batch positions, written only by the trigger |
| `inventory_ledger` | Every entry; append-only; by month |
| `inventory_reservation` | Written only by the trigger |
| `inventory_pick_claim` | Spot claims of open pick tasks (section 7.1); a plan, not stock |
| `inventory_command` | Keys and answers |
| `inventory_receipt`, `inventory_count`, `inventory_count_line`, `inventory_transfer` | Receipts, counts and transfers with their state |

The date kind and `min_days_to_sell` are on the product ([ADR-003](../../product-model/)). Schema changes expand, then contract ([ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying)).

## 16. Who may do what

Roles are [ADR-010's](../../users-and-access/spec/#4-who-may-do-what). A person limited to some warehouses acts only on their stock: stock reads cover the person's warehouses (none named: every warehouse they may see), and a read naming another is refused. Settings › Warehouses is shown to those who may add or change warehouses.

| Action | Warehouse | Manager, Admin, Owner |
| --- | --- | --- |
| Receive (without a purchase order: an unusual one quarantined, section 8.4), move, repack, count, mark damaged or quarantined | Yes | Yes |
| Approve a count; confirm reserved units gone | No | Yes |
| Adjust, write off, restore damaged units (reason required) | No | Yes |
| Accept or refuse a quarantined receipt; receive without a purchase order directly | No | Yes |
| Block or unblock a lot; pin a batch; resolve a line again | No | Yes |
| Assemble; send an expired best-before batch on a manual order; relabel stock to a product's copy | No | Yes |
| Send or receive a transfer between warehouses | Yes | Yes |
| Add or change warehouses and spots | No | Yes |

Floor actions (pick, pack, ship, inspect a return) are [ADR-014 SPEC 8](../../fulfilment/spec/#8-who-may-do-what).

## 17. Constraints

| Constraint | What it means here | Source |
| --- | --- | --- |
| Use-by and best-before (UK) | Selling food past use-by is an offence; past best-before it may be sold if still of good quality | [Business Companion: date and lot marking](https://www.businesscompanion.info/en/quick-guides/food-and-drink/date-and-lot-marking-of-prepacked-food) |
| Lot marking (UK) | Most prepacked food carries a lot mark; a day-and-month date can serve as one | Food (Lot Marking) Regulations 1996, same page |
| Traceability | A food business names who supplied it and whom it supplied, on demand | [Retained Regulation 178/2002, Article 18](https://www.legislation.gov.uk/eur/2002/178/article/18) |
| Amazon's warehouses (*Later*) | Food must be lot-controlled with more than 90 days of shelf life at check-in | [Amazon: expiration dates on FBA products](https://sellercentral.amazon.com/gp/help/external/201003420) |

## 18. Tests that prove each rule

Database tests run on real Postgres under the runtime role ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)); batch choice and the four numbers are also pure unit tests.

| Test | Proves |
| --- | --- |
| Checks | No balance number goes negative; reserved + held never exceeds on hand; a breach returns "would go negative" and writes nothing |
| Append-only | The runtime role cannot update, delete or truncate the ledger, nor write balances, positions or reservations |
| Kinds | An entry whose numbers do not fit its kind is refused, one case per kind |
| Nightly check | Holds after every test; a hand-broken balance, entry or gap is found (by the next night with an entry, or by the monthly sum); a transaction with no entry leaves no gap |
| Last unit | Two orders for the last unit, concurrently on real Postgres: exactly one reserves it |
| Repeats | The same command twice moves stock once, one test per command; the same order state imported twice moves nothing the second time, and a newer state with a smaller quantity releases the difference |
| Batch choice | Earliest sell-by first; expired, short-dated, blocked and damaged units never reserved; use-by never leaves on or after its date, by every route; an undated use-by batch never leaves until dated |
| Shortage | A short line reserves what exists; a receipt fills short lines by ship-by time |
| Bundles | Whole sets only; a component edit does not change an open line |
| Moves | A move between spots never changes a reservation |
| Counts | A count during picking writes off nothing in the allowance and never creates stock; a shortfall beyond it leaves sale at once |
| Links | A link change never changes an open line; linking reserves waiting lines oldest first after the link commits |
| Notes | Every command that changes sellable writes one outbox note with its sequence; one that does not, writes none |
| Lock | Every stock command's first statement takes the company's lock; an order import takes about eight round trips |
| Batch assumed | At most 1 % of use-by and business-buyer lines on the simulated reference seller's day ([ADR-014 SPEC 3](../../fulfilment/spec/#3-packing)); run with Fulfilment, which packs |
| Transfers | Sending and receiving a transfer keeps every check of section 11 at both warehouses and keeps the batch and lot |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Writers:** only Inventory's code inserts into `stock_*` tables; other modules call its ports (search them for `stock_`).
- [ ] **Trigger:** one trigger on the ledger writes balances, positions and reservations; the runtime role has no write grant on them.
- [ ] **No SQL:** apart from the trigger's migration, every query uses the typed query builder; no `sql` or `raw` import in the module.
- [ ] **Lock first:** each stock command opens with the counter-row update; the lock test lists every command.
- [ ] **Keys:** every command but an order import takes a key and checks `inventory_command` under the lock before planning; the import compares targets ([ADR-007 SPEC 3](../../order-ingestion/spec/#3-one-order-per-marketplace-order)).
- [ ] **No figure:** nothing in Inventory reads links or writes a listing's figure; the note carries products and the sequence only.
- [ ] **Batch choice:** one function used by import, link, date pass, pin and count moves; it filters by the demand's shelf life.
- [ ] **Use-by:** the check sits in batch choice, pack and dispatch, with no override parameter.
- [ ] **No clamp:** no `max(0, …)` or similar on a stored number; a refusal is a typed `Result`.
- [ ] **No outside call** inside a stock transaction (search the module for connector or HTTP imports).
- [ ] **Counts:** the expected figure is read at the saved sequence; the allowance reads `inventory_pick_claim`.
- [ ] **Later parts:** no `transferred_out` path, Vendor demand, purchase-order receipt or serial field at launch.
