# ADR-004.3 SPEC: Shopify connector

| | |
| --- | --- |
| **Decision** | [ADR-004.3: Shopify connector](../) |
| **Procedures** | [Rotate a marketplace app secret](../../runbooks/rotate-a-marketplace-app-secret/) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

Only what is particular to Shopify. Everything the host does (credentials, HTTP, outcomes, notices in, the completeness check, shadow mode) is [ADR-004 SPEC](../../channel-connectors/spec/) and is not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed.

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| The whole Shopify connector | A seller needs Shopify (owner ruling, 21 October 2026) | All |

## 1. Connecting

1. **Installing.** The seller gives their shop's address and approves on Shopify's install screen. Shopify signs its redirect with the app's secret; the host checks that signature and its own single-use state.
2. **Scopes:** read orders, products, inventory and locations; write inventory; read and write the seller's own fulfilment orders; read a fulfilment partner's (so Vervoro sees an order is theirs to ship).
3. **The shop's address is claimed** in the external directory; installing again on the same shop renews that account.
4. **Tokens.** Each refresh returns a new access and refresh token; the host seals both before using either. Lifetimes come from Shopify's reply. `invalid_grant` means the app was uninstalled or the grant ran out: the account is disconnected, even if the uninstall webhook never arrived.
5. **The app's secret** is checked against the current and previous value, because Shopify takes a while to switch ([runbook](../../runbooks/rotate-a-marketplace-app-secret/)).
6. **Picking the warehouse:** one of the shop's active locations that fulfil online orders. It cannot change while the account is live.

## 2. Locations

1. **Vervoro writes one location:** the available quantity at the warehouse location. Other locations are never touched.
2. **Orders follow Shopify's assignment.** An order assigned to the warehouse reserves Vervoro's stock. One assigned entirely elsewhere is recorded and reserves nothing. One assigned to a location that no longer exists is held for a person.
3. **Only orders assigned wholly to the warehouse** count as sales out of the figure Vervoro sent ([ADR-008](../../inventory-sync/)).

## 3. Webhooks and orders

1. **Declared once in the app's configuration,** all to one address.
2. **Checked with the app's secret** (current or previous) before any database read. The shop is named in a header the signature does not cover, so it is used only to find the account; a genuine body replayed under another shop's name can at most cause a fetch that finds nothing.
3. **Topics:** order created, updated, edited and cancelled; fulfilment order moved, placed on hold and released; a new risk assessment; inventory changed at the warehouse location; app uninstalled; the privacy topics. Moves, holds and risk assessments do not reliably raise the order-updated topic, so each has its own ([ADR-007](../../order-ingestion/spec/#7-from-each-marketplace)).
4. **The body is not imported.** Only the order id, the topic, and what changed (cancelled, or shipped outside Vervoro, with the time) are queued; the order is fetched.
5. **Backup read** every 10 minutes, early reads at least 30 seconds apart. Without the older-orders scope only the last 60 days are readable, longer than Vervoro keeps buyer data.
6. **Lines without a SKU.** A gift card, a tip or a line that needs no shipping is left out. A line that needs shipping with no SKU and no variant stays unmatched, so the order cannot be dispatched until a person looks.

## 4. Orders other marketplaces put into the shop

1. **Each order names the app that created it.** When that is a marketplace's app, the order is marked as sold on that marketplace, so a marketplace also connected directly reaches Vervoro one way only.
2. **Unattributable:** imported as an ordinary sale, never dropped; the seller is warned when any marketplace is also connected directly.
3. **Possible duplicate:** when its SKUs and quantities match a direct order placed within 30 minutes, it is held for a manager. No buyer data is compared. ADR-007 keeps a mirror's units off every figure until its direct order arrives.

## 5. Stock

1. **Compare-and-set on every write,** with the available figure Vervoro believes Shopify shows. If a sale got there first, the connector reads the figure again and answers `compare_mismatch` with it.
2. **Batches of up to 250,** each item with its own expected figure, so decreases may travel in a batch on either lane.
3. **One stale entry may fail the whole call.** The connector reads the stale entries again (`compare_mismatch` each) and sends the others once more. If that call is refused too, the batch is `unknown` and is read back ([ADR-004 SPEC 5](../../channel-connectors/spec/#5-retries-and-outcomes)).
4. **Idempotency key** per call, made from the gate's key and what the call holds, so a repeat replays Shopify's answer and new figures are a new send.
5. **Synchronous:** `applied`, `compare_mismatch` or refused, never `accepted`.
6. **Read back** reads the available quantity at the warehouse location for the listing's inventory item.

## 6. The cost budget

1. **Stock writes cost the mutation's 10 points plus one for errors,** for 1 item or 250.
2. **Their share:** at most two batch calls a second, and every batch leaves 55 points in the bucket, enough for five single decreases ([ADR-008 SPEC 8](../../inventory-sync/spec/#8-limits-and-who-goes-next)).
3. **Reads follow Shopify's throttle reply,** which says how many points a call needs and how fast they return; the host waits exactly that long.
4. **Large reads use bulk operations,** which run inside Shopify and are downloaded when done ([ADR-005](../../catalogue-sync/)).

## 7. Variants without a unique SKU

A variant with a blank SKU, or one another variant shares, is named by its variant id as a listing and on order lines. Every other variant goes by its SKU as Shopify has it. Whether a SKU is shared is checked against the shop within a small cost cap; one the check could not settle goes by its plain SKU, and if shared its line arrives unmatched until a later check names the variant.

## 8. Buyer data and privacy

1. **Protected customer data** (names, addresses, phones) is released only to approved apps. Without approval those fields arrive empty and nothing is guessed.
2. **Only what is needed to ship:** the delivery address with the recipient's name and phone, the order note, a gift message, each line's title. Anonymised 30 days after delivery, or after dispatch when no delivery date is known ([ADR-009](../../buyer-data/)).
3. **Privacy webhooks:** a request to forget a buyer anonymises their orders at once; a buyer's data request and a request to forget a shop are recorded for a person, due within 30 days ([ADR-004 SPEC 8](../../channel-connectors/spec/#8-notices-in)).

## 9. Dispatch and the page inside Shopify

1. **Dispatch** is confirmed against the order's fulfilment orders at the warehouse location, with carrier and tracking, through the gate. A fulfilment partner's are never written.
2. **The App Store needs a page in the Shopify admin:** one small page showing whether the shop is connected, to which company, and a link into Vervoro. It holds no session or cookie and checks Shopify's session token on every request. Until the listing, sellers install from Vervoro's own link.

## 10. Simulator and pre-launch recordings

The simulator speaks only the GraphQL Admin calls above, with cost-point buckets and throttled replies, compare-and-set races on demand, bulk operations, the install flow, expiring tokens and signed webhooks. Development stores stand in for a sandbox. Before launch each call is recorded against a development store ([ADR-004 SPEC 14](../../channel-connectors/spec/#14-simulators-and-recorded-replies)), including an unapproved protected field, the app names on orders other marketplaces put into a shop, and a batch with one stale entry; either answer to the last is safe.

## 11. Constraints

Checked against Shopify's documentation on 17 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| Cost budget | Per app and shop; 100 points a second standard, 200 Advanced, 1,000 Plus, 2,000 enterprise | [GraphQL Admin API rate limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits) |
| One query | At most 1,000 points; a mutation costs 10 | Same page |
| Array inputs | At most 250 items | [API limits](https://shopify.dev/docs/api/usage/limits) |
| Webhooks | Five seconds to answer; up to eight retries over four hours | [Troubleshooting webhooks](https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks) |
| Offline tokens | Expiring for public apps: access an hour, refresh 90 days, a new pair each refresh; non-expiring tokens end for existing public apps on 1 January 2027 | [Offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens) |
| Compare-and-set | A change whose expected figure no longer matches is refused; idempotency key required from 2026-04 | [inventorySetQuantities](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities) |
| Privacy webhooks | Three required for App Store apps; 30 days to act | [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance) |

## 12. Tests that prove each rule

| Test | Proves |
| --- | --- |
| Compare | A sale between read and write ends `compare_mismatch` with Shopify's figure, never an overwrite |
| Stale batch | One stale entry: the others are resent once; a second refusal is `unknown` and read back |
| Budget | A batch never leaves fewer than 55 points |
| One location | No write names another location |
| Assignment | An order assigned elsewhere reserves nothing |
| Token pair | Both new tokens are sealed before either is used |
| Header | A body replayed under another shop's header fetches nothing that shop has |
| Mirror | An order from a marketplace's app is marked with it; a 30-minute match is held |
| Variant id | A blank or shared SKU variant is linked and written by its id |
| Forget buyer | Anonymises at once |

## How to check it was built right

- [ ] **Compare-and-set:** every inventory write carries expected figures and an idempotency key.
- [ ] **Location:** the warehouse location id comes from the account's setting; it cannot change while live.
- [ ] **Webhook body:** nothing from it but ids and the change kind reaches the queue.
- [ ] **Budget:** the 55-point floor is enforced before each batch.
- [ ] **Admin page:** no cookie, no session; the session token is checked on every request.
