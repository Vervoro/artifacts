# ADR-008: Inventory sync

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026 |
| **Scope** | How Vervoro keeps every linked listing's figure right on every marketplace: the figure per listing, when a figure is sent and when it may wait, what Vervoro believes each marketplace shows, the order read before a raise, confirming every write, the per-listing and shared limits, the low-stock policy, listing modes and stopping, held raises, the first figure after a link, Amazon accounts on several marketplaces, one writer per listing, shadow and going live, recovery, and what the seller and the operator are told |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-003: Product model](../product-model/), [ADR-004: Channel connectors](../channel-connectors/) with [ADR-004.1](../ebay-connector/), [ADR-004.2](../amazon-seller-connector/) and [ADR-004.3](../shopify-connector/), [ADR-005: Catalogue sync and linking](../catalogue-sync/), [ADR-006: Stock ledger and reservations](../stock-ledger/), [ADR-007: Order ingestion](../order-ingestion/) |

## Context

Vervoro is the stock master. Every linked listing shows the figure Vervoro sends. Earlier records fixed the pieces around that figure:

- **ADR-000:** only the foundation writes the figure a listing should show, in the same transaction as the stock change. One egress gate is the only door out. Every account starts in shadow. A timeout is `unknown`.
- **ADR-004:** the host owns credentials, rate buckets and shared daily pools, each with a safety lane, a bulk lane and a reserve per account. A raise waits until a complete order read covers it.
- **ADR-005:** figures go only to linked listings; some raises are held for a reason; unlinking sends 0 by default.
- **ADR-006:** sellable is on hand less reserved less held, per warehouse.
- **ADR-007:** an order reserves when it is imported; an order that cannot be imported is recorded as a problem with the listing of each line it could read.

This record decides the figure and how it reaches each marketplace. The design has to meet these requirements:

- **A figure that is too high oversells.** Marketplaces count an oversell against the seller's account. A figure that is too low loses a sale, and the seller can see it. When unsure, Vervoro errs low.
- **No marketplace hears about a sale at the same moment.** Between a sale on one channel and the new figure on the others there is always a delay. The design keeps the exposure small where stock is short, and says plainly that it is never zero.
- **Every write costs something.** eBay lets one listing be revised 250 times a calendar day. eBay's Trading API allows 5,000 calls a day for Vervoro's whole application, shared by every seller. Amazon allows 5 listing updates a second per seller. Shopify meters cost points per shop. Telling a channel the same thing all day protects nobody.
- **Marketplaces set the quantity they are given.** eBay and Amazon overwrite whatever they show, so a write can undo a sale they just counted. Amazon applies a change minutes after it accepts it.
- **Things fail.** Calls time out, workers crash, marketplaces go down, a company is restored from a backup. Nothing may be sent twice by mistake, and nothing may be lost.
- **One operator** runs the platform, with a small team. Every rule must earn its place by a failure it prevents at launch: 5 to 10 sellers, then 100.

## Decision

1. **One figure per listing, worked out by the foundation** from one warehouse's sellable stock: less the units kept for another account, less the account's buffer, divided by units per sale, the scarcest component for a bundle.
2. **One belief per listing, kept by the host:** the figure Vervoro believes the marketplace shows. It may err only upward.
3. **Near zero, every change is sent. Above it, a figure is sent again only once it is 20 away** from what the channel shows. The zone near zero is at least 20 listing units wide, and wider for a listing that sells in large order lines.
4. **The 20-unit tolerance applies only where a channel's own sales are known to come out of Vervoro's figure:** eBay, an Amazon account on one marketplace, and Shopify orders at Vervoro's location. Everywhere else, every change is sent.
5. **No raise leaves before a complete order read covers the moment it became due,** with two minutes for clocks.
6. **Every write is single, keyed and confirmed.** One writer per listing, one open write at a time (an Amazon decrease may overtake one), a deadline, and a read back after it. Amazon's `accepted` is not applied. An `unknown` write is settled before anything else is sent.
7. **Lanes and limits follow ADR-004.** Decreases and every change near zero use the safety lane; other raises use the bulk lane. eBay's 250 revisions are counted per listing over a rolling 24 hours, with the last ones kept for a zero. Amazon stock goes by single patches.
8. **One low-stock policy:** the last 2 units are kept for one account, and either the units kept or the account can be changed per product, until an end date. A campaign on Amazon is such a dated keep.
9. **Every stop asks one question, at every scale:** leave the figure, or send 0. A listing is managed or not managed. A company that closes for non-payment carries out each account's answer on its closing date, and its accounts are then decrease-only until it is erased ([ADR-012](../billing-and-plans/)).
10. **Shadow before live.** A company's first go-live compares the old system's stock twice and moves every account the old system served at once. A listing showing more than Vervoro's figure is never accepted as explained.
11. **A restore or a reconnect returns to shadow.** A restore raises the company's sync epoch, so no write from before it can be mistaken for one after it.
12. **The seller sees what every marketplace shows and how fresh it is.** One kind of problem is also emailed: a marketplace showing more than the seller has, which Vervoro cannot fix. The operator is paged for a stalled sync, never per listing.
13. **Amazon Vendor accounts get no figure** from this record (ADR-004.4).

## How a figure travels

<!-- DIAGRAM -->

A stock change commits with the listing's new figure (ADR-000, ADR-006). The host's work list is a query: every listing whose figure differs from what the marketplace is believed to show, and whose rules say it is due. The dispatcher leases the listing's write target, takes a call from the account's bucket and from any shared pool on the right lane, and hands the write to the egress gate. In shadow, the gate records it. In live mode, it sends it. Outcomes, read backs, notices and the channel's own sales update the belief, and the same rules run again.

## Terms

| Term | Meaning |
| --- | --- |
| **D** | The figure a listing should show, written by the foundation. A whole number, or no figure |
| **B** | The figure the marketplace is believed to show, kept by the host. A number, or unknown |
| **T** | The tolerance, in listing units. Default 20, per account |
| **W** | The width of the zone near zero, per listing: the larger of T and twice the listing's largest order line in the last 30 days, at most 5 × T |
| **In the zone** | The smaller of B and D is at most W, or B is unknown |
| **Vouched** | The connector can say that a sale on this listing came out of the one figure Vervoro writes to it |
| **Write target** | What one write names: an eBay inventory item, an eBay Seller Hub listing or variation, an Amazon SKU on the account, a Shopify inventory item at Vervoro's location |

## 100 units, three channels

A worked walk through the rules. One warehouse holds 100 jars of honey. The seller sells on Amazon (one marketplace, connected first), eBay and Shopify, with the defaults: T = 20, W = 20, the last 2 units kept for Amazon.

**The start.** Amazon is shown 100; eBay and Shopify 98 each, because the last 2 belong to Amazon.

**A sale on eBay.** eBay sells one, and shows 97 by itself. The order is imported and reserves a jar: 99 can be sold. The figures become Amazon 99, eBay 97, Shopify 97.

- eBay is sent nothing: its own sale is vouched, so B falls to 97 with it.
- Amazon (B 100, D 99) and Shopify (B 98, D 97) differ by 1. Above the zone, that waits.

**The morning goes on.** Each sale lowers D on the other channels by one. Nothing is sent until a channel is 20 away. After 20 sales elsewhere, Amazon shows 100 against D 80: one write sets 80. A busy listing costs one write per 20 sales, not one per sale.

**What the wait risks.** A channel can show up to 19 more than its D while D is above 20. To oversell, the channels together would have to sell more than D, more than 20 units, inside the minute or two before the next figure lands. The zone exists so that this cannot happen near zero.

**A delivery of 50 arrives.** Sellable goes from 80 to 130. Every channel's D rises by 50, a gap far above 20, so each gets a raise, but not at once. Vervoro first waits until a complete order read covers the moment, plus two minutes, because a sale made a minute ago may not be imported yet. On Shopify that takes under a minute, on eBay a few minutes, on Amazon 5 to 8. Each channel then gets the figure as it is at that moment.

**Three returns are restocked.** D rises by 3. A gap of 3 is under the tolerance, and the listing is above the zone, so nothing is sent: the channels show 3 too few, which is safe, and the next real write carries it.

**Stock runs low.** Once D or B is 20 or less, the listing is in the zone. Every decrease goes at once on the safety lane, and every raise goes as soon as the order read covers it.

| Sellable | Amazon | eBay | Shopify |
| --- | --- | --- | --- |
| 20 | 20 | 18 | 18 |
| 5 | 5 | 3 | 3 |
| 2 | 2 | 0 | 0 |
| 0 | 0 | 0 | 0 |

At 2, eBay and Shopify are sent 0 at once, and from then on only Amazon can sell. Above 2, the last units can still sell twice if two channels sell them inside the minute or two before the next figure lands. Keeping 2 units makes that rarer, not impossible. The seller's screen shows those zeros as "0 by policy".

## The figure per listing

**One warehouse.** Each account is served by its default warehouse (ADR-006), and only by it; on Shopify, by the location picked as Vervoro's (ADR-004.3). A sum over warehouses would promise units no single parcel can reach. Changing an account's warehouse recomputes its listings, and their decreases go at once. Serving one account from several warehouses is a later record.

**The steps,** for a listing on account A, linked to product P with `units_per_sale` u:

1. **Sellable.** S = P's sellable in A's warehouse (ADR-006). Best-before is already in it.
2. **What A may sell.** avail = max(0, S − units kept for another account − A's buffer for P − units of open import problems). All in product units.
3. **A bundle** takes, for each component, that component's avail for account A, divided by the quantity the bundle needs, rounded down, and the smallest of them (ADR-003).
4. **The listing.** D = floor(avail ÷ u).

**Import problems.** ADR-007 records an order that cannot be imported, with the listing and quantity of each line it could read. Its units are sold on the marketplace but reserved nowhere. So each line whose listing and quantity were read takes its quantity times the units per sale of the link valid at the time of purchase off avail for every account, never below zero. When the order imports, its reservations replace the deduction in the same transaction. A line whose quantity could not be read holds raises on its listing. A line whose listing could not be read holds every raise on the account, as ADR-007's scope says; after 60 minutes the operator is paged.

**No figure.** Marketplace-shipped listings (ADR-003); pending, ended and missing listings (ADR-005); eBay variations without a SKU; eBay Seller Hub listings never read because the out-of-stock option is off (ADR-004.1); listings that are not managed; disconnected accounts. "No figure" is never sent as 0.

**Versions.** The desired row holds D, a version, and the ledger sequence and time it came from. The version rises only when D changes, so a recompute that changes nothing sends nothing. A policy, link or setting change recomputes under the company's lock without a ledger entry. An older figure never replaces a newer one (ADR-000).

**Worked example.** Honey has sellable 27. The last 2 are kept for the eBay account, which links honey and jam. The Shopify account has a buffer of 3 for honey. Gift set G is 1 honey and 2 jam; jam has sellable 9.

| Listing | u | avail | D |
| --- | --- | --- | --- |
| eBay, one jar | 1 | 27 | 27 |
| eBay, six jars | 6 | 27 | 4 |
| Shopify, one jar | 1 | 27 − 2 − 3 = 22 | 22 |
| Amazon, one jar | 1 | 27 − 2 = 25 | 25 |
| Shopify, gift set G | 1 | min(22 ÷ 1, (9 − 2) ÷ 2) = 3 | 3 |

## When a figure is sent

| Situation | Sent | Lane | When |
| --- | --- | --- | --- |
| B unknown | Read first, then the rules below | Safety | At once |
| In the zone, D < B | D | Safety | At once |
| In the zone, D > B | D | Safety | After the order read |
| Above the zone, B − D ≥ T | D | Safety | At once |
| Above the zone, D − B ≥ T | D | Bulk | After the order read |
| Above the zone, gap under T | Nothing | | Goes with the next write |
| Not vouched (any figure) | D, whenever D ≠ B | Safety if lower, bulk if higher | At once if lower; after the order read if higher |

- **W is per listing.** A listing that has sold in lines of 30 has W = 60, so the listing is already sending every change before one more order of its usual largest size could take more than the figure that is left. One large trade order on one listing never puts the whole account in the zone. W is in the listing's own units, so a six-pack or a bundle is in the zone as soon as its own figure is.
- **One write in flight per listing.** New figures only update the desired row. When a write ends, the latest D is compared with B again, so ten changes cost one more write at most.

## What Vervoro believes each marketplace shows

**B may err only upward.** A belief that is too high costs one extra write. A belief that is too low hides an overshow, and that oversells.

- **A confirmed write or a read sets B.**
- **A vouched own sale lowers B,** only for the listing the order names by its marketplace id, and only if it was placed more than 2 minutes after the confirmation of Vervoro's last write was received. On Amazon that is the notice or read that confirmed it, never the acceptance. An order that names a listing the last read did not show asks for a read of it.
- **A sale that may have crossed a write leaves B at the written figure.** D already counts the sale, so the gap is there, and the rules send it: at once in the zone, at the next write above it.
- **A confirmed cancellation** gives the units back to B the same way.
- **When the account's marketplaces or Vervoro's Shopify location change,** its beliefs are cleared and its listings read again.

Who vouches:

| Marketplace | Own sales vouched | Why |
| --- | --- | --- |
| eBay | Yes, for the listing the order names | eBay lowers the listing it sold on |
| Amazon, one marketplace | Yes | The one quantity Vervoro writes is the one Amazon sells from |
| Amazon, several marketplaces | No | Whether a sale on one lowers the others depends on a seller setting Vervoro cannot see (ADR-004.2) |
| Shopify | Only for orders assigned wholly to Vervoro's location | Shopify takes units from the location an order is assigned to (ADR-004.3) |

**Worked example.** Vervoro believes eBay shows 6. A sale on Shopify makes D 5, and Vervoro sends 5 at 10:00:00, confirmed at 10:00:01. An eBay buyer had bought one at 09:59:58: eBay went from 6 to 5, and Vervoro's write set 5 again. The truth is 4. The eBay order is imported at 10:00:40. It was placed before the confirmation plus 2 minutes, so B stays at 5. D is 4, and the listing is in the zone, so 4 goes at once.

## The order read before a raise

A notice can say that an order exists, never that none is missing (ADR-004). A raise sent too early lets a marketplace sell units that already went.

- **A raise becomes due** when D rises above B, or when a read lowers B. A decrease, or a read that changes nothing, does not restart the wait. A busy listing is never kept waiting by its own sales.
- **It goes** when the account's order watermark is at least that moment plus 2 minutes. The two minutes cover the difference between Vervoro's clock and the marketplace's. Each marketplace's own completeness bound is already in the watermark.
- **It sends the latest D,** never the figure it became due with.
- **A notice that names an order without its lines** holds the account's raises until the order is fetched or recorded as an import problem (above); if neither happens within 30 minutes, the operator is paged.
- **One on-demand read per account** covers every raise waiting on it:

| Marketplace | Soonest after the last read | Daily cap | Typical wait |
| --- | --- | --- | --- |
| Shopify | 30 seconds | None | Under a minute |
| Amazon | 3 minutes | None | 5 to 8 minutes |
| eBay | 5 minutes | 48 a day per account, and none once the application's order calls for the day pass 70 % of its allowance | 1 to 6 minutes; past either cap, the hourly backup read |

**Worked example.** An Amazon account on one marketplace. At 14:00:10 a delivery makes D 54 for a listing that shows 6. The raise is due at 14:00:10, so the watermark must reach 14:02:10. The last order read ran at 13:58 and covers up to 13:56, because Amazon stops two minutes before its clock. The next allowed reads, at 14:01 and 14:04, cover up to 13:59 and 14:02. The one at 14:07 covers up to 14:05. It imported an order for 2 placed at 14:03, so D is now 52, and 52 goes at 14:07:30. Had the raise gone at 14:00:10, Amazon would have shown 54 with 52 left.

## Confirming every write

| Outcome | B becomes | Next |
| --- | --- | --- |
| `applied` (eBay, Shopify) | The figure sent | Confirmed |
| `accepted` (Amazon) | Unchanged until confirmed; then the figure the confirming notice or read showed | Confirmed by the first quantity notice equal to the figure sent, or by a read showing the figure sent, less at most the listing's own orders placed since it was accepted. A safety write is read at 2 and 10 minutes, a bulk write once at 10 minutes; a read is skipped once a notice has confirmed. When more than 2,000 of an account's writes are open, they are confirmed by one all-listings report instead, and the deadlines and pages count from that report |
| `throttled` | Unchanged | The marketplace's wait, capped at an hour, or 5 s × 2ⁿ up to 15 minutes |
| `compare-mismatch` (Shopify) | The figure Shopify reports | The rules run again |
| `rejected` | Unchanged | The seller sees the reason. No retry until D or the listing changes |
| `unknown` (a timeout, a lost lease) | Unknown | Read back before anything else is sent. On eBay's Trading API, where a read costs the same pool call as a write, D is sent again instead: at once if it is no higher than the figure last sent, after the order read if it is higher |

- **A read back that does not match** after the deadline closes the write as "send again"; D goes again under the rules.
- **Why Amazon's confirmation subtracts its own orders:** a busy listing keeps selling after the write lands, so a read never shows exactly the figure sent. Without the subtraction, every busy Amazon listing would look unconfirmed.
- **Drift** (a figure Vervoro did not send) is found by notices where the marketplace has them (Amazon's listing-quantity notices, Shopify's inventory webhook), by eBay inventory item reads every 6 hours from the Inventory API's own allowance, and by the catalogue's daily safety read (ADR-005). A reading replaces B, and the rules decide. Showing more is corrected like any decrease. Showing less is a raise, and waits for the order read.
- **Entering the zone.** An eBay inventory item entering the zone is read once, from the Inventory API's own allowance. A Seller Hub listing is read on entering the zone only within the account's share of the Trading pool; otherwise a seller's hand edit to it waits for the daily read.

## Limits and who goes next

**Order of claims.** One ladder across all of an account's work: reading back an `unknown` write; a safety-lane write and the fetch of a new order whose notice carried no lines; any other order fetch; a bulk-lane raise; the scheduled order read; background reads. Within a rung: zeros first, then the smallest D, then the oldest. On a shared pool, accounts take turns within a rung, one call each, so one seller's go-live cannot starve the others.

**Shared pools** (ADR-004). An account's reserve is spent only after the pool's bulk lane has paused for the day. From then on, raises on the safety lane may take only the first half of what is left of the account's share; decreases may take all of it.

**Go-lives and bulk links on a shared pool.** Their raises take at most a tenth of the pool's bulk lane per account per day. Their decreases must fit the day's free room; if they do not, the screen offers the first day that has room.

### eBay

- **250 revisions a listing a day.** eBay allows each listing 250 revisions a calendar day, whichever API is used, and does not say which time zone the day is in. Vervoro counts over a rolling 24 hours: every calendar day, in any time zone, is one of those windows, so the count holds whichever day eBay uses. It counts per item, every variation together, each variation revised counting as one revision. eBay does not say how variations count, and this reading can only overcount.
- **2,000 a month, possibly.** The change history of eBay's inventory revision call also states a limit of 2,000 revisions per item per month (2011); eBay's current listing guide names only the daily one. Vervoro also counts each item's revisions over 30 days, and from 1,800 an item takes only zeros, as at 240 a day. The operator asks eBay's developer support whether the monthly limit still applies; if it does not, the rule goes.

| Revisions in the last 24 hours | What may go |
| --- | --- |
| Under 150 | Everything |
| 150 to 239 | Decreases, and raises from 0 |
| 240 to 249 | Only a 0. A listing in the zone is sent 0 at 240, so it cannot be left frozen above its stock |

- **eBay's own reply wins.** A "limit reached" reply stops every write to the item until the window frees a revision, and the seller is told at once.
- **eBay's own sales cost no revision.** Under the tolerance, a listing selling 400 a day elsewhere costs about 20 revisions a day while well stocked, and at most about 44 on the day it sells down to 0 (24 above the zone, 20 inside it).
- **Trading calls** carry up to four listings or variations of one account. A call waits at most 2 seconds to fill; a zero never waits. eBay answers at once, so no read follows an applied write.

### Amazon

- **Single patches only.** At 5 a second per seller, that is 18,000 an hour: a 25,000-listing go-live drains in about 83 minutes. Amazon says a listings feed with only a few records can still take several hours, and processes its records out of order, so a raise in a feed can overwrite hours of Amazon's own sales. ADR-004.2 allows feeds for raises; this record does not use them.
- **One open write per SKU.** A decrease may overtake an open write; the later of the two is confirmed by the rule above.
- **Reads** come from their own bucket, 5 a second per seller. Scheduled reads use the all-listings report and notices, never one read per listing, which keeps the application under Amazon's 100 reads a second.

### Shopify

- **Compare-and-set on every write** (ADR-004.3), in batches of up to 250 on the bulk lane, singly on the safety lane, always leaving 55 points in the bucket.

### Budget

Assumptions: per seller, 2,000 linked listings on two or three accounts and 150 orders a day; at 1,000 sellers, about 600 eBay accounts (240 with Seller Hub listings), 500 Amazon and 500 Shopify.

| Limit | 10 sellers | 100 sellers | 1,000 sellers | Allowance |
| --- | --- | --- | --- | --- |
| eBay Trading pool, stock writes and reads | about 100 a day | about 740 | about 7,400 | 5,000 by default for the application |
| Pool that ADR-004's reserve needs (500 per Seller Hub account) | 5,000 | about 12,000 | about 120,000 | The same |
| eBay order calls | about 600 | about 6,000 | about 61,000 | 100,000 |
| Amazon patches | trivial | trivial | about 3 a second across the application | 5 a second per seller, 500 per application |
| Shopify cost points | under 1 % of a shop's bucket | the same | the same | Per shop |

**What binds is ADR-004's reserve rule, not Vervoro's own writes.** A tenth of the Trading pool is its reserve, and a new account waits in shadow when its share would fall below 50 calls, so the pool needs 500 calls per Seller Hub account. The default 5,000 serves 10. More need eBay's Application Growth Check, asked for in time for each stage.

## The low-stock policy

| Setting | Set for | Default |
| --- | --- | --- |
| **Keep the last K units for one account** | The company, with an override per product, optionally until an end date | K = 2, for the first seller-shipped account connected; never an Amazon account on several marketplaces |
| **Buffer** (units an account is never shown) | Product and account, optionally until an end date | 0 |
| **Tolerance T** | Account | 20 |

- **One keep per product at a time.** A dated keep replaces the default for that product until its end, then the default returns. It may not keep more than the product's sellable when it is set.
- **Kept units are never stranded.** Units are kept only while the priority account is live and its listing of the product is managed. Otherwise every account sees the whole figure.
- **A campaign is a dated keep.** "Keep 50 for Amazon until Sunday" stops other channels selling the units committed to a deal, which Amazon cancels when the stock behind it falls short. Every change shows a preview first: what each other account can still sell, and how long that lasts at last week's pace.
- **Owner, Admin or Manager** change the settings; each change recomputes the figures in one transaction, and its decreases go at once.

## Listing modes and stopping

- **A listing is managed or not managed,** optionally until a date. Not managed means no figure is sent; its orders still reserve.
- **Every stop asks one question:** leave the figure as it is, or send 0. It applies to stopping an account, stepping it back to shadow, disconnecting, switching a marketplace off, and setting one listing to not managed (ADR-000, ADR-004). A 0 is confirmed applied before the mode changes.
- **A not-managed listing that shows more than the stock** is flagged to the seller, because nothing else will correct it.
- **Decrease-only** is an account mode for a company closed under ADR-012, from its closing date until its erasure. Orders still import and reserve, and D is worked out as usual, but a figure is sent only when it is lower than B. A higher D is never sent, whatever raised it: a receipt, a return, a cancellation or a policy change. Rows of the sending table that would send a higher D send nothing.

## Held raises

ADR-005 keeps one set of reasons per listing. While the set is not empty, D is still worked out truthfully, every decrease goes, and raises wait. The reasons: the listing came back after ending; its SKU was edited onto another product's; a live bulk link is not yet confirmed; a fulfilment conflict is open (ADR-005, ADR-007); its product failed the nightly check (ADR-006); an open import problem names it (above). When the last reason clears, the raise becomes due at that moment and waits for the order read.

## The first figure after a link

- **B comes from the link's catalogue read** if it is under an hour old; otherwise the listing is read first. The raise, if any, becomes due when the link is made.
- **A single link** follows the rules at once: a lower figure goes now, a higher one after the order read.
- **A bulk link** on a live account sends its decreases under the rules, within the admission rule above. Its raises wait for the seller's one confirm (ADR-005).
- **A listing moving from marketplace-shipped to seller-shipped,** and a pending Amazon offer, get no figure until ADR-005's conditions clear.

## Amazon accounts on several marketplaces

One patch sets one quantity for every marketplace the account serves (ADR-004.2). Whether a sale on one lowers the others depends on a seller setting Vervoro cannot see. So such an account's own sales are not vouched: B is never lowered by them, the tolerance does not apply, and every change is sent. A sale is always followed by a write, so every marketplace returns to the same figure within minutes. Such an account is never the priority account for kept units.

## One writer per listing

- **One job per write target at a time.** A batch takes the lease of every member; a member already leased is left out.
- **Leases** last the call's timeout plus 15 seconds. A lease that expires is written `unknown` before anything else, and the write is settled as above.
- **The idempotency key** is the company's sync epoch, the write target, the version, the figure, and how many writes of that figure at that version have already settled. A repeat after a crash carries the same key and is never sent twice. A deliberate second write of the same figure, after the first settled, gets a new key.
- **The sync epoch** is kept in the control database (ADR-001), outside the company's own data, so a restore can never roll it back.

## Shadow and going live

Every account starts in shadow (ADR-004): orders reserve inside Vervoro and the gate records each figure it would send.

**The listing check.** D is compared with what each marketplace shows, listing by listing. A listing showing more than D is never accepted as explained: going live sends the decrease. A listing showing less can be accepted in bulk. A ratio of 3 or more either way is listed first and needs its own tap (ADR-005).

**A company's first go-live** is a move from an older system, and needs:

- **Two on-hand imports from the old system,** one when shadow starts and one at going live. Every product that fell by more than its imported orders explain is listed for the seller to tick off: it shows an order type Vervoro does not see.
- **One complete order read** and every linked listing read.
- **Every account the old system syncs goes live in one step,** and the seller confirms that the old system's sync is off. After this, on-hand imports are refused, a restore included: the ledger is the only record of stock.

**Later accounts,** added to a company already live, go live on the listing check, one complete order read and every listing read.

**Going live** is one confirm with the totals: "Going live sends 143 decreases now and 212 raises after the next order read."

## Recovery

| Event | What happens |
| --- | --- |
| **A crash or our own outage** | Leases expire and open writes are `unknown`, settled first. The desired rows are current, so nothing is replayed. Every raise waits for a fresh order read; each account's first read is spread over 5 minutes |
| **A marketplace outage** | Calls back off. After 5 failures in a row an account's writes stop for 1 minute, doubling to 15, with one probe each interval. The rows simply age, and on recovery the latest figures go in ladder order at normal rates |
| **The operator's hold on a marketplace** (ADR-004) | Figures wait as desired rows; on release, `unknown` writes are settled first |
| **A restore** (ADR-001) | The sync epoch rises; every account returns to shadow; every B is unknown; listings are read by reports and bulk reads, never one Trading call per listing. eBay revisions are counted at their worst for 24 hours. The operator signs off the differences before anything is sent |
| **An account reconnects** | A new shadow period with B unknown; it goes live on the listing check like any later account |
| **A closed company reopens** (ADR-012) | Every account returns to shadow and every B is unknown. Goods received while it was closed are recorded first; each account goes live again on the listing check, like a later account |

## What the seller and the operator see

**Every listing shows two figures,** Vervoro's and what the marketplace last showed, each with its age in words: "confirmed 3 min ago", "waiting for Amazon, 4 min", "read 6 h ago". An account's health is one of four words: not measured (in shadow, or nothing confirmed yet), right, catching up, or needs you.

**Seller alerts, in the app:**

- a listing at 0 with stock for 5 minutes, when no rule is already fixing it;
- a figure the marketplace refused;
- a figure not confirmed 20 minutes after its deadline;
- a listing that is not managed and shows more than the stock.

**One email:** "a marketplace shows more than you have and Vervoro cannot fix it" (a refused decrease, eBay's revision limit, a frozen item). It goes to the account's owner and admins, grouped per account, at most one every 30 minutes, never during an incident on the marketplace's side, and it names the listings and the fix. Vervoro runs in the browser, so email is how a seller hears about this while away from the screen.

**Operator pages,** per marketplace, never per listing: the order watermark more than 60 minutes behind; a decrease or a change in the zone that no rule is holding, unsent for 15 minutes; a shared pool at 90 %; an Amazon write accepted but not confirmed after 60 minutes; an `unknown` write not settled after three reads. When a fifth of a marketplace's accounts page at once, one "marketplace down" page replaces them.

## Amazon Vendor

A Vendor account sells to Amazon by purchase order and has no listing figure in this sense. Its orders reserve stock (ADR-006) and so lower every seller-shipped listing's figure. What a Vendor account sends, if anything, is ADR-004.4's (planned).

## Storage

| Table | Owner | Holds |
| --- | --- | --- |
| `listing_desired` | Foundation | Listing, link version, account, D or no figure, version, ledger sequence and time it came from, the time a raise became due |
| `stock_policy` | Foundation | Keep K and the priority account per company and product, with an end date; buffers per product and account, with an end date; T per account |
| `listing_sync` | Host | B or unknown, when and how it was observed, W, the listing's mode, the lease, revisions in the last 24 hours |
| `stock_send` | Host | Write target, listings, version, figure, lane, idempotency key, outcome and times; 30 days of detail, then a daily count per listing |
| `sync_epoch` | Control database | One number per company, raised by every restore |

The host and the foundation name each other's rows by plain ids, read through ports; no foreign key crosses modules (ADR-000).

## Rules, each with a test

1. Recomputing every desired row from committed state gives the stored rows. The nightly check (ADR-006) runs this too.
2. B is never lowered without evidence: a confirmed write, a read, or a vouched own sale on the listing the order names.
3. No raise is sent before the order watermark covers the moment it became due, plus 2 minutes. A simulated late order proves it.
4. A write target has at most one open write, except that an Amazon decrease may overtake an open write; a crash ends in `unknown` and a settle, never a blind resend.
5. No idempotency key repeats across a restore.
6. Every stop, at account and at listing scale, asks leave or 0, and a 0 is confirmed before the mode changes.
7. On a simulated eBay day, no item passes 250 revisions from Vervoro, every write past 240 is a 0, and a 0 always has room; over a simulated 30 days, every write past 1,800 is a 0.
8. No figure is ever sent to a marketplace-shipped listing, and "no figure" is never sent as 0.
9. Kept units go only to a live, managed priority listing.
10. A listing above its zone shows at most T − 1 more than D once its writes have settled.
11. An import problem's units are off every account's figure until it imports, and come back exactly once.
12. After a restore, nothing is sent before the operator signs off.
13. An account in decrease-only mode never sends a figure above B; a sale on one account still lowers the others.

## Constraints

Checked against each marketplace's documentation on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| eBay revisions per listing | Up to 250 a calendar day, whichever API is used; then blocked until the next day; the time zone is not stated, nor how variations count | [Listing management](https://developer.ebay.com/develop/guides/sell/listing-management), [bulkUpdatePriceQuantity](https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/bulkUpdatePriceQuantity) |
| eBay revisions per month | 2,000 per item, counting every revision call, in the call's change history (2011); not in the current listing guide | [ReviseInventoryStatus, change history](https://developer.ebay.com/devzone/xml/docs/Reference/eBay/ReviseInventoryStatus.html) |
| eBay Trading inventory revision | Up to four listings or variations a call; sets the quantity available; the reply no longer returns the quantity | [ReviseInventoryStatus](https://developer.ebay.com/devzone/xml/docs/Reference/eBay/ReviseInventoryStatus.html) |
| eBay out-of-stock option | Keeps a fixed-price listing alive at quantity 0, hidden from search; off by default | [SetUserPreferences](https://developer.ebay.com/devzone/xml/docs/Reference/eBay/SetUserPreferences.html) |
| eBay daily limits per application | Trading 5,000; order resource 100,000; Inventory 2 million; raised after the Application Growth Check | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Amazon listing patch and read | 5 a second per seller and application, burst 5; 500 patches and 100 reads a second per application | [Listings Items API rate limits](https://developer-docs.amazon/sp-api/docs/listings-items-api-rate-limits) |
| Amazon `accepted` | Initial checks passed and submitted for processing; not yet applied | [Listings workflows](https://developer-docs.amazon/sp-api/docs/building-listings-management-workflows-guide) |
| Amazon listings feeds | A small feed can take several hours; records are not processed in order; at most 5 feeds a seller every 5 minutes | [Listings workflows](https://developer-docs.amazon/sp-api/docs/building-listings-management-workflows-guide), [Feeds API rate limits](https://developer-docs.amazon/sp-api/docs/feeds-api-rate-limits) |
| Shopify inventory set | Compare-and-set per item; an idempotency key is required from API version 2026-04; at most 250 items an input | [inventorySetQuantities](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities), [API limits](https://shopify.dev/docs/api/usage/limits) |
| Shopify cost budget | Per app and shop; 100 points a second on the standard plan | [GraphQL Admin API rate limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits) |

## Changes to earlier records

This record amends three published records, in the same publication.

- **ADR-000, the send rules.** "A decrease, or any change while the shelf is low, goes at once. … A well-stocked figure is sent again only once the channel has drifted from it." becomes "Any change while a listing is near zero goes at once. Above that, a figure is sent again only once the channel has drifted from it by the tolerance, in either direction."
- **ADR-001, restoring one company, step 6.** Adds: "Raise the company's sync epoch, kept in the control database, which every write's idempotency key carries (ADR-008)."
- **ADR-005.** "Accounts go live one at a time" adds: "except at a company's first go-live, when every account the old system served goes live in one step (ADR-008)". The set of held-raise reasons adds "its product failed the nightly check (ADR-006)" and "an open import problem names it (ADR-007)".

## Consequences

**What this gives us**

- Near zero, every channel hears every change at once, and the last 2 units can be sold by only one channel.
- A busy listing costs one write per 20 sales, so eBay's revision cap and the shared Trading pool hold at every stage.
- No raise lets a marketplace sell stock whose order Vervoro has not seen.
- Every write is confirmed, and a stalled sync pages the operator before a seller notices.
- A crash, an outage or a restore loses nothing and sends nothing twice.
- The whole design is a handful of rules and three seller settings.

**What it costs**

- Above the zone, a channel can show up to 19 more than its figure. It matters only if the channels together sell more than the figure in the minute or two before the next write.
- Raises wait for an order read: under a minute on Shopify, a few minutes on eBay, 5 to 8 on Amazon.
- Amazon accounts on several marketplaces get no savings: every sale is a write.
- A seller's hand edit to an eBay Seller Hub listing near zero can go unseen until the daily read, if the account's share of the Trading pool is spent.
- An account is served by one warehouse.
- A company's first go-live moves every account the old system served at once.
- More than 10 Seller Hub accounts need eBay's Growth Check.
- An order that cannot be imported holds back its units everywhere until it imports or a person resolves it.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Send every change at once | Spends eBay's 250 revisions by mid-afternoon on a busy listing and multiplies Trading calls, for no protection while stock is plentiful |
| A fixed floor of 10 under a tolerance of 20 | Leaves listings between 11 and 29 where a channel can show up to 19 too many; the zone must be at least as wide as the tolerance |
| A floor that grows with two hours of sales | Sizes for hours a risk that lasts minutes, and puts busy listings in the zone all day |
| Amazon listings feeds for large sets of raises | Feeds take hours and run out of order, so a raise can overwrite Amazon's own sales; single patches are fast enough |
| Divide an Amazon figure by its marketplaces while low | Hides the last units entirely; sending every change does the protecting instead |
| A separate "uncertain" belief | The rule that a belief only falls on evidence already covers a crossed sale |
| A display cap per listing and an automatic lift | No launch failure needs them once the tolerance cuts writes; a cap inside the zone writes on every sale |
| Campaign mode with committed quantities and faster order checks | A dated keep protects a deal; faster checks would spend eBay's shared order allowance on promotions that ignore quantity |
| Paused and set-once listing modes | Not managed, with an optional end date, covers both, and asks the same stop question |
| A daily stock import from the old system during shadow | Two imports, at the start and at going live, find the same missing order types without daily work |
| Hourly reads of every listing | Breaks eBay's daily page cap and Amazon's application read ceiling at scale; reports and notices find drift instead |
| Read back every eBay and Shopify write | They answer at once; a read on eBay's Trading API costs a call from the shared pool |
| A heartbeat listing written every 15 minutes | A page for the oldest unsent figure finds a stalled sync without writing to any marketplace |
| Send figures from a queue of messages | Old figures would replay; one row per listing sends only the latest (ADR-000) |
| A "lowered on the marketplace" hold | The eBay revision count bounds any tug-of-war with a seller's own edits, and a hold would leave a listing at 0 with stock until the seller answers |
| Holding raises when Amazon orders come from a marketplace the account does not serve | Those orders are imported and reserve stock like any other (ADR-007), so holding raises protects nothing |
| A product-wide limit on how far its listings may together show too much | With the zone at least T wide, it matters only above about 250 sales an hour, and its writes could not be explained on the seller's screen |
| A safety reserve sized from each account's shadow use | ADR-004's reserve stands; this is the fallback if eBay's Growth Check grants less (see later records) |
| Pacing the bulk lane to the pool's daily reset | No pool is contested at 5 to 100 sellers |

## What later records decide

- **ADR-004.4: Amazon Vendor connector** (planned): whether a Vendor account sends any availability.
- **Serving one account from several warehouses:** needs order routing.
- **Amazon bulk raises:** listings feeds, with a read back of every member, if single patches ever fall short.
- **Display caps:** a "show at most" figure per listing and its automatic lift.
- **Campaign mode in full:** committed quantities per listing, and marketplaces that lock a campaign quantity.
- **Moving eBay Seller Hub listings to the Inventory API**, and an account reserve sized from shadow use: only if the Growth Check grants less than the reserve rule needs.
- **eBay item-change notices for Seller Hub listings**, so a seller's hand edit is seen before the daily read.
- **Proving that Amazon keeps its marketplaces in step** for an account, from its notices during shadow, which would let those accounts use the tolerance.
