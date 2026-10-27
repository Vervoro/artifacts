# ADR-015: Purchasing

| | |
| --- | --- |
| **Status** | Proposed, 27 October 2026, after the owner's approval of the draft and of every recommendation in it |
| **Date** | 27 October 2026; owner rulings of 27 October 2026: built in two steps, purchase orders never required, selling price stays on listings, and the nine open questions of the draft decided as recommended |
| **Scope** | The Purchasing module: suppliers, each product's suppliers with the supplier's code, order minimums and lead time, a reorder level per product, the "Needs reordering" list and the Purchasing card on the product page (step 1, ROADMAP 5.2.1); purchase orders and receiving against them (step 2, ROADMAP 5.5.1, outline only) |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-002](../data-retention/), [ADR-003](../product-model/), [ADR-006](../stock-ledger/), [ADR-010](../users-and-access/); used by [ADR-003](../product-model/) (status and retiring) and [ADR-006](../stock-ledger/) (receipts against a purchase order) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | None yet |

## Context

What sellers say and what the tools do (sources in [SPEC 13](spec/#13-research-and-constraints)):

- **"What do I need to buy?" is answered in a spreadsheet.** Shopify sellers who lost Stocky describe exporting stock to a sheet and working out reorder points by hand. Shopify's own admin has no reorder point and no supplier lead time ([Endless Commerce](https://endlesscommerce.com/playbook/how-to-reorder-without-stocky/), [Shopify community](https://community.shopify.com/t/681984)). Seller-built sheets count sold-out days as days nobody wanted the product, so best sellers get under-ordered again.
- **The supplier's name for a product is not yours.** A supplier's part number, case size and minimum order differ from the seller's SKU and the marketplace's code. Linnworks keeps pack size and minimum order on the supplier ([Linnworks](https://www.linnworks.com/Doc/Supplier_Packs_and_Minimum_Order_Quantity.html)); orders are rounded up to them ([Endless Commerce](https://endlesscommerce.com/playbook/how-to-reorder-without-stocky/)).
- **A product has more than one supplier,** and the lead time belongs to the pair. inFlow shows the lead time "for the last vendor you purchased from" and may switch vendor on each reorder ([inFlow](https://www.inflowinventory.com/support/cloud/can-inflow-recommend-a-reorder-point-for-my-products)); RestockPro reviewers list "no multiple suppliers per product" as a flaw ([Capterra](https://www.capterra.in/software/144970/restockpro)).
- **Quoted lead time is not real lead time.** A single figure per supplier "breaks the first time one slips"; sellers are told to use measured, not agreed, lead times ([Endless Commerce](https://endlesscommerce.com/playbook/how-to-reorder-without-stocky/)).
- **Reorder levels are per product and often per location** (Veeqo: minimum, usual reorder quantity and maximum, per product per location, with a demand report built on them; [Veeqo](https://help.veeqo.com/en/articles/3806756-set-re-order-levels)). A report that ignores customer backorders under-orders; Veeqo adds them by a setting.
- **Forcing purchase orders on a small seller gets in the way.** Many sellers buy by phone, message or marketplace, and want the reorder list and the supplier's code, not a document system. Tools that start from the purchase order lose them.
- **Vervoro's own records already leave room for this.** A product holds no supplier codes, pack sizes, lead times or reorder points ([ADR-003 SPEC 1.2](../product-model/spec/#1-what-a-product-is)); incoming stock is shown beside the four numbers, never added ([ADR-006 SPEC 3.2](../stock-ledger/spec/#3-the-four-numbers)); a receipt without a purchase order is allowed ([ADR-006 SPEC 8.4](../stock-ledger/spec/#8-receiving)); Purchasing is parked ([ADR-000 SPEC 4.7](../system-architecture/spec/#4-the-foundation-and-the-launch-modules)).

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **Purchasing is a module of its own and the only writer of suppliers, product–supplier links and reorder settings.** A product holds none of them ([ADR-003](../product-model/)); the product page shows them on a card the module contributes. It is switchable, in every plan, and needs Products and Inventory ([ADR-000 SPEC 4](../system-architecture/spec/#4-the-foundation-and-the-launch-modules), [ADR-012](../billing-and-plans/)).
2. **Purchase orders are never required** (owner ruling, 27 October 2026). A seller can add a product, set its supplier, the supplier's code, reorder level and lead time, and enter stock bought in the past without any purchase order. The supplier link lives on the product, not on an order. Stock enters through Inventory's own ways ([ADR-006 SPEC 8.4](../stock-ledger/spec/#8-receiving)). Purchase orders, when built, are an optional layer on top.
3. **Built in two steps** (owner ruling, 27 October 2026). **Step 1** (5.2.1, right after Inventory): suppliers, a product's suppliers, the reorder level, lead times, the "Needs reordering" list and the Purchasing card. **Step 2** (5.5.1, after Orders): purchase orders and receiving against them, outlined in the SPEC and written as a later batch.
4. **A supplier is a name and a few optional details.** Name, a default lead time, a contact (name, email, phone) and a note. The contact can be a person, so it is personal data: seen only by Owner, Admin and Manager, never copied into activity entries, clearable at any time and deleted with the company, with a supplier row in the retention schedule ([ADR-002 SPEC 2](../data-retention/spec/#2-the-retention-schedule)).
5. **A product has up to 10 suppliers, one preferred.** Each link holds the supplier's code, the smallest order, the case multiple the supplier sells in, and the lead time for that pair. The preferred supplier is the one the list suggests.
6. **A reorder level is a number the seller sets on a product,** in base units, for the company as a whole; a level per warehouse is *Later*. An optional "usual order quantity" sits beside it. Blank means "not tracked"; 0 means "reorder when out". Bundles have none: the components are reordered.
7. **A product needs reordering when its position is at or below its level.** The position is sellable stock plus stock on its way ([ADR-006](../stock-ledger/)). Held stock does not count. The suggested quantity is rounded up to the preferred supplier's minimum and multiple.
8. **Needs reordering is a query, never stored or pushed.** It is read when someone opens it, from Inventory's read port. Nothing in Purchasing writes stock, and nothing reaches a supplier in step 1. Anything sent to a supplier later goes through the egress gate ([ADR-000 SPEC 7](../system-architecture/spec/#7-the-egress-gate)). There is no daily mail at launch, only a card on Today (Home) and the list; a mail is *Later*, as a new mail is a drift. Purchasing has its own workbook, following [ADR-003 SPEC 14](../product-model/spec/#14-spreadsheet-import-and-bulk-edit).
9. **Lead times are quoted by the seller and, from step 2, also measured** from purchase order dates and shown beside the quote. *Later:* a reorder level suggested from sales, lead time and stock-out days, shown for the seller to accept; never set on its own.
10. **Selling price is not here.** It stays on listings ([ADR-005](../catalogue-sync/)). Purchasing holds no price in step 1; a purchase price appears on a purchase order line in step 2, in the company's currency only.

## Step 2 in one paragraph

A purchase order is optional. It names a supplier and lines (product, supplier's code as it was then, quantity, unit cost), has statuses (draft, sent, part received, received, closed, cancelled), is sent by download or email through the egress gate, and shows incoming quantity beside the four numbers. Receiving against it calls Inventory's receive port, one batch per delivery; its cost goes in as the batch's provisional landed cost. Outline in [SPEC 12](spec/#12-step-2-purchase-orders-outline), written in full as a later SPEC batch.

## Consequences

**Gives**

- A seller replaces the reorder spreadsheet on day one with no purchase order, no new document and no supplier portal.
- The supplier's code, minimum and case size sit where the seller looks when buying, and the list can be downloaded per supplier.
- Bundles and multipacks are reordered by what they are made of, so one list shows what to buy.
- No new stock path: Inventory stays the only writer, and a seller who never uses purchase orders loses nothing.

**Costs**

- The reorder level is the seller's number. Vervoro does not forecast in step 1; a seller who wants one still thinks about lead time themselves (the Later suggestion closes this once Orders has history).
- The list reads Inventory once per opening (one batched read for the products with a level). At 10 sellers and at 1,000 sellers this is one extra read per list opening, not per product and not per stock change; it stays cheap because nothing is stored. See [SPEC 6.5](spec/#6-needs-reordering).
- One company-wide level cannot see that one warehouse is empty while another is full; a level per warehouse is *Later*, when a seller with two sites that cannot share stock asks for it.
- Supplier contacts are personal data the seller chooses to enter; they have a row in the retention schedule and are in the company export.

## Alternatives rejected

- **Purchase orders first, reorder list on top:** every small seller would need an order document before any help, and the first-day pain (what to buy) waits for the second step.
- **Supplier fields on the product:** [ADR-003](../product-model/) keeps the product to what the warehouse counts; one supplier per product breaks at the second supplier.
- **The supplier code as a barcode on the product:** barcodes are unique in the company and identify the product ([ADR-003 SPEC 4](../product-model/spec/#4-barcodes)); a supplier's code belongs to one supplier.
- **A reorder level per product and warehouse at launch:** an order is shipped from one warehouse, so it is the correct model for sellers with two sites, but most start with one and would set every level twice. Kept as *Later*.
- **A computed reorder point from sales as the only mechanism:** it needs order history that a new seller lacks, hides the number the seller has to defend to a supplier, and goes wrong when stock-out days look like low demand.
- **Counting held stock (damaged, quarantined, short-dated) as stock:** it cannot be sold, so it would hide the need.
- **Reordering a bundle:** a bundle has no stock; its components do.
- **Storing the "needs reordering" state and telling people when it flips:** a second copy of stock that can drift; a new mail is a rule change of its own.
- **Lead time only per supplier:** the same supplier ships a stocked item in days and a made-to-order one in weeks.

## Decided with this record

The draft's nine open questions were decided by the owner on 27 October 2026, each as recommended; the rules are in the decisions above and in the SPEC.

1. **Reorder level:** per product, company-wide (decision 6). Per warehouse is *Later*.
2. **Usual order quantity:** yes, optional (decision 6).
3. **Receipts without a purchase order:** three amendments to [ADR-006 SPEC 8.4](../stock-ledger/spec/#8-receiving) ([SPEC 1.4](spec/#1-what-purchasing-is)): a `delivery` reason, the daily-list sentence dropped, bulk opening stock noted as Inventory's to build.
4. **Supplier contacts:** personal data, seen by Owner, Admin and Manager only (decision 4, [SPEC 11](spec/#11-personal-data-and-retention)).
5. **Where core and Purchasing meet:** Products declares an extension point and Inventory a slot that Purchasing contributes to; a batch's supplier is a plain id plus a name copy ([SPEC 10.4](spec/#10-ports-events-and-tables)).
6. **Module kind and plan:** switchable, in every plan (decision 1).
7. **No daily mail at launch:** a Today card and the list (decision 8).
8. **Workbook:** Purchasing's own, following ADR-003 SPEC 14 (decision 8, [SPEC 8](spec/#8-spreadsheet-import-and-bulk-edit)).
9. **Currency:** the company's currency only in step 2 (decision 10).

## Amendments to other records

Made in the same batch (owner approval, 27 October 2026): [ADR-000](../system-architecture/) (SPEC 4 module table and 4.7), [ADR-002](../data-retention/) (SPEC 2), [ADR-003](../product-model/) (SPEC 1.2, 9), [ADR-006](../stock-ledger/) (SPEC 0, 1, 3.2, 8.4, 8.5), [ADR-010](../users-and-access/) (SPEC 4), [ADR-012](../billing-and-plans/) (SPEC 2) and the [guide](../guide/).
