# ADR-014 SPEC: Fulfilment

| | |
| --- | --- |
| **Decision** | [ADR-014: Fulfilment](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-014-fulfilment) |
| **Date** | 21 October 2026; amended by owner rulings of 25 October 2026: a lot tapped at packing only for use-by products and business buyers (3.2); amended by owner delegation, 3 November 2026 (phase 5.8's developer's review): Products and Access in the needs (1.1), several orders started in one tap (2.1), what the packing screen shows (3.7), own carrier per box and a manual order's shipping (4.1), dispatch without packing from an open, picking or packed order (4.5), shadow (4.9), the returns nightly check (6.5), the block through Inventory's port (7.3); the tracking number kept by Buyer data (1.2), the label scanned on the open order (4.8), ruled by delegation, 3 November 2026, for the owner's confirmation; Fulfilment's pick and pack as built (phase 5.8, PR 1): the table names (1.2), where "not found" leads (2.3), a barcode that carries a lot (3.2), the company's day (3.3), nobody says (3.4), the packing spot's count (3.5), a short line at packing (3.8), ruled by delegation, 4 November 2026, for the owner's confirmation; Fulfilment's ship as built (phase 5.8, PR 2): the shipment's lines and boxes (1.2), a line split across boxes (4.1), label-unchecked shipments listed for 3 days (4.8), ruled by delegation, 4 November 2026, for the owner's confirmation; returns and the recall list as built (phase 5.8, PR 3): receiving's lots, bundles and lines with no dispatch record (6.1), the nightly check's window (6.5), the download (7.4), ruled by delegation, 4 November 2026, for the owner's confirmation |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-014 from: the Fulfilment module. Every stock change below is a call to an Inventory port defined in [ADR-006 SPEC 7](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call), and every status change a call to Orders ([ADR-007](../../order-ingestion/spec/#1-the-module)). Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| Recording every pick as a move at the shelf | The phone can queue picks offline | [2](#2-picking) |
| Serial numbers recorded at packing and checked on return | ADR-003's serial tracking is built | [3](#3-packing), [6](#6-returns) |
| Packing and handover of a shipment into a marketplace's warehouse | FBA shipments get their record | [4](#4-shipments) |
| Packing and shipping an Amazon Vendor purchase order | The Vendor connector (ADR-004.4, not written) | [4](#4-shipments) |

## 1. The module

1. **Always on, outside the core.** Needs Orders, Inventory, Buyer data, Products (a product's facts and codes) and Access (a person's role and warehouse scope) ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules); owner delegation, 3 November 2026). The core never calls it.
2. **Its tables,** with the `fulfilment_` prefix (the module's id, [ADR-001 SPEC 5](../../database-architecture/spec/)), declared through `tenantTable()` and queried through the typed query builder: `fulfilment_pick_task`, `fulfilment_packing`, `fulfilment_shipment`, `fulfilment_put_back`, `fulfilment_return` and `fulfilment_inspection`, each with its lines as child tables, and `fulfilment_command`, the floor commands' keys. `fulfilment_shipment` holds the order, its number of boxes, method and carrier, with its lines (`fulfilment_shipment_line`: line, quantity, box) as a child table; the tracking number Vervoro is given goes to Buyer data's port ([ADR-009 SPEC 4](../../buyer-data/spec/#4-what-is-kept)) (ruled by delegation, 3 November 2026; for the owner's confirmation).
3. **One transaction per floor command.** Fulfilment writes its own row and calls Inventory's (and, for a shipment, Orders') port inside the same transaction, under the company's lock, with the command's key ([ADR-006 SPEC 12](../../stock-ledger/spec/#12-the-lock-keys-and-the-sequence)).
4. **Screens:** Orders → pick and pack, returns, and the recall list.

## 2. Picking

1. **Starting to pick** an order creates a pick task. For each reservation it asks Inventory to claim a spot: the spot of that batch with the fewest units first, less what other open pick tasks already claim from it, unless the caller names one (Inventory's claim port, [ADR-006 SPEC 7.1](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call); owner delegation, 30 October 2026). A person may start several orders in one tap; each starts as its own command, so a held order is refused alone (owner delegation, 3 November 2026).
2. **The pick list** names the batch, its lot and date, and the spot. A pick task writes no ledger entry.
3. **"Not found"** calls Inventory's quarantine port ([ADR-006 SPEC 7.7](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call)); the pick list then shows the new batch, or the line as short. The walk says where "not found" leads before the tap: the spot of the batch the reservation would move to, or the line short.
4. **A unit taken from a spot the books do not show** is reported as it is; Inventory records it as a move or a find (ADR-006 SPEC 7.8).
5. An order whose line is waiting or short does not join the pick list ([ADR-007](../../order-ingestion/spec/#10-whole-orders)).

## 3. Packing

Packing (ADR-007's "packed") is a server command, keyed by the packing id. For each unit it names the batch:

1. **One eligible batch** of the product in the spot (or the warehouse, without spots): implied.
2. **Several:** for a use-by product, or a line of an order to a business buyer, the packer taps the date or lot on the unit, or scans a barcode that carries it. A product barcode alone names no batch. A barcode carries a lot when it is a GS1 element string: with a symbology identifier (`]C1`, `]d2`, `]Q3`), a leading FNC1, bracketed AIs, or more than 14 digits opening with AI 01; a plain 8 to 14 digit number is the product's GTIN and names no batch. Any other product packs as its reserved batch, marked "batch assumed", unless a scanned barcode carries the lot (owner ruling, 25 October 2026).
3. **Another eligible batch than planned** (in date, not blocked, meeting the demand's need) is taken without a manager; Inventory moves or exchanges the reservation. Choices of a later date than planned are listed daily, by the company's day ([ADR-000 SPEC 13.2](../../system-architecture/spec/)), for a manager.
4. **Nothing to exchange, or nobody says** (the packer marks it packed without tapping): the line keeps its reserved batch, marked "batch assumed", with any lot tapped.
5. **Packed units** move, still reserved, to the packing spot. The orders with units there for more than 24 hours are counted on Home and on Today, opening their list.
6. **A use-by unit on or after its date, or of a blocked lot,** is refused at packing and swapped.
7. **What the packing screen shows.** The packing screen shows, through Buyer data's port, the order note, the gift message and customisation and, on a manual order to be delivered, the recipient's name, address and phone ([ADR-009 SPEC 4 and 7.2](../../buyer-data/spec/#4-what-is-kept)); Amazon's gift flag says to print the message from Seller Central ([ADR-004.2 SPEC 8](../../amazon-seller-connector/spec/#8-buyer-data)). The pick list shows no buyer field (owner delegation, 3 November 2026).
8. **A line short at packing** refuses "packed": the order goes back to waiting with the reason, as an order with a short line waits (2.5, 4.3).

## 4. Shipments

1. **One shipment per order.** It carries every unit still to ship, possibly in several boxes, and names the lines, quantities, carrier and tracking. The packer chooses "label on the marketplace" (the default on a marketplace order) or "own carrier", which takes a carrier and, per box, a tracking number where there is one, and sends one dispatch notice per box. With several boxes the packer says which box each line goes in; a line's units may split across boxes; each box carries at least one unit, and each line's units across its boxes are every unit it still ships. A manual order ships by own carrier ("Own delivery" or "Collected" allowed), with no notice. A box without tracking goes as the marketplace allows ([ADR-004.2 SPEC 9](../../amazon-seller-connector/spec/#9-dispatch)) (owner delegation, 3 November 2026).
2. **Confirming it,** in one transaction, keyed by the shipment id: Inventory's dispatch port deducts exactly what was packed for it; Orders records the status shipped and, for an own-carrier shipment, the outbox note for the dispatch notice through the egress gate ([ADR-000 SPEC 7](../../system-architecture/spec/#7-the-egress-gate)). A repeat returns "already confirmed".
3. **A line never ships more than it reserved,** so an order with a short line waits. A bundle line ships whole sets.
4. **Part shipped** only when the marketplace reports part shipped outside Vervoro ([ADR-007](../../order-ingestion/spec/#17-shipped-outside-vervoro)); the rest ships whole.
5. **Dispatch without packing in Vervoro** (confirmed at the bench) is allowed from an open, picking or packed order: Inventory packs by the dispatch itself (owner delegation, 3 November 2026).
6. **Shipped outside Vervoro** is Orders' import calling Inventory directly; Fulfilment shows the task asking which lot left, and a manager may reverse it ("Not from our stock").
7. Sellable does not change on dispatch, so it sends Stock sync no note.
8. **A label bought on the marketplace** (owner ruling, 22 October 2026). The shipment closes when both have happened, in either order: the order is packed in Vervoro, and the marketplace has reported its label ([ADR-007 SPEC 17.8](../../order-ingestion/spec/#17-shipped-outside-vervoro)). It deducts exactly what was packed, line by line, with its batches, and sends no dispatch notice. By default the packer scans the label on the order being packed; a label of another order is refused and closes nothing; a label not yet reported says so and asks the marketplace again; a scan after the close clears "label unchecked" (ruled by delegation, 3 November 2026; for the owner's confirmation). A shipment closed without a scan is marked "label unchecked"; the list shows the label-unchecked shipments of the last 3 days. A voided label leaves the order "label bought"; the next report replaces the tracking.
9. **In shadow** Fulfilment works the same; the dispatch notice is recorded, not sent, and the ship step says so ([ADR-000 SPEC 7.2](../../system-architecture/spec/#7-the-egress-gate)) (owner delegation, 3 November 2026).

## 5. Cancellations on the floor

1. **A confirmed cancellation** is Orders' (a request releases nothing). Inventory releases the line's units.
2. **Picked, not packed:** the units are in a tote and still on their spot by the books. A put-back task stays open until each unit is confirmed back, by a scan or a tap.
3. **Packed:** the units are sellable in the packing spot. The put-back task moves each one to a storage spot when confirmed.
4. **After dispatch:** nothing moves; a parcel that comes back is a return.

## 6. Returns

1. **Receiving** names the order line; Inventory takes the units back into one of the batches that line dispatched, held ([ADR-006 SPEC 7.9](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call)). The person chooses the spot (a returns bench, or the default spot). If the product tracks lots, the person scans or picks the lot from those the line received; another lot is refused. A bundle returns by its parts. An order with no dispatch record (shipped before Vervoro) is received line by line with a reason, and a dated product's date, into a new batch, at most what each line sold less cancelled units and earlier returns; in an order Vervoro shipped, a line it never dispatched takes none. An order not shipped is refused.
2. **Inspection decides per unit:** restock (sellable again unless the batch is expired, short-dated or blocked), keep as damaged, or write off with a reason.
3. **A use-by unit** is restocked only with a manager's reason; otherwise it is kept as damaged or written off.
4. **Refunds** are done in the channel's own tools; the credit note is [ADR-011's](../../invoicing-and-vat/).
5. **The nightly check.** Each night, at the company's night, per company with a return received in the last two days (a missed night is covered by the next), return lines equal their `returned` entries (through Inventory's port); a difference alerts the operator (owner delegation, 3 November 2026).

## 7. The recall list

1. From a lot number, Inventory's lot trace gives the demands that received it ([ADR-006 SPEC 10](../../stock-ledger/spec/#10-lot-trace-and-recalls)). Fulfilment joins each with its order: the order id, the date and the order's destination country ([ADR-007 SPEC 5](../../order-ingestion/spec/#5-the-order-and-its-lines)), never the buyer's name or address.
2. The lines that may have received it, as the lot trace defines them ([ADR-006 SPEC 10.1](../../stock-ledger/spec/#10-lot-trace-and-recalls)), are listed apart, and so are lines shipped "label unchecked" (section 4.8).
3. The stock of that lot on hand is shown per warehouse, with a button to block the lot through Inventory's port (a manager; owner delegation, 3 November 2026).
4. The seller reaches buyers through the marketplace's own messaging, with the order id. The list downloads as a file: an export without buyer data ([ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what)), each download in the audit log; an operator takes none. Procedure: [Run a recall](../../runbooks/run-a-recall/).

## 8. Who may do what

Roles are [ADR-010's](../../users-and-access/spec/#4-who-may-do-what). A person limited to some warehouses acts only on their orders.

| Action | Warehouse | Manager, Admin, Owner |
| --- | --- | --- |
| Pick, report "not found", pack, take another eligible batch, confirm a shipment, put back | Yes | Yes |
| Receive a return; inspect: restock or keep as damaged | Yes | Yes |
| Inspect: write off; restock a use-by unit with a reason | No | Yes |
| Reverse a shipment reported outside Vervoro | No | Yes |
| See the recall list; block the lot from it | See only | Yes |

## 9. Tests that prove each rule

Database tests run on real Postgres under the runtime role ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)).

| Test | Proves |
| --- | --- |
| Pick claims | Starting to pick writes no ledger entry and claims the spot with the fewest units first |
| Packing | One eligible batch is implied; several need a tap for a use-by product or a business buyer's line, and otherwise pack as the reserved batch, "batch assumed", unless a scanned barcode carries the lot; a product barcode alone never names a batch; another eligible batch moves or exchanges the reservation; nothing to exchange ends "batch assumed" |
| Use-by | A use-by unit on or after its date, or of a blocked lot, is refused at packing and at dispatch |
| Shipment | A shipment deducts only what was packed for it and carries every unit still to ship; an order with a short line cannot ship; confirming twice deducts once |
| Whole sets | A bundle line ships whole sets only |
| Marketplace label | Packing then the label report, or the report then packing, closes one shipment that deducts what was packed and writes no dispatch notice; an unscanned close is marked "label unchecked" |
| Put-back | A confirmed cancellation of picked or packed units leaves a put-back task open until each unit is confirmed |
| Returns | A return enters held, into a batch the line dispatched, at most what it dispatched; inspection outcomes write the right entries |
| Recall | The list includes bundles and lists "batch assumed" lines apart; it shows no buyer name or address |
| Boundaries | Fulfilment writes no `inventory_` or order table; every stock change goes through an Inventory port |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Writers:** Fulfilment inserts only into `fulfilment_` tables; stock and status changes are port calls (search the module for `inventory_` and order tables).
- [ ] **One transaction:** each floor command writes its row and calls the ports inside one transaction with its key.
- [ ] **Packing:** the batch rule (implied, tap, scan) is one function; there is no path that packs without naming a batch or marking "batch assumed".
- [ ] **Shipment:** one shipment per order; the confirm command refuses an order with a short or waiting line.
- [ ] **Recall:** the query reads the order's country; it selects no Buyer data field.
- [ ] **No outside call** in a transaction; the dispatch notice goes through the egress gate after commit.
- [ ] **Later parts:** no serial field, no marketplace-warehouse handover and no Vendor shipment at launch.
