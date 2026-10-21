# Runbook: A shared pool runs low

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-004](../../channel-connectors/), rules in [SPEC 7](../../channel-connectors/spec/#7-shared-daily-pools); eBay's pool in [ADR-004.1 SPEC 5](../../ebay-connector/spec/#5-the-trading-pool) |
| **Who runs it** | The operator, when a pool reaches 90 % of its day, when an account's share of the reserve would fall below 50 calls, or before onboarding sellers who need the pool |
| **Role or credential** | The operator console; the marketplace's developer account for a limit request |

A shared pool is a daily allowance for Vervoro's whole application, such as eBay's Trading API. Its reserve protects every account's decreases; this procedure keeps it that way.

## Steps

1. See which jobs spent the pool today, by account and job. A single account or job far above the rest is a fault: hold that job's bulk work and fix it.
2. If the spend is normal growth, check how many accounts use the pool and each one's share of the reserve.
3. If a new account would take a share below 50, leave it in shadow and tell the seller it is waiting for marketplace capacity, with no date promised.
4. Request a higher limit from the marketplace (eBay's Application Growth Check), with the current spend and the expected number of accounts. Do this early; it takes time.
5. When the marketplace grants it, set the pool's new size as a platform setting.
6. Take waiting accounts live in the order they asked, through [Take a company live](../take-a-company-live/).

## Verify

- The pool's alert clears the next day, and every account's share is at least 50.
- The send log shows no decrease refused for want of a pool call.

## If it stops halfway

Nothing here changes figures. A pool size not yet set leaves the old size in force, and waiting accounts stay in shadow.
