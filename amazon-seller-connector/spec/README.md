# ADR-004.2 SPEC: Amazon Seller connector

| | |
| --- | --- |
| **Decision** | [ADR-004.2: Amazon Seller connector](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-0042-amazon-seller-connector) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

Only what is particular to Amazon. Everything the host does (credentials, HTTP, outcomes, notices in, the completeness check, shadow mode) is [ADR-004 SPEC](../../channel-connectors/spec/) and is not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed.

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| Listings feeds for many raises | Single patches fall short ([ADR-008](../../inventory-sync/spec/#0-at-launch-and-later)) | [5](#5-stock) |
| Selling to Amazon as a vendor | ADR-004.4 is written | None here |

## 1. Connecting and renewing

1. **Two ways in, one flow.** From Vervoro (the seller picks a marketplace) or from Amazon's app store. The seller is sent only to Seller Central's consent or confirm page; Amazon does not sign its redirect, so the host's single-use state proves it. The code is exchanged for a refresh token at Amazon's login service.
2. **Proof before the claim.** One read with the new token for that seller id; a seller id changed on the way is refused.
3. **Marketplaces.** The seller's marketplaces are read with the new token. The account starts on the one picked (refused with a message if they do not sell there); others of the region are a setup choice.
4. **Tokens.** Access tokens last as long as Amazon's reply says (an hour today).
5. **Renewal.** Amazon cannot be asked when an approval ends, so the host records approval plus 365 days, reminds the seller 30 days ahead, and a new approval writes a fresh date. `invalid_grant` means the seller removed the app: the account is disconnected.
6. **Client secret.** Lasts 180 days; the operator is reminded from day 150 ([runbook](../../runbooks/rotate-a-marketplace-app-secret/)).

## 2. Regions and marketplaces

1. **The region decides** the API address and the notice destination the seller is subscribed to.
2. **One figure for the account's marketplaces.** A listing update names every marketplace the account serves, and Amazon applies one quantity to all.
3. **Which marketplace a sale lowers** depends on a seller setting Vervoro cannot see. An order counts as coming out of Vervoro's figure only when the account serves exactly one marketplace ([ADR-008 SPEC 12](../../inventory-sync/spec/#12-amazon-accounts-on-several-marketplaces)).
4. **Orders from every marketplace of the region are imported.** The first order the seller ships from a marketplace the account was not set up for asks who ships that marketplace's orders ([ADR-007](../../order-ingestion/spec/#21-amazon-orders-from-the-regions-other-marketplaces)).

## 3. Notices and the bridge

| Notice | Amazon delivers to | The bridge |
| --- | --- | --- |
| Order change; Amazon-held stock change | An SQS queue only | A pipe reads the queue and posts each message |
| Listing quantity and status change | An EventBridge bus only | A rule posts each event |

1. **One bridge for every Amazon region,** in an EU AWS region, with no code: a queue, a pipe and an API destination ([ADR-000 SPEC 8](../../system-architecture/spec/#8-connectors-and-orders-in)). It keeps nothing and decides nothing.
2. **A shared secret** on every post; the endpoint accepts the current or previous one ([ADR-004 SPEC 8](../../channel-connectors/spec/#8-notices-in)). Rotated yearly, or at once if it may have leaked.
3. **The notice must be ours.** Any application can name our queue as its destination, so the endpoint also checks Vervoro's application id. Anything else is answered and dropped.
4. **Failures are visible.** A post the endpoint refuses is retried by AWS, then lands in the bridge's dead-letter queue, whose alarm pages the operator.
5. **Subscriptions on connect,** with the seller's token, to order, listing and Amazon-held stock notices at the region's destination. One already at our destination is kept; one at another destination is an error. Disconnect deletes them without the seller's token, so it works after the seller removed the app.
6. **What each leads to.** An order change fetches the order (`getOrder`); a forged or replayed notice can at most cause a fetch. A listing change reads that listing back. An Amazon-held stock change reads that stock for the SKUs it names ([7](#7-stock-amazon-holds)).

Procedure: [Set up the Amazon notice bridge](../../runbooks/set-up-the-amazon-notice-bridge/).

## 4. Orders

1. **Every 10 minutes,** on every marketplace of the region in one search (up to 50). An early read is never closer than three minutes, because the search refills that slowly.
2. **Each page carries its orders' items,** so nothing is fetched per order.
3. **Amazon stops a search two minutes before its own clock** and says where it stopped; that bound is the window's completeness.

## 5. Stock

1. **Single writes:** one listing at a time, a Listings Items patch of the merchant-fulfilled quantity across the account's marketplaces.

| Amazon answers | Outcome |
| --- | --- |
| Accepted | `accepted`; read back |
| Invalid, 400, 404 | `rejected`, with Amazon's issue codes |
| 429 | `throttled`, with Amazon's wait if given |
| 5xx, timeout, unreadable | `unknown`; read back before anything is sent again |

2. **Read back** with `getListingsItem`: the quantity sent is `applied`; an error issue on the quantity, or a listing that has gone, is `rejected`; anything else is still pending. When the reads happen is [ADR-008 SPEC 6](../../inventory-sync/spec/#6-confirming-every-write).
3. **No compare-and-set.** The order watermark is the guard ([ADR-008](../../inventory-sync/)).
4. *Later:* **listings feeds for raises only.** A feed is uploaded, then named; its report names refused messages by position, so the host keeps the order it sent them in. A feed never carries a decrease: it lands when Amazon processes it, and could undo a later single decrease.
5. **Reading every listing** uses the merchant listings report, one per marketplace ([ADR-005](../../catalogue-sync/)).

## 6. Listings Amazon ships

A SKU Amazon fulfils on any of the account's marketplaces is Amazon's and is never sent a figure: one update names every marketplace. Its orders are recorded for reports ([ADR-003](../../product-model/)).

## 7. Stock Amazon holds

1. **A reading, not stock.** Read with `getInventorySummaries`, kept by Inventory as a dated reading per product beside its four numbers ([ADR-006](../../stock-ledger/)). It moves no stock and sends no figure.
2. **What is read,** per marketplace, with details: units Amazon can ship, reserved or in transfer, unsellable, under investigation, inbound. A summary reaches the product through the listing's link; a pack's units are multiplied by its units per sale. A SKU with no link is kept on the listing until linked.
3. **When:** a full read daily, and after each `FBA_INVENTORY_AVAILABILITY_CHANGES` notice for the SKUs it names. A change read misses inbound units, so the daily read is always full.
4. **Paging:** up to 50 SKUs a filtered call; a page token lasts 30 seconds, so a read pages straight through and restarts if it stalls.
5. **Role:** Product Listing or Amazon Fulfillment, neither restricted; Product Listing is already asked for.

## 8. Buyer data

1. **The restricted role** releases names, addresses and phones only for orders the seller ships, while unshipped or shipped.
2. **Only what is needed to ship:** name, address, phone, gift message. What Amazon withholds or masks is left out, never stored blank, so it never erases an earlier value.
3. **Orders Amazon ships carry no buyer data.**
4. **Anonymised 30 days after delivery** ([ADR-009](../../buyer-data/)). Amazon's policy also asks for multi-factor sign-in on every user account ([ADR-013](../../sign-in/)).

## 9. Dispatch

A shipment is confirmed with Amazon's carrier code, or "Other" with the carrier's name. Amazon requires a tracking number, so one without it goes to a person. A confirmation whose outcome is unknown is never sent twice: a person checks the order in Seller Central.

## 10. Limits

1. **Buckets per seller and application** for most operations, from Amazon's figures, with the live limit from `x-amzn-RateLimit-Limit` when present.
2. **The slow buckets** (order search, report requests, feed creation) refill in minutes; nothing a notice or single call can do is spent from them.

## 11. Simulator and pre-launch recordings

The simulator speaks only the calls above: consent and tokens, orders, listings, reports, notifications, FBA inventory, Amazon's buckets, and an SQS-style queue the host reads directly in development. Before launch each call is recorded against the sandbox or a real account ([ADR-004 SPEC 14](../../channel-connectors/spec/#14-simulators-and-recorded-replies)), including the approval pages' paths and an Amazon-held stock notice.

## 12. Constraints

Checked against Amazon's documentation on 17 October 2026; Amazon-held stock rows on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| Rate limits | Token bucket, usually per seller and application; live limit header when present, not to be relied on; 429 retryable | [Usage plans and rate limits](https://developer-docs.amazon/sp-api/docs/usage-plans-and-rate-limits) |
| `patchListingsItem` | 5 a second per seller and application, burst 5; 500 a second per application | [Listings Items API rate limits](https://developer-docs.amazon/sp-api/docs/listings-items-api-rate-limits) |
| Order and Amazon-held stock notices | SQS only | [Notification type values](https://developer-docs.amazon/sp-api/docs/notification-type-values) |
| Listing quantity and status notices | EventBridge only | Same page |
| Missed notices | Amazon advises a way to recover from late or missing notices | [Notifications API](https://developer-docs.amazon/sp-api/docs/notifications-api-v1-use-case-guide) |
| `getInventorySummaries` | 2 a second, burst 2; one marketplace a call; 50 SKUs a filtered call; page token 30 seconds; a change read misses inbound changes | [FBA Inventory API model](https://github.com/amzn/selling-partner-api-models/blob/main/models/fba-inventory-api-model/fbaInventory.json) |
| Roles for Amazon-held stock | Product Listing or Amazon Fulfillment | [FBA Inventory API use case guide](https://developer-docs.amazon/sp-api/docs/fba-inventory-api-v1-use-case-guide) |
| Seller approval | Re-authorised every 365 days; no expiry date through the API | [Renew authorizations](https://developer-docs.amazon/sp-api/docs/renew-authorizations) |
| Client secret | Rotated every 180 days | [Rotate your application's client secret](https://developer-docs.amazon.com/sp-api/docs/rotate-your-application-client-secret) |

## 13. Tests that prove each rule

| Test | Proves |
| --- | --- |
| Not ours | A notice naming another application id is answered and dropped |
| Accepted | An accepted write is not applied until a read shows it; an issue found later is `rejected` |
| Unknown | A timed-out patch is read back before any other write to it |
| Amazon ships | No write names a SKU Amazon fulfils on any of the account's marketplaces |
| One figure | A patch names every marketplace the account serves |
| Early read | No order search runs within three minutes of the last |
| Window | The watermark moves only to the bound Amazon names |
| Masked fields | A masked field never overwrites a stored value |
| Held stock | A reading changes no ledger entry and sends no figure |
| Renewal | The reminder date is approval plus 365 days less 30 |
| Dispatch | No tracking number, or an unknown confirmation, goes to a person and is never resent |

## How to check it was built right

- [ ] **Bridge:** the endpoint checks the shared secret and the application id before any database read.
- [ ] **No AWS credentials** in any Worker; nothing reads SQS in production.
- [ ] **Accepted:** no code path marks an Amazon write applied without a read or notice.
- [ ] **Amazon ships:** the write path refuses a fulfilled-by-Amazon SKU.
- [ ] **Buyer data:** restricted fields read only under the restricted role and only for seller-shipped orders.
- [ ] **Held stock:** the reading lives beside the ledger and is never summed into it.
- [ ] **Later parts:** no feed path at launch.
