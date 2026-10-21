# ADR-014 SPEC: Fulfilment

| | |
| --- | --- |
| **Decision** | [ADR-014: Fulfilment](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-014-fulfilment) |
| **Date** | 21 October 2026 |
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

1. **Always on, outside the core.** Needs Orders, Inventory and Buyer data ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). The core never calls it.
2. **Its tables,** with the `fulfil_` prefix, declared through `tenantTable()` and queried through the typed query builder: `fulfil_pick_task`, `fulfil_packing`, `fulfil_shipment` (order, lines and quantities, boxes, carrier, tracking), `fulfil_put_back`, `fulfil_return` and `fulfil_inspection`.
3. **One transaction per floor command.** Fulfilment writes its own row and calls Inventory's (and, for a shipment, Orders') port inside the same transaction, under the company's lock, with the command's key ([ADR-006 SPEC 12](../../stock-ledger/spec/#12-the-lock-keys-and-the-sequence)).
4. **Screens:** Orders → pick and pack, returns, and the recall list.

## 2. Picking

1. **Starting to pick** an order creates a pick task. For each reservation it asks Inventory to claim a spot: the spot of that batch with the fewest units first, less what other open pick tasks already claim from it.
2. **The pick list** names the batch, its lot and date, and the spot. A pick task writes no ledger entry.
3. **"Not found"** calls Inventory's quarantine port ([ADR-006 SPEC 7.7](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call)); the pick list then shows the new batch, or the line as short.
4. **A unit taken from a spot the books do not show** is reported as it is; Inventory records it as a move or a find (ADR-006 SPEC 7.8).
5. An order whose line is waiting or short does not join the pick list ([ADR-007](../../order-ingestion/spec/#10-whole-orders)).

## 3. Packing

Packing (ADR-007's "packed") is a server command, keyed by the packing id. For each unit it names the batch:

1. **One eligible batch** of the product in the spot (or the warehouse, without spots): implied.
2. **Several:** the packer taps the date or lot on the unit, or scans a barcode that carries it. A product barcode alone names no batch.
3. **Another eligible batch than planned** (in date, not blocked, meeting the demand's need) is taken without a manager; Inventory moves or exchanges the reservation. Choices of a later date than planned are listed daily for a manager.
4. **Nothing to exchange, or nobody says:** the line keeps its reserved batch, marked "batch assumed", with any lot tapped.
5. **Packed units** move, still reserved, to the packing spot. Units there for more than 24 hours are listed on Home.
6. **A use-by unit on or after its date, or of a blocked lot,** is refused at packing and swapped.

## 4. Shipments

1. **One shipment per order.** It carries every unit still to ship, possibly in several boxes, and names the lines, quantities, carrier and tracking.
2. **Confirming it,** in one transaction, keyed by the shipment id: Inventory's dispatch port deducts exactly what was packed for it; Orders records the status shipped and the outbox note for the dispatch notice through the egress gate ([ADR-000 SPEC 7](../../system-architecture/spec/#7-the-egress-gate)). A repeat returns "already confirmed".
3. **A line never ships more than it reserved,** so an order with a short line waits. A bundle line ships whole sets.
4. **Part shipped** only when the marketplace reports part shipped outside Vervoro ([ADR-007](../../order-ingestion/spec/#17-shipped-outside-vervoro)); the rest ships whole.
5. **Dispatch without packing in Vervoro** (confirmed at the bench) is allowed: Inventory packs by the dispatch itself.
6. **Shipped outside Vervoro** is Orders' import calling Inventory directly; Fulfilment shows the task asking which lot left, and a manager may reverse it ("Not from our stock").
7. Sellable does not change on dispatch, so it sends Stock sync no note.

## 5. Cancellations on the floor

1. **A confirmed cancellation** is Orders' (a request releases nothing). Inventory releases the line's units.
2. **Picked, not packed:** the units are in a tote and still on their spot by the books. A put-back task stays open until each unit is confirmed back, by a scan or a tap.
3. **Packed:** the units are sellable in the packing spot. The put-back task moves each one to a storage spot when confirmed.
4. **After dispatch:** nothing moves; a parcel that comes back is a return.

## 6. Returns

1. **Receiving** names the order line; Inventory takes the units back into one of the batches that line dispatched, held ([ADR-006 SPEC 7.9](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call)). The person chooses the spot (a returns bench, or the default spot). If the product tracks lots, the person scans or picks the lot from those the line received.
2. **Inspection decides per unit:** restock (sellable again unless the batch is expired, short-dated or blocked), keep as damaged, or write off with a reason.
3. **A use-by unit** is restocked only with a manager's reason; otherwise it is kept as damaged or written off.
4. **Refunds** are done in the channel's own tools; the credit note is [ADR-011's](../../invoicing-and-vat/).

## 7. The recall list

1. From a lot number, Inventory's lot trace gives the demands that received it ([ADR-006 SPEC 10](../../stock-ledger/spec/#10-lot-trace-and-recalls)). Fulfilment joins each with its order: the order id, the date and the buyer's country, never the buyer's name or address ([ADR-009](../../buyer-data/)).
2. Lines marked "batch assumed" or "lot not traced" are listed apart, as "may have received it".
3. The stock of that lot on hand is shown per warehouse, with a button to block the lot (a manager).
4. The seller reaches buyers through the marketplace's own messaging, with the order id. Procedure: [Run a recall](../../runbooks/run-a-recall/).

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
| Packing | One eligible batch is implied; several need a tap; a product barcode alone never names a batch; another eligible batch moves or exchanges the reservation; nothing to exchange ends "batch assumed" |
| Use-by | A use-by unit on or after its date, or of a blocked lot, is refused at packing and at dispatch |
| Shipment | A shipment deducts only what was packed for it and carries every unit still to ship; an order with a short line cannot ship; confirming twice deducts once |
| Whole sets | A bundle line ships whole sets only |
| Put-back | A confirmed cancellation of picked or packed units leaves a put-back task open until each unit is confirmed |
| Returns | A return enters held, into a batch the line dispatched, at most what it dispatched; inspection outcomes write the right entries |
| Recall | The list includes bundles and lists "batch assumed" lines apart; it shows no buyer name or address |
| Boundaries | Fulfilment writes no `stock_` or order table; every stock change goes through an Inventory port |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Writers:** Fulfilment inserts only into `fulfil_` tables; stock and status changes are port calls (search the module for `stock_` and order tables).
- [ ] **One transaction:** each floor command writes its row and calls the ports inside one transaction with its key.
- [ ] **Packing:** the batch rule (implied, tap, scan) is one function; there is no path that packs without naming a batch or marking "batch assumed".
- [ ] **Shipment:** one shipment per order; the confirm command refuses an order with a short or waiting line.
- [ ] **Recall:** the query reads Buyer data's country only; no name or address field is selected.
- [ ] **No outside call** in a transaction; the dispatch notice goes through the egress gate after commit.
- [ ] **Later parts:** no serial field, no marketplace-warehouse handover and no Vendor shipment at launch.
