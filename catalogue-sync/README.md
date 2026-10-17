# ADR-005: Catalogue sync and linking

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026 |
| **Scope** | How Vervoro learns what each seller has listed on every marketplace (the full read on connect, change notices, a manual refresh and a daily safety read, new and ended listings), and how each listing is tied to a product: suggestions and how sure each one is, the unlinked-listings list, creating a product from a listing, creating an Amazon offer for a product, bundles and packs, link changes while orders are open, and conflicts |
| **Builds on** | [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-003: Product model](../product-model/), [ADR-004: Channel connectors](../channel-connectors/), with [ADR-004.1](../ebay-connector/), [ADR-004.2](../amazon-seller-connector/) and [ADR-004.3](../shopify-connector/) |

## Context

ADR-003 decided that a listing links to exactly one product, with the number of units one sale uses and who ships it. ADR-004 decided that each connector can read every listing on an account, and that the host owns the calls and their limits. This record decides how the listings get there, how they stay current, and how a person ties each one to a product.

Vervoro is the stock master. Every figure a marketplace shows for a linked listing comes from Vervoro. So a wrong link is worse than no link: it sends one product's stock to another product's listing, or multiplies a figure by a pack size.

The design has to meet these requirements:

- **Sellers arrive with listings.** A typical seller has 100 to 5,000 listings on two or three marketplaces before they connect Vervoro. Most were made in the marketplace's own tools, years ago, by different people.
- **A SKU or barcode match says which product, never how many units a sale uses.** A six-pack listing often carries the single's SKU or barcode. Linked at one unit per sale, it shows six times the real stock.
- **Vervoro manages only the listings a person links.** The marketplace keeps managing the rest. An unlinked listing is not an error; it is the seller's choice, made or not yet made.
- **Marketplaces change listings without asking.** A seller relists, renames a SKU, deletes and recreates, or edits in bulk. Some of it comes with a notice, much of it does not, and no notice is guaranteed.
- **Listing identity is not the SKU.** eBay gives a relisted item a new item number. Amazon cannot rename a SKU, only delete it and make a new one. Shopify allows a blank SKU, or the same SKU on two variants.
- **Shared allowances are tight.** eBay's Trading API allows 5,000 calls a day for the whole application, shared by every seller (ADR-004.1). Reading a catalogue must not spend what protects another seller's stock.
- **Phone first.** Onboarding 5,000 listings on a phone pushes a seller to accept everything without reading. The safe path has to be the fast path.
- **Connectors stay isolated and switchable** (ADR-004). One marketplace's trouble stays its own, and an account that is switched off reads nothing.

## Decision

1. **A listing is the smallest thing a marketplace sells and counts on its own:** an eBay inventory item, a Seller Hub listing or one of its variations; an Amazon seller SKU across the account's marketplaces; a Shopify variant. Parents (an eBay listing with variations, an Amazon parent ASIN, a Shopify product) are listing groups. They are shown, never linked. A variation links to one member of a product family (ADR-003), and a whole group can be paired with a family in one step.
2. **A listing's identity is a key built from the marketplace's most stable id, never the bare SKU.** The SKU, item number, ASIN, barcode and variant id are attributes. The same listing gets the same key from a catalogue read and from an order line.
3. **Catalogue reading is one optional connector capability:** a full snapshot, changes since a time, details, catalogue lookup, and offer create. The host owns the schedule, the budget and the storage.
4. **Three triggers start a full read:** connecting an account, the daily safety read, and the seller's refresh. A notice, or an order that names an unknown listing, starts a read of that one listing. All of it is the lowest-priority work on the account, on the bulk lane.
5. **Presence comes from the cheapest complete source; details only for listings without a link.** A listing matched by its SKU needs no title or barcode fetch.
6. **A notice is a hint.** It causes at most one read. It never changes a listing or a link by itself.
7. **A listing ends only on two proofs,** and only from complete reads. A read that would end too many listings at once is held. An ended listing keeps its link, gets no figure, and still resolves late orders and returns.
8. **Every link is made by a person.** The one exception is an eBay relist that eBay itself declares, with nothing about the listing changed: its link carries over, and the seller is told.
9. **Suggestions come in three tiers from fixed rules,** with a list of vetoes that demote a match. Only the strong tier can be accepted in bulk. A veto that could not be checked counts as fired.
10. **Every link shows units per sale and the figure change before it is made.** Bulk accept never sets units per sale above 1. On a live account, a bulk link sends decreases at once and holds raises for one confirm.
11. **Links are versioned.** A change closes the current link and opens a new one. Open orders keep the link they were reserved with, and an order belongs to the link that was valid when the buyer bought. Unlinking sends the listing 0 unless the seller chooses to leave the marketplace's figure.
12. **An unlinked listing is left to the marketplace.** Going live needs an answer only for unlinked listings that look like they share stock with a linked product.
13. **Figures go only to linked listings,** on every marketplace.
14. **A product can be made from a listing in one tap,** and an existing product can be offered on Amazon by ASIN, through a checked write at quantity 0.
15. **Vervoro writes nothing to a listing except its quantity and the offers the seller asks for.**

## How it works

<!-- DIAGRAM -->

A trigger asks the host for a read. The host runs it through the connector and the account's HTTP binding (ADR-004), page by page or report by report, and saves each chunk with its cursor. Each listing is stored under its key. When a full read completes, the host works out which listings it no longer saw, and starts the proof that they ended.

New and changed listings without a link get suggestions. They appear in the unlinked-listings list, where a person links them, makes a product from them, or leaves them to the marketplace. A link is written by the foundation, which is the only code that changes what a listing should show (ADR-000). Inventory sync then sends linked listings their figure (ADR-008).

## Listings and their identity

**What a listing is.**

| Marketplace | A listing | Listing group (never linked) |
| --- | --- | --- |
| eBay, Inventory API | An inventory item, with all its offers | Its inventory item group |
| eBay, Seller Hub | A single listing, or one variation of a listing | The listing with variations |
| Amazon Seller | One seller SKU, across the account's marketplaces | The parent ASIN |
| Shopify | One variant | The product |

**The key.** The connector builds each listing's key from what the marketplace keeps stable:

| Listing | Key | The SKU is |
| --- | --- | --- |
| eBay inventory item | `inv:{sku}` | The identity: eBay names inventory items by SKU |
| eBay Seller Hub listing | `item:{item number}` | An attribute |
| eBay variation with a SKU | `item:{item number}/sku:{sku}` | The identity within the listing |
| eBay variation without a SKU | `item:{item number}/spec:{hash of its options}` | Absent. Readable, its orders resolve to it, but it cannot be linked or updated (ADR-004.1) |
| Amazon seller SKU | `sku:{sku}` | The identity: Amazon cannot rename a SKU |
| Shopify variant | `variant:{variant id}` | An attribute: it may be blank or shared (ADR-004.3) |

- **One key from both directions.** An order line names its listing the same way a catalogue read does. The shared contract test suite proves it for every connector.
- **A key format is fixed.** A connector that changes how it builds keys ships a mapping from old keys to new in the same change.
- **Listings are never deleted.** They move through states. An order line from two years ago still resolves to its listing.
- **Identifiers are attributes.** The item number, ASIN (per marketplace), Amazon's unit label (FNSKU), Shopify's inventory item, and every barcode are stored beside the listing, each indexed, so an order, a scan or a match can find the listing by any of them. Barcodes are normalised and checked as in ADR-003; restricted and internal codes are stored but never matched.

**States.** `pending` (an offer Vervoro asked Amazon to create, not yet confirmed), `active`, `inactive` (on the marketplace but not buyable), `missing` (one proof of ending), `ended`. An account that is disconnected keeps its listings, marked as such, and they sync nothing.

## The catalogue capability

A connector that can read a catalogue declares this capability (ADR-004). Each part is optional, and the host calls only what is declared.

| Part | What it does | What it returns |
| --- | --- | --- |
| **Snapshot** | Reads every listing on the account, page by page, or as a report or bulk job the host polls | Listings with their keys and attributes, the time the snapshot describes (`asOf`), and whether it is complete |
| **Changes since** | Reads the listings created, changed or ended since a time. Declared only where the marketplace has a real filter | Changed listings, a cursor, and the time up to which the window is complete |
| **Details** | Reads title, barcodes, image, options, pack quantity and relist parent for up to a set number of listings | Each value tagged by where it came from: entered by the seller, or from the marketplace's catalogue |
| **Catalogue lookup** | Looks up a marketplace product by its code or barcode | Name, brand, barcodes, image, weight, dimensions, pack quantity, product type |
| **Offer create** | Creates an offer for an existing marketplace product. A write, so only the egress gate sends it | A gate outcome (ADR-000) |

Parse-notice (ADR-004) gains three results: listing created, listing changed, listing ended. A connector leaves out what the marketplace did not give. It never makes up a title, a barcode or a pack quantity.

The contract test suite grows with the capability: a snapshot that stops part-way is not complete; a changes read across pages survives a throttle; a relist, a SKU-less variation and one SKU on two listings each come back as the table above says.

## Reading the catalogue

**Three triggers start a full read.**

- **On connect.** The first read starts as soon as the account is connected, in shadow (ADR-004). The seller sees its progress and can leave; a push says when it is done.
- **The daily safety read.** One full read per account a day, as a `due` row (ADR-001), its time spread across the day by a hash of the account id. Any complete full read, including a refresh, resets it. Accounts that are off have no row.
- **Refresh.** The seller asks. A whole-catalogue refresh runs at most once an hour and four times a day per account; a refresh of one listing at most once every 15 minutes, and at most 20 such refreshes a day per account. Both caps are platform settings. A refresh asked while a read runs joins that read. When the button is disabled, it says why and when it opens.

**A single-listing read** follows a notice, an order line that names a listing Vervoro does not know, or a refresh of one listing. Reads of the same listing are joined while one is waiting.

**Catalogue work comes last.** Within an account, it runs after stock writes, order fetches and read backs, under its own job key, so a long read never holds an order or a decrease (ADR-004). It uses the bulk lane, never a safety lane.

**Reads survive crashes.** A page read saves its cursor with every chunk it writes. A report read saves each step: requested, processing, downloading, applying, complete. A crash costs one lease period, never a restart from the first page.

**Complete means complete.** A read is complete only if every page, or the whole report, arrived, and the account, the company and the platform stayed switched on throughout. The read checks the switches at every chunk. The transaction that saves a chunk checks the account and its own lease again, and drops the chunk if either changed. Switching an account off or disconnecting it ends its read.

**Only what changed is written.** Each listing carries a fingerprint of its attributes; an unchanged listing is not rewritten. Every saved value carries the time the marketplace observed it, and an older observation never overwrites a newer one, so a slow full read never undoes a newer single-listing read.

## Read plan per marketplace

| | eBay inventory items | eBay Seller Hub | Amazon Seller | Shopify |
| --- | --- | --- | --- | --- |
| **Presence (full read)** | Active-listings report from eBay's Feed API | The same report: SKU, item number, variations | All-listings report per served marketplace (active and inactive, with status), from the seller's own allowance | One bulk operation over every variant |
| **Details for unlinked listings** | Inventory API pages: title, barcodes, images | Trading API: listings started since the last read, inside the account's daily page cap | Catalogue lookup by ASIN, 20 a call, for barcodes | In the same bulk file |
| **Notices** | None | Trading API events: listed, revised, closed | Listing status changes, through the relay | Product created, updated, deleted |
| **Changes since** | None | None | Search by last update time | Products by update time |
| **Daily safety read** | Fresh report | Fresh report | Fresh report | Bulk operation |

- **eBay: the report, not the Trading API.** The Feed API's active-listings report names every active listing with its SKU, item number and variations, and it costs nothing from the Trading pool. The Trading API is used only for the titles and barcodes of Seller Hub listings without a link. Inventory items have no listing notices at all; a new one is found by the daily read, or sooner by a refresh.
- **eBay notices.** On connect, the account is subscribed to the Trading API's listed, revised and closed events, with one call. Receiving them costs no Trading call. The revised event's body carries the item, so its fingerprint is compared before anything is read, and the echo of Vervoro's own stock writes (which revise the listing) costs nothing.
- **Amazon: the report for presence, the search for changes.** Amazon's listings search pages through at most 1,000 SKUs, so it cannot read a whole catalogue. The all-listings report can: it names every SKU, active and inactive, with its status, one marketplace per request. It is the full read and the daily safety read. The search, sorted by last update time, is the changes read. A changes read that finds more than 1,000 SKUs is split into shorter time windows, and if one window still finds more, the account gets a fresh report instead. Both run once per marketplace the account serves, and presence is kept per marketplace.
- **Amazon multi-marketplace accounts.** A SKU is one listing across the account's marketplaces; its ASIN and status are kept per marketplace. A SKU that exists only on a marketplace the account does not serve is shown as not served and cannot be linked. A SKU Amazon ships on any served marketplace is marketplace-shipped (ADR-004.2).
- **Shopify.** A bulk operation reads every variant without draining the shop's cost budget (ADR-004.3). Variants with a blank or shared SKU are keyed by variant id and can be linked; a variant Shopify does not track, or that is not stocked at Vervoro's location, is shown with the fix the seller must make.

## Notices

A notice is a hint, never the truth (ADR-004). It can start a read; only the read changes a listing.

- **Created, ended and deleted notices always cause a single-listing read.**
- **Changed notices** cause a read only when their fingerprint differs from what is stored and they are newer than it. Quantity is left out of the fingerprint, so our own writes echo back for free.
- **Duplicates are dropped** by notice id. A notice older than the `asOf` of the last complete read of its scope is ignored.
- **Bursts become one read.** Only notices that would cause a read count. When more than 200 arrive for one account in 10 minutes, they become one changes read on Amazon and Shopify. On eBay they become single-listing reads within the account's daily Trading cap, and the next report covers the rest.
- **Notices that look broken are noticed.** When a daily read finds more than 5 changes that no notice announced, the account's notices are marked unreliable: changes reads every hour on Amazon and Shopify, and an operator alert on eBay, where no cheap changes read exists.

## New and ended listings

**New listings** arrive by a notice, a changes read, a full read or an order line. A new listing gets suggestions at once. If it looks like it shares stock with a linked product, the seller is alerted (below).

**A listing ends only on two proofs.**

1. **First proof:** it is missing from a complete read of its scope whose `asOf` is later than the time the listing was first seen. It becomes `missing`. It keeps its link and its figure.
2. **Second proof,** for a **linked** listing: a read of that one listing says it ended or does not exist. For an **unlinked** listing, that, or missing again from a complete read at least 20 hours later.

The second proof for a linked listing is always a direct read, because eBay's report may leave out a listing sitting at zero under the out-of-stock option, and a status-filtered search leaves out inactive SKUs. Two missed reports would otherwise put a live listing to sleep, and it would never be raised again when stock returns. Linked listings rarely end, so this costs a few reads a day.

**A read that would end too much is held.** If a complete read would mark more than 10 % of a scope missing (and at least 20 listings), it is held as suspect: nothing changes, the operator is alerted, and the read is due again in an hour. An empty or cut-off report is the common real failure, and it must never unlink half a catalogue.

**A delete notice** (an Amazon status change, a Shopify product deleted, an eBay item closed) starts a single-listing read, and that read's answer is final at once.

**An ended listing keeps its link.** It gets no figure, and its late orders and returns still resolve. The seller sees it in a daily digest; it becomes an alert only if it had open orders, or if its product still has stock but no seller-shipped listing left. For ADR-003's rule that a retired product has no linked listings, an ended listing does not count, and retiring the product closes its link.

**A listing that comes back** keeps its link only if its marketplace product (ASIN, eBay item or parent, Shopify product) and its barcodes are unchanged. Otherwise its link is closed and the old product is offered as a suggestion: Amazon lets a seller delete a SKU and create it again for a different product. A listing that keeps its link holds raises until the seller has looked.

## Relists and SKU changes

| What happened | Same key? | What Vervoro does |
| --- | --- | --- |
| A SKU edited on an eBay Seller Hub listing or a Shopify variant | Yes | The link stays. The seller is told "SKU changed from X to Y", with a way to relink |
| A SKU edited onto another product's SKU | Yes | A conflict. The link stays, decreases continue, raises wait until the seller answers |
| An eBay relist that eBay declares (the new item names the old one), same SKU, same fulfilment, same options, no veto, title, lot size and variations unchanged | No | The link carries over automatically, by the same compare-and-set as a person (a person who linked first wins). The seller is told, with Undo, which returns the new listing to unlinked |
| Any other relist, or "sell similar" | No | A successor suggestion: the old link's product and units per sale, one tap |
| An Amazon SKU deleted and made again, or an eBay inventory item renamed | No (new key) | The old listing ends; the new one gets a successor suggestion |

The relist carry is the one link no person makes. It is the marketplace stating that one listing continues another, not Vervoro guessing a match, and leaving it to a person would let the relisted item sell the seller's typed quantity until someone taps.

## Suggestions

**Three tiers, from fixed rules.** No score for the seller to read, and no learned or fuzzy model.

| Tier | Rule | Bulk accept |
| --- | --- | --- |
| **Strong** | The listing's SKU equals a product's SKU, ignoring case, and no veto. Or a barcode the seller entered on the listing (an eBay inventory item, a Shopify variant, the seller's own Amazon offer) equals one product's unit barcode, no veto, the listing's SKU names no other product, and no other listing on the same account carries that barcode | Yes |
| **Medium** | The SKU matches once a known suffix is removed (`-FBA`, `-6PK`); a barcode that comes only from the marketplace's catalogue; the same ASIN or barcode already linked on another account of the company; a successor; a strong match demoted by a veto, or by a barcode shared with another listing on the account | One at a time |
| **Weak** | Similar title | Shown only |

**Vetoes.** A veto demotes a strong match to medium, and the row says why:

- a pack word or count in the title or SKU ("pack of 6", "6 x", "set of"), from a fixed, tested list per language;
- the marketplace's own pack quantity is above 1;
- the barcode belongs to a pack product or a box size (the suggestion then proposes the box's units per sale);
- the marketplace's current figure is near a whole multiple of 2 or more of what Vervoro would send;
- two products match;
- the product is retired.

**A veto that could not be checked counts as fired.** A listing whose title, or whose pack quantity where the marketplace has one, has not been read yet is never strong. It stays medium, and the row says "details not yet read". So a spent Trading allowance can delay a link, never let a six-pack through at one unit per sale.

**Bundles and packs.** The product picker offers simple products, packs and bundles together, each with its kind. A barcode that belongs to a sealed pack suggests the pack product. A listing of three units of one product is steered to units per sale = 3, never to a bundle (ADR-003).

**Suggestions are tied to what they were computed from.** Each one records the listing and product versions it used. Accepting it checks both again; a stale suggestion is recomputed, never applied. A dismissed suggestion stays dismissed until its evidence changes.

## Linking

**Every link shows what it will do.** The link screen and every bulk preview show units per sale (1 written out, never assumed) and the figure change: "eBay shows 40; Vervoro would send 6". A ratio of 3 or more either way is highlighted and drops the row out of bulk accept. The same ratio check runs over confirmed links during the shadow check (ADR-004), so a wrong units per sale shows up before going live.

**Link to family.** A listing group (an eBay listing with variations, an Amazon parent ASIN, a Shopify product) mirrors a product family (ADR-003): each variation is one size or colour, and each size or colour is its own product. "Link to family" on a group pairs each variation with the family member that has the same SKU, or else the same option values ("42 / Black"), matched ignoring case and spaces.

- **One preview, one confirm, still one link per variation.** The preview lists every pair with its units per sale and figure change. Each link is an ordinary link: a pair can be unticked, and any later change is made per variation.
- **The same rules as any suggestion.** A pair made only by option values is medium, so it is never applied without this preview; vetoes and the ratio check apply to each pair.
- **What does not pair stays unlinked,** with its reason: no member with those options, two members match, or the variation has no SKU and no options Vervoro can read. "Add a size" (ADR-003) can draft the missing members from the unpaired variations.
- **The group is never linked itself.** The family has no stock; each variation sells its own size.

**Bulk accept.**

- Strong suggestions only, on "all N in this filter", not only the rows on screen.
- Previewed in full: grouped by product, with every product that gains more than one listing first, five random rows to spot-check, and the total change in figures.
- Never sets units per sale above 1.
- One recorded batch, written in chunks of 500 links per transaction. Undo closes only the links that still belong to the batch; a link a person changed since is left alone, and the undo says how many it skipped.
- **On a live account, raises wait.** A bulk link sends decreases at once. Raises wait for one "send raises" confirm: a single list with a total, where any row can be unticked. Raises not sent after 24 hours remind the seller once. Until then the marketplace keeps its own figure, never higher than ours would have been.

**Links are versioned.** A link change closes the current link and opens a new one in one transaction, compare-and-set against the link the person saw, so two people linking at once cannot both win: the second sees who changed it and to what. The link keeps ADR-003's fields and adds when it began and ended, who made it, and how (by a person, from a listing, by bulk accept, by a relist carry, by an Amazon offer).

**Open orders keep their link.** An order line records the link it was reserved with (ADR-006, ADR-007). A relink applies to orders received afterwards, and to open lines that arrived unlinked and are not yet dispatched. The link screen says both: "2 open orders keep Honey 340 g. Linking reserves stock for 3 waiting orders."

**The purchase time decides the link.** An order belongs to the link that was valid when the buyer bought, not when Vervoro imported it. Links record when they began and ended, so this is a lookup. A sale at 10:00 on a listing unlinked at 10:01, whose notice arrives at 10:03, still reserves from the product. A sale after the unlink is an order for an unlinked listing.

**Unlinking.** Closing a link without a new one, by a person, by retiring the product or by an undo:

- **Reserved orders keep their stock.** Open orders keep the product they reserved; dispatch deducts it, and a cancellation or return puts it back on that product. The unlink screen says so: "2 open orders keep Honey 340 g."
- **The listing is sent 0 by default.** Without a link Vervoro sends no figure, and the marketplace would keep the last one, selling stock nothing protects. The unlink screen offers "Set to 0 and unlink", the default, which sends 0 at once like any decrease, or "Leave eBay's figure at 6", for a seller handing the listing back to the marketplace on purpose. The choice shows the figure and is recorded on the closed link.
- **Marketplace-shipped listings** never get a figure, so unlinking one sends nothing.
- **Relinking is a new link.** Like any link, it reserves stock for orders that arrived while the listing was unlinked and are not yet dispatched. Orders already dispatched while unlinked stay flagged, and the seller attaches each one to a product from the order (ADR-007).

**Fulfilment changes.** A listing moving from seller-shipped to marketplace-shipped stops getting figures at once. One moving the other way gets no figure until the seller confirms, because it suddenly exposes warehouse stock. An order line's own fulfilment decides whether it reserves: a seller-shipped order on a listing still linked as marketplace-shipped reserves units per sale of the product, and opens a conflict (ADR-007 imports it).

**Held raises are one set of reasons per listing:** it came back after ending, its SKU was edited onto another product's, a live bulk link is not yet confirmed, or a fulfilment conflict is open. Raises go only when the set is empty, and each reason clears with its own answer. Decreases are never held. How a link's first figure is sent, and on which lane, is ADR-008.

## Unlinked listings and going live

**An unlinked listing is left to the marketplace.** Vervoro sends it no figure, imports its orders and flags them (ADR-003, ADR-007). Unlinked is the default and needs no mark. The account shows "N listings left to the marketplace".

**The danger is a listing that shares stock.** An unlinked listing that sells the same goods as a linked product takes stock Vervoro does not deduct, so every linked listing of that product oversells. A **shared-stock listing** is an unlinked, buyable, seller-shipped listing that has a strong or medium suggestion naming a product already linked to another listing, or that sits in a listing group with a linked member.

**Going live on an account needs** a complete catalogue read, no open conflict, and an answer for every shared-stock listing: link it, or "separate stock, leave to the marketplace". Many can be answered at once, with a confirm that names the risk: "These listings may sell the same stock as products Vervoro manages. Vervoro will not change their quantity." The answer is recorded (the listing, the evidence, who, when), creates no link, and is asked again when a new strong suggestion appears. Every other unlinked listing is a count, never a blocker. Accounts go live one at a time, so a finished Shopify account does not wait for eBay.

**After going live,** the seller is alerted (push) once per listing for a new shared-stock listing, and for the first order on an unlinked listing that has a strong or medium suggestion and no "separate stock" answer. Orders on other unlinked listings go to the daily digest and the list's open-orders filter, never to alerts, so a seller who leaves 2,000 listings to the marketplace is not flooded.

**Figures go only to linked listings.** On eBay, the lookup of every listing a SKU is on (ADR-004.1) finds listings to suggest; it is not a list of places to write. Another Seller Hub listing that carries a linked SKU but is not linked itself gets no figure; it is a strong suggestion and a shared-stock listing.

## The unlinked-listings list

**Default order:**

1. Listings an open order names, soonest dispatch deadline first.
2. Shared-stock listings.
3. Strong and medium suggestions that sold in the last 30 days, most sold first. The sales come from orders already imported, so they cost no calls.
4. Other strong and medium suggestions.
5. The rest, by account.

**Each row** shows the main image, title, account, listing SKU (or "no SKU" with the item number), options, who ships it, the figure the marketplace shows now, open orders, sales in the last 30 days, and the best suggestion with its tier, its reason ("same barcode") and any veto. **Buttons:** Link, Make product, Leave to marketplace, and Link to family on a variation whose group has unlinked variations. On a wide screen the same fields are columns with a select box per row.

**Filters:** account, tier, who ships it, open orders, sold recently, has a barcode, no SKU, needed for going live, ended. **Search** by SKU, title, barcode, item number or ASIN, or by scanning a barcode with the phone's camera.

**The header** shows each account's read: in progress ("4,812 of about 5,000"), or why it waits ("eBay daily limit; resumes tomorrow at page 31"), and when it last completed.

**Listings that cannot be linked** stay on the list with the fix the seller must make on the marketplace: an eBay variation without a SKU ("add a SKU on eBay", then a one-listing refresh), a Shopify variant not tracked or not stocked at Vervoro's location, a SKU on a marketplace the account does not serve.

## Making a product from a listing

ADR-003 route 3, in one tap. "Make product" fills a draft from the listing: its SKU, title as the name, brand, barcode, main image and weight where the marketplace has them. The person checks it and saves. The product, its barcode and the link are written in one transaction. Units per sale is 1 unless the person changes it. If the SKU already belongs to a product, the draft is refused and that product is offered as a strong match.

- **Many at once.** "Make N products" groups the selected listings across accounts by barcode, then by SKU, into one draft each, never two listings from the same account (ADR-003). It shows the workbook's preview and offers "edit as spreadsheet" for large catalogues. One confirm creates and links them all.
- **A bundle from a listing.** "Make a bundle" opens the bundle form with the listing's name and photo; the listing is linked to the bundle on save.

## Offering a product on Amazon by ASIN

A seller who already sells a product elsewhere can offer it on Amazon against an existing ASIN. Creating an offer changes the marketplace, so it is a write through the egress gate. In shadow it is only recorded.

1. **Find the ASIN.** From the product's barcode, or a pasted ASIN or product link, through the catalogue lookup. The screen shows the ASIN's title, image, identifiers and pack quantity.
2. **Check the seller may sell it.** Amazon's listing restrictions are read for the marketplace and condition first. "Approval needed" stops here with Amazon's link to apply; "not allowed" stops with the reason. Nothing is sent in the hope it is accepted.
3. **Fill the offer.** SKU: the product's SKU by default; refused if that SKU already exists on another ASIN on the account, and a warning if the account already sells this ASIN under another SKU. Condition, who ships it, units per sale (confirmed by the person if the ASIN's pack quantity is above 1, or if its identifiers do not include the product's barcode), and the price.
4. **The price is the seller's.** The seller types it. Vervoro passes it to Amazon once, keeps no price, and never proposes one (ADR-003).
5. **Validate, then send.** Amazon's validation preview runs first, and its issues are shown. Then the offer goes through the gate, at quantity 0.
6. **Pending until Amazon confirms.** The listing and its link exist at once, as pending. They get no figure until a read shows the offer buyable with no blocking issue. Issues Amazon raises later appear on the listing. A refused offer ends the pending listing and closes its link.

## Conflicts

Conflicts are solved one at a time, never in bulk.

| Conflict | Until it is answered |
| --- | --- |
| A listing's SKU and its barcode point at different products | Stays unlinked; no suggestion is strong |
| A SKU edited onto another product's SKU | Link kept, decreases continue, raises wait |
| A seller-shipped order on a listing linked as marketplace-shipped | The order reserves; the listing's figure waits for the seller's confirm |
| A listing came back as a different marketplace product | The old link is closed; the old product is suggested |

**Duplicate listings are allowed.** Several listings linked to one product, on one account or across accounts, all draw on the same stock and each gets the figure (ADR-003). The product page lists them, and same-account duplicates are flagged as a warning, not a conflict.

## Budget

eBay's Trading API is the only shared pool catalogue work touches.

- **Catalogue's share is capped.** It may spend at most 15 % of a shared pool's bulk lane a day across the platform, inside ADR-004.1's 50 pages per account, and never a safety lane.
- **Single-listing Trading reads** (after a notice, an unknown item on an order, a refresh, or a second proof) come from the account's 50-page cap, at most once per item a day. Above that, the item waits for the next report.
- **Onboarding.** Seller Hub listings matched by SKU cost no Trading call. Unlinked ones cost one page per 200, so 5,000 unlinked listings cost 25 calls, and a 50,000-listing seller with nothing matched takes about five days at the page cap; the report gives presence on day one, so only details wait.

| Calls a day | 10 sellers | 100 sellers | 1,000 sellers | Pool |
| --- | --- | --- | --- | --- |
| eBay Trading, catalogue after onboarding | about 10 | about 100 | about 1,000 | 5,000 for the application by default |
| eBay Trading, onboarding new sellers | about 50 | about 100 | about 500 | The same |
| eBay Inventory API | about 200 | about 2,000 | about 20,000 | 2 million for the application |
| eBay Feed API (one report each) | about 80 | about 800 | about 8,000 | 100,000 for the application; 400 per seller per feed type |
| Amazon, per seller | about 150 | about 150 | about 150 | The seller's own bucket |
| Shopify, per shop | under 1 % of the cost budget | the same | the same | The shop's own bucket |

Assumptions: 2,000 listings per seller, 2 % changing a day, half of eBay sellers with Seller Hub listings. Catalogue work is a small share of every pool. What forces eBay's Growth Check is ADR-004's reserve of 50 calls per account, not the catalogue.

## Storage

The Channels host owns the listing tables; the foundation owns the link (ADR-000, ADR-003). Every table is a tenant table (ADR-001): `company_id` on every row and every key, under row-level security.

| Table | Owner | Holds |
| --- | --- | --- |
| `channel_listing` | Host | One row per listing: account, key, SKU, title, image, the figure shown, observed fulfilment, state, whether it can be linked and why not, its group, a fingerprint, when it was observed, a version |
| `channel_listing_identifier` | Host | Item numbers, ASINs per marketplace, unit labels, inventory items and barcodes, each indexed for lookup |
| `channel_listing_presence` | Host | Per listing and scope (one Amazon marketplace, eBay's report, a Shopify shop): present, missing or absent, and the read that last saw it |
| `channel_catalogue_read` | Host | Each read: account, scope, trigger, method, `asOf`, cursor, counts, and its state (running, complete, partial, suspect, failed) |
| `channel_link_suggestion` | Host | Listing, product, rule, tier, proposed units per sale, evidence, the versions it used, and its state |
| `channel_listing_decision` | Host | "Separate stock, leave to the marketplace": listing, evidence, who, when |
| `channel_offer_request` | Host | An Amazon offer: product, ASIN, SKU, condition, units per sale, its state and Amazon's issues. Never the price |
| `listing_link` | Foundation | ADR-003's link, one row per version: listing, product, units per sale, fulfilment, how it was made, when it began and ended, and who |

**Rules, each with a test:**

- One current link per listing, enforced by a partial unique index.
- A read never writes a link.
- Every automatic or bulk link uses the same compare-and-set as a person.
- The link names its listing by a plain id, checked through the host's port in the same transaction; no foreign key crosses modules.
- The running system never deletes a listing.
- An older observation never overwrites a newer one.
- Accepting a suggestion checks the listing and product versions again.
- No listing ends from an incomplete or suspect read, nor from one read alone.
- A listing gets the same key from a read and from an order.
- An order line's reservation never changes because a link changed.

A second refresh or daily read joins the read already running, through a partial unique index on running reads per account and scope.

## What people see

- **The seller, per account:** the last complete read and its source, a read in progress or why it waits, notices in the last day, "not notified" or "notices unreliable", and counts of unlinked, shared-stock and missing listings.
- **The operator:** catalogue's share of each shared pool, accounts with no complete read for 48 hours (an alert), held suspect reads, notice bursts turned into one read, and dead letters. Many accounts failing on one marketplace is one incident alert (ADR-004).

## Marketplace constraints

Checked against each marketplace's documentation on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| eBay active-listings report | A Feed API task (`LMS_ACTIVE_INVENTORY_REPORT`): SKU, item number, price and quantity of active listings | [Feed API](https://developer.ebay.com/develop/api/sell/feed_api.md) |
| eBay listing notices | The Notification API has no general listing topic; the Trading API's platform notifications include listed, revised and closed | [Notification API](https://developer.ebay.com/develop/api/sell/notification_api) |
| eBay Trading API | 5,000 calls a day for the application by default | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| eBay Feed API | 100,000 calls a day for the application; 400 requests a day per seller for each feed type, and requests beyond that count against the application | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Amazon listings search | 5 a second per seller and application; at most 20 a page and 1,000 SKUs in all; filters by created and last updated time; search by up to 20 identifiers | [Listings Items API rate limits](https://developer-docs.amazon/sp-api/docs/listings-items-api-rate-limits), [API model](https://github.com/amzn/selling-partner-api-models/blob/main/models/listings-items-api-model/listingsItems_2021-08-01.json) |
| Amazon all-listings report | `GET_MERCHANT_LISTINGS_ALL_DATA`: every SKU with its status; one marketplace per request; a report may be served from a cache up to a few hours old | [Inventory report types](https://developer-docs.amazon/sp-api/docs/report-type-values-inventory) |
| Amazon listing notices | Listing status changes (created, deleted, buyable) on the event bus only | [EventBridge notifications](https://developer-docs.amazon/sp-api/docs/set-up-notifications-with-amazon-eventbridge) |
| Amazon offer on an existing ASIN | A listing put with offer-only requirements; restrictions checked through the Listings Restrictions API | [Listings Items API](https://developer-docs.amazon/sp-api/docs/listings-items-api) |
| Shopify product notices | Product created, updated and deleted webhooks; variants arrive in product updates | [Webhooks](https://shopify.dev/docs/api/webhooks/latest) |

## Consequences

**What this gives us**

- No link is made by a guess. A pack hidden behind a single's SKU or barcode cannot be bulk-linked at one unit per sale, even when its details have not been read.
- Every link shows the figure it will cause before it is made, which catches a wrong product or a wrong units per sale on sight.
- A listing that is still selling is never put to sleep by a missed or cut-off read.
- Relists, renamed SKUs and recreated listings keep or regain their link without moving stock to the wrong product, and open orders keep what they reserved.
- Onboarding a large catalogue is mostly one reviewed bulk accept, ordered so that what is selling now comes first.
- Unlinked listings stay the seller's, as the owner's rule asks, and only the ones that share stock with a linked product need an answer before going live.
- Catalogue work costs a small share of every pool, and none of it from a safety lane.

**What it costs**

- On eBay, a new inventory item, or a change no notice announced, can wait up to a day for the daily read; a refresh is the seller's way to see it sooner.
- A listing whose details wait behind the Trading cap cannot be bulk-linked until they arrive.
- On a live account, raises from a bulk link wait for the seller's confirm, so some listings show too little for a while.
- An eBay Seller Hub listing that carries a linked SKU but is not linked gets no figure until someone links it. ADR-004.1 is amended to match: every linked listing gets the figure.
- The Trading API's platform notifications are a second inbound shape on eBay, with their own signature check.
- Amazon's full read is a report, which is slower than a search: a new SKU no notice announced can wait for the next changes read or the daily report.
- Link history, listing presence per scope and suggestion versions are more tables and more tests than one listing row with a product column.

## What later records decide

- **ADR-006: Stock ledger and reservations** (planned): how an order line records the link it reserved with, and how reserving for waiting orders works when a link is made.
- **ADR-007: Order ingestion** (planned): importing orders for unlinked listings and flagging them, and the conflict for a seller-shipped order on a marketplace-shipped link.
- **ADR-008: Inventory sync** (planned): the figure each linked listing gets, the first figure after a link, which lane a bulk link's decreases use, and when held raises go.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Link automatically on an exact SKU match | A six-pack listing often carries the single's SKU; a machine link at one unit per sale shows six times the stock |
| A confidence score from a model, or fuzzy matching | Not explainable to a seller, not testable as a rule, and wrong in ways nobody sees; fixed tiers and named vetoes are both |
| Leave the marketplace's figure when a link closes | The last figure stays live with nothing behind it, so the listing oversells; leaving it is an explicit choice instead |
| Match an order to the link valid when it is imported | A sale made just before an unlink, with a late notice, would reserve nothing |
| Key listings by SKU | eBay relists change the item number, Amazon cannot rename a SKU, Shopify allows blank and shared SKUs; a SKU key would move stock to the wrong listing or orphan orders |
| End a listing when one read misses it | Reports come back empty or cut off, and paged reads shift; one bad read would unlink a catalogue |
| Trust a delete notice | Notices arrive late, twice, out of order, or forged; a read of that listing is the proof |
| Read every listing's details on every read | Spends the eBay Trading pool on listings already matched by SKU |
| Page through Seller Hub listings with the Trading API daily | Up to half the default pool at 50 accounts; the Feed API report gives the same presence for no Trading calls |
| Make every unlinked listing block going live | Contradicts the owner's rule that the marketplace manages unlinked listings, and teaches sellers to mark everything without reading |
| A row cap on bulk accept | Turns 5,000 listings into ten identical confirms; holding raises on live accounts is the safety, not a number |
| Send figures to every listing a linked SKU is on | Writes to listings nobody linked, which may be a different pack size; they are suggested and treated as shared stock instead |
| Write the product's SKU back to SKU-less eBay variations | Vervoro changes nothing on a listing but its quantity and the offers the seller asks for |
| Link a listing group to a family as one link | The family holds no stock; each variation sells one size, and its orders and figure must name that size's product |
| Edit a link in place | An open order would silently move to another product or another units per sale; versions keep what was reserved |
| Leave relists to a person | The relisted item sells the seller's typed quantity until someone taps; eBay states the lineage, so carrying the link is not a guess |
| Subscribe to eBay's revised event without a fingerprint check | Every Vervoro stock write revises the listing, so each write would cause a read |
