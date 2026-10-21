# ADR-006: Stock ledger and reservations

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026, revised after review the same day; split into ADR, SPEC and RUNBOOK 21 October 2026, with picking, packing, dispatch and returns moved to [ADR-014](../fulfilment/) and each listing's figure left to Stock sync ([ADR-000 SPEC 4.6](../system-architecture/spec/#4-the-foundation-and-the-launch-modules)) |
| **Scope** | The Inventory module: the append-only ledger and its nightly proof, the four stock numbers per product, batch and spot, reservations for every demand, use-by and best-before dates, lot blocks and the lot trace, receiving, counts and adjustments, negative stock, the company's lock and commands safe to repeat |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-002](../data-retention/), [ADR-003](../product-model/), [ADR-005](../catalogue-sync/); used by [ADR-007](../order-ingestion/), [ADR-008](../inventory-sync/) and [ADR-014](../fulfilment/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-006-stock-ledger-and-reservations) |

## Context

- **"How many do we have?" has several right answers.** The warehouse needs what is there, picking needs what is promised, channels need what can still be sold. Using the wrong one oversells or undersells, and a wrong number is wrong on every channel at once.
- **Two orders for the last unit arrive together, and everything repeats.** Exactly one order may get the unit. A notice arrives twice, a phone on patchy Wi-Fi sends a tap twice; neither may move stock twice.
- **Food expires and gets recalled.** Food past its use-by date may not be sold at all; a recall must find every buyer of a lot.
- **The shelf and the system disagree.** Units are lost, broken, miscounted and found, and a small warehouse counts a shelf while orders are being picked from it. The record must show the truth without inventing stock or hiding a loss.
- **History must survive archiving.** Ledger months older than 24 months leave the database ([ADR-002](../data-retention/)), and the proof must still hold.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **The ledger is the record of stock, and Inventory is its only writer.** Every change is one or more append-only entries with a reason, a person or process, and a source. Only the ledger insert changes a balance or a reservation: a database trigger applies each entry, and nothing else may write them. Every other module changes stock only by calling Inventory's ports. This record owns that rule.
2. **Stock is counted per product, batch and spot, in four numbers:** on hand, reserved, held and sellable, where sellable is on hand less reserved less held. Only sellable is offered to channels. No number is ever negative, and nothing is quietly set to zero: the database refuses the change and the command reports it. A real shortfall is recorded through a count. Incoming stock is shown beside the four numbers but is never stock.
3. **One reservation serves every kind of demand.** It names a batch and a warehouse, never a spot. Each demand states the shelf life it needs, and the batch with the earliest sell-by date that meets it goes first. *Later: shipments into a marketplace's warehouse, when FBA shipments get their record; Amazon Vendor purchase order lines, with ADR-004.4.*
4. **An order line reserves when it is imported,** inside Orders' transaction, by calling Inventory's port. A shortage reserves what exists and records what is missing, and Vervoro never cancels the order. Short lines are filled by ship-by time when stock arrives.
5. **A line reserves what its link says.** A pack reserves its own stock, and a bundle reserves its components in whole sets. An unlinked line reserves nothing until its listing is linked; Orders then reserves for it as soon as the link commits. A line the marketplace ships reserves nothing, and a line whose fulfilment is not yet known reserves as if the seller ships it.
6. **A dated batch is use-by or best-before.** A use-by batch is never reserved, packed or dispatched on or after its date, by any route and with no override. A batch past its sell-by date, or of a blocked lot, is held. A nightly date pass moves reservations that are not yet packed off such batches. A recall starts from one search by lot. *Later: serial numbers, when ADR-003's serial tracking is built.*
7. **Received stock is sellable as soon as the receipt is confirmed.** Put-away is a move between spots and changes nothing a channel sees. A receipt that needs a manager enters the ledger at once, quarantined, until a manager accepts or refuses it.
8. **Counts are blind and need a role; adjustments need a manager and a reason.** A count is compared with the ledger at the moment its figure was saved, and allows for units being picked from that spot. Any shortfall beyond that leaves sale at once, and is written off when a manager approves.
9. **One stock writer per company at a time, and every command is safe to repeat.** The company's lock is the first statement of every stock command. Each command carries a key, and a repeat returns the first answer; an order import is made safe to repeat by its targets instead, so a newer state of the order still moves the difference ([ADR-007](../order-ingestion/spec/#3-one-order-per-marketplace-order)). The decision is revisited only when measured command time or lock wait for the busiest company passes its threshold for 7 days running.
10. **Every night a check proves the ledger, and every change tells Stock sync.** Each stock change commits with its ledger sequence and an outbox note; Stock sync works out each listing's figure after the commit ([ADR-008](../inventory-sync/)). Inventory never writes a listing's figure. The check proves that every balance equals its entries and every reserved number equals its open reservations. A difference alerts the operator and the seller, and holds raises on that product's listings.

The floor work that calls these ports (picking, packing, dispatch, put-back and returns inspection) is the Fulfilment module's, in [ADR-014](../fulfilment/).

## How stock moves

<!-- DIAGRAM -->

Units arrive by receiving or by a return. Received units are sellable, unless their batch is past its sell-by date or the receipt waits for a manager. Returned units are held until someone inspects them. An order moves sellable units of a batch to reserved. Packing moves reserved units to the packing spot, and a confirmed shipment takes them out of the warehouse. Held units return to sellable only when a person or a date says so, or they leave by write-off. Every arrow is a ledger entry under the company's lock.

## Consequences

**Gives**

- One record explains every unit: where it came from, where it went, who moved it and why. A recall is one search by lot, bundles included.
- Channels only ever see sellable stock. The database makes it impossible to promise a unit twice, to count one that is not there, or to change a balance without an entry.
- Repeated notices, reads and taps are harmless, and two orders for the last unit never both get it.
- Counts can happen while picking goes on, and a real loss leaves sale the moment it is counted.
- Drift is caught within a day, and archiving does not break the proof.

**Costs**

- One company's stock writes are serial, so transactions must stay short and large counts are split. Lock wait is measured, not guessed.
- A reservation promises a batch, not a shelf. The date pass and lot blocks can change a printed pick list, so packing checks every unit.
- Stock logic lives partly in a database trigger, which must be tested on real Postgres.
- Reservation rows, reasons and a key for every command mean more tables and more writes than one stock number per product.
- Short lines are filled by deadline, not by who ordered first.

## Alternatives rejected

- **A stock counter per product, with no ledger:** a counter cannot explain itself, and drift is found at year end.
- **Incoming as one of the four numbers:** a purchase order is a promise; once it sits next to stock, someone sends it to a channel.
- **Allowing negative stock, or clamping to zero:** one channel sells stock that does not exist, and the real loss hides until a count.
- **Reserving at payment, picking or label time:** the gap before the reservation is exactly when another channel oversells.
- **A reservation without a batch:** the database could not check reserved stock against good stock, and cancellations could not release exactly what was held.
- **A reservation that names its spot:** every put-away would have to carry reservations with it.
- **A count shortfall that waits for a manager before leaving sale:** a counted loss stays on every channel for hours.
- **Receipts that wait outside the ledger:** units on the shelf would be counted twice.
- **Double entry, with an account per order line:** "dispatched never above reserved" already stops a double deduction.
- **Reserving whatever each bundle component has:** a half-reserved gift set holds units a single-item buyer could have had.
- **Filling short lines oldest order first:** an order due today would wait behind an unpaid one.
- **A lock per product, or optimistic retries:** a bundle spans products, so locks would need an order and deadlock handling.
- **Inventory writes each listing's figure in its own transaction:** Inventory would have to know listings, links and pack sizes ([ADR-000](../system-architecture/)).
- **Repairing a balance by writing it:** the ledger is the truth; a balance is rebuilt from it.

## Open items

- **Lock thresholds.** The target command time and the lock-wait share that trigger a revisit are set from the load test before launch; until then [SPEC 12.3](spec/#12-the-lock-keys-and-the-sequence) holds proposals.
- **Amazon's 90 days at check-in** binds only shipments into Amazon's warehouses, which are *Later*. Recheck it when that record is written.
- **Serial tracking is deferred** ([ADR-003](../product-model/)). When it is built, ADR-014 takes recording a serial at packing and checking it on return; this record takes no serial rules.
- **"Batch assumed" at most 1 % of lines** on a simulated day is a target, measured in shadow before launch.
