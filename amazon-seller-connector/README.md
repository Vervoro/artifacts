# ADR-004.2: Amazon Seller connector

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026; split into ADR, SPEC and RUNBOOK, 21 October 2026; the restricted role Later, with shipping labels (owner ruling, 22 October 2026); amended by owner rulings of 25 October 2026: the backup read hourly |
| **Scope** | What Amazon's Selling Partner API adds to [ADR-004](../channel-connectors/), for a seller who ships their own orders and may also use Amazon's fulfilment |
| **Builds on** | [ADR-004](../channel-connectors/), [ADR-003](../product-model/), [ADR-006](../stock-ledger/), [ADR-008](../inventory-sync/), [ADR-009](../buyer-data/) |
| **SPEC** | [The Amazon rules, limits and checks](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-0042-amazon-seller-connector) |

## Context

- **Notices land only in Amazon's cloud.** Order changes go only to an AWS queue, listing changes only to an AWS event bus. Amazon calls no address of ours.
- **One seller, many marketplaces.** A seller id covers a region, and one listing can sell in several of its marketplaces.
- **Writes are processed later,** and can still fail after Amazon accepted them.
- **Limits are each seller's own,** some very slow: the order search refills about once every three minutes.
- **Approvals expire yearly, and buyer data is restricted.**

## Decision

1. **The seller approves Vervoro in Seller Central,** from Vervoro or from Amazon's app store. One read with the new token proves the seller id before it is claimed.
2. **One account is one seller id in one region,** serving the marketplaces the seller picks there. One figure goes to all of them.
3. **Notices come through a small no-code AWS bridge in an EU region** ([ADR-000 SPEC 8](../system-architecture/spec/#8-connectors-and-orders-in)), which posts each one to the notice endpoint with a shared secret. The endpoint also checks the notice names Vervoro's application.
4. **Each order notice is answered by fetching the order.** The backup read runs hourly, every 10 minutes while the account's notices look broken, and never closer than three minutes apart (owner ruling, 25 October 2026).
5. **Every stock write is one listing at a time.** *Later: listings feeds for many raises if single writes fall short; a feed never carries a decrease.*
6. **Amazon's `accepted` does not mean applied.** Every write is read back before Vervoro counts it as applied.
7. **A listing Amazon ships on any of the account's marketplaces is never sent a figure.**
8. **Buyer data needs no restricted role at launch.** Orders carry the country and the territory worked out from the postcode, which is not kept ([ADR-004 SPEC 1](../channel-connectors/spec/#1-the-connector-contract)). *Later, with shipping labels: the Direct-to-Consumer Shipping role, only for orders the seller ships, anonymised 30 days after delivery ([ADR-009](../buyer-data/)).*
9. **Stock in Amazon's warehouses is read daily and on Amazon's notice,** as a reading beside Vervoro's figures, never added to them ([ADR-006](../stock-ledger/)).
10. **Approval lasts 365 days from the day the seller gives it,** because Amazon gives no expiry date. The seller is reminded 30 days ahead, and the operator rotates the app's client secret every 180 days.

## Consequences

**Gives**

- Amazon's notices reach the same endpoint, queue and consumer as every other marketplace's.
- A slow order search is spent only as a backup, and no decrease waits behind a feed.
- A listing Amazon ships can never be given a merchant figure.
- Buyer data is held only as long as Amazon allows, and only for orders the seller ships.
- A lost bridge costs speed, not orders: the backup read still finds them, every 10 minutes once notices look broken.

**Costs**

- An AWS bridge in a second cloud, with its own alarm and secret.
- Every write is two steps, the write and its read back.
- With several marketplaces on one account, Vervoro assumes the cautious case for which marketplace a sale came out of.
- Sellers re-approve every year, and the operator rotates the client secret twice a year.
- A raise can wait up to a few minutes for the slow order search.

## Alternatives rejected

- **Reading the queue from Vervoro directly:** a Worker would hold AWS credentials; the bridge keeps one inbound path.
- **Feeds for every write:** a decrease in a late feed can put back a figure that is too high.
- **Treating `accepted` as applied:** an accepted change can fail minutes later.
- **Sending a figure to a SKU Amazon ships on one marketplace and the seller on another:** it would put a merchant figure on Amazon's listing.
- **Keeping buyer data with the order:** Amazon's policy limits it to 30 days after delivery.

## Open items

- **Recorded replies** before launch: approval page paths, the Amazon-held stock notice's contents, and every call the connector makes.
- **Accounts on several marketplaces:** whether Amazon keeps them in step is measured in shadow ([ADR-008](../inventory-sync/)).
- **Limits** were checked on 17 and 18 October 2026; recheck before launch.
