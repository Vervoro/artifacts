# ADR-005 SPEC: Catalogue sync and linking

| | |
| --- | --- |
| **Decision** | [ADR-005: Catalogue sync and linking](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-005-catalogue-sync-and-linking) |
| **Date** | 21 October 2026; amended by the owner's sign-off of 25 October 2026 (the developer's review): a new link to a retired product refused (11); amended by owner delegation, 31 October 2026 (the developer's review before phase 5.3): the intake shape and the account copy (1.2), `listing_changed` (1.4), one observed time per source group (5.7), the held answer (8.4), a retired product's close (8.5), the multiple veto's edges (10.2), the figure from Inventory's sellable (11.1), a read and the link's fulfilment (11.7), Orders' values and All listings (13), the `listings_` prefix, `listings_account`, first seen and missing since (19), the closed link's columns (How to check); amended by owner delegation, 1 November 2026 (phase 5.3 as built): the order-line listing (8.1), a full read's ended status and the single read (8.3), the relist carry's timing and the seller told (9), the weak tier and shared-barcode (10.1), option values as a set (11.2), left out (11.3), the undo's choice (11.6), not stock on an unlinked listing (12.2), rows that leave the list (13); a listing first known ended (8.3) and the not-stock row's place (13.8), by owner delegation, 1 November 2026 (the drift-reviewer's re-run); a chunk's sightings and the order-line listing's presence (8.1, 8.3), by owner delegation, 1 November 2026 (the whole-module review) |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-005 from: the Listings module, core and always on, needing Products, and its part in Channels, which reads the marketplaces for it ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| Shopify listings: variant keys, one bulk operation per full read, product notices, variants not tracked or not at Vervoro's location | The Shopify connector is built ([ADR-004.3](../../shopify-connector/), owner ruling, 21 October 2026) | [2](#2-listings-and-keys), [6](#6-read-plan-per-marketplace), [7](#7-notices) |
| "Add a size": drafting missing family members from unpaired variations | ADR-003's family tools are built ([ADR-003 SPEC 0](../../product-model/spec/#0-at-launch-and-later)) | [11.2](#112-link-to-family) |

## 1. Who does what

1. **Listings writes** listings, their identifiers and presence, listing groups, suggestions, links, "separate stock" answers, not-stock marks and Amazon offer requests. No other module writes them.
2. **Channels reads.** It owns each read's schedule, cursor, budget and lane, calls the connector, and hands each chunk to Listings' port with the read's id, scope and `asOf`, each listing with its key and the attributes read; a field not read is absent, never empty; a relist names its parent's key; at most 500 listings a chunk. The read's end answers the new, changed and ended counts, and whether the read is held (8.4). It never writes a listing. Channels also tells Listings of each account through its port (`listings_account`, section 19): id, marketplace, label, served marketplaces, connected, disconnected or off, shadow or live, default warehouse.
3. **Listings asks by event.** A core module never calls Channels, so Listings asks for a single-listing read, a refresh or an Amazon offer send by an event Channels hears after commit.
4. **Listings announces link changes by event:** made, changed or closed, with the version, the units per sale and, on a close, the seller's choice of 0 or leave. Orders reserves waiting lines from it ([ADR-006 SPEC 6.5](../../stock-ledger/spec/#6-what-a-line-reserves)); Stock sync recomputes the figure ([ADR-008 SPEC 1](../../inventory-sync/spec/#1-the-figure-per-listing)); and a listing's state and observed fulfilment changes (`listing_changed`, with what changed), which Stock sync hears too.
5. **Listings sends held-raise reasons by event** (section 11.8); Stock sync keeps and clears them ([ADR-008 SPEC 7](../../inventory-sync/spec/#7-held-raises)).
6. **Orders calls Listings' port** to resolve a line to the link valid at purchase, to report an unknown listing, and to open a fulfilment conflict (section 16).
7. **Connectors stay isolated and switchable** ([ADR-004](../../channel-connectors/)): an account switched off reads nothing, and one marketplace's trouble stays its own.

## 2. Listings and keys

| Marketplace | A listing | Listing group (never linked) | Key | The SKU is |
| --- | --- | --- | --- | --- |
| eBay, Inventory API | An inventory item, with all its offers | Its inventory item group | `inv:{sku}` | The identity |
| eBay, Seller Hub | A single listing | — | `item:{item number}` | An attribute |
| eBay, Seller Hub variation with a SKU | One variation | The listing with variations | `item:{item number}/sku:{sku}` | The identity within the listing |
| eBay, variation without a SKU | One variation | The same | `item:{item number}/spec:{hash of its options}` | Absent: read, orders resolve, never linked or written ([ADR-004.1 SPEC 4.10](../../ebay-connector/spec/#4-listings-and-stock)) |
| Amazon Seller | One seller SKU, across the account's marketplaces | The parent ASIN | `sku:{sku}` | The identity |
| *Later:* Shopify | One variant | The product | `variant:{variant id}` | An attribute: it may be blank or shared |

1. **One key from both directions.** An order line names its listing the way a catalogue read does; the contract suite proves it per connector.
2. **A key format is fixed.** A connector that changes it ships a mapping from old keys to new in the same change.
3. **Listings are never deleted;** they move through states, so an old order line still resolves.
4. **Identifiers are attributes,** each indexed: item number, ASIN per marketplace, Amazon's unit label (FNSKU), and every barcode, normalised as in [ADR-003 SPEC 4](../../product-model/spec/#4-barcodes). Restricted and internal codes are stored but never matched.

## 3. States

`pending` (an Amazon offer Vervoro asked for, not confirmed), `active`, `inactive` (on the marketplace, not buyable), `missing` (one proof of ending), `ended`. A missing listing keeps its link and its figure. A disconnected account keeps its listings, marked so, and they sync nothing.

## 4. The catalogue capability

An optional capability, added to the connector contract as a typed addition ([ADR-004 SPEC 1.3](../../channel-connectors/spec/#1-the-connector-contract)). Each part is optional; Channels calls only what is declared.

| Part | Does | Returns |
| --- | --- | --- |
| Snapshot | Every listing on the account, by pages, or a report or bulk job Channels polls | Listings with keys and attributes, `asOf`, and whether it is complete |
| Changes since | Listings created, changed or ended since a time; only where the marketplace has a real filter | Listings, a cursor, the time up to which the window is complete |
| Details | Title, barcodes, image, options, pack quantity and relist parent for a set number of listings | Each value tagged as entered by the seller or from the marketplace's catalogue |
| Catalogue lookup | A marketplace product by code or barcode | Name, brand, barcodes, image, weight, sizes, pack quantity |
| Offer create | An offer for an existing marketplace product; a write, sent only by the egress gate | An outcome by [ADR-004 SPEC 5](../../channel-connectors/spec/#5-retries-and-outcomes) |

1. **Parse a notice** gains listing created, changed and ended.
2. **Nothing is made up:** a value the marketplace did not give is left out.
3. **The contract suite** adds: a snapshot that stops part-way is not complete; a changes read across pages survives a throttle; a relist, a variation without a SKU and one SKU on two listings each come back as section 2 says.

## 5. Reading

1. **Full reads** start on connect (in shadow; the seller sees progress and gets a push when done), once a day as a `due` row spread across the day by a hash of the account id ([ADR-001 SPEC 9](../../database-architecture/spec/#9-background-work-and-the-outbox)), and on the seller's refresh. Any complete full read resets the daily one. An account switched off has no row.
2. **Refresh caps,** platform settings: a whole catalogue at most once an hour and four times a day per account; one listing at most once every 15 minutes and 20 times a day per account. A refresh asked during a read joins it. A disabled button says why and when it opens.
3. **A single-listing read** follows a notice, an unknown listing on an order line, a one-listing refresh, or a second proof. Reads of the same listing are joined while one waits.
4. **Catalogue work comes last:** after stock writes, order fetches and read-backs, on the bulk lane, never a safety lane ([ADR-004 SPEC 7](../../channel-connectors/spec/#7-shared-daily-pools)).
5. **Reads survive crashes.** A page read saves its cursor with every chunk; a report read saves each step (requested, processing, downloading, applying, complete). A crash costs one lease period.
6. **Complete means complete:** every page or the whole report arrived, and the account, the company and the platform stayed switched on. Each chunk's transaction checks the account and the read's lease again, and drops the chunk if either changed. Switching off or disconnecting ends the read.
7. **Only what changed is written.** Each listing has a fingerprint of its attributes, leaving out quantity. Every value carries the time its source observed it (one time for presence, status and figure, one for details, one per identifier), and an older observation never overwrites a newer one.

## 6. Read plan per marketplace

| | eBay inventory items | eBay Seller Hub | Amazon Seller | *Later:* Shopify |
| --- | --- | --- | --- | --- |
| Presence (full and daily read) | Feed API active-listings report | The same report: SKU, item number, variations | All-listings report, one per served marketplace, active and inactive with status | One bulk operation over every variant |
| Details for unlinked listings | Inventory API pages | Trading API, listings started since the last read, inside the account's page cap | Catalogue lookup by ASIN, 20 a call | In the same bulk file |
| Notices | None | Trading API listed, revised, closed | Listing status changes, through the AWS bridge | Product created, updated, deleted |
| Changes since | None | None | Listings search by last update time | Products by update time |

1. **eBay: the report, not the Trading API,** for presence; it costs nothing from the Trading pool ([ADR-004.1 SPEC 5.4](../../ebay-connector/spec/#5-the-trading-pool)). Inventory items have no listing notices: a new one appears at the daily read, or sooner on refresh.
2. **eBay notices:** one subscription call on connect. A revised event carries the item, so its fingerprint is compared before any read, and the echo of Vervoro's own stock writes costs nothing.
3. **Amazon: the report for presence, the search for changes.** The search reaches at most 1,000 SKUs, so it cannot read a whole catalogue. A changes read that finds more than 1,000 is split into shorter windows; if a window still does, the account gets a fresh report. Both run per served marketplace, and presence is kept per marketplace.
4. **Amazon accounts on several marketplaces:** a SKU is one listing; its ASIN and status are kept per marketplace. A SKU only on an unserved marketplace is shown as not served and cannot be linked. A SKU Amazon ships on any served marketplace is marketplace-shipped ([ADR-004.2](../../amazon-seller-connector/)).
5. *Later:* **Shopify** reads every variant by a bulk operation inside the shop's cost budget ([ADR-004.3](../../shopify-connector/)). Blank or shared SKUs are keyed by variant id and can be linked; a variant not tracked or not stocked at Vervoro's location is shown with the fix.

## 7. Notices

A notice is a hint ([ADR-004 SPEC 8](../../channel-connectors/spec/#8-notices-in)); only a read changes a listing.

1. **Created, ended and deleted notices** always cause a single-listing read, and that read's answer is final at once.
2. **Changed notices** cause a read only when their fingerprint differs from the stored one and they are newer.
3. **Duplicates are dropped** by notice id. A notice older than the `asOf` of the last complete read of its scope is ignored.
4. **Bursts:** counting only notices that would cause a read, more than 200 for one account in 10 minutes become one changes read on Amazon (and *Later* Shopify). On eBay they become single-listing reads within the account's page cap; the next report covers the rest.
5. **Notices that look broken:** a daily read that finds more than 5 changes no notice announced marks the account's listing notices unreliable. Amazon then gets a changes read every hour; eBay, which has no cheap changes read, alerts the operator ([Repair a notice subscription](../../runbooks/repair-a-notice-subscription/)).

## 8. New and ended listings

1. **A new listing** (from a notice, a changes read, a full read or an order line) gets suggestions at once. A shared-stock listing alerts the seller (section 12). A listing first known from an order line is stored `active` with its details not read, so it is never strong, and Listings asks for a read of it; it counts as present in the order's scope from when it is first seen, so the proofs of 8.2–8.3 reach it.
2. **First proof:** missing from a complete read of its scope whose `asOf` is later than when the listing was first seen. It becomes `missing`.
3. **Second proof:** for a linked listing, a read of that one listing says it ended or does not exist; eBay's report may leave out a listing at 0, and the search leaves out inactive SKUs. For an unlinked listing, that, or missing again from a complete read at least 20 hours later. A single-listing read that does not see a missing listing ends it; one that does not see a present listing marks it missing. A full read's chunk that reports a listing ended is a first proof, applied when the read completes; nothing goes missing or ends from an incomplete read, while what a chunk sees present is applied with the chunk. A listing first known from a read that reports it ended is stored ended; it has no link and gets no figure.
4. **A read that would end too much is held:** more than 10 % of a scope missing, and at least 20 listings. Nothing changes, the operator is alerted, and the read is due again in an hour. If the next read finds the same listings missing, it stays held until the operator releases it after checking ([Settle a held catalogue read](../../runbooks/settle-a-held-catalogue-read/)). Listings works out a read's missing share at its end and answers "held" to Channels, which keeps the read's state; the release is Listings' port, called from the runbook's console step.
5. **An ended listing keeps its link,** gets no figure, and resolves late orders and returns. The seller sees it in the daily digest; it alerts only if it had open orders, or its product still has stock and no seller-shipped listing left. An ended listing does not count against retiring a product ([ADR-003 SPEC 9](../../product-model/spec/#9-status)); retiring closes its link, and a link closed because its product was retired records 0 (an ended listing gets no figure anyway).
6. **A listing that comes back** keeps its link only if its marketplace product (ASIN, eBay item or parent) and its barcodes are unchanged, and its raises are held until the seller looks. Otherwise its link closes and the old product is offered as a suggestion.

## 9. Relists and SKU changes

| What happened | Same key? | What Vervoro does |
| --- | --- | --- |
| A SKU edited on a Seller Hub listing | Yes | The link stays; the seller is told the old and new SKU, with a way to relink |
| A SKU edited onto another product's SKU | Yes | A conflict (section 16) |
| An eBay relist eBay declares (the new item names the old), with the same SKU, fulfilment, options, title, lot size and variations, and no veto | No | The link carries over by the same compare-and-set as a person; the seller is told, with Undo, which returns the listing to unlinked |
| Any other relist, or "sell similar" | No | A successor suggestion: the old link's product and units per sale |
| An Amazon SKU deleted and made again, or an eBay inventory item renamed | No | The old listing ends; the new one gets a successor suggestion when the connector names the old key; a rename with no parent named gets none |

1. **A declared relist carries the link when the chunk declares the parent,** whether or not the old listing has ended; the old link stays until the old listing ends (duplicates are allowed, section 16).
2. **"The seller is told"** (here and in 8.6) is a state on the listing's row and page, cleared by a person who may link; no mail or push.

## 10. Suggestions

1. **Three tiers from fixed rules,** with no score shown and no learned or fuzzy model.

| Tier | Rule | Bulk accept |
| --- | --- | --- |
| Strong | The listing's SKU equals a product's SKU, ignoring case, with no veto. Or a barcode the seller entered on the listing equals one product's unit barcode, with no veto, the listing's SKU naming no other product, and no other listing on the account carrying that barcode | Yes |
| Medium | A SKU match once a known suffix is removed (`-FBA`, `-6PK`); a barcode only from the marketplace's catalogue; the same ASIN or barcode linked on another account of the company; a successor; a strong match demoted by a veto or a shared barcode (a barcode another listing of the same account carries: `shared-barcode`) | One at a time |
| Weak | A similar title: every word of the product's name is in the listing's title, ignoring case and punctuation; worked out when a listing's page opens, never stored in bulk | Shown only |

2. **Vetoes** demote strong to medium, and the row says why: a pack word or count in the title or SKU, from a fixed, tested list per language; the marketplace's pack quantity above 1; the barcode belongs to a pack product or a box size (then the box's units per sale is proposed); the marketplace's figure near a whole multiple of 2 or more of Vervoro's (both figures at least 1, and the larger divided by the smaller within 10 % of a whole number of 2 or more; a 0 on either side fires nothing); two products match; the product is retired.
3. **A veto that could not be checked counts as fired.** A listing whose title, or pack quantity where the marketplace has one, is not yet read is never strong; the row says "details not yet read".
4. **Packs and bundles.** The picker offers simple products, packs and bundles, each with its kind. A sealed pack's barcode suggests the pack product. Three units of one product is units per sale = 3, never a bundle ([ADR-003 SPEC 6](../../product-model/spec/#6-product-kinds)).
5. **Suggestions record the listing and product versions they used.** Accepting checks both again; a stale suggestion is recomputed, never applied. A dismissed one stays dismissed until its evidence changes.

## 11. Linking

The link's fields and what a sale reserves are [ADR-003 SPEC 8](../../product-model/spec/#8-the-link-from-a-listing).

### 11.1 The preview

1. **Every link screen and bulk preview shows units per sale** (1 written out, never assumed) **and the figure change:** what the marketplace shows now and what Vervoro would send: up to the product's sellable in the account's warehouse divided by units per sale (Inventory's port; Stock sync's buffers come later, [ADR-008 SPEC 1](../../inventory-sync/spec/#1-the-figure-per-listing)), shown only to a person whose scope covers that warehouse ([ADR-010 SPEC 3.2](../../users-and-access/spec/#3-roles-and-warehouse-scope)); tiers and vetoes are worked out as the system, whoever looks.
2. **A ratio of 3 or more either way** is highlighted and leaves bulk accept. The shadow check runs the same ratio over confirmed links ([ADR-008 SPEC 14.1](../../inventory-sync/spec/#14-shadow-and-going-live)).
3. **It says what happens to orders:** how many open orders keep their old link, and how many waiting lines will be reserved, and how many short ([ADR-006 SPEC 6.5](../../stock-ledger/spec/#6-what-a-line-reserves)).

### 11.2 Link to family

1. **"Link to family"** on a listing group pairs each variation with the family member that has the same SKU, or else the same option values as a set, ignoring case, spaces and option names ([ADR-003 SPEC 10](../../product-model/spec/#10-sizes-and-colours)).
2. **One preview and one confirm, still one link per variation;** any pair can be unticked and later changed alone.
3. **A pair made only by option values is medium;** vetoes and the ratio check apply to each pair.
4. **What does not pair stays unlinked,** with its reason. *Later:* "Add a size" drafts the missing members; at launch they are made with Make product.
5. **The group is never linked itself.**

### 11.3 Bulk accept

1. Strong suggestions only, on every row in the filter, not only those on screen.
2. Previewed in full: grouped by product, products gaining more than one listing first, five random rows to spot-check, and the total change in figures.
3. Never sets units per sale above 1.
4. One recorded batch, written in chunks of 500 links a transaction. Undo closes only the links still belonging to the batch, and says how many it skipped. The preview's "left out" counts the rows with a ratio of 3 or more together with rows a concurrent change skipped.
5. **On a live account, raises wait** for one "send raises" confirm: one list with a total, any row can be unticked. Decreases go at once. Unconfirmed raises remind the seller once after 24 hours.

### 11.4 Versions

1. **A link change closes the current link and opens a new one in one transaction,** compare-and-set against the link the person saw; the loser sees who changed it and to what.
2. **Every automatic or bulk link uses the same compare-and-set.** A read never writes a link.
3. **The link records** when it began and ended, who made it, and how: a person, from a listing, bulk accept, a relist carry, or an Amazon offer.
4. **It names its listing and product by plain ids,** checked through the owner's port in the same transaction; no foreign key crosses modules ([ADR-000 SPEC 2](../../system-architecture/spec/#2-tables)).

### 11.5 Orders and links

1. **Open orders keep their link.** A relink applies to orders received afterwards and to open lines that arrived unlinked and are not yet dispatched ([ADR-006 SPEC 5.3 and 6.5–6.6](../../stock-ledger/spec/#6-what-a-line-reserves)).
2. **The purchase time decides the link:** an order belongs to the link valid when the buyer bought, found from the link's start and end. A sale after an unlink is an order for an unlinked listing.

### 11.6 Unlinking

Closing a link without a new one, by a person or by an undo. A product with linked listings cannot be retired, and a new link to a retired product is refused ([ADR-003 SPEC 9.2](../../product-model/spec/#9-status)).

1. **Reserved orders keep their stock** ([ADR-006 SPEC 6.6](../../stock-ledger/spec/#6-what-a-line-reserves)); the screen says how many.
2. **The listing is sent 0 by default.** The screen offers "Set to 0 and unlink", the default, or "Leave the marketplace's figure", showing the figure. The choice is recorded on the closed link, and Stock sync carries it out as a stop ([ADR-008 SPEC 10.2](../../inventory-sync/spec/#10-listing-modes-and-stopping)). An undo in the toast right after a link, and a bulk undo, record `leave` when no figure was sent under the link (an account in shadow); otherwise the unlink screen opens with its choice.
3. **A marketplace-shipped listing** never gets a figure, so unlinking it sends nothing.
4. **Relinking is a new link.** Orders already dispatched while unlinked stay flagged; the seller attaches each to a product from the order ([ADR-007](../../order-ingestion/spec/#14-orders-for-unlinked-listings)).

### 11.7 Fulfilment changes

1. **Seller-shipped to marketplace-shipped** stops figures at once.
2. **Marketplace-shipped to seller-shipped** gets no figure until the seller confirms, because it exposes warehouse stock.
3. **An order line's own fulfilment decides whether it reserves** ([ADR-006 SPEC 6.8](../../stock-ledger/spec/#6-what-a-line-reserves)); a mismatch opens a conflict.
4. **A read changes only the listing's observed fulfilment;** the link keeps its own. A figure goes only while both say seller; the change to seller-shipped is confirmed by a person's relink.

### 11.8 Held-raise reasons Listings sends

The listing came back after ending (8.6); its SKU was edited onto another product's (9); a live bulk link is not confirmed (11.3.5); a fulfilment conflict is open (16); a fulfilment change waits for the seller (11.7.2). Each clears with its own answer. Decreases are never held. The first figure after a link is [ADR-008 SPEC 11](../../inventory-sync/spec/#11-the-first-figure-after-a-link).

## 12. Unlinked listings and going live

1. **An unlinked listing is left to the marketplace.** It gets no figure; its orders are imported and flagged ([ADR-007](../../order-ingestion/spec/#14-orders-for-unlinked-listings)). Unlinked is the default and needs no mark. The account shows how many listings are left to the marketplace.
2. **Not stock.** A listing that sells no stock is marked "not stock" with a VAT class by those who may link ([ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what)). It is never linked and gets no figure; its order lines are charge lines ([ADR-003 SPEC 1.1](../../product-model/spec/#11-charge-lines-and-listings-that-are-not-stock), owner ruling, 21 October 2026). Removing the mark makes it an ordinary unlinked listing. The mark is offered only on an unlinked listing: unlink first.
3. **A shared-stock listing** is an unlinked, buyable, seller-shipped listing with a strong or medium suggestion naming a product already linked elsewhere, or in a listing group with a linked member. It takes stock Vervoro does not deduct.
4. **Going live on an account needs** a complete catalogue read, no open conflict, and an answer for every shared-stock listing: link it, or "separate stock, leave to the marketplace". Many can be answered at once, with a confirm that names the risk. The answer is recorded (listing, evidence, who, when), creates no link, and is asked again when a new strong suggestion appears. Every other unlinked listing is a count, never a blocker. How accounts go live is [ADR-008 SPEC 14](../../inventory-sync/spec/#14-shadow-and-going-live).
5. **After going live,** the seller gets one push per listing for a new shared-stock listing, and for the first order on an unlinked listing with a strong or medium suggestion and no "separate stock" answer. Orders on other unlinked listings go to the daily digest.
6. **Figures go only to linked listings.** On eBay, the lookup of every listing a SKU is on ([ADR-004.1 SPEC 4.1](../../ebay-connector/spec/#4-listings-and-stock)) finds listings to suggest, not places to write; an unlinked Seller Hub listing carrying a linked SKU is a strong suggestion and a shared-stock listing.

## 13. The unlinked-listings list

1. **Order:** listings an open order names, soonest dispatch deadline first; shared-stock listings; strong and medium suggestions sold in the last 30 days, most sold first (from imported orders, no calls); other strong and medium suggestions; the rest, by account.
2. **Each row:** image, title, account, SKU (or "no SKU" with the item number), options, who ships it, the figure shown now, open orders, 30-day sales, and the best suggestion with tier, reason and any veto. **Buttons:** Link, Make product, Leave to marketplace, Not stock, and Link to family on a variation whose group has unlinked members. A wide screen shows columns with a select box per row.
3. **Filters:** account, tier, who ships it, open orders, sold recently, has a barcode, no SKU, needed for going live, ended. **Search** by SKU, title, barcode, item number or ASIN, or by scanning with the phone's camera.
4. **The header** shows each account's read: in progress with counts, or why it waits and when it resumes, and when it last completed.
5. **Listings that cannot be linked** stay on the list with the fix: a variation without a SKU (add one on eBay, then refresh that listing), a SKU on an unserved marketplace.
6. **Orders' values** (open orders, 30-day sales, the preview's order counts) are Orders' values on Listings' list extension point and an Orders card on the link screen; Listings never calls Orders.
7. **Every listing,** linked or ended included, is reachable from Listings › All listings with the same search and filters, read by every role ([ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what)).
8. **A listing answered "separate stock" leaves the unlinked list** and stays under All listings and the "needed for going live" filter; one marked not stock leaves it and stays under All listings.

## 14. Making a product from a listing

ADR-003's creation from a listing ([SPEC 13](../../product-model/spec/#13-creating-products)), in one tap.

1. **Make product** fills a draft from the listing: SKU, title as the name, brand, barcode, main image and weight where given. The person checks and saves; product, barcode and link are written in one transaction. Units per sale is 1 unless changed.
2. **A SKU that already belongs to a product** refuses the draft and offers that product as a strong match.
3. **Make N products** groups the selected listings across accounts by barcode, then SKU, one draft each, never two listings from one account in a draft. It shows the spreadsheet preview and offers "edit as spreadsheet" ([ADR-003 SPEC 14](../../product-model/spec/#14-spreadsheet-import-and-bulk-edit)). One confirm creates and links them all.
4. **Make a bundle** opens the bundle form with the listing's name and photo, and links on save.

## 15. Offering a product on Amazon by ASIN

A write through the egress gate ([ADR-000 SPEC 7](../../system-architecture/spec/#7-the-egress-gate)); in shadow it is only recorded.

1. **Find the ASIN** from the product's barcode, or a pasted ASIN or link, by catalogue lookup. The screen shows its title, image, identifiers and pack quantity.
2. **Check the seller may sell it:** Amazon's listing restrictions for the marketplace and condition. "Approval needed" stops with Amazon's link to apply; "not allowed" stops with the reason.
3. **Fill the offer.** SKU: the product's by default; refused if that SKU exists on another ASIN on the account; a warning if the account already sells this ASIN under another SKU. Condition, who ships it, units per sale (confirmed by the person when the ASIN's pack quantity is above 1 or its identifiers lack the product's barcode).
4. **The price is the seller's:** typed by them, passed to Amazon once, never stored or proposed ([ADR-003](../../product-model/)).
5. **Validate, then send:** Amazon's validation preview first, its issues shown; then the gate sends the offer at quantity 0.
6. **Pending until Amazon confirms.** The listing and its link exist at once as `pending`, with no figure, until a read shows the offer buyable with no blocking issue. Later issues appear on the listing. A refused offer ends the listing and closes its link.

## 16. Conflicts

Answered one at a time, never in bulk.

| Conflict | Until it is answered |
| --- | --- |
| A listing's SKU and barcode point at different products | Stays unlinked; no suggestion is strong |
| A SKU edited onto another product's SKU | Link kept, decreases go, raises wait |
| A seller-shipped order on a listing linked as marketplace-shipped (opened by Orders, [ADR-007](../../order-ingestion/spec/#15-marketplace-shipped-lines-and-conflicts)) | The order reserves; raises wait for the seller's answer |
| A listing came back as a different marketplace product | The old link is closed; the old product is suggested |

**Duplicates are allowed.** Several listings may link to one product, on one account or across accounts; each gets the figure. Same-account duplicates are a warning on the product page, not a conflict.

## 17. Budget

1. **eBay's Trading API is the only shared pool catalogue work touches.** Catalogue may spend at most 15 % of a shared pool's bulk lane a day across the platform, inside the account's daily page cap ([ADR-004.1 SPEC 5.3](../../ebay-connector/spec/#5-the-trading-pool)), never a safety lane.
2. **Single-listing Trading reads** come from the account's page cap, at most once per item a day; beyond that the item waits for the next report.
3. **Seller Hub listings matched by SKU cost no Trading call.** Unlinked ones cost one page per 200; presence comes from the report on day one, so only details wait.

## 18. What people see

1. **The seller, per account:** the last complete read and its source, a read in progress or why it waits, notices in the last day, "not notified" or "notices unreliable", and counts of unlinked, shared-stock and missing listings.
2. **The operator:** catalogue's share of each shared pool; accounts with no complete read for 48 hours (an alert); held reads; notice bursts turned into one read; dead letters. Many accounts failing on one marketplace is one incident ([ADR-004](../../channel-connectors/)).

## 19. Storage

Listings' tables carry the `listings_` prefix ([ADR-000 SPEC 2.1](../../system-architecture/spec/#2-tables): the module's id), are declared through `tenantTable()` and queried through the typed query builder; modules write no SQL ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)). Schema changes expand, then contract ([ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying)).

| Table | Holds |
| --- | --- |
| `listings_account` | Channels' account id, marketplace, label, served marketplaces, connected, disconnected or off, shadow or live, default warehouse; written only through Listings' port, which Channels calls in its own transaction |
| `listings_listing` | Account, key, SKU, title, image, figure shown, observed fulfilment, state, linkable and why not, group, fingerprint, observed at (per source group, 5.7), first seen, version, not-stock mark and VAT class |
| `listings_identifier` | Item numbers, ASINs per marketplace, unit labels, barcodes, each indexed |
| `listings_presence` | Per listing and scope: present, missing or absent, the read that last saw it, missing since (the `asOf`), the read holding it |
| `listings_suggestion` | Listing, product, rule, tier, proposed units per sale, evidence, versions used, state |
| `listings_link` | One row per version: listing, product, units per sale, fulfilment, how made, began, ended, who, the closing choice (0 or leave), batch |
| `listings_decision` | "Separate stock" answers: listing, evidence, who, when |
| `listings_offer_request` | Amazon offer: product, ASIN, SKU, condition, units per sale, state, Amazon's issues; never the price (made with section 15) |
| `chan_catalogue_read` (Channels) | Each read: account, scope, trigger, method, `asOf`, cursor, counts, state (running, complete, partial, suspect, held, failed) |

1. **One current link per listing,** by a partial unique index.
2. **One running read per account and scope,** by a partial unique index, so a second refresh or daily read joins it.

## 20. Constraints

Checked against each marketplace's documentation on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| eBay active-listings report | Feed API task `LMS_ACTIVE_INVENTORY_REPORT`: SKU, item number, price and quantity of active listings | [Feed API](https://developer.ebay.com/develop/api/sell/feed_api.md) |
| eBay Feed API limits | 100,000 calls a day for the application; 400 requests a day per seller per feed type, beyond which they count against the application | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| eBay listing notices | No general listing topic in the Notification API; the Trading API's platform notifications include listed, revised and closed | [Notification API](https://developer.ebay.com/develop/api/sell/notification_api) |
| eBay Trading API | 5,000 calls a day for the application by default | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Amazon listings search | 5 a second per seller and application; 20 a page and 1,000 SKUs in all; filters by created and updated time; up to 20 identifiers | [Listings Items API rate limits](https://developer-docs.amazon/sp-api/docs/listings-items-api-rate-limits), [API model](https://github.com/amzn/selling-partner-api-models/blob/main/models/listings-items-api-model/listingsItems_2021-08-01.json) |
| Amazon all-listings report | `GET_MERCHANT_LISTINGS_ALL_DATA`: every SKU with status, one marketplace a request, possibly from a cache a few hours old | [Inventory report types](https://developer-docs.amazon/sp-api/docs/report-type-values-inventory) |
| Amazon listing notices | Status changes (created, deleted, buyable) on the event bus only | [EventBridge notifications](https://developer-docs.amazon/sp-api/docs/set-up-notifications-with-amazon-eventbridge) |
| Amazon offer on an existing ASIN | An offer-only listing put; restrictions through the Listings Restrictions API | [Listings Items API](https://developer-docs.amazon/sp-api/docs/listings-items-api) |
| *Later:* Shopify product notices | Product created, updated and deleted webhooks; variants arrive in product updates | [Webhooks](https://shopify.dev/docs/api/webhooks/latest) |

## 21. Tests that prove each rule

Pure rules (keys, tiers, vetoes, proofs) run as unit tests; ports, versions and indexes on real Postgres; marketplace behaviour on the simulators and the contract suite ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)).

| Test | Proves |
| --- | --- |
| Writer | Only Listings writes `listing_` tables; Channels' read hands chunks to the port and writes none |
| Key | A listing gets the same key from a read and from an order line, per connector |
| One link | Two current links for one listing are refused; two people linking at once leave one winner, the other told |
| Read never links | No read, notice or suggestion writes a link; the relist carry uses the person's compare-and-set |
| Observed time | An older observation never overwrites a newer value |
| Complete | A read cut part-way, or across an account switched off, is not complete and ends nothing |
| Two proofs | No listing ends from one read, an incomplete read or a held read; a linked listing ends only on a single-listing read |
| Held read | A read finding 10 % and 20 listings missing changes nothing until released |
| Unread veto | A listing with title or pack quantity unread is never strong |
| Bulk | Bulk accept takes strong only, never units per sale above 1, and leaves rows with a ratio of 3 or more |
| Stale suggestion | Accepting checks both versions; a stale one is recomputed, never applied |
| Purchase time | A sale before an unlink, whose notice arrives after it, reserves under the old link |
| Open orders | A line's reservation never changes because a link changed |
| Waiting lines | Waiting lines reserve in Orders' transaction after the link commits, never in Listings' |
| Unlink | The closed link records 0 or leave, and the event carries it; 0 is the default |
| Figures | No figure goes to an unlinked, not-stock, pending, ended or marketplace-shipped listing |
| Not stock | A not-stock listing cannot be linked; its lines import as charge lines |
| Going live | An unanswered shared-stock listing blocks going live; other unlinked listings do not |
| Offer | An offer goes only through the gate, at quantity 0, and no price is stored |
| Never deleted | The running system deletes no listing |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **One writer:** only Listings' code writes `listing_` tables; Channels and the connectors import only its port.
- [ ] **No calls out of the core:** Listings imports nothing from Channels, Orders or Stock sync; reads and offers are asked by event.
- [ ] **No SQL:** every query uses the typed query builder; no `sql` or `raw` import in the module.
- [ ] **Key:** one key builder per connector, shared by catalogue and order parsing; the key test is green for each.
- [ ] **Compare-and-set:** every link write, bulk, relist carry and undo included, goes through one function that checks the version seen.
- [ ] **Versions:** links are closed and inserted, never updated in place except the end time, who ended it and the closing choice.
- [ ] **Proofs:** the ending code reads `asOf`, the read's completeness and the held state; a linked listing's second proof is a single-listing read.
- [ ] **Vetoes:** an unread field is treated as a fired veto in one place.
- [ ] **Events:** link made, changed and closed carry the version and closing choice; Orders and Stock sync handle them after commit.
- [ ] **Lane:** every catalogue call is on the bulk lane, after stock writes and order fetches.
- [ ] **Egress:** the Amazon offer goes through the gate; no price column exists.
- [ ] **Later parts:** no Shopify catalogue path and no "Add a size" at launch.
