# Runbook: Order ingestion stalled

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-007](../../order-ingestion/), rules in [SPEC 2](../../order-ingestion/spec/#2-how-an-order-comes-in) and [SPEC 9](../../order-ingestion/spec/#9-import-problems); the completeness check in [ADR-004 SPEC 9](../../channel-connectors/spec/#9-the-completeness-check) |
| **Who runs it** | The operator, when the order watermark of a marketplace's accounts is more than 60 minutes behind ([ADR-008 SPEC 16](../../inventory-sync/spec/#16-what-the-seller-and-the-operator-see)) |
| **Role or credential** | The operator console |

While the watermark is behind, raises on those accounts wait and orders no notice brought are not reserved. Decreases still go. The watermark moves only after a complete window, so the task is to find what keeps the window from completing.

## Steps

1. Count the accounts behind. Many accounts on one marketplace at once is an outage: follow [Handle a marketplace outage](../handle-a-marketplace-outage/) and come back at step 6.
2. For one account, read why its last completeness check did not complete: throttled, failed, switched off, or waiting on an order.
3. If an order in the window keeps failing to import, check it has become a problem row after three attempts. If it has not, the import is failing before it can record one: open an incident, because that is a defect.
4. If the dead-letter queue is not empty, follow [Replay dead letters](../replay-dead-letters/).
5. If the account shows "not notified", follow [Repair a notice subscription](../repair-a-notice-subscription/).
6. Ask for an on-demand completeness check on each account behind, and wait for it to complete.

## Verify

- Each account's watermark is within its normal interval of now, and the page has cleared.
- Every order the check found has committed or has a problem row.

## If it stops halfway

Nothing is lost: notices keep importing orders while the watermark is behind, and an on-demand check can be asked for again at any time.
