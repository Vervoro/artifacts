# ADR-005: Catalogue sync and linking

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026; split into ADR, SPEC and RUNBOOK, with Listings as the core module that alone writes listings and links, 21 October 2026 |
| **Scope** | The Listings module: what a listing is and its key, how listings are read and kept current, when a listing has ended, relists and SKU changes, suggestions, links and their versions, unlinked and not-stock listings, the shared-stock answer before going live, making a product from a listing, and offering a product on Amazon by ASIN |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-003](../product-model/), [ADR-004](../channel-connectors/) with [ADR-004.1](../ebay-connector/), [ADR-004.2](../amazon-seller-connector/) and [ADR-004.3](../shopify-connector/); used by [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/) and [ADR-008](../inventory-sync/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The procedures for this record](../runbooks/#adr-005-catalogue-sync-and-linking) |

## Context

- **Sellers arrive with listings.** A typical seller has 100 to 5,000 listings on two or three marketplaces, made over years in the marketplaces' own tools.
- **A wrong link is worse than no link.** Vervoro is the stock master, so a wrong link sends one product's stock to another product's listing. A SKU or barcode match says which product, never how many units a sale uses: a six-pack often carries the single's SKU.
- **Marketplaces change listings without asking,** and the SKU is not a listing's identity. eBay gives a relist a new item number; Amazon cannot rename a SKU, only delete and recreate it. Notices are late, missing or repeated.
- **Shared allowances are tight.** eBay's Trading API allows 5,000 calls a day for every seller together ([ADR-004.1](../ebay-connector/)). Reading a catalogue must not spend what protects another seller's stock.
- **Phone first.** Onboarding 5,000 listings on a phone pushes a seller to accept everything unread, so the safe path has to be the fast path.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **Listings is a core module, and the only writer of listings, listing groups, versioned links and suggestions** ([ADR-000](../system-architecture/)). A listing is the smallest thing a marketplace sells and counts on its own: an eBay inventory item, Seller Hub listing or variation; an Amazon seller SKU. Parents are listing groups: shown, never linked. Channels reads the marketplaces and hands what it reads to Listings; Listings knows no marketplace protocol. *Later: Shopify variants, with ADR-004.3.*
2. **A listing's key is built from the marketplace's most stable id, never the bare SKU.** The same listing gets the same key from a catalogue read and from an order line. Listings are never deleted.
3. **Reading is one optional capability added to ADR-004's contract.** A full read runs on connect, once a day and on the seller's refresh; a notice or an unknown listing on an order reads that one listing. All of it is the lowest-priority work on the account. Presence comes from the cheapest complete source, such as eBay's Feed API report and Amazon's all-listings report; details are read only for listings without a link.
4. **A notice is a hint.** It causes at most one read and never changes a listing or a link by itself.
5. **A listing ends only on two proofs, from complete reads.** A read that would end too many listings at once is held. An ended listing keeps its link, gets no figure, and still resolves late orders and returns.
6. **Every link is made by a person.** The one exception is an eBay relist that eBay itself declares, with nothing about the listing changed: its link carries over, and the seller is told.
7. **Suggestions come in three tiers from fixed rules, with vetoes that demote a match.** Only the strong tier can be accepted in bulk. A veto that could not be checked counts as fired.
8. **Every link shows units per sale and the figure change before it is made.** Bulk accept never sets units per sale above 1. On a live account a bulk link's decreases go at once, and its raises wait for one confirm.
9. **Links are versioned, and an order uses the link that was valid when the buyer bought.** A change closes the current link and opens a new one; open orders keep the link they were reserved with. Orders waiting for a link reserve right after the link commits, when Orders hears Listings' event ([ADR-006](../stock-ledger/spec/#6-what-a-line-reserves)). A new link reaches Stock sync as an event too. Unlinking sends the listing 0 unless the seller chooses to leave the marketplace's figure.
10. **An unlinked listing is left to the marketplace, and figures go only to linked listings.** A listing that is not stock is marked so and never linked ([ADR-003](../product-model/spec/#11-charge-lines-and-listings-that-are-not-stock)). Going live needs an answer only for unlinked listings that look like they share stock with a linked product. Vervoro writes nothing to a listing but its quantity and the offers the seller asks for: a product made from a listing in one tap, or an existing product offered on Amazon by ASIN at quantity 0.

## How a listing gets linked

<!-- DIAGRAM -->

A trigger asks Channels for a read. Channels runs it through the connector, page by page or report by report, and hands each chunk to Listings' port, which stores each listing under its key. When a complete read ends, Listings works out which listings it no longer saw and starts the proof that they ended. New listings without a link get suggestions and appear in the unlinked-listings list, where a person links them, makes a product from them, or leaves them to the marketplace. Listings writes the link and announces it. Orders then reserves the listing's waiting lines, and Stock sync works out its figure ([ADR-008](../inventory-sync/)).

## Consequences

**Gives**

- No link is made by a guess: a pack hidden behind a single's SKU or barcode cannot be bulk-linked at one unit per sale, even before its details are read.
- Every link shows the figure it will cause, so a wrong product or units per sale is caught on sight.
- A listing that is still selling is never put to sleep by a missed or cut-off read.
- Relists and changed SKUs keep or regain their link without moving stock to the wrong product, and open orders keep what they reserved.
- Unlinked listings stay the seller's; only those that share stock with a linked product need an answer before going live.

**Costs**

- On eBay, a new inventory item or a change no notice announced can wait up to a day for the daily read, unless the seller refreshes.
- A listing whose details wait behind the Trading page cap cannot be bulk-linked until they arrive.
- On a live account, raises from a bulk link wait for the seller's confirm, so some listings show too little for a while.
- An eBay Seller Hub listing that carries a linked SKU but is not linked gets no figure until someone links it.
- Amazon's full read is a report, slower than a search: a new SKU no notice announced can wait for the next changes read.

## Alternatives rejected

- **Link automatically on an exact SKU match:** a six-pack listing often carries the single's SKU.
- **A confidence score from a model, or fuzzy matching:** not explainable to a seller, nor testable as a rule.
- **Key listings by SKU:** relists, recreated Amazon SKUs and blank SKUs would move stock to the wrong listing.
- **End a listing when one read misses it:** reports come back empty or cut off, and one bad read would unlink a catalogue.
- **Trust a delete notice:** notices arrive late, twice, out of order or forged; a read of that listing is the proof.
- **Match an order to the link valid at import:** a sale just before an unlink, with a late notice, would reserve nothing.
- **Edit a link in place:** an open order would silently move to another product or units per sale.
- **Leave the marketplace's figure when a link closes:** the last figure stays live with nothing behind it.
- **Make every unlinked listing block going live:** it teaches sellers to tick everything without reading.
- **Send figures to every listing a linked SKU is on:** it writes to listings nobody linked, perhaps another pack size.
- **Link a listing group to a family as one link:** each variation sells one size, and its orders must name that size's product.
- **Leave relists to a person:** the relist sells the seller's typed quantity until someone taps, though eBay states the lineage.

## Open items

- **eBay Feed API.** Confirm with a recorded call that the active-listings report includes listings at 0 under the out-of-stock option, and the 400 requests a day per seller per feed type.
- **Amazon's all-listings report** may be served from a cache a few hours old; measure the lag against notices during shadow.
- **Thresholds are proposals:** a notice burst of 200 in 10 minutes, notices unreliable after 5 unannounced changes, a held read at 10 % and 20 listings, the refresh caps, and catalogue's 15 % share of a shared pool.
- **The pack-word list** (English at launch) needs its first version and tests.
- **Marketplace constraints** were checked on 18 October 2026; recheck them before launch.
