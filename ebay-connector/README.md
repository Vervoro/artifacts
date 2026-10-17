# ADR-004.1: eBay connector

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026 |
| **Scope** | What eBay forces us to decide beyond the shared connector design: how a seller connects, how orders arrive, which API carries each listing's stock, the shared Trading API pool, the seller's out-of-stock option, and privacy notices |
| **Builds on** | [ADR-004: Channel connectors](../channel-connectors/), [ADR-003: Product model](../product-model/), [ADR-001: Multi-tenant database architecture](../database-architecture/) |

## Context

ADR-004 decided the connector contract and everything the host does around it. This record covers only what is particular to eBay.

eBay shapes the design in five ways:

- **Two kinds of listing.** Listings made through eBay's Inventory API are inventory items, named by SKU. Listings made in eBay's own seller tools (Seller Hub, and most listing tools) are not; they live in the older Trading API and are named by item number. A seller usually has both, and one SKU can sit on several listings of either kind.
- **Daily limits per application.** eBay's limits are calls per day for Vervoro's application as a whole, shared by every seller. The Trading API allows 5,000 a day by default, the order resource 100,000, the Inventory API 2 million.
- **No compare-and-set.** eBay sets the quantity it is given, whatever it showed before.
- **A listing that reaches zero can end.** Unless the seller has turned on eBay's out-of-stock option, a Seller Hub listing whose quantity reaches 0 ends, and a variation set to 0 is removed.
- **Notices exist for orders,** through eBay's Notification API, but delivery is not guaranteed.

## Decision

1. **One Vervoro application, approved by each seller** on eBay's own consent page. Nobody pastes keys.
2. **Orders arrive by eBay's Notification API:** one signed destination for the whole application, and a subscription per seller to order confirmations and cancellation activity. Each notice is answered by fetching the order.
3. **The backup read runs hourly,** because eBay's order allowance is shared by every seller; an account whose notices look broken is read every 10 minutes. The read goes from the last page of its window back to the first.
4. **Every linked listing gets the figure:** inventory items through the Inventory API, Seller Hub listings through the Trading API by item number. A listing nobody linked gets none: finding every listing a SKU is on only finds listings for [ADR-005](../catalogue-sync/) to suggest.
5. **The Trading API is spent only where nothing else will do,** from the shared pool of ADR-004, with a daily page cap per account.
6. **Vervoro never changes a seller's eBay settings.** A Seller Hub listing is not updated while the seller's out-of-stock option is off, and the account cannot go live until the seller turns it on.
7. **A variation with no SKU cannot be updated.** Its orders still come in, and the seller is told to add a SKU.
8. **eBay's account deletion notices are received** for every eBay user, as eBay requires. A connected seller's is a privacy request. A buyer's is matched against a keyed hash stored with that buyer's orders, and a match anonymises them ([ADR-009](../buyer-data/)). The notice itself is never kept.

## Connecting

- **One application, one consent.** The seller is sent to eBay's consent page (only eBay's own address is allowed) with the scopes Vervoro needs: inventory, fulfilment, account (read only), identity (read only), notification subscriptions and cancellations. A scope eBay does not know refuses every seller's approval, so the list changes only after the scope is confirmed on Vervoro's keyset.
- **The redirect is not signed by eBay.** The host's signed, single-use state is what proves the redirect belongs to the approval it started.
- **Who approved.** The token reply names no user, so the host asks eBay's Identity API with the new token. The seller's stable user id is claimed in the external directory, for one company at a time. Approving again from the same eBay account renews that account's token; it never makes a second account.
- **One account is one eBay site.** The site the seller registered on (such as the UK site) is kept as the account's site, and decides which site the Trading API calls name.
- **Tokens.** The credential is the seller's refresh token. eBay's token reply says how long it and each access token last, so the host keeps the date eBay gives rather than a figure of its own, refreshes access tokens before they lapse, and warns the seller 30 days before the refresh token ends. A refresh that eBay refuses as an invalid grant means the seller removed Vervoro, and the account is disconnected.

## Orders

**Notices first.** eBay's Notification API posts signed JSON to one destination for Vervoro's application.

- **The destination is made once per environment** by the operator, because making it needs the endpoint's verification token, a secret no hook sees. eBay also wants an alert address for the application before it accepts a destination, and checks the endpoint's challenge before it keeps it.
- **Each seller is subscribed on connect** to two topics: order confirmation (the buyer finished checkout and payment cleared) and order cancellation activity (a cancellation requested, declined or completed). The disconnect hook removes both subscriptions. A subscription that fails is retried and alerts, and the account shows as "not notified" until it works.
- **A notice is verified with eBay's public key** before any database read, and handed on only for a seller someone holds, as a minimal message: the topic, the notice id, the seller's user id and the order ids. No user name and no buyer details.
- **The order is fetched at once** (one call on the order resource) and imported. A cancellation notice makes the host fetch the order again; the fetched order's own cancellation state decides, so a declined request needs nothing of its own. A reminder to answer a cancellation is ignored.

**The backup read.** It reads orders changed in a window, hourly by default (24 order calls a day for a quiet seller, against the application's 100,000; at 1,000 sellers, 24,000). A read every 10 minutes would be 144 a seller, more than the whole allowance at 1,000 sellers. An account whose notices look broken is read every 10 minutes, and any complete read, including one a raise asks for, resets the timer (ADR-004). Early reads are never closer than one minute apart. The window ends 10 seconds before now, so an order eBay is still writing is read next time.

**A window is read backwards.** eBay pages orders by offset. An order that changes while its window is being paged leaves the window, and every order after it moves up one place. Read forwards, an order at the edge of the next page would slip onto a page already read, and no later window would read it, because its change date did not move. So the first call reads offset 0; if more pages exist, the read goes from the last page back to offset 0. A departure can then only move an order onto a page still to come, where it is read twice, and imports are idempotent. Only the final read of offset 0 proves the window complete. A window of n pages costs n + 1 calls; a window of one page costs one.

**Items marked shipped on eBay** (outside Vervoro) come in through the backup read, not by notice: no further scope is asked of the seller for them. Holding stock a little longer is the safe side.

How an imported order is mapped to statuses and reservations is ADR-007.

## Listings and stock

**Every linked listing a SKU is on.** A read names, for each SKU, every listing it is on: the inventory item, each Seller Hub listing by item number, and each variation by item number and its own SKU. Only the listings a person linked (ADR-005) are written to; the host hands their item numbers back on every write and read back. Another listing that carries a linked SKU but is not linked itself gets no figure: it is suggested for linking and treated as shared stock (ADR-005). One SKU on several linked listings shows the highest figure any of them shows, so a listing showing more than Vervoro's figure is always corrected, and the seller sees a note that each linked listing gets the same figure.

**Writes.**

| Listing kind | Call | Per call |
| --- | --- | --- |
| Inventory item | Inventory API, bulk price and quantity update | One SKU, up to 25 of its offers |
| Seller Hub listing | Trading API, inventory status revision | Up to 4 listings or variations |

- **Every linked listing gets the figure even when another fails.** A refused inventory update does not keep the figure from the Seller Hub listings, nor one Trading batch from the next.
- **eBay is synchronous.** A write is `applied` or refused at once, never `accepted`.
- **"Identical quantity" is applied.** eBay refuses to revise a listing to the figure it already shows; that is the listing being right.
- **When eBay refuses a batch,** the listings its reply does not name as revised are sent again one by one, to learn which one it refused.
- **A SKU no read has met** goes to the Inventory API first, for a linked inventory item. If eBay does not know it there, the Trading API finds its Seller Hub listings by SKU. They get no figure: they come back to the catalogue as new listings, to be suggested and linked (ADR-005).
- **A listing that has gone** (ended, relisted under a new number, SKU removed) makes the connector look the SKU up afresh. The listings that now carry it come back to the catalogue; a relist eBay declares carries the link, and any other is suggested (ADR-005). Only a linked listing is sent the figure. A SKU on no listing any more is `rejected`, with eBay's reason.
- **No compare-and-set.** The order watermark is the guard against selling the same unit twice (ADR-007, ADR-008).
- **250 revisions a day per listing.** eBay caps how often one listing can be revised in a calendar day. Inventory sync keeps room for decreases under that cap (ADR-008).

**Read back** uses the API that took the write: the inventory item by SKU, each Seller Hub listing by item number. A listing eBay will not show is looked up afresh by SKU before anything is concluded.

**Variations without a SKU.** eBay names a variation in the Trading API only by its own SKU. A variation without one is read and its orders still come in, keyed by item number and variation id, but it can be neither linked for stock nor updated. The seller is told to add a SKU in Seller Hub, after which it links like any other.

## The Trading API pool

The Trading API's 5,000 calls a day belong to Vervoro's application, so they are an ADR-004 shared pool with a safety lane and a bulk lane, and a reserve per account. At the default size, a tenth of the pool split at 50 calls each serves 10 accounts with Seller Hub listings; more need the limit raised through eBay's Application Growth Check, after which the operator sets the new size. Until then, a new account with Seller Hub listings waits in shadow. Accounts whose listings are all inventory items do not use this pool. Three rules keep the spend low:

- **Seller Hub listings are read only when a linked SKU needs them.** A seller whose linked SKUs are all inventory items spends none of the pool on reads. The trade-off: a Seller Hub listing that shares such a SKU is not found until the SKU needs the Trading API for another reason.
- **A daily page cap per account** (50 pages of 200 listings) bounds what one seller's reads can take. A read that runs out resumes the next day from the page it reached, and nothing is taken as gone from a read that did not run from the first page to the last.
- **The catalogue's full read prefers eBay's daily report** of active listings (from the Feed API, outside the Trading pool), and uses the Trading API only for listings new since the previous report, and only while that costs fewer calls than reading the seller's listings page by page. How the catalogue is read and matched is ADR-005.

When eBay answers that the application has used its day's calls, the pool is `throttled` for 15 minutes at a time and the operator is alerted. If the Trading API cannot be read at all, inventory items are still read and written, and each Seller Hub SKU says why it waits.

## The out-of-stock option

- **Asked, never changed.** When a read finds Seller Hub listings, the connector asks the seller's selling preferences. While the out-of-stock option is off (eBay's default), every SKU on a Seller Hub listing is left out of the read with a plain note: turn on eBay's out-of-stock option, or eBay ends a listing whose quantity reaches 0 and removes a variation.
- **It blocks going live.** A linked listing that cannot be read blocks activation (ADR-004), so the account stays in shadow until the seller turns the option on.
- **Turned off later,** sends still go, zero included: selling stock that is gone is worse than an ended listing. The next read shows the note again.

Changing the preference for the seller was rejected: it changes how all of their listings behave, including those Vervoro does not manage.

## Dispatch

A shipment is confirmed on the order with its carrier and tracking number, through the fulfilment API, one call per shipment, through the egress gate.

## Account deletion notices

eBay requires every application to receive marketplace account deletion notices for all eBay users. The endpoint answers eBay's challenge with the verification token, verifies each notice's signature, and:

- for a seller connected to Vervoro, records a privacy request with its due date (ADR-004);
- for anyone else, looks up a keyed hash of the user id in each cell; a buyer found there has their orders anonymised at once ([ADR-009](../buyer-data/)). Nothing from the notice is kept.

## Simulator and sandbox

The eBay simulator speaks the Inventory, Fulfillment, Feed, Notification and Identity APIs and the Trading API's XML calls used here, including the consent page, token exchange, signed notices, daily usage limits and the out-of-stock preference. Before launch, each call is recorded against eBay's sandbox or a real account and the simulator is corrected where it differs. The recordings include a check that the order list keeps a stable order for one filter across calls, which the backwards read relies on.

## eBay constraints

Checked against eBay's documentation on 17 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| Trading API, per application | 5,000 calls a day by default | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Fulfillment API order resource, per application | 100,000 calls a day | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Inventory API, per application | 2 million calls a day | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Notification API, per application | 10,000 calls a day | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Feed API, per application | 100,000 calls a day; 400 a day per seller for each feed type | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Raising the limits | After eBay's Application Growth Check | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits) |
| Bulk price and quantity update | One SKU, up to 25 offers; up to 250 revisions per listing per calendar day | [bulkUpdatePriceQuantity](https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/bulkUpdatePriceQuantity) |
| Trading API inventory status revision | Up to 4 listings or variations per call; a variation is named by its SKU | [ReviseInventoryStatus](https://developer.ebay.com/devzone/xml/docs/Reference/eBay/ReviseInventoryStatus.html) |
| Notices | Destinations, per-topic subscriptions, public keys to verify signatures | [Notification API](https://developer.ebay.com/develop/api/sell/notification_api) |

## Consequences

**What this gives us**

- Orders arrive as they happen, and the backup read spends a small share of the order allowance.
- Every listing a seller has gets Vervoro's figure, whichever tool made it.
- The Trading pool goes where it protects sellers, and one large catalogue cannot use it up.
- No seller loses a listing because Vervoro sent a zero to a listing that would end.

**What it costs**

- Two APIs for one job, with two ways to name a listing, and links the host must keep current.
- Sellers with Seller Hub listings must turn on the out-of-stock option before going live.
- Variations without a SKU stay outside stock sync until the seller adds one.
- The destination and alert address are an operator step per environment.
- At eBay's default limit only 10 accounts with Seller Hub listings can go live; more depend on eBay's Growth Check.

## Alternatives considered

| Option | Why not |
| --- | --- |
| The Trading API for every listing | Spends the 5,000-a-day pool on listings the Inventory API serves at no shared cost |
| The Inventory API only, after migrating the seller's listings | Migration changes the seller's own listings; Vervoro does not change what it does not own |
| eBay's Platform Notifications in the Trading API | The Notification API covers the order topics with signed JSON and per-topic subscriptions |
| Polling orders as the main path | Spends the shared order allowance and brings orders late |
| Reading an order window forwards | An order that changes during the read can slip past every window |
| Turning on the out-of-stock option for the seller | Changes the behaviour of all their listings, including those Vervoro does not manage |
| Sending zero while the option is off | eBay would end the listing or drop the variation, losing its history |
| Reading each Seller Hub listing one by one | One call per listing per read; the daily report and page reads cost far less |
