# ADR-015 SPEC: Purchasing

| | |
| --- | --- |
| **Decision** | [ADR-015: Purchasing](../) |
| **Procedures** | None yet |
| **Date** | 27 October 2026, Proposed; owner rulings of 27 October 2026: two steps, purchase orders never required, the draft's open questions decided as recommended; owner rulings of 31 October 2026, the developer's review of step 1: Access joins the needs (6.3.4), Inventory's `position` and `suppliersUsed` ports (10.2), the receipt's supplier picker through a field slot (10.4), the not-tracked filter (5.6), the bundle card, the Today card and the floor for scoped people (5.3, 6.6.2, 7.2), the list's paging (6.4) |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-015 from: the Purchasing module. Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/). This batch writes **step 1** in full. Step 2 (purchase orders) is an outline in [section 12](#12-step-2-purchase-orders-outline) and gets its own SPEC batch before it is built.

## 0. At launch and later

Step 1 is built when ROADMAP 5.2.1 is reached. Everything marked *Later* keeps its rules here and is built only when its trigger arrives.

| Later part | Trigger | Rules |
| --- | --- | --- |
| Purchase orders, sending them, receiving against them, measured lead time, landed cost hand-off (step 2) | ROADMAP 5.5.1: Orders is built | [12](#12-step-2-purchase-orders-outline) |
| Customer shortfalls (order lines short of stock) counted in the position | Orders is built (step 2) | [6.2](#62-the-position) |
| A reorder level per product and warehouse | A seller with two sites that cannot share stock asks | [5](#5-reorder-settings) |
| A reorder level suggested from sales, lead time and stock-out days | Orders has 8 weeks of history for the company, and sellers ask | [5.5](#5-reorder-settings) |
| A daily mail "n products need reordering" | The owner approves the mail (a new mail is a drift) | [6.6](#6-needs-reordering) |
| Searching products by the supplier's code from the product list | Sellers ask for it beyond Purchasing's own search | [4.6](#4-a-products-suppliers) |
| Reorder advice for stock held in a marketplace's warehouse (FBA) | FBA shipments get their record ([ADR-000 SPEC 4.7](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)) | [6.3](#63-what-counts) |

## 1. What Purchasing is

1. **The Purchasing module** is a switchable module that needs Products and Inventory ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). It is switchable and in every plan ([ADR-012 SPEC 2](../../billing-and-plans/spec/#2-plans)). It is the only writer of the `purchasing_*` tables in section 10. It calls the core's ports; the core never calls it ([ADR-000 SPEC 4.2](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)).
2. **A product does not hold** a supplier, a supplier's code, a pack size, a lead time or a reorder level; these are Purchasing's ([ADR-003 SPEC 1.2](../../product-model/spec/#1-what-a-product-is)). Purchasing holds no stock, no batch, no selling price and no marketplace code ([ADR-006](../../stock-ledger/), [ADR-005](../../catalogue-sync/)).
3. **Purchase orders are never required** (owner ruling, 27 October 2026). Every rule below works with no purchase order in the company:
   1. A seller can create a product, then set its supplier, the supplier's code, reorder level and lead time, without any purchase order. The link between a product and its supplier is a row of section 4, not a field of an order.
   2. No stock command, receipt, count, listing link or order import asks for a purchase order, a supplier or a link. Purchasing being switched off changes none of them.
   3. Stock bought before Vervoro, and stock bought later by phone or message, enters through Inventory's existing ways (rule 4). A purchase order, once built, is an optional record that a delivery can be attached to ([ADR-006 SPEC 8.5](../../stock-ledger/spec/#8-receiving)); a receipt made without one stays complete.
   4. Nothing in step 2 changes what step 1 does. A company that never raises a purchase order keeps the list, the card and the links exactly as they were.
4. **How stock bought in the past enters today** (ADR-006, checked against its SPEC of 25 October 2026):
   1. **Receiving without a purchase order** is allowed: a Manager (or above) receives directly, sellable at once, with a reason from a short list including "opening stock"; a Warehouse user's receipt is sellable at once unless it is unusual, when it waits for a manager ([ADR-006 SPEC 8.4](../../stock-ledger/spec/#8-receiving)). Cost may be blank; reports then use the product's standard cost and say so. The batch records its supplier, lot and date.
   2. **A count** can find stock and book it as a surplus on approval ([ADR-006 SPEC 9.5](../../stock-ledger/spec/#9-counts-and-adjustments)).
   3. **Gaps found and closed** (owner ruling, 27 October 2026; made in [ADR-006 SPEC 8.4](../../stock-ledger/spec/#8-receiving) in the same batch):
      - *(a) No reason fitted an ordinary delivery.* The list was "supplier extra, sample, opening stock, found, other". A seller who buys by phone has no honest reason for Tuesday's delivery. Added: `delivery` ("Delivery, no purchase order"): sellable at once for every role that may receive, on the Warehouse user's usual-size check only.
      - *(b) The daily list would have become permanent noise.* "Every receipt a Warehouse user made without a purchase order is on the manager's daily list" would put every delivery of a seller who never uses purchase orders on it. Removed: an unusual receipt is quarantined and so already on the list; an ordinary one is in the activity view and the stock movements report, with its reason.
      - *(c) Opening stock has no bulk way in.* A seller arrives with 100 to 5,000 products ([ADR-003 context](../../product-model/)); receiving each by hand is not a real day. Noted in ADR-006 SPEC 8.4 as Inventory's to build: a spreadsheet of opening stock (SKU, warehouse, quantity, lot, date, optional unit cost), previewed and written as one receipt per line with reason "opening stock", in the pattern of [ADR-003 SPEC 14](../../product-model/spec/#14-spreadsheet-import-and-bulk-edit), by Inventory. This is Inventory's, not Purchasing's; Purchasing does not wait for it.
   4. **The supplier on a batch** (owner ruling, 27 October 2026) is a plain id and a copy of the name, chosen on the receipt screen from Purchasing's suppliers when Purchasing is on, else typed. Inventory never calls Purchasing ([section 10.4](#10-ports-events-and-tables)).

## 2. Words and shapes

| Thing | Meaning |
| --- | --- |
| **Supplier** | Whoever the seller buys from: a wholesaler, a manufacturer, a marketplace seller they buy from. Not a login; suppliers sign in to nothing ([ADR-010 SPEC 1](../../users-and-access/spec/#1-the-people)) |
| **Product supplier** | A product bought from a supplier: the supplier's code, minimum order, case multiple and lead time |
| **Supplier's code** | The supplier's own name for the item. One of four codes ([ADR-003 context](../../product-model/)); never the SKU, never a barcode |
| **Reorder level** | The number of units at or below which the seller wants to buy more |
| **Position** | Sellable stock plus stock on its way (section 6.2) |
| **Needs reordering** | The list of products whose position is at or below their level |

Quantities are integers of base units ([ADR-003 SPEC 2.1](../../product-model/spec/#21-numbers-and-money)). Money does not appear in step 1.

## 3. Suppliers

**`purchasing_supplier`**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | uuidv7 | Yes | Never shown to sellers |
| `name` | text | Yes | 1–200 characters. Unique in the company whatever its case, among all suppliers including archived |
| `status` | `active`, `archived` | Yes | Default `active`. An archived supplier is not offered for new links or receipts and stays on what it was used for. Archiving is allowed with links in place; they keep showing and drop off the list's suggestions |
| `lead_time_days` | integer | No | The supplier's usual lead time, 0–365. Used when a link has none |
| `contact_name` | text | No | Up to 100 characters. **Personal data** (section 11) |
| `contact_email` | text | No | Up to 254 characters; one address, checked for shape only. **Personal data** |
| `contact_phone` | text | No | Up to 30 characters, digits, `+`, spaces, `-`, `(`, `)`. **Personal data** |
| `note` | text | No | Up to 1,000 characters. Internal. Asked not to hold personal details beyond the fields above |
| `created_at`, `updated_at`, `version` | | Yes | Set by the data layer; an edit on an older `version` is refused ([ADR-003 SPEC 2](../../product-model/spec/#2-fields)) |

1. **Deliberately not here in step 1:** address, account number, payment terms, currency, VAT number, price lists, free-text "ordering instructions". Step 2 adds only what a purchase order needs ([section 12](#12-step-2-purchase-orders-outline)), as an expand-only change.
2. **Deleting** a supplier is allowed only while nothing uses it (no link, no batch naming it by id); otherwise it is archived. No fixed limit on suppliers per company beyond 5,000.
3. Every change writes an activity entry: who, when, field, old and new value. The contact fields' old and new values are written as "changed", not as text, so the activity view holds no copy of personal data (section 11.3).

## 4. A product's suppliers

**`purchasing_product_supplier`**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `product_id` | product id (plain id, resolved through Products' port) | Yes | A simple product or a pack. A bundle is refused: its components are reordered |
| `supplier_id` | supplier id | Yes | An active supplier. Unique with the product |
| `supplier_code` | text | No | Up to 60 characters, letters, digits and `- _ . / space`, trimmed. Not unique: two products may share a supplier's code, and the screen says so |
| `min_order_qty` | integer | Yes | Default 1. 1–1,000,000 base units: the smallest quantity the supplier takes on an order line |
| `order_multiple` | integer | Yes | Default 1. 1–100,000 base units: the case or carton size the supplier sells in. Not [ADR-003 SPEC 7](../../product-model/spec/#7-box-and-pallet-sizes)'s box size: a box size describes how one delivery arrived and can differ from delivery to delivery |
| `lead_time_days` | integer | No | 0–365. For this product from this supplier |
| `preferred` | boolean | Yes | Exactly one active link per product is preferred |

1. **Up to 10 links per product.** More is refused with the reason.
2. **One preferred link.** The first link is preferred. Setting another preferred clears the old one in the same change. Removing the preferred link makes the oldest remaining one preferred, and the activity entry says so. No preferred link exists when no link does.
3. **Lead time used** is the link's, else the supplier's, else none. The screen shows which one it used. Step 2 adds the measured lead time beside it ([section 12](#12-step-2-purchase-orders-outline)).
4. **Rounding rule.** A wanted quantity `q` becomes `max(q, min_order_qty)` rounded up to a multiple of `order_multiple`. If `min_order_qty` is not a multiple, the larger multiple is taken. One function, used by the list, the export and (step 2) the purchase order.
5. **A retired product** takes no new link and no level; existing ones stay readable. An `inactive` product keeps them but is not suggested ([ADR-003 SPEC 9](../../product-model/spec/#9-status)).
6. **Finding by supplier's code** works inside Purchasing's own search and on the card. The product list does not search it at launch ([section 0](#0-at-launch-and-later)).
7. Every change writes an activity entry.

## 5. Reorder settings

**`purchasing_reorder`** (one row per product, none when not tracked)

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `product_id` | product id | Yes | Unique. A simple product or a pack; a bundle is refused |
| `reorder_level` | integer | Yes | 0–1,000,000 base units. **0 means "reorder when out"; no row means "not tracked"** |
| `usual_order_qty` | integer | No | 1–1,000,000. The seller's usual order. (owner ruling, 27 October 2026) |
| `version` | | Yes | As elsewhere |

1. **Company-wide at launch.** The level is compared with the position summed over every warehouse of the company. The cost, accepted by the owner on 27 October 2026: a seller with two sites that cannot share stock sees no need while one site is empty. A warehouse-specific level is *Later*.
2. **The Purchasing card on the product page** shows, in this order: Supplier (preferred), Supplier's code, Reorder level, Lead time (the one used, with its source). A product with several suppliers shows "+ 2 more" and opens a small list. Editing is on the card; there is no separate settings screen.
3. **Bundle:** no level. The bundle's page shows, read-only, "Components that need reordering" (the components on the list) to people who may see the list and are not scoped to warehouses. A bundle with no component on the list shows nothing. A product that becomes a bundle before its first use keeps its links and level, unread while it is a bundle.
4. **A pack** has its own level and suppliers when the seller buys sealed packs; a pack made by repacking singles has none ([ADR-003 SPEC 6.2](../../product-model/spec/#62-pack)). Singles and their packs are counted apart, because their stock is ([ADR-003 SPEC 6.2](../../product-model/spec/#62-pack)).
5. *Later:* **a suggested level.** Worked out from the average daily sales over a window that leaves out days the product was out of stock, times the lead time used, plus a safety margin the seller sets as days; shown as "Suggested: 40" beside the seller's number with the figures behind it. It is never written by Vervoro. Not built until Orders has history.
6. **Products with no level** (simple products and packs, not retired) are a filter Purchasing adds to the products list ("not tracked", through Products' list extension point) and a count on the list's page linking to it, so a product the seller forgot does not silently never reorder.

## 6. Needs reordering

### 6.1 What it lists

A product is on the list when all hold: it has a reorder level; its status is `active` ([ADR-003 SPEC 9](../../product-model/spec/#9-status)); it is a simple product or a pack; and its position is **at or below** its level.

### 6.2 The position

`position = sellable + on its way`, summed over the company's warehouses, from Inventory's read port ([ADR-006 SPEC 13.2](../../stock-ledger/spec/#13-telling-stock-sync)).

1. **Sellable** is on hand less reserved less held, as [ADR-006 SPEC 3](../../stock-ledger/spec/#3-the-four-numbers) defines it. Reserved stock is promised, so it is gone. Held stock (quarantined, damaged, short-dated, expired, blocked) cannot be sold, so it does not count.
2. **On its way** at step 1 is units in transit between the company's own warehouses (a transit spot belongs to no warehouse's on hand, [ADR-006 SPEC 1.2](../../stock-ledger/spec/#1-where-stock-is-counted)). Without them a transfer would show as a need. From step 2 it also holds open purchase order quantity not yet received ([ADR-006 SPEC 3.2](../../stock-ledger/spec/#3-the-four-numbers)).
3. **Short lines** (order lines that reserved less than they needed, [ADR-006 SPEC 5.3](../../stock-ledger/spec/#53-reserving-an-order-line)) are customers waiting for stock. Sellable cannot go below zero, so they are invisible to it. From step 2 (Orders exists) the position is reduced by the units missing on open short lines of that product, read through Orders' port; Veeqo does the same by a setting, here it is the rule.
4. The position may be negative once short lines count; the list shows the figure.

### 6.3 What counts

1. **Only the company's own warehouses.** Stock a marketplace holds is a reading, never added ([ADR-006 SPEC 6.9](../../stock-ledger/spec/#6-what-a-line-reserves)). A product shipped by a marketplace has no Vervoro position to reorder from; its level is not offered while every listing of it is linked as marketplace-shipped.
2. **Bundles and multipacks.** A bundle sale reserves its components in whole sets, so the components' sellable already falls with every bundle sale. A listing with six units per sale reserves six units of the same product. Reordering is therefore always of the product that has the stock, never of the bundle or the listing.
3. **Packs and singles are separate** (section 5.4). When singles could make a missing pack, that is a repack ([ADR-006 SPEC 6.1](../../stock-ledger/spec/#6-what-a-line-reserves)), shown nowhere here.
4. **Warehouse scope.** The list is the company's, so it needs a person with no warehouse scope ([ADR-010 SPEC 3](../../users-and-access/spec/#3-roles-and-warehouse-scope)). A scoped Manager is refused with the reason "limited to some warehouses"; the card still shows the level and the suppliers.

### 6.4 The row

| Column | Source |
| --- | --- |
| Product (SKU, name, image) | Products |
| Sellable, on its way (and, from step 2, short), position | Inventory (and Orders) |
| Reorder level | Purchasing |
| Short by | `level − position` (0 or more) |
| Suggested quantity | The larger of the usual order and the shortfall, `max(usual_order_qty, short by)`, through the rounding rule of section 4.4, for the preferred link; blank when the product has no link |
| Supplier, supplier's code, lead time used | Purchasing, preferred link |

1. **Sorting and filters:** by short by (default), supplier, and "no supplier". Group by supplier, because sellers decide at the supplier level to meet minimums. The list is computed whole and shown 50 rows a page; the download holds all of it.
2. **A product on the list with no supplier** stays on it, flagged "no supplier".
3. **Archived supplier:** the row shows it flagged and suggests nothing until another link is preferred.

### 6.5 Computing it

1. **A query, never stored.** Purchasing reads its levels and links (two queries, one for each table, with the company's rows only), Products' status and kind in one port call, and Inventory's sellable and incoming for those product ids in one batched port call. About three round trips per opening, whatever the number of products (tested at 5,000 levels). Nothing runs on a stock change, so a stock command is unchanged.
2. **What the rule costs:** one batched read per list opening (and per Today opening, section 7.2). At 10 sellers this is a few reads a day; at 1,000 sellers, each opening a few times a day, a few thousand reads a day. Storing the state would remove the read but add a second copy of stock that can drift and a handler on every stock note; rejected.
3. **Stale reads:** the list is a snapshot of the moment it was read and says when. A receipt made afterwards shows on the next opening.

### 6.6 Taking it away

1. **Download.** The list downloads as a spreadsheet, one sheet per supplier or filtered, with SKU, supplier's code, product name, suggested quantity, lead time and supplier contact (to Owner, Admin and Manager only). It contains no costs and no buyer data. This is the seller's order sheet when there are no purchase orders.
2. **Today** (the Home screen) shows a card "Needs reordering (n)", n from the same query, computed when Home is opened; a person scoped to warehouses is not shown the card.
3. **No mail at launch** (owner ruling, 27 October 2026). A daily mail is *Later* ([section 0](#0-at-launch-and-later)).

## 7. Screens

1. **Purchasing** (menu): Needs reordering (default), Suppliers, a supplier's page (its details and its products), Import/export. Step 2 adds Purchase orders.
2. **Product page:** the Purchasing card (section 5.2); no Purchasing card on the floor's product screen in step 1. **Today:** the card of section 6.6.
3. **Receipt screen** (Inventory's): when Purchasing is on, the supplier is a pick list of active suppliers with a free-text fallback; otherwise free text.
4. Every word comes from the catalogue ([rulebook](../../rulebook/)); no screen waits for anything outside Vervoro.

## 8. Spreadsheet import and bulk edit

Purchasing has its own workbook (owner ruling, 27 October 2026), not columns in the Products sheet, in the pattern of [ADR-003 SPEC 14](../../product-model/spec/#14-spreadsheet-import-and-bulk-edit): export, bulk edit and bulk create from one file.

1. **Sheets:** Suppliers (key: name), Product suppliers (SKU, supplier name, supplier's code, minimum order, order multiple, lead time, preferred) and Reorder levels (SKU, level, usual order). Only one sheet is required.
2. **Match keys:** supplier name (whatever its case), SKU (whatever its case) with supplier name. A known key updates; a new key creates.
3. **A blank cell or a missing column changes nothing;** `(clear)` empties. **Lists replace per product:** a SKU named on Product suppliers gets exactly those links.
4. **Preview first, errors never apply,** one transaction on confirm, up to 10,000 rows per sheet, exactly as [ADR-003 SPEC 14.6–14.9](../../product-model/spec/#14-spreadsheet-import-and-bulk-edit).
5. **Refused outright:** a SKU that is a bundle or unknown (Products' port is asked once for the file's SKUs); a supplier twice in one sheet; more than 10 suppliers for a SKU; two preferred for one SKU; a retired product.
6. **A SKU that does not exist is never created here.** Products create products.
7. The Reorder levels sheet reaches seller-wide, not a warehouse. The contact columns are exported only to roles that may read them (section 9).

## 9. Who may do what

Roles are [ADR-010's](../../users-and-access/spec/#4-who-may-do-what). These rows are in its table (Products group), in the six roles:

| Action | Owner | Admin | Manager | Warehouse | Accountant | Staff |
| --- | --- | --- | --- | --- | --- | --- |
| Read supplier names, supplier's codes, reorder levels and lead times | Yes | Yes | Yes | Yes | Yes | Yes |
| Read a supplier's contact (name, email, phone) and note | Yes | Yes | Yes | No | No | No |
| Create, edit, archive suppliers; set a product's suppliers and reorder level; import | Yes | Yes | Yes | No | No | No |
| See the Needs reordering list (a scoped person is refused, 6.3) and download it | Yes | Yes | Yes | No | No | No |

1. **No costs in step 1,** so no cost permission is needed. Step 2 adds purchase order rows and, for prices, "See costs" ([ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what)).
2. **Warehouse users read the supplier and the supplier's code** because a delivery note carries them; they pick a supplier on a receipt.
3. Each action is declared in the module's manifest ([ADR-000 SPEC 1](../../system-architecture/spec/#1-modules-and-the-manifest)). While a company is restricted, purchasing is read-only ([ADR-012 SPEC 8](../../billing-and-plans/spec/#8-what-runs-in-each-state)).

## 10. Ports, events and tables

1. **Purchasing provides:** `suppliers.list` (id, name, status) for receipt screens and the card; `product.purchasing` (the card's data for a product); `reorder.list` (the list).
2. **Purchasing uses:** Products' read port (status, kind, SKU and name for ids; the pack and bundle shape), Inventory's `position` port (sellable and units in transit per product and warehouse, batched, with the ledger sequence; Stock sync's `sellable` port is unchanged) and its `suppliersUsed` port (which of the supplier ids asked a batch of the company names, read when a supplier is deleted, 3.2), Access's member facts for a person's warehouse scope (6.3.4; Access is in the needs, [ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)), once Listings is built its read port for marketplace-shipped products (6.3.1; Listings then joins the needs), and from step 2 Orders' read port (units missing per product) and Inventory's receive port.
3. **Events.** Purchasing publishes and handles none in step 1: the list reads a product's status through Products' port, so no `product.retired` handler is needed. It needs no event from Inventory because the list reads the port when opened. If a later feature (a mail, a Home count held in a table) needs "stock changed", it listens to the stock note ([ADR-006 SPEC 13](../../stock-ledger/spec/#13-telling-stock-sync)).
4. **Where core and Purchasing meet** (owner ruling, 27 October 2026; made in the records named, in the same batch):
   - *Retiring and first use* ([ADR-003 SPEC 9.2, 3.3](../../product-model/spec/#9-status)) name open purchase orders. Products is core and cannot call Purchasing. Products ([ADR-003 SPEC 9.2](../../product-model/spec/#9-status)) declares an extension point "blocks retiring / counts as first use" that modules contribute to; Purchasing contributes open purchase order lines in step 2 and nothing in step 1. Step 1 has no purchase orders, so nothing breaks before then.
   - *A batch's supplier* ([ADR-006 SPEC 1](../../stock-ledger/spec/#1-where-stock-is-counted)): `stock_batch` holds `supplier_id` (plain id, no foreign key) and `supplier_name` (a copy at receipt, [ADR-006 SPEC 15](../../stock-ledger/spec/#15-storage)); the receive port takes both. Inventory never reads Purchasing's tables.
   - *The receipt's supplier picker* (7.3): Inventory's receipt screens, desk and floor, declare a field slot; Purchasing contributes the supplier picker, which returns the id and name; Inventory's receive takes `supplierId` beside the name and stores both as given, reading nothing of Purchasing's.
   - *Incoming from purchase orders* beside the four numbers ([ADR-006 SPEC 3.2](../../stock-ledger/spec/#3-the-four-numbers)): Inventory cannot call Purchasing. Inventory declares a slot on the product and stock screens that Purchasing contributes the "incoming" figure to, and Purchasing adds it to the list through its own query; Inventory stores none. Step 2.
5. **Tables** (tenant tables with the `purchasing_` prefix, declared through `tenantTable()`, queried through the typed query builder; no foreign key crosses modules, [ADR-000 SPEC 2](../../system-architecture/spec/#2-tables)): `purchasing_supplier`, `purchasing_product_supplier`, `purchasing_reorder`. Step 2 adds `purchasing_order`, `purchasing_order_line`. Schema changes expand, then contract ([ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying)). The unique indexes are on the company and the lower-cased name (suppliers), on the company, product and supplier (links), with a partial unique index on the company and product where `preferred` (one preferred per product), and on the company and product (levels).
6. **No stock write, no listing figure, no outside call.** Purchasing never inserts into `stock_*` and never sends anything in step 1.

## 11. Personal data and retention

1. **What is personal data.** `contact_name`, `contact_email` and `contact_phone` can name a person; a sole trader's own details are personal data under UK GDPR and EU GDPR. The `note` is asked not to hold any. The supplier's name can be a person's name too (a sole trader), so it is treated the same in an erasure.
2. **Retention** ([ADR-002 SPEC 2](../../data-retention/spec/#2-the-retention-schedule)): the first row of the schedule now reads: "Products, listings, stock levels, open orders and purchase orders, **suppliers and their contacts, product–supplier links and reorder levels**, settings, users | Always | Never | Deleted with the company". Suppliers are current state, never archived. An archived supplier's contact fields can be cleared by a Manager at any time; nothing clears them on a timer, because the seller is the controller of their own supplier list and the supplier is not Vervoro's data subject beyond hosting it.
3. **Copies.** The activity entry does not copy contact values (section 3.3). Exports of a company include the three tables ([ADR-012 SPEC 16](../../billing-and-plans/spec/#16-cancellation-export-erasure-and-refunds)); an erased company's rows go with it.
4. **Encryption.** Stored like other company data, not encrypted per field (that is for buyers' names and addresses, [ADR-009](../../buyer-data/)). The owner confirmed this on 27 October 2026.
5. **Seen by:** Owner, Admin, Manager only (section 9). No view log: it is not buyer data.
6. **Not shared:** contacts are never sent to a marketplace, a connector or another module, except in the list's download (section 6.6) to a role that may read them.

## 12. Step 2: purchase orders (outline)

*Later, ROADMAP 5.5.1, after Orders. Step 1 is ROADMAP 5.2.1. This outline is not a rule set and nothing here is built at step 1; step 2 gets its own SPEC batch first.*

1. **Optional.** Every rule of section 1.3 holds.
2. **A purchase order** has a number (a gap-free series per company, so a supplier can quote it), a supplier, lines (product, the supplier's code and name as they were that day, quantity, unit cost in the company's currency only (owner ruling, 27 October 2026), expected date = sent date + lead time used), and a status.
3. **Statuses:** `draft` → `sent` → `part_received` → `received`; `closed` (a manager closes a line or order that will not complete); `cancelled` (from draft or sent with nothing received). A purchase order with receipts cannot be cancelled. The list's position counts the open quantity of `sent` and `part_received` orders.
4. **Creating one:** from the list, one draft per supplier with the suggested quantities; or by hand, with no list involved.
5. **Sending:** download, print, or email, where the email is an egress effect through the gate ([ADR-000 SPEC 7](../../system-architecture/spec/#7-the-egress-gate)); in shadow, recorded only. The seller can mark it sent after phoning.
6. **Receiving.** On the order a Warehouse user or above receives a delivery: Purchasing calls Inventory's receive port with the order line as the source, one batch per delivery, lot and date as ADR-006 requires ([ADR-006 SPEC 8.5](../../stock-ledger/spec/#8-receiving)). Fewer than ordered leaves the rest incoming until a manager closes the line; more is received as counted and the surplus is shown. A receipt made without the order can be attached to its line later.
7. **Cost hand-off.** The line's unit cost plus the order's extras (freight, duty, handling, entered on the order, apportioned by value) is the batch's provisional landed unit cost, in the receive call. Correcting a cost afterwards calls Inventory's cost port and never touches quantities or the ledger ([ADR-006 SPEC 8.6](../../stock-ledger/spec/#8-receiving)). Purchase VAT and import VAT are the seller's accounting, not Vervoro's ([ADR-011](../../invoicing-and-vat/)).
8. **Measured lead time:** days from sent to first receipt, kept per product and supplier from the last five receipts, shown beside the quote on the card and the list.
9. **Retiring and first use:** the product's SKU is fixed after the first purchase order line ([ADR-003 SPEC 3.3](../../product-model/spec/#3-sku)); an open purchase order blocks retiring ([ADR-003 SPEC 9.2](../../product-model/spec/#9-status)), through the extension point of section 10.4.
10. **Permissions to add:** create, edit and send (Owner, Admin, Manager); receive (also Warehouse); see costs ([ADR-010](../../users-and-access/spec/#4-who-may-do-what)).
11. **Not in step 2:** several currencies on one order, landed cost by weight, forecasting, supplier portals, EDI, approvals, blanket orders, returns to supplier (a write-off or a return is Inventory's, [ADR-006 SPEC 8.4](../../stock-ledger/spec/#8-receiving)).

## 13. Research and constraints

| Constraint or finding | What it means here | Source |
| --- | --- | --- |
| Reorder point and lead time live outside Shopify's admin; lead time must be measured; a stock-out day looks like no demand; wholesale draws on the same stock | Level is the seller's number; measured lead time in step 2; the Later suggestion leaves out stock-out days | [Endless Commerce: how to reorder without Stocky](https://endlesscommerce.com/playbook/how-to-reorder-without-stocky/) |
| Per-product, per-location minimum, usual reorder quantity and maximum; the report includes customer backorders by a setting | Level and usual order per product; the position counts short lines from step 2 | [Veeqo: set re-order levels](https://help.veeqo.com/en/articles/3806756-set-re-order-levels) |
| Supplier pack size and minimum order stored with the supplier | Minimum and multiple on the link, because they differ by item | [Linnworks: supplier packs and minimum order quantity](https://www.linnworks.com/Doc/Supplier_Packs_and_Minimum_Order_Quantity.html) |
| Lead time of the last vendor shown; vendor changes at each reorder; a reorder point is lead-time demand plus safety stock | One preferred supplier, chosen by the seller; lead time per pair | [inFlow: recommended reorder point](https://www.inflowinventory.com/support/cloud/can-inflow-recommend-a-reorder-point-for-my-products) |
| Missing multiple suppliers per product is a reviewer's complaint | Up to 10 links | [Capterra: RestockPro reviews](https://www.capterra.in/software/144970/restockpro) |
| Shopify's native replacement for Stocky has no reorder suggestions, lead time or purchase order API; sellers move to apps for reorder suggestions and purchase orders | The gap is the list; purchase orders are the second layer | [Shopify community: Stocky shuts down](https://community.shopify.com/t/637085) |
| Amazon IPI penalises excess and stranded stock and rewards sell-through | A reorder list that ignores FBA stock and over-orders is a risk; FBA replenishment waits for FBA shipments | [Amazon: inventory performance](https://sellercentral.amazon.com/gp/help/external/202174810) (thresholds vary by source; recheck before FBA work) |
| UK and EU GDPR cover a sole trader's business contact details | Contact fields flagged, deleted with the company, clearable | [ICO: UK GDPR guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/) |

US-specific and Turkish marketplace and supplier tools are out of scope.

## 14. Tests that prove each rule

Database tests run on real Postgres under the runtime role ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)); the rounding and position functions are pure unit tests.

| Test | Proves |
| --- | --- |
| No purchase order | With no purchase order in the company: a product can get a supplier, code, level and lead time; stock can be received, counted and shipped; the list works |
| Links | A bundle is refused; an 11th link is refused; exactly one preferred; removing it promotes the oldest; an archived supplier is not offered |
| Lead time used | Link, else supplier, else none, and the source is named |
| Rounding | Below the minimum rises to it; a non-multiple rounds up; a minimum that is not a multiple takes the next multiple |
| List | At or below the level lists; 0 lists at 0 position; no row never lists; inactive and retired never list |
| Position | Held units never count; reserved units never count; units in transit count; a transfer between warehouses creates no need |
| Bundles | Selling a bundle lowers its components' position; the bundle itself is never listed |
| Scope | A scoped Manager is refused the list with a reason |
| Round trips | The list for 5,000 levels takes about three queries and one port call to each of Products and Inventory |
| Spreadsheet | Blank changes nothing, `(clear)` empties, errors write nothing, two preferred are refused |
| Personal data | Contact values are not in the activity entry; Warehouse, Accountant and Staff do not see contacts or the export columns |
| Isolation | Another company's suppliers, links and levels are invisible (the cross-company suite, [ADR-001 SPEC 14](../../database-architecture/spec/#14-tests-that-prove-each-rule)) |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Writers:** only Purchasing inserts into `purchasing_*`; the product tables have no supplier, lead time or level column.
- [ ] **No requirement:** no stock command, product command or listing command reads Purchasing; the no-purchase-order test is green.
- [ ] **No stock write:** nothing in Purchasing imports Inventory's write ports at step 1 (search the module).
- [ ] **No SQL:** all queries use the typed query builder.
- [ ] **Bundles:** the level and link commands refuse a bundle in the same transaction.
- [ ] **Position:** one function; held stock and reserved stock are not added; transit is.
- [ ] **Rounding:** one function used by the list, the download and (step 2) the order.
- [ ] **Stored state:** no column or table holds "needs reordering".
- [ ] **Scope:** the list command checks the person's warehouse scope.
- [ ] **Personal data:** contact fields are listed in the erasure and export; activity entries never copy them.
- [ ] **Later parts:** no purchase order table, mail, per-warehouse level or suggested level at step 1.
