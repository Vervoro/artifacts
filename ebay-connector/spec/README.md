# ADR-004.1 SPEC: eBay connector

| | |
| --- | --- |
| **Decision** | [ADR-004.1: eBay connector](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-0041-ebay-connector) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

Only what is particular to eBay. Everything the host does (credentials, HTTP, outcomes, pools, notices in, the completeness check, shadow mode) is [ADR-004 SPEC](../../channel-connectors/spec/) and is not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed.

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| eBay item-change notices for Seller Hub listings | Hand edits near zero are seen too late in shadow ([ADR-008](../../inventory-sync/spec/#0-at-launch-and-later)) | [4](#4-listings-and-stock) |
| Moving Seller Hub listings to the Inventory API | The Growth Check grants less than the reserve rule needs ([ADR-008](../../inventory-sync/spec/#0-at-launch-and-later)) | [5](#5-the-trading-pool) |

## 1. Connecting

1. **Consent.** The seller is sent only to eBay's consent page with Vervoro's scopes: inventory, fulfilment, account and identity (read only), notification subscriptions, cancellations. A scope eBay does not know refuses every seller, so the list changes only after the scope is confirmed on Vervoro's keyset.
2. **eBay does not sign its redirect;** the host's single-use state proves it ([ADR-004 SPEC 3](../../channel-connectors/spec/#3-credentials-and-approval)).
3. **Who approved.** The token reply names no user, so the connector asks eBay's Identity API with the new token. The stable user id is claimed in the external directory. Approving again from the same eBay account renews it.
4. **One account is one eBay site** (such as the UK site), which the Trading API calls name.
5. **Tokens.** The credential is the refresh token. Its lifetime and each access token's come from eBay's reply. An `invalid_grant` refusal means the seller removed Vervoro: the account is disconnected.

## 2. Notices

1. **One destination per environment,** made by the operator, because it needs the endpoint's verification token, which no hook sees. eBay also needs the application's alert address and checks the endpoint's challenge first. Procedure: [Set up eBay notices](../../runbooks/set-up-ebay-notices/).
2. **Three topics per seller,** subscribed on connect and removed on disconnect: `ORDER_CONFIRMATION`, `ORDER_CANCELLATION_ACTIVITY`, `ITEM_MARKED_SHIPPED`.
3. **Checked with eBay's public key** before any database read. The queue message holds the topic, the notice id, the seller's user id and the order ids.
4. **What each leads to.** A confirmation fetches the order. A cancellation notice fetches it again, and the fetched order's own cancellation state decides; a reminder to answer is ignored. An item marked shipped outside Vervoro fetches the order; Vervoro's own shipments return on the same topic and are not fetched again ([ADR-007](../../order-ingestion/)).

## 3. Orders

1. **Hourly backup read,** 10 minutes while notices look broken; early reads at least one minute apart. The window ends 10 seconds before now.
2. **Cost.** Hourly is 24 order calls a day for a quiet seller; every 15 minutes, the first step if a launch gate fails, is 96. Order fetches draw on the same allowance, so the operator checks its room before shortening.
3. **Read backwards.** eBay pages orders by offset. The first call reads offset 0; if more pages exist, the read goes from the last page back to offset 0. An order that leaves the window during the read can then only move another onto a page still to come, where it is read twice, and imports are idempotent. Only the final read of offset 0 proves the window complete. A window of n pages costs n + 1 calls.

## 4. Listings and stock

1. **Every linked listing a SKU is on.** A read names, per SKU, the inventory item, each Seller Hub listing by item number, and each variation by item number and its SKU. Only linked listings are written ([ADR-005](../../catalogue-sync/)); the host hands their item numbers back on every write and read back. One SKU on several linked listings shows the highest figure any of them shows, so an over-showing listing is always corrected.

| Listing kind | Call | Per call |
| --- | --- | --- |
| Inventory item | Inventory API, bulk price and quantity update | One SKU, up to 25 offers |
| Seller Hub listing | Trading API, `ReviseInventoryStatus` | Up to 4 listings or variations |

2. **One failure does not stop the rest:** a refused inventory update does not keep the figure from Seller Hub listings, nor one Trading batch from the next.
3. **Synchronous.** A write is `applied` or refused, never `accepted`. "Identical quantity" is `applied`.
4. **A refused batch** is resent one listing at a time for the listings its reply does not name as revised, to learn which one eBay refused.
5. **An unknown SKU** goes to the Inventory API first. If eBay does not know it there, the Trading API finds its Seller Hub listings, which get no figure and come back to the catalogue to be linked.
6. **A listing that has gone** (ended, relisted, SKU removed) makes the connector look the SKU up afresh. A relist eBay declares carries the link; any other is suggested. A SKU on no listing is `rejected` with eBay's reason.
7. **No compare-and-set.** The order watermark is the guard ([ADR-008](../../inventory-sync/)). eBay's 250 revisions per listing per day are counted by [ADR-008 SPEC 8](../../inventory-sync/spec/#8-limits-and-who-goes-next).
8. **Read back** uses the API that took the write. A listing eBay will not show is looked up afresh by SKU first.
9. **The unknown-write exception.** An unknown Trading API write is settled by sending the figure Vervoro wants now again, at the time [ADR-008 SPEC 6](../../inventory-sync/spec/#6-confirming-every-write) sets, because `ReviseInventoryStatus` sets the quantity and never adds to it, and a read costs the same pool call. An unknown Inventory API write is read back as usual ([ADR-004 SPEC 5](../../channel-connectors/spec/#5-retries-and-outcomes); owner ruling, 21 October 2026).
10. **A variation without a SKU** is read and its orders come in by item number and variation id, but it is neither linked nor written. The seller is told to add a SKU in Seller Hub.

## 5. The Trading pool

1. **ADR-004's pool, with its lanes and reserve** ([ADR-004 SPEC 7](../../channel-connectors/spec/#7-shared-daily-pools)). Accounts whose listings are all inventory items do not use it. At 5,000 a day, a tenth split at 50 calls each serves 10 accounts with Seller Hub listings; more wait in shadow until the Growth Check raises it.
2. **Seller Hub listings are read only when a linked SKU needs them.** A Seller Hub listing that shares a SKU otherwise served by the Inventory API is found only when that SKU needs the Trading API.
3. **A daily page cap per account:** 50 pages of 200 listings. A read that runs out resumes the next day from where it stopped; nothing is taken as gone from a read that did not run first page to last.
4. **Full catalogue reads prefer the Feed API's daily active listings report** (outside the Trading pool), and use the Trading API only for listings new since that report, and only while that costs fewer calls than page reads ([ADR-005](../../catalogue-sync/)).
5. **When eBay says the day is spent,** the pool is `throttled` for 15 minutes at a time and the operator is alerted. If the Trading API cannot be read at all, inventory items are still read and written, and each Seller Hub SKU says why it waits.

## 6. The out-of-stock option

1. **Asked, never changed.** When a read finds Seller Hub listings, the connector reads the seller's selling preferences. While the option is off (eBay's default), every SKU on a Seller Hub listing is left out with a note: turn it on, or eBay ends a listing at 0 and removes a variation.
2. **It blocks going live:** a linked listing that cannot be read blocks the shadow check.
3. **Turned off later,** sends still go, zero included: selling stock that is gone is worse than an ended listing. The next read shows the note again.

## 7. Cancellations and dispatch

1. **Vervoro sends no cancellation and no answer to a buyer's request** ([ADR-007 decision 9](../../order-ingestion/#decision)). No Post-Order call is made. The cancellations scope is still asked for, because the cancellation notice needs it. ADR-007 fetches the order again when eBay's 3-day answer window closes.
2. **Dispatch:** one Fulfillment API call per shipment, with carrier and tracking, through the gate.

## 8. Account deletion notices

1. eBay requires every application to receive account deletion notices for all eBay users. The endpoint answers eBay's challenge with the verification token and checks each notice's signature.
2. **A connected seller:** a privacy request with its due date ([ADR-004 SPEC 8](../../channel-connectors/spec/#8-notices-in)).
3. **Anyone else:** a keyed hash of the user id is looked up in each cell; a buyer found there has their orders anonymised at once ([ADR-009](../../buyer-data/)). Nothing from the notice is kept.

## 9. Simulator and pre-launch recordings

The simulator speaks only the calls above: Inventory, Fulfillment, Feed, Notification and Identity APIs, the Trading calls used here, the consent page and token exchange, signed notices, daily usage limits and the out-of-stock preference. Before launch each call is recorded against the sandbox or a real account ([ADR-004 SPEC 14](../../channel-connectors/spec/#14-simulators-and-recorded-replies)). The recordings include that the order list keeps a stable order for one filter across calls, which the backwards read relies on. `getTopics` is read on the production keyset: the three topics must be available to Vervoro with the scopes it asks for; any restricted one is requested from eBay before a seller connects.

## 10. Constraints

Checked against eBay's documentation on 17 October 2026; the order topics row on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| Trading API, per application | 5,000 calls a day by default | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Fulfillment API order resource | 100,000 calls a day | Same page |
| Inventory API | 2 million calls a day | Same page |
| Notification API | 10,000 calls a day | Same page |
| Feed API | 100,000 calls a day; 400 a day per seller for each feed type | Same page |
| Raising the limits | After eBay's Application Growth Check | Same page |
| Bulk price and quantity update | One SKU, up to 25 offers; up to 250 revisions per listing per calendar day | [bulkUpdatePriceQuantity](https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/bulkUpdatePriceQuantity) |
| Trading inventory status revision | Up to 4 listings or variations; a variation is named by its SKU | [ReviseInventoryStatus](https://developer.ebay.com/devzone/xml/docs/Reference/eBay/ReviseInventoryStatus.html) |
| Notices | Destinations, per-topic subscriptions, public keys to check signatures | [Notification API](https://developer.ebay.com/develop/api/sell/notification_api) |
| Order topics | The three above; some topics restricted to approved partners; `getTopics` gives each topic's scopes | [Notification topics](https://developer.ebay.com/develop/api/buy/notification_events) |

## 11. Tests that prove each rule

| Test | Proves |
| --- | --- |
| Backwards read | An order that changes mid-read is still read; only offset 0's final read completes the window |
| Every linked listing | One failed write leaves the other listings of the SKU written |
| Unlinked | A listing carrying a linked SKU but not linked gets no figure |
| Identical quantity | eBay's "identical" reply is `applied` |
| Batch refusal | Unnamed listings are resent singly |
| Trading unknown | A timed-out Trading write is resent with the current figure, never read first; an Inventory API timeout is read back |
| Option off | No Seller Hub write while the option is off; the account cannot go live |
| No SKU | A variation without a SKU is never written; its order imports |
| Page cap | A read stops at 50 pages and resumes; nothing is marked gone |
| Pool spent | eBay's "day spent" throttles the pool 15 minutes and alerts |
| Deletion notice | A buyer match anonymises; nothing is stored from the notice |
| Settings | No call changes a seller preference |

## How to check it was built right

- [ ] **Two APIs:** the write path chooses by what the read learned; inventory items never go through the Trading API.
- [ ] **Pool:** every Trading call names the shared pool; the page cap is a setting.
- [ ] **Backwards:** the order read pages from last to first; the completion mark is set only after offset 0.
- [ ] **Exception:** the resend path exists only for `ReviseInventoryStatus`.
- [ ] **No settings writes:** no `SetUserPreferences` call anywhere.
- [ ] **Notices:** signature checked with eBay's key before any database read; the queue message has no user name or buyer field.
- [ ] **No cancellation sent:** no Post-Order call in the connector.
- [ ] **Later parts:** no item-change notice subscription, no listing migration.
