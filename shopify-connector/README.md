# ADR-004.3: Shopify connector

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026; split into ADR and SPEC, and moved to *Later* (owner ruling), 21 October 2026 |
| **Scope** | What Shopify adds to [ADR-004](../channel-connectors/) |
| **Builds on** | [ADR-004](../channel-connectors/), [ADR-003](../product-model/), [ADR-007](../order-ingestion/), [ADR-008](../inventory-sync/), [ADR-009](../buyer-data/) |
| **SPEC** | [The Shopify rules, limits and checks](spec/) |
| **RUNBOOK** | Rotating the app secret: [Rotate a marketplace app secret](../runbooks/rotate-a-marketplace-app-secret/) |

## Context

- **Shopify offers compare-and-set:** a stock change carries the figure expected, and Shopify refuses it if a sale got there first.
- **Stock lives per location,** and a shop may hold stock in places that are not Vervoro's warehouse.
- **Limits are cost points per app and shop,** not calls; a write of 250 items costs what a write of one does.
- **Tokens expire after an hour,** and each refresh hands out a new pair.
- **Other marketplaces sell through the shop:** a seller may connect eBay or Amazon to Shopify too, so a sale can reach Vervoro twice.

## Decision

*Later: the whole connector is built when a seller needs Shopify* (owner ruling, 21 October 2026). Its rules are kept here and in the SPEC so it fits the contract unchanged.

1. **The seller installs Vervoro's Shopify app** on their shop; the shop is the account. Nobody pastes a token.
2. **Expiring offline tokens,** refreshed by the host under the account's lock, with the new pair sealed before either is used.
3. **One Shopify location is Vervoro's warehouse,** picked by a person after connecting and fixed while the account is live. Vervoro sets the available quantity there and nowhere else.
4. **Orders arrive by webhook** to one address for the app, declared in the app's configuration. Each webhook is answered by fetching the order. The backup read runs every 10 minutes, because Shopify's limits are per shop.
5. **Every stock write uses compare-and-set,** one listing at a time or up to 250 in one call, decreases included.
6. **Stock writes have their own share of the shop's cost budget,** always leaving room for urgent decreases.
7. **A variant with a blank or shared SKU is named by its variant id,** so it can still be linked and updated.
8. **An order another marketplace's app put into the shop is marked with that marketplace,** so a sale Vervoro also gets directly is not counted twice. One that cannot be attributed is imported as an ordinary sale and the seller is warned; one matching a direct order is held as a possible duplicate.
9. **Privacy webhooks are received, as Shopify requires.** A request to forget a buyer is carried out at once; the others are answered within 30 days.

## Consequences

**Gives**

- A stale figure never overwrites a newer one, and decreases can travel in batches.
- Raising or lowering a whole catalogue costs a handful of calls.
- Stock at the seller's other locations stays theirs.
- Sales that reach the shop from another marketplace are not reserved twice.

**Costs**

- A person must pick the warehouse location before the account can go live.
- Rotating tokens must be sealed before use; a lost refresh ends the grant.
- Buyer addresses depend on Shopify approving Vervoro for protected customer data.
- Orders from an app that does not say which marketplace they came from may be counted twice until the seller sorts it.

## Alternatives rejected

- **Writing without compare-and-set:** a sale between our read and our write would be overwritten.
- **Writing every location, or the shop's total:** the other locations are not Vervoro's warehouse.
- **Importing the webhook body:** it carries buyer data and may be older than the order.
- **Counting calls instead of cost points:** one call of 250 items costs the same as one of a single item.
- **Raises only in batches:** the per-item compare makes a batched decrease safe.
- **Skipping variants without a unique SKU:** their stock would never update and their orders would never match.
- **Dropping orders other marketplaces put into the shop:** a wrong guess would lose a sale.

## Open items

- **Protected customer data approval** and the App Store listing are requests to Shopify before sellers install.
- **Recorded replies** before launch: an unapproved protected field, the app names on orders other marketplaces put into a shop, and a batch with one stale entry.
- **Limits** were checked on 17 October 2026; recheck before launch.
