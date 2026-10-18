# ADR-004.3: Shopify connector

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026 |
| **Scope** | What Shopify forces us to decide beyond the shared connector design: installing Vervoro's app, expiring tokens, the warehouse location, webhooks, compare-and-set writes in batches, a budget in cost points, variants without a unique SKU, orders other marketplaces put into the shop, buyer data and privacy webhooks |
| **Builds on** | [ADR-004: Channel connectors](../channel-connectors/), [ADR-003: Product model](../product-model/), [ADR-001: Multi-tenant database architecture](../database-architecture/) |

## Context

ADR-004 decided the connector contract and everything the host does around it. This record covers only what is particular to Shopify.

Shopify is the seller's own shop, not a marketplace, and it shapes the design in six ways:

- **Compare-and-set.** A stock change can carry the figure we expect Shopify to show, and Shopify refuses it when the figure has moved. eBay and Amazon have nothing like it.
- **Stock lives per location.** A shop can hold stock in several places: its own warehouse, a shop counter, a fulfilment partner. Vervoro runs one warehouse.
- **A budget in cost points, not calls.** Each app and shop pair has a bucket of query cost that refills at a rate set by the shop's plan. A call's cost depends on what it asks for, not on how many items it changes.
- **Webhooks are signed and come straight to us,** with a short timeout and a few hours of retries, and are not guaranteed.
- **Tokens expire.** Shopify's offline tokens for public apps last an hour, and each refresh hands out a new pair.
- **Other marketplaces sell through the shop.** A seller may already connect eBay or Amazon to Shopify with those marketplaces' own apps, so the shop's orders can include sales Vervoro also sees directly.

## Decision

1. **The seller installs Vervoro's Shopify app** on their shop. Nobody pastes a token.
2. **Expiring offline tokens,** refreshed by the host under the account's lock, the new pair sealed in the same step.
3. **One Shopify location is Vervoro's warehouse,** picked by a person after connecting. Vervoro sets the available quantity there and nowhere else.
4. **Orders arrive by webhook** to one address for the app. Each webhook is answered by fetching the order. The backup read runs every 10 minutes, because Shopify's limits are per shop.
5. **Every stock write uses compare-and-set,** one listing at a time or up to 250 in one call, decreases included.
6. **Stock writes have their own share of the shop's cost budget,** with a reserve for the safety lane.
7. **A variant with a blank or shared SKU is named by its variant id,** so every variant can still be linked and updated.
8. **An order another marketplace's app put into the shop is marked with that marketplace,** so a sale Vervoro also gets directly is not counted twice. One whose marketplace cannot be told is imported as an ordinary sale, and the seller is warned; if it matches a direct order, it is held as a possible duplicate.
9. **Privacy webhooks are received, as Shopify requires.** A request to forget a buyer is carried out at once; the others are answered within 30 days.

## Connecting

- **Installing the app.** The seller gives their shop's address and approves on Shopify's install screen. Shopify signs its redirect back with the app's secret, and the host checks that signature as well as its own single-use state.
- **Scopes.** Orders, products, inventory and locations to read; inventory to write; the seller's own fulfilment orders to read and write; a fulfilment partner's to read only. Reading a partner's lets Vervoro see that an order is theirs to ship, not the seller's.
- **The shop is the account.** Its address is claimed in the external directory, for one company at a time. Installing again on the same shop renews that account.
- **Tokens.** The access token lasts an hour. Each refresh returns a new access token and a new refresh token, and the host seals both before using either. The expiry Shopify gives for the refresh token is kept, and the seller is warned 30 days before it, which only happens if the account has not refreshed for a long time. A refresh refused as an invalid grant means the app was uninstalled or the grant ran out, and the account is disconnected, even if the uninstall webhook never arrived.
- **The app's secret** rotates with a current and a previous value, because Shopify takes a while to switch.
- **Picking the warehouse.** After connecting, a person picks one of the shop's active locations that fulfil online orders as Vervoro's warehouse. It cannot be changed while the account is live (ADR-004), because what Vervoro sends must not change under it.

## Locations

- **Vervoro writes one location.** It sets the available quantity at the warehouse location. Stock Shopify holds at other locations is the seller's and is never touched.
- **Orders follow Shopify's assignment.** Shopify assigns each order's lines to a location. An order assigned to Vervoro's warehouse is the seller's to ship and reserves Vervoro's stock. An order assigned entirely elsewhere (a shop counter, a fulfilment partner) is recorded and reserves nothing. An order assigned to a location that no longer exists is held for a person.
- **Only orders assigned wholly to the warehouse** are counted as sales out of the figure Vervoro sent, because Shopify takes a sale's units from the location it is assigned to.

## Orders

**Webhooks first.** Shopify's webhooks are declared once in the app's own configuration, so every shop that installs the app gets them, and they all go to one address.

- **Verified before anything is read.** Each webhook is checked with the app's secret (current or previous) before any database read. The shop is named in a header that the signature does not cover, so the host uses it only to find the account. A genuine body sent again under another shop's name can at most make Vervoro fetch an order that shop does not have.
- **Topics:** order created, updated, edited and cancelled; a fulfilment order moved, placed on hold and released; a new risk assessment; inventory changed at the warehouse location; the app uninstalled; and the privacy topics (below). Moves, holds and risk assessments do not reliably raise the order-updated topic, so each has its own ([ADR-007](../order-ingestion/)).
- **The body is not imported.** An order webhook carries the buyer's details. The host keeps only the order's id and the topic, and imports the order by fetching it.
- **What changed** is read from the body: cancelled, or shipped outside Vervoro, with the time, so the host can tell our own fulfilment coming back from a change made in the shop.
- **Shopify gives five seconds** to answer, retries up to eight times over four hours, and then stops. The endpoint answers as soon as the message is on the inbound queue, so a slow database never costs a delivery.

**The backup read** searches orders updated since the watermark. Shopify's limits are per app and shop, so it runs every 10 minutes and costs no other seller anything. Early reads are never closer than 30 seconds apart. An account whose webhooks look broken is treated as ADR-004 says. Without the extra scope for older orders, only the last 60 days of orders can be read, which is longer than Vervoro keeps buyer data.

**Orders other marketplaces put into the shop.** A seller who connects eBay or Amazon to Shopify with those marketplaces' own apps gets their orders in the shop too. Each order says which app created it. When it names a marketplace's app, the order is marked as sold on that marketplace, so a marketplace connected to Vervoro directly as well reaches Vervoro one way only. An order from a multi-marketplace app that cannot be attributed is imported as an ordinary sale, never dropped, and the seller is warned when any marketplace is also connected directly: counted twice is safer than missed. When its SKUs and quantities match a direct order placed within 30 minutes, it is held as a possible duplicate for a manager; no buyer data is compared. ADR-007 decides how such orders are imported, and keeps a mirror's units off every figure until its direct order arrives.

**Lines without a SKU.** A gift card, a tip, or a line that needs no shipping is left out. A line that needs shipping but has no SKU and no variant stays on the order, unmatched, so the order cannot be dispatched until a person looks.

## Stock

**Compare-and-set on every write.** Each change carries the available figure Vervoro believes Shopify shows now. If a sale got there first, Shopify refuses the change, the connector reads the figure again and answers `compare-mismatch` with it, and the host decides again (ADR-004).

**Batches of up to 250.** One call can set up to 250 listings, each with its own expected figure. Because the check is per item, a decrease is as safe in a batch as on its own, so on Shopify both lanes may carry decreases.

- **One stale entry fails the whole call.** Shopify's documentation speaks of the call failing, not of one entry. So the connector reads the stale entries again (`compare-mismatch` each), and sends the others once more in a second call. If that call is refused too, the batch is `unknown`, and the host reads back before sending again.
- **Repeats are safe.** Each call carries an idempotency key made from the gate's key and what the call holds, so a repeat of the same call replays Shopify's answer, while a call with new figures is a new send.
- **Shopify answers at once.** A write is `applied`, `compare-mismatch` or refused, never `accepted`.

**Read back** reads the available quantity at the warehouse location for the listing's inventory item.

## The cost budget

Shopify meters each app and shop pair by query cost: a bucket that refills by the shop's plan (100 points a second on the standard plan, more on larger plans), and no single query above 1,000 points.

- **Writes are cheap and do not grow with their size.** A stock change costs the mutation's 10 points plus a point for its errors, for 1 item or 250.
- **Stock writes have a share of the bucket.** Batches go at most two calls a second (22 points a second, up to 500 listings), and every batch must leave 55 points in the bucket, enough for five single decreases, so a large batch can never leave an urgent decrease throttled. On the standard plan that leaves most of the bucket for reads.
- **Reads go by Shopify's own throttle reply.** A throttled reply says how many points the call needs and how fast they return, and the host waits exactly that long.
- **Large reads use Shopify's bulk operations,** which run inside Shopify and are downloaded when done, so reading a whole catalogue does not drain the bucket. How the catalogue is read and matched is ADR-005.

## Variants without a unique SKU

Shopify lets a variant have a blank SKU, or the same SKU as another variant. Such a variant is named by its variant id, both as a listing and on order lines, so it can be linked and updated like any other. Every other variant goes by its SKU exactly as Shopify has it. Whether a SKU is shared is checked against the shop, within a small cost cap. A SKU the check could not settle goes by its plain SKU: unique, it matches at once; shared, its line arrives unmatched until a later check names the variant.

## Buyer data and privacy

- **Protected customer data.** Names, addresses and phone numbers are protected data that Shopify releases only to approved apps. Without approval, Shopify sends the order with those fields empty, and the order still arrives without them; nothing is guessed.
- **Only what is needed to ship:** the delivery address with the recipient's name and phone, the order note, a gift message, and each line's title as a packer reads it. Vervoro anonymises buyer data 30 days after delivery, or after dispatch when no delivery date is known ([ADR-009](../buyer-data/)).
- **Privacy webhooks.** Shopify requires every App Store app to receive three: a buyer's data request, a request to forget a buyer, and a request to forget a shop. A request to forget a buyer has that buyer's orders anonymised at once. The others are recorded for a person, due within 30 days.

## Dispatch

A shipment is confirmed against the order's fulfilment orders at the warehouse location, with carrier and tracking, through the egress gate. A fulfilment partner's fulfilment orders are never written.

## The app inside Shopify

A Shopify App Store listing needs a page inside the Shopify admin. Vervoro's is one small page: whether the shop is connected, to which company, and a link into Vervoro. It holds no session and no cookie, and checks Shopify's session token on every request. Until the listing, sellers install the app from Vervoro's own link.

## Simulator and sandbox

The Shopify simulator speaks the GraphQL Admin API calls used here, with cost-point buckets and throttled replies, compare-and-set races on demand, bulk operations, the install flow, expiring tokens and signed webhooks. Development stores stand in for Shopify's sandbox. Before launch, each call is recorded against a development store and the simulator is corrected where it differs; the recordings include the shape of an unapproved protected field, the app names on orders other marketplaces put into a shop, and a stock batch with one stale entry, to learn whether Shopify refuses the whole call or only that entry. Either answer is safe, because the connector already handles the whole call failing.

## Shopify constraints

Checked against Shopify's documentation on 17 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| Cost budget | Per app and shop; 100 points a second on the standard plan, 200 on Advanced, 1,000 on Plus, 2,000 for enterprise | [GraphQL Admin API rate limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits) |
| One query | At most 1,000 points; a mutation costs 10 | [GraphQL Admin API rate limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits) |
| Array inputs | At most 250 items, on every Shopify API | [API limits](https://shopify.dev/docs/api/usage/limits) |
| Webhooks | Five seconds to answer; up to eight retries over four hours; then delivery stops | [Troubleshooting webhooks](https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks) |
| Offline tokens | Expiring for public apps: access token an hour, refresh token 90 days, a new pair on every refresh; non-expiring tokens end for existing public apps on 1 January 2027 | [Offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens) |
| Compare-and-set | A change whose expected figure no longer matches is refused | [inventorySetQuantities](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities) |
| Privacy webhooks | Three required for App Store apps; 30 days to act | [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance) |

## Consequences

**What this gives us**

- A stale figure can never overwrite a newer one on Shopify, and decreases can travel in batches.
- Raising or lowering a whole catalogue costs a handful of calls.
- Stock at the seller's other locations stays theirs.
- Sales that reach the shop from another marketplace are not reserved twice.

**What it costs**

- A person must pick the warehouse location before the account can go live.
- Rotating tokens must be sealed before use; a lost refresh would end the account's grant.
- Buyer addresses depend on Shopify approving Vervoro for protected customer data.
- Orders from an app that does not say which marketplace they came from may be counted twice until the seller sorts the duplicate connection.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Sending figures without compare-and-set | Shopify offers it; without it, a sale between our read and our write would be overwritten |
| Writing every location, or the shop's total | The seller's other locations are not Vervoro's warehouse; their stock is not Vervoro's to set |
| Per-shop webhook subscriptions made on connect | The app's own configuration gives every shop the same topics at one address, with nothing to subscribe or forget |
| Importing the webhook body as the order | It carries buyer data the host must not keep, and may be older than the order |
| Counting calls instead of cost points | One write of 250 items costs the same as one of 1 item; calls are the wrong unit |
| Raises only in batches, as on Amazon | The per-item compare makes a decrease in a batch safe, so there is no reason to hold it back |
| Skipping variants without a unique SKU | Their stock would never be updated and their orders would never match |
| Dropping orders other marketplaces put into the shop | A wrong guess would lose a sale; counting it twice is the safer mistake, and the seller is warned |
