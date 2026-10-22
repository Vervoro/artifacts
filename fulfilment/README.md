# ADR-014: Fulfilment

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 21 October 2026, split out of [ADR-006](../stock-ledger/) (decided 18 October 2026) so that each module has one record (owner ruling, 21 October 2026); labels bought on the marketplace (owner ruling, 22 October 2026) |
| **Scope** | The Fulfilment module: pick lists, packing that records the batch that left, shipments that carry a whole order, put-back after a cancellation, returns inspection, and the recall list |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/), [ADR-009](../buyer-data/), [ADR-010](../users-and-access/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [Procedures for this record](../runbooks/#adr-014-fulfilment) |

## Context

- **The lot recorded must be the lot that left.** A product barcode names the product, not the batch, and staff may type instead of scanning. A recall that trusts the plan instead of the parcel misses buyers.
- **Floor work happens on phones,** on patchy Wi-Fi, in chillers and back rooms. Only some steps can reach the server, and every tap may be sent twice.
- **A parcel is the unit a marketplace and a buyer see.** Sending part of an order invites a second deduction, a wrong tracking number and a complaint.
- **Returns come back in every state,** and some cannot be sold again. A refund is the channel's business; whether a unit goes back on sale is the warehouse's.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **Fulfilment is an always-on module outside the core** ([ADR-000](../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). It owns pick lists, packing records, shipments, put-back tasks and return inspections. Every stock change it causes is a call to Inventory's ports ([ADR-006](../stock-ledger/)), and every status change a call to Orders'. It never writes stock or an order's status itself.
2. **Picking chooses the spots.** When an order starts picking, the pick list takes each reservation from the spot of that batch with the fewest units first. Inventory records the claim, so counts allow for it. Starting to pick moves no stock. *Later: recording every pick as a move at the shelf, once the phone can queue picks offline.*
3. **Packing records the batch of every unit.** The batch is implied when only one is eligible. Otherwise the packer taps the date or lot printed on the unit, or scans a barcode that carries it. Another eligible batch than planned may be taken without a manager. When nobody says, the line ships its reserved batch, marked "batch assumed". Packed units move, still reserved, to the packing spot.
4. **A unit the picker cannot find leaves sale at once,** and its spot goes on the count list. A unit picked where the books do not show it is a move, and only a unit no spot holds is a find for a manager to review.
5. **Stock leaves only when a shipment is confirmed.** One shipment carries the whole order, possibly in several boxes, and deducts exactly what was packed for it, once. A short order waits. A label bought on the marketplace closes the shipment once the order is packed, and Vervoro sends no dispatch notice for it. *Later: serial numbers, recorded at packing and checked on return, when ADR-003's serial tracking is built.*
6. **Cancelled units go back by a task.** Units picked or packed for a confirmed cancellation are sellable again at once, and a put-back task stays open until each one is confirmed back on a shelf.
7. **A return is held until a person inspects it.** It comes back into the batch it left from. Inspection restocks it, keeps it as damaged, or writes it off. A refund never restocks, and a restock never refunds.
8. **The recall list joins Inventory's lot trace with the orders** that received the lot, with each order's destination country and the date. It lists the lines marked "batch assumed" separately, so the seller can reach every buyer through the marketplace.
9. **Floor work belongs to the floor, and decisions to a manager.** A Warehouse user picks, packs, ships and inspects. Write-offs, a use-by restock, reversals and batch pins need a manager ([ADR-010](../users-and-access/)).

## Consequences

**Gives**

- The lot on a parcel is the lot that left, or is marked as assumed, so a recall reaches every buyer.
- A parcel is always a whole order, and repeated taps never ship or deduct twice.
- Missing and misplaced units leave sale or are found on the spot, not at the next count.
- A cancelled or returned unit is on sale as soon as it can be, and never sooner.

**Costs**

- Packing asks for a tap whenever more than one batch of a product is in the spot.
- A pick list can change after it was printed (a date pass or a lot block), so packing checks every unit.
- Some lines ship "batch assumed", and a recall lists them apart.
- An order with a short line waits; nothing ships in part unless the marketplace shipped part itself.
- Units in the packing spot or in a tote need a put-back step before a shelf count is clean.

## Alternatives rejected

- **Picking as a move at every shelf:** the phone would need the server at every shelf. Packing is already a server step and records what left.
- **Trusting the planned batch at packing:** a recall would trust the plan, not the parcel.
- **Part shipments:** a second deduction and a second tracking number for one order.
- **Returns straight back to sellable:** an opened or damaged unit would be sold again.
- **A return into a new batch:** it loses the date and the lot.
- **Pick lists, packing and returns in the Inventory record:** Fulfilment is its own module, and one record per module lets it be built and reviewed alone.

## Open items

- **"Batch assumed" at most 1 % of lines** on a simulated day is a target, measured in shadow before launch.
- **Serial tracking is deferred** ([ADR-003](../product-model/)); its stock side lands here when it is built.
- **Marketplace warehouse shipments and Amazon Vendor shipments** are *Later*. Their packing and handover will reuse this record's shipment, once FBA shipments and ADR-004.4 have records.
- **Number.** ADR-014 is the next free number; a planned record (MCP access) has no number yet.
