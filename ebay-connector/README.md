# ADR-004.1: eBay connector

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026; Trading API exception, 21 October 2026; split into ADR, SPEC and RUNBOOK, 21 October 2026 |
| **Scope** | What eBay adds to [ADR-004](../channel-connectors/) |
| **Builds on** | [ADR-004](../channel-connectors/), [ADR-003](../product-model/), [ADR-005](../catalogue-sync/), [ADR-008](../inventory-sync/) |
| **SPEC** | [The eBay rules, limits and checks](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-0041-ebay-connector) |

## Context

- **Two kinds of listing:** Inventory API listings named by SKU, and Seller Hub listings in the older Trading API named by item number. Most sellers have both.
- **Limits belong to Vervoro's application:** 5,000 Trading calls and 100,000 order calls a day, shared by every seller.
- **No compare-and-set,** and a Seller Hub listing that reaches zero ends unless the seller has turned on eBay's out-of-stock option.
- **Order notices are not guaranteed.**

## Decision

1. **One Vervoro application, approved by each seller** on eBay's consent page.
2. **Orders arrive by eBay's Notification API:** one destination per environment, three order topics per seller, each notice answered by fetching the order.
3. **The backup read runs hourly,** every 10 minutes while an account's notices look broken, and reads each window from its last page back, so no order slips past.
4. **Every linked listing gets the figure:** inventory items through the Inventory API, Seller Hub listings through the Trading API by item number. A listing nobody linked gets none ([ADR-005](../catalogue-sync/)).
5. **The Trading API is spent only where nothing else will do,** from ADR-004's shared pool, with a daily page cap per account; full reads prefer the Feed API's daily report.
6. **An unknown Trading API write is settled by sending the figure again,** the exception [ADR-004's rule](../channel-connectors/spec/#5-retries-and-outcomes) allows: the call sets a quantity, and a read costs the same pool call.
7. **Vervoro never changes a seller's eBay settings.** A Seller Hub listing is not written while the out-of-stock option is off, and the account cannot go live until the seller turns it on.
8. **A variation with no SKU cannot be updated.** Its orders still come in, and the seller is told to add a SKU.
9. **eBay's account deletion notices are received,** as eBay requires; a buyer's anonymises their orders ([ADR-009](../buyer-data/)).
10. **eBay goes live only after its shadow launch gates pass** ([ADR-004 SPEC 11](../channel-connectors/spec/#11-shadow-mode-and-launch-gates)); if not, the backup read is shortened, then live stock sync stays off for eBay.

## Consequences

**Gives**

- Every linked listing gets Vervoro's figure, whichever eBay tool made it.
- The Trading pool goes where it protects sellers, and one large catalogue cannot use it up.
- No seller loses a listing because Vervoro sent zero to a listing that would end.
- Lost notices are measured before any seller depends on them.

**Costs**

- Two APIs for one job, with two ways to name a listing.
- Sellers with Seller Hub listings must turn on the out-of-stock option before going live.
- Variations without a SKU stay outside stock sync until the seller adds one.
- The notice destination is an operator step per environment.
- At eBay's default limit, about 10 accounts with Seller Hub listings can go live; more depend on eBay.

## Alternatives rejected

- **The Trading API for every listing:** spends the shared pool on listings the Inventory API serves at no shared cost.
- **Migrating the seller's listings to the Inventory API:** changes listings Vervoro does not own.
- **Reading an order window forwards:** an order that changes during the read can slip past every window.
- **Turning on the out-of-stock option for the seller:** changes all their listings, including ones Vervoro does not manage.
- **Sending zero while the option is off:** eBay would end the listing or drop the variation.

## Open items

- **The shared Trading pool is a business dependency.** About 10 live accounts with Seller Hub listings fit before each one's reserve falls below 50 calls. Request eBay's Application Growth Check before the first pilot seller; until it is granted, further accounts wait in shadow ([runbook](../runbooks/a-shared-pool-runs-low/)).
- **Lost notices.** The launch gate figures in [ADR-004 SPEC 11](../channel-connectors/spec/#11-shadow-mode-and-launch-gates) are proposals and need the owner's numbers.
- **The order allowance also carries every order fetch,** so hundreds of sellers, or a shortened backup read, need the Growth Check too.
- **Topics and scopes** are confirmed with `getTopics` on the production keyset before any seller connects.
- **Unknown Inventory API writes** are read back; the resend exception covers the Trading API only.
- **Recorded replies,** including a stable order across pages, are a pre-launch task.
