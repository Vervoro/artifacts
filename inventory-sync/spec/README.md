# ADR-008 SPEC: Inventory sync

| | |
| --- | --- |
| **Decision** | [ADR-008: Inventory sync](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-008-inventory-sync) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-008 from: the Stock sync module, switchable per company, needing Inventory, Listings, Orders and Channels ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| Amazon Vendor accounts: they get no figure from this record; their orders reserve stock and so lower other listings' figures | The Vendor connector (ADR-004.4, not written) decides whether a Vendor account sends any availability | None here |
| Serving one account from several warehouses | Order routing gets its record | [1](#1-the-figure-per-listing) |
| Amazon listings feeds for bulk raises, with a read-back of every member | Single patches fall short | [8](#8-limits-and-who-goes-next) |
| A "show at most" figure per listing with an automatic lift; campaign mode with committed quantities | Sellers ask for them | [9](#9-the-low-stock-policy) |
| Moving eBay Seller Hub listings to the Inventory API; an account reserve sized from shadow use | The Growth Check grants less than ADR-004's reserve rule needs | [8](#8-limits-and-who-goes-next) |
| eBay item-change notices for Seller Hub listings | Hand edits near zero are seen too late in shadow | [6](#6-confirming-every-write) |
| The tolerance for Amazon accounts on several marketplaces | Notices during shadow prove Amazon keeps the marketplaces in step | [12](#12-amazon-accounts-on-several-marketplaces) |

## 1. The figure per listing

This section owns the rule that Stock sync alone writes each listing's figure (owner ruling, 21 October 2026, [ADR-000 SPEC 4.6](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)).

1. **Inventory writes, Stock sync works out.** Inventory writes each stock change with its ledger sequence and an outbox note in one transaction ([ADR-006 SPEC 13](../../stock-ledger/spec/#13-telling-stock-sync)). Stock sync's handler hears the note after commit ([ADR-001 SPEC 9](../../database-architecture/spec/#9-background-work-and-the-outbox)), reads sellable and its sequence through Inventory's port and the links through Listings' port, and writes the rows in its own transaction. No other module writes `sync_listing_figure`.
2. **One row per linked listing:** D (or no figure), a version, the link version, and the ledger sequence and time it came from.
3. **An older sequence never replaces a newer one.** A recompute first locks the listing's row, then reads its inputs, and writes only if its sequence is at least the stored one. So the last recompute to commit always read the newest inputs.
4. **Other recomputes:** a link made, changed or closed (Listings' event), a bundle's components changed (Products' event), a policy or account-setting change (Stock sync's own), an import problem opened or closed (Orders' event). They run at the current sequence, without a ledger entry.
5. **The version rises only when D changes,** so a recompute that changes nothing sends nothing.
6. **Nothing is lost:** the note commits with the stock change, and the handler is idempotent with a receipt. Recomputing every row from committed state gives the stored rows; the nightly check runs this ([ADR-006 SPEC 14](../../stock-ledger/spec/#14-the-nightly-check-and-checkpoints)).

**The steps,** for a listing on account A, linked to product P with `units_per_sale` u:

1. **One warehouse.** Each account is served by its default warehouse only ([ADR-006 SPEC 1](../../stock-ledger/spec/#1-where-stock-is-counted)); on Shopify, by Vervoro's location ([ADR-004.3](../../shopify-connector/)). Changing it recomputes the account's listings, and their decreases go at once.
2. **Sellable.** S = P's sellable in A's warehouse. Dates are already in it.
3. **What A may sell.** avail = max(0, S − units kept for another account − A's buffer for P − units of open import problems), in product units.
4. **A bundle** takes, per component, that component's avail for A divided by the quantity per bundle, rounded down, and the smallest of them.
5. **D = floor(avail ÷ u).**

**Import problems** ([ADR-007](../../order-ingestion/)): each line whose listing and quantity were read takes quantity × the units per sale of the link valid at purchase off avail for every account, never below zero, until the order imports, when its reservations replace the deduction. A line whose quantity was not read holds raises on its listing; a line whose listing was not read holds every raise on the account, and pages the operator after 60 minutes. A mirror's lines (a Shopify copy of a sale also connected directly) count the same.

**No figure** (never sent as 0): marketplace-shipped listings; pending, ended and missing listings ([ADR-005](../../catalogue-sync/)); eBay variations without a SKU; eBay Seller Hub listings never read because the out-of-stock option is off ([ADR-004.1](../../ebay-connector/)); listings not managed; disconnected accounts.

## 2. Terms

| Term | Meaning |
| --- | --- |
| **D** | The figure a listing should show. A whole number, or no figure |
| **B** | The figure the marketplace is believed to show. A number, or unknown |
| **T** | The tolerance, in listing units. Default 20, per account |
| **W** | The width of the zone near zero, per listing: the larger of T and twice the listing's largest order line in the last 30 days, at most 5 × T |
| **In the zone** | The smaller of B and D is at most W, or B is unknown |
| **Vouched** | The connector can say a sale on this listing came out of the one figure Vervoro writes to it |
| **Write target** | What one write names: an eBay inventory item, an eBay Seller Hub listing or variation, an Amazon SKU on the account, a Shopify inventory item at Vervoro's location |

## 3. When a figure is sent

| Situation | Sent | Lane | When |
| --- | --- | --- | --- |
| B unknown | Read first, then the rules below | Safety | At once |
| In the zone, D < B | D | Safety | At once |
| In the zone, D > B | D | Safety | After the order read |
| Above the zone, B − D ≥ T | D | Safety | At once |
| Above the zone, D − B ≥ T | D | Bulk | After the order read |
| Above the zone, gap under T | Nothing | | With the next write |
| Not vouched | D whenever D ≠ B | Safety if lower, bulk if higher | At once if lower; after the order read if higher |

1. **W is in the listing's own units,** so a six-pack or a bundle is in the zone as soon as its own figure is, and one large trade order on one listing never puts the whole account in the zone.
2. **One write in flight per listing.** New figures only update the row; when a write ends, the latest D is compared with B again.

## 4. The belief

1. **B may err only upward.** A confirmed write or a read sets it.
2. **A vouched own sale lowers B,** only for the listing the order names by its marketplace id, and only if placed more than 2 minutes after the confirmation of Vervoro's last write was received (on Amazon, the notice or read that confirmed it, never the acceptance). An order naming a listing the last read did not show asks for a read.
3. **A sale that may have crossed a write** leaves B at the written figure; D already counts the sale, so the rules send the gap.
4. **A confirmed cancellation** gives units back to B the same way.
5. **When an account's marketplaces or Vervoro's Shopify location change,** its beliefs are cleared and its listings read again.

| Marketplace | Own sales vouched |
| --- | --- |
| eBay | Yes, for the listing the order names |
| Amazon, one marketplace | Yes |
| Amazon, several marketplaces | No: whether a sale on one lowers the others depends on a seller setting Vervoro cannot see (ADR-004.2) |
| Shopify | Only for orders assigned wholly to Vervoro's location |

## 5. The order read before a raise

1. **A raise becomes due** when D rises above B, or a read lowers B. A decrease, or a read that changes nothing, does not restart the wait.
2. **It goes** when the account's order watermark ([ADR-007](../../order-ingestion/)) is at least that moment plus 2 minutes, and **sends the latest D,** never the figure it became due with.
3. **A notice naming an order without its lines** holds the account's raises until the order is fetched or recorded as an import problem; after 30 minutes the operator is paged.
4. **One on-demand read per account** covers every raise waiting on it:

| Marketplace | Soonest after the last read | Daily cap |
| --- | --- | --- |
| Shopify | 30 seconds | None |
| Amazon | 3 minutes | None |
| eBay | 5 minutes | 48 a day per account, and none once the application's order calls pass 70 % of the day's allowance; then the hourly backup read |

## 6. Confirming every write

| Outcome | B becomes | Next |
| --- | --- | --- |
| `applied` (eBay, Shopify) | The figure sent | Confirmed; no read follows |
| `accepted` (Amazon) | Unchanged until confirmed | Confirmed by the first quantity notice equal to the figure sent, or a read showing it less at most the listing's own orders since acceptance. A safety write is read at 2 and 10 minutes, a bulk write once at 10; a read is skipped once a notice confirmed. With more than 2,000 open writes on an account, one all-listings report confirms them |
| `throttled` | Unchanged | The marketplace's wait, capped at an hour, or 5 s × 2ⁿ up to 15 minutes |
| `compare_mismatch` (Shopify) | The figure Shopify reports | The rules run again |
| `rejected` | Unchanged | The seller sees the reason; no retry until D or the listing changes |
| `unknown` | Unknown | Settled before anything else is sent, by [ADR-004's rule](../../channel-connectors/spec/#5-retries-and-outcomes), with its eBay Trading exception ([ADR-004.1](../../ebay-connector/spec/#4-listings-and-stock)) |

1. **A read-back that does not match** after the deadline closes the write as "send again".
2. **Drift** (a figure Vervoro did not send) is found by notices where they exist (Amazon's listing-quantity notices, Shopify's inventory webhook), eBay inventory item reads every 6 hours from the Inventory API's own allowance, and the daily safety read ([ADR-005](../../catalogue-sync/)). A reading replaces B and the rules decide.
3. **Entering the zone:** an eBay inventory item is read once, from the Inventory API's allowance; a Seller Hub listing only within the account's share of the Trading pool, otherwise at the daily read.

## 7. Held raises

1. **Stock sync keeps one set of reasons per listing.** While it is not empty, D is still worked out truthfully, every decrease goes, and raises wait.
2. **Reasons:** the listing came back after ending; its SKU was edited onto another product's; a live bulk link is not confirmed; a fulfilment conflict is open ([ADR-005](../../catalogue-sync/), [ADR-007](../../order-ingestion/)); its product failed the nightly check ([ADR-006](../../stock-ledger/spec/#14-the-nightly-check-and-checkpoints)); an open import problem names it. Each arrives by its owner's event; the operator can also hold raises by hand ([runbook](../../runbooks/hold-raises-or-pause-an-account/)).
3. **When the last reason clears,** the raise becomes due at that moment and waits for the order read.

## 8. Limits and who goes next

1. **One ladder per account:** reading back an `unknown` write; a safety-lane write and the fetch of a new order whose notice carried no lines; any other order fetch; a bulk-lane raise; the scheduled order read; background reads. Within a rung: zeros first, then the smallest D, then the oldest. On a shared pool, accounts take turns within a rung.
2. **Shared pools** ([ADR-004](../../channel-connectors/)): an account's reserve is spent only after the pool's bulk lane has paused for the day; then safety-lane raises may take only the first half of what is left of the account's share, decreases all of it.
3. **Go-lives and bulk links on a shared pool:** raises take at most a tenth of the pool's bulk lane per account per day; decreases must fit the day's free room, or the screen offers the first day that has room.
4. **eBay revisions.** Counted per item over a rolling 24 hours (every variation together, each revised variation one revision), and over 30 days:

| Revisions in the last 24 hours | What may go |
| --- | --- |
| Under 150 | Everything |
| 150 to 239 | Decreases, and raises from 0 |
| 240 to 249 | Only a 0; a listing in the zone is sent 0 at 240 |

   From 1,800 in 30 days an item takes only zeros. eBay's own "limit reached" reply stops every write to the item until the window frees a revision, and the seller is told at once. A Trading call carries up to four listings or variations of one account, waits at most 2 seconds to fill, and a zero never waits.
5. **Amazon:** single patches only, one open write per SKU (a decrease may overtake it). Scheduled reads use the all-listings report and notices, never one read per listing.
6. **Shopify:** compare-and-set on every write ([ADR-004.3](../../shopify-connector/)), in batches of up to 250 on the bulk lane, singly on the safety lane, always leaving 55 points in the bucket.
7. **Budget.** At 2,000 linked listings and 150 orders a day per seller, stock writes and reads use about 100 Trading calls a day for 10 sellers and 740 for 100. What binds is ADR-004's reserve rule: 500 calls per Seller Hub account, so the default 5,000 serves 10, and more need eBay's Growth Check.

## 9. The low-stock policy

| Setting | Set for | Default |
| --- | --- | --- |
| Keep the last K units for one account | The company, with an override per product, optionally until an end date | K = 2, for the first seller-shipped account connected; never an Amazon account on several marketplaces |
| Buffer (units an account is never shown) | Product and account, optionally until an end date | 0 |
| Tolerance T | Account | 20 |

1. **One keep per product at a time.** A dated keep replaces the default until its end. It may not keep more than the product's sellable when it is set.
2. **Kept units are never stranded:** they are kept only while the priority account is live and its listing of the product is managed.
3. **Every change shows a preview** (what each other account can still sell, and how long that lasts at last week's pace), is made by an Owner, Admin or Manager, recomputes the figures in one transaction, and its decreases go at once.

## 10. Listing modes and stopping

1. **A listing is managed or not managed,** optionally until a date. Not managed sends no figure; its orders still reserve. One that shows more than the stock is flagged to the seller.
2. **Every stop asks: leave the figure, or send 0.** It applies to stopping an account, stepping it back to shadow, disconnecting, switching a marketplace off, and setting a listing to not managed. A 0 is confirmed applied before the mode changes.
3. **Decrease-only** is an account mode for a company closed under [ADR-012](../../billing-and-plans/), from its closing date until erasure. D is worked out as usual, but a figure is sent only when it is lower than B.

## 11. The first figure after a link

1. **B comes from the link's catalogue read** if it is under an hour old; otherwise the listing is read first. The raise becomes due when the link is made.
2. **A single link** follows the rules at once. **A bulk link** on a live account sends its decreases within section 8.3; its raises wait for the seller's one confirm ([ADR-005](../../catalogue-sync/)).
3. **A listing moving from marketplace-shipped to seller-shipped,** and a pending Amazon offer, get no figure until ADR-005's conditions clear.

## 12. Amazon accounts on several marketplaces

One patch sets one quantity for every marketplace the account serves ([ADR-004.2](../../amazon-seller-connector/)). Its own sales are not vouched, B is never lowered by them, the tolerance does not apply, and every change is sent. Such an account is never the priority account for kept units.

## 13. One writer per listing

1. **One job per write target at a time.** A batch takes the lease of every member; a member already leased is left out.
2. **A lease** lasts the call's timeout plus 15 seconds. An expired lease is written `unknown` and settled first.
3. **The idempotency key** is the company's sync epoch, the write target, the version, the figure, and how many writes of that figure at that version have already settled. A repeat after a crash carries the same key; a deliberate second write of the same figure gets a new one.
4. **The sync epoch** is one number per company in the control database ([ADR-001 SPEC 7](../../database-architecture/spec/#7-control-database-and-routing)), so a restore never rolls it back. Every restore raises it.

## 14. Shadow and going live

Every account starts in shadow by [ADR-004's rule](../../channel-connectors/spec/#11-shadow-mode-and-launch-gates). This section adds what going live needs.

1. **The listing check.** D is compared with what each marketplace shows. A listing showing more than D is never accepted as explained; going live sends the decrease. One showing less can be accepted in bulk; a ratio of 3 or more either way is listed first and needs its own tap ([ADR-005](../../catalogue-sync/)).
2. **A company's first go-live** needs two on-hand imports from the old system, one when shadow starts and one at going live. A product that fell by more than its imported orders explain is listed for the seller. The second import sets on hand outright to the old system's figure as one adjustment ([ADR-006](../../stock-ledger/)). It also needs one complete order read, every linked listing read, and every account the old system syncs going live in one step, after the seller confirms the old system's sync is off. After that, on-hand imports are refused, a restore included.
3. **Later accounts** go live on the listing check, one complete order read and every listing read.
4. **Going live is one confirm** with the totals of decreases sent now and raises after the next order read. Procedure: [Take a company live](../../runbooks/take-a-company-live/).

## 15. Recovery

| Event | What happens |
| --- | --- |
| A crash or our own outage | Leases expire, open writes are `unknown` and settled first. Rows are current, so nothing is replayed. Every raise waits for a fresh order read; each account's first read is spread over 5 minutes |
| A marketplace outage | Calls back off; after 5 failures in a row an account's writes stop for 1 minute, doubling to 15, with one probe each interval. On recovery the latest figures go in ladder order |
| The operator's hold on a marketplace ([ADR-004](../../channel-connectors/)) | Figures wait as rows; on release, `unknown` writes are settled first |
| A restore ([ADR-001](../../database-architecture/)) | The sync epoch rises; every account returns to shadow; every B is unknown; listings are read by reports and bulk reads; eBay revisions count at their worst for 24 hours; the operator signs off before anything is sent ([runbook](../../runbooks/recover-stock-sync-after-a-restore/)) |
| An account reconnects | A new shadow period with B unknown; it goes live on the listing check |
| A closed company reopens ([ADR-012](../../billing-and-plans/)) | Every account returns to shadow with B unknown; goods received while closed are recorded first |

## 16. What the seller and the operator see

1. **Every listing shows two figures,** Vervoro's and what the marketplace last showed, each with its age in words. An account's health is one of: not measured, right, catching up, needs you.
2. **Seller alerts in the app:** a listing at 0 with stock for 5 minutes that no rule is fixing; a refused figure; a figure not confirmed 20 minutes after its deadline; a not-managed listing showing more than the stock.
3. **One email:** "a marketplace shows more than you have and Vervoro cannot fix it" (a refused decrease, eBay's revision limit, a frozen item), to the account's Owners and Admins, grouped per account, at most every 30 minutes, never during an incident on the marketplace's side, naming the listings and the fix.
4. **Operator pages, per marketplace, never per listing:** the order watermark more than 60 minutes behind; a decrease or a change in the zone, unheld, unsent for 15 minutes; a shared pool at 90 %; an Amazon write accepted but unconfirmed after 60 minutes; an `unknown` write unsettled after three reads. When a fifth of a marketplace's accounts page at once, one "marketplace down" page replaces them.

## 17. Storage

Stock sync's tables carry the `sync_` prefix, are declared through `tenantTable()` and queried through the typed query builder ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)); they name other modules' rows by plain ids, with no foreign key.

| Table | Holds |
| --- | --- |
| `sync_listing_figure` | Listing, link version, account, D or no figure, version, ledger sequence and time it came from, the time a raise became due |
| `sync_policy` | K and the priority account per company and product, buffers per product and account (each with an end date), T per account |
| `sync_listing_state` | B or unknown, when and how observed, W, the mode, the lease, revisions in 24 hours and 30 days, the held-raise reasons |
| `sync_send` | Write target, listings, version, figure, lane, key, outcome and times; 30 days of detail, then a daily count per listing |

The sync epoch is in control. Schema changes expand, then contract ([ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying)).

## 18. Constraints

Checked against each marketplace's documentation on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| eBay revisions per listing | Up to 250 a calendar day, whichever API; time zone and variation counting not stated | [Listing management](https://developer.ebay.com/develop/guides/sell/listing-management) |
| eBay revisions per month | 2,000 per item, in a 2011 change history only | [ReviseInventoryStatus](https://developer.ebay.com/devzone/xml/docs/Reference/eBay/ReviseInventoryStatus.html) |
| eBay Trading revision call | Up to four listings or variations; sets the quantity; the reply no longer returns it | Same page |
| eBay out-of-stock option | Keeps a fixed-price listing alive at 0, hidden; off by default | [SetUserPreferences](https://developer.ebay.com/devzone/xml/docs/Reference/eBay/SetUserPreferences.html) |
| eBay daily limits per application | Trading 5,000; orders 100,000; Inventory 2 million; raised by the Growth Check | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Amazon listing patch and read | 5 a second per seller and application; 500 patches and 100 reads a second per application | [Listings Items API rate limits](https://developer-docs.amazon/sp-api/docs/listings-items-api-rate-limits) |
| Amazon `accepted` and feeds | Accepted is not applied; a small feed can take hours and runs out of order | [Listings workflows](https://developer-docs.amazon/sp-api/docs/building-listings-management-workflows-guide) |
| Shopify inventory set | Compare-and-set; idempotency key required from 2026-04; at most 250 items | [inventorySetQuantities](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities) |
| Shopify cost budget | Per app and shop; 100 points a second on the standard plan | [GraphQL Admin API rate limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits) |

## 19. Tests that prove each rule

Pure send rules run as unit tests; the handler and leases on real Postgres; marketplace behaviour on the simulators ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)).

| Test | Proves |
| --- | --- |
| Writer | Only Stock sync writes `sync_listing_figure`; Inventory's transaction writes a note and no figure |
| Sequence | Two handlers for sequences 10 and 11 in either commit order leave the row at 11; a policy change racing a note ends with both applied |
| Recompute | Recomputing every row from committed state gives the stored rows |
| Belief | B never falls without a confirmed write, a read, or a vouched own sale on the listing the order names |
| Order read | No raise is sent before the watermark covers the due moment plus 2 minutes; a simulated late order proves it |
| One write | A write target has at most one open write (an Amazon decrease excepted); a crash ends `unknown`, settled first |
| Epoch | No idempotency key repeats across a restore; after a restore nothing is sent before sign-off |
| Stops | Every stop asks leave or 0; a 0 is confirmed before the mode changes |
| eBay day | On a simulated day no item passes 250; every write past 240 is a 0 and a 0 always has room; over 30 days every write past 1,800 is a 0 |
| No figure | Nothing is sent to a marketplace-shipped listing; "no figure" is never sent as 0 |
| Kept units | Go only to a live, managed priority listing |
| Tolerance | A listing above its zone shows at most T − 1 more than D once writes settle |
| Import problems | Their units are off every account's figure until the order imports, and come back exactly once |
| Decrease-only | Never sends above B; a sale on one account still lowers the others |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **One writer:** only Stock sync's code inserts or updates `sync_listing_figure`; Inventory imports nothing from Listings or Stock sync.
- [ ] **After commit:** the figure is written in the outbox handler, never inside a stock command's transaction.
- [ ] **Sequence guard:** the update locks the row first, reads inputs after, and compares the sequence; the sequence test is green.
- [ ] **No SQL:** every query uses the typed query builder; no `sql` or `raw` import in the module.
- [ ] **Work list:** the dispatcher reads a query over rows, never a message queue.
- [ ] **Order read:** the raise path compares the watermark with the due time plus 2 minutes in one function used by every marketplace.
- [ ] **Keys:** the idempotency key includes the epoch read from control; nothing caches the epoch across a restore.
- [ ] **Egress:** every write goes through the gate; no connector call from Stock sync directly.
- [ ] **Unknown:** the settle step runs before any other write to that target, using ADR-004's rule.
- [ ] **Later parts:** no Vendor figure, no second warehouse per account, no Amazon feed path, no display cap at launch.
