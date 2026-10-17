# ADR-004.2: Amazon Seller connector

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026 |
| **Scope** | What Amazon's Selling Partner API forces us to decide beyond the shared connector design: how a seller connects and renews, regions and marketplaces, the notice relay, single writes and listings feeds, listings Amazon ships, buyer data, and limits |
| **Builds on** | [ADR-004: Channel connectors](../channel-connectors/), [ADR-003: Product model](../product-model/), [ADR-001: Multi-tenant database architecture](../database-architecture/) |

## Context

ADR-004 decided the connector contract and everything the host does around it. This record covers only what is particular to Amazon, for a seller who ships their own orders (merchant-fulfilled) and may also use Amazon's own fulfilment (FBA). Selling to Amazon as a vendor is a different shape and is not covered here.

Amazon shapes the design in six ways:

- **Notices land only in Amazon's cloud.** Order changes are delivered only to an SQS queue, listing changes only to an EventBridge event bus. Amazon calls no HTTPS address of ours.
- **One seller, many marketplaces.** A seller id covers a region (Europe, North America, the Far East), and one listing can sell in several marketplaces of that region.
- **Writes are processed later.** A listing update is accepted and applied a little afterwards, and can still fail after it was accepted.
- **Limits are per seller and application,** as token buckets, some very slow (the order search refills about once every three minutes), with per-application ceilings above them.
- **Approvals expire.** A public application must be re-authorised by each seller every 365 days, and Amazon gives no expiry date through the API.
- **Buyer data is restricted.** Addresses need a restricted role, and Amazon's data protection policy limits how long they are kept.

## Decision

1. **The seller approves Vervoro in Seller Central,** from Vervoro's own page or from Amazon's app store. Nobody pastes keys.
2. **One account is one seller id in one region,** serving the marketplaces the seller picks there.
3. **Notices come through a small relay in AWS** that posts each one to Vervoro's single endpoint, signed with a relay secret. The endpoint checks that the notice names Vervoro's application.
4. **Each order notice is answered by fetching the order.** The backup read runs every 10 minutes by default and never closer than three minutes apart.
5. **Decreases go one listing at a time;** raises may go many at once in a listings feed. A feed never carries a decrease.
6. **Every write is `accepted` and read back** before Vervoro counts it as applied.
7. **A listing Amazon ships on any of the account's marketplaces is never sent a figure.**
8. **Buyer data is read only under the restricted role,** only for orders the seller ships, and anonymised 30 days after delivery.

## Connecting and renewing

- **Two ways in, one flow.** A seller starts from Vervoro (picking their marketplace) or from Amazon's app store. Either way, the host sends the seller only to Seller Central's own consent or confirm page, checks the single-use state on the way back (Amazon does not sign its redirect), and exchanges the code for a refresh token at Amazon's login service.
- **Proof before the claim.** Before the seller id is claimed in the external directory, the host makes one read with the new token for that seller id. A seller id changed on the way is refused.
- **Marketplaces.** The seller's marketplaces are read with the new token. The account starts on the one the seller picked (refused, with a message, if they do not sell there), and the seller may add others of the same region afterwards as a setup choice.
- **Access tokens** last an hour and are refreshed by the host under the account's lock.
- **Renewal every 365 days.** Amazon cannot be asked when an approval ends, so the host records the moment of approval plus 365 days and reminds the seller 30 days ahead. Approving again writes a fresh date. A refresh refused as an invalid grant means the seller removed the app, and the account is disconnected.
- **The app's client secret** lasts 180 days. The host reminds the operator from day 150. Rotation is an operator step, not a seller one.

## Regions and marketplaces

- **One account, one region.** The region decides the API address and which notice destination the seller is subscribed to.
- **One figure across the account's marketplaces.** A listing update names every marketplace the account serves, and Amazon applies one quantity to all of them.
- **Whether a sale on one marketplace lowers the others** depends on a seller setting Vervoro cannot see (Amazon's international listings tool). So an order counts as coming out of Vervoro's figure only when the account serves exactly one marketplace; with several, Vervoro assumes the cautious case. ADR-008 decides how that shapes the figure.
- **An order from a marketplace the account does not serve** is not imported: Amazon's notices cover the whole region, and the backup read would never update such an order.

## Notices and the relay

**The relay.** One AWS stack, in one AWS region next to the databases, serves sellers in every Amazon region: each regional destination points at the same queue and event bus.

| Notice | Amazon delivers to | The relay |
| --- | --- | --- |
| Order change | An SQS queue only | A pipe reads the queue and posts each message to Vervoro's endpoint |
| Listing quantity and status changes | An EventBridge event bus only | A rule posts each event to the same endpoint |

- **Signed with a relay secret.** The relay sends a shared secret on every call; the endpoint accepts the current or the previous one, compared in constant time, so the secret rotates without a gap. It is rotated yearly, or at once if it may have leaked.
- **The notice must be ours.** Any Selling Partner application can name our queue as its destination, so the endpoint also checks that the notice names Vervoro's application id. Anything else is answered and dropped.
- **Failures are visible.** A post the endpoint refuses is retried by AWS and then lands in a dead-letter queue whose alarm alerts the operator, as the inbound queue's does on Vervoro's side.
- **Subscriptions on connect.** The connect hook subscribes the seller, with their own token, to the order and listing notices at their region's destinations. A subscription that already exists at our destination is kept; one at another destination is an error. The disconnect hook deletes them without the seller's token, so it works after the seller removed the app.
- **Without the relay,** orders still arrive through the backup read, only without the instant stock hold.

**What a notice leads to.**

- **An order change** names the order and what changed: a new order, a cancellation, a buyer's cancellation request, or an order shipped outside Vervoro. The order is fetched (`getOrder`) and imported. A forged or replayed notice can at most make Vervoro fetch an order; it cannot change stock by itself.
- **A listing change** makes the host read that listing back, which catches a figure changed in Seller Central.

**The backup read** searches orders changed since the watermark, every 10 minutes by default. The order search refills only about once every three minutes, so an early check is never closer than that. Each page carries its orders' items, so nothing is fetched per order. Amazon stops a search two minutes before its own clock and says where it stopped; that bound is the window's completeness. How orders are imported is ADR-007.

## Stock

**Single writes.** One listing at a time through the Listings Items API: a patch of the merchant-fulfilled quantity across the account's marketplaces.

| Amazon answers | Outcome |
| --- | --- |
| Accepted | `accepted`; the listing is read back |
| Invalid, 400, 404 | `rejected`, with Amazon's issue codes |
| 429 | `throttled`, with Amazon's wait if it gives one |
| 5xx, timeout, unreadable | `unknown`; read back before anything is sent again |

**Read back.** The listing is read (`getListingsItem`). The quantity sent is `applied`; an error issue on the quantity, or a listing that has gone, is `failed`; anything else is still pending. An accepted change can fail minutes later, and its issues appear on that read.

**Listings feeds, for raises only.** Many raises can go as one listings feed: a document uploaded to Amazon, then a feed that names it. The feed is `accepted` at once and read back when Amazon has processed it; its report names only the messages Amazon refused, by their position, so the host keeps the order it submitted them in.

- **A feed never carries a decrease.** A feed is applied when Amazon processes it, not when it is made. A decrease in a feed could land after a later single decrease and put back a figure that is too high. Decreases always go one by one, on the safety lane.
- **No compare-and-set** either way. The order watermark is the guard against selling the same unit twice (ADR-007, ADR-008).

**Listings Amazon ships.** A SKU that Amazon fulfils on any of the account's marketplaces is read as Amazon's and never sent a figure: one update names every marketplace, and would put a merchant figure on Amazon's own listing. Its orders are recorded for reports (ADR-003).

**Reading every listing** uses Amazon's merchant listings report, one per marketplace. How the catalogue is read and matched is ADR-005.

## Buyer data

- **The restricted role.** Names, addresses and phone numbers of buyers are visible only under Amazon's direct-to-consumer shipping role, for orders the seller ships, while they are unshipped or shipped.
- **Only what is needed to ship.** Name, address, phone and gift message ride on the order. What Amazon withholds or masks is left out, never stored as blank, so it never erases what an earlier read kept.
- **Orders Amazon ships carry no buyer data.**
- **Thirty days after delivery** the foundation anonymises the order's buyer data, as Amazon's data protection policy asks. The policy also asks for multi-factor sign-in on every user account.

## Dispatch

A shipment is confirmed with Amazon's carrier code where the carrier is on Amazon's list, or as "Other" with the carrier's name. Amazon requires a tracking number, so a shipment without one is not sent and goes to a person. A confirmation whose outcome is unknown is never sent twice: it goes to a person, who checks the order in Seller Central.

## Limits

- **A token bucket per seller and application** for most operations, declared from Amazon's published figures, with the live figure from Amazon's header when it is present.
- **Per-application ceilings** sit above them (for example 500 listing updates a second for the whole application). They are not counted centrally: each seller's bucket keeps Vervoro far below them, and an application-wide throttle is waited on and alerts the operator (ADR-004).
- **The slow ones** set the rhythm: the order search, report requests and feed creation each refill in minutes, not seconds. Their buckets are never spent on anything a notice or a single call can do.

## Simulator and sandbox

The Amazon simulator speaks the consent and token flow, the order, listing, report, feed and notification APIs used here, its token buckets, and an SQS-style queue the host reads directly in development. Before launch, each call is recorded against Amazon's sandbox or a real seller account and the simulator is corrected where it differs. The recordings include the listings feed's message and report shape and the approval pages' paths.

## Amazon constraints

Checked against Amazon's documentation on 17 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| Rate limits | Token bucket, usually per seller and application; live limit in `x-amzn-RateLimit-Limit` when present, not to be relied on; 429 is retryable | [Usage plans and rate limits](https://developer-docs.amazon/sp-api/docs/usage-plans-and-rate-limits) |
| Listing update (`patchListingsItem`) | 5 a second per seller and application, burst 5; 500 a second per application | [Listings Items API rate limits](https://developer-docs.amazon/sp-api/docs/listings-items-api-rate-limits) |
| Order change notices | SQS only | [Notification type values](https://developer-docs.amazon/sp-api/docs/notification-type-values) |
| Listing quantity and status notices | EventBridge only | [Notification type values](https://developer-docs.amazon/sp-api/docs/notification-type-values) |
| Missed notices | Amazon advises a way to recover from late or missing notices | [Notifications API](https://developer-docs.amazon/sp-api/docs/notifications-api-v1-use-case-guide) |
| Seller approval | A public application is re-authorised every 365 days; no expiry date through the API | [Renew authorizations](https://developer-docs.amazon/sp-api/docs/renew-authorizations) |
| Client secret | Rotated every 180 days | [Rotate your application's client secret](https://developer-docs.amazon.com/sp-api/docs/rotate-your-application-client-secret) |

## Consequences

**What this gives us**

- Amazon's notices reach the same endpoint, queue and consumer as every other marketplace's.
- A slow order search is spent only as a backup, and decreases never wait behind a feed.
- A listing Amazon ships can never be given a merchant figure.
- Buyer data is held only as long as Amazon allows, and only for orders the seller ships.

**What it costs**

- An AWS stack to deploy, watch and keep a secret for, in a second cloud.
- Every write is two steps, the write and its read back, and feeds take minutes to land.
- With several marketplaces on one account, Vervoro must assume the cautious case for which marketplace a sale came out of.
- Sellers must re-approve Vervoro every year, and the operator must rotate the client secret twice a year.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Reading the SQS queue from Vervoro directly | A Worker would hold AWS credentials and poll a queue; a relay that posts to the endpoint keeps one inbound path |
| Polling orders as the main path | The order search refills about once every three minutes; notices are the only way to see orders as they happen |
| Feeds for every write | A feed lands late, so a decrease in it can put back a figure that is too high |
| Single writes only | Raising thousands of listings one call at a time takes too long at five a second |
| Treating `accepted` as applied | An accepted change can still fail minutes later |
| One account per marketplace | Amazon applies one quantity across the marketplaces a listing names, so separate accounts would fight over one figure |
| Pushing to a SKU that Amazon fulfils on one marketplace and the seller on another | One update names every marketplace and would put a merchant figure on Amazon's listing |
| Keeping buyer data with the order indefinitely | Amazon's data protection policy limits it to 30 days after delivery |
