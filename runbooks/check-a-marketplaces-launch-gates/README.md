# Runbook: Check a marketplace's launch gates

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-004](../../channel-connectors/), rules in [SPEC 10](../../channel-connectors/spec/#10-what-is-measured) and [SPEC 11](../../channel-connectors/spec/#11-shadow-mode-and-launch-gates); eBay's fallback in [ADR-004.1 SPEC 3](../../ebay-connector/spec/#3-orders) |
| **Who runs it** | The operator, before the first account on a marketplace goes live, and again after a gate fails |
| **Role or credential** | The operator console |

No account on a marketplace goes live until shadow on that marketplace passes its gates. The gate figures are proposals until the owner sets them.

## Steps

1. Open the marketplace's measurements. Check that shadow has run at least 14 days and 500 orders across its accounts. If not, wait.
2. Read the three figures: notice miss rate, 99th-percentile detection delay, and unreserved-order exposure. Compare each with its gate.
3. **All pass:** mark the marketplace's gates passed. Its accounts may now go live by [Take a company live](../take-a-company-live/).
4. **One fails, first time:** list the orders behind it. Check whether one account explains them (a broken subscription is [Repair a notice subscription](../repair-a-notice-subscription/)). If so, fix it and measure again.
5. Otherwise shorten the marketplace's scheduled read. On eBay, go from hourly to 15 minutes, after checking the order allowance has room for 96 reads a day per account plus the order fetches. On Amazon, go from hourly to 10 minutes; its order limit is each seller's own. Record the change and its date.
6. Measure for 7 more days, then repeat from step 2.
7. **Fails again:** leave live stock sync off for that marketplace. Its accounts stay in shadow; orders are still imported and reserved. Tell the owner, with the figures, and open a decision.

## Verify

- The marketplace's gate state shows passed, or shows the shortened read and its start date.
- No account on a marketplace whose gates have not passed is live.

## If it stops halfway

The gates are read-only until step 3 or step 5. A read interval changed in step 5 stays in force; set it back if the measurement is abandoned.
