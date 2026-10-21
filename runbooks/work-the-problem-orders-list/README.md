# Runbook: Work the problem-orders list

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-007](../../order-ingestion/), rules in [SPEC 9](../../order-ingestion/spec/#9-import-problems) |
| **Who runs it** | The operator, when an import problem alerts; the seller's Manager for steps 5 and 6 |
| **Role or credential** | The operator console for retries. A problem row holds no buyer data; seeing the company's own order screens needs an operator grant ([Open an operator grant](../open-an-operator-grant/)) |

An order on this list is sold on the marketplace but reserved nowhere in Vervoro. Its units are kept off the figures of its listings, or of the whole account when a line could not be read, until it imports or is marked resolved.

## Steps

1. Read the problem's reason and its lines: listing and quantity, or "not readable".
2. If many rows share one reason on one marketplace, the connector cannot read something the marketplace now sends. Open a defect for the connector and wait for its fix; the rows keep the units off the figures meanwhile.
3. When the fix ships, retry every open problem at once from the console.
4. For a single row with a database or lock reason, retry it. If it fails again with "would go negative", follow [A stock change refused as negative](../a-stock-change-refused-as-negative/).
5. If the order can never import (the marketplace deleted it, or it was a test), the seller's Manager checks it on the marketplace from the row's link.
6. The Manager marks it resolved only after deciding what the warehouse does: ship it by hand as a manual order, or nothing. Marking it resolved gives its units back to the figures.

## Verify

- The row shows imported or resolved, and the order appears in the order list if it imported.
- The account's figures no longer hold back that order's units.

## If it stops halfway

A row stays open, and its units stay off the figures, until it imports or is marked resolved. A retry can be run again at any time; imports are idempotent.
