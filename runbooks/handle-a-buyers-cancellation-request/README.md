# Runbook: Handle a buyer's cancellation request

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-007](../../order-ingestion/), rules in [SPEC 12](../../order-ingestion/spec/#12-cancellations-and-refunds) |
| **Who runs it** | The seller's Manager, Admin or Owner, when the cancellation list shows a request |
| **Role or credential** | The seller's own marketplace account, and Vervoro as Manager or above |

Vervoro never sends a cancellation or an answer to a buyer. The order is held and keeps its stock until the marketplace says what happened. Every answer is given on the marketplace.

## Steps

1. Open the cancellation list. Requests are sorted by the marketplace's deadline; take the soonest first.
2. Open the order on the marketplace from its link.
3. To accept on eBay, accept the request there. To refuse on eBay, decline it there, or let the deadline pass on a paid order: eBay then closes the request and the order ships.
4. On Amazon there is no refusal. To accept, cancel the order in Seller Central. To refuse, release the hold in Vervoro with a reason; Vervoro reads the order first and refuses the release if Amazon has already cancelled it. Then ship as usual.
5. If the order was already picked or packed, tell the warehouse: a confirmed cancellation shows a red stop and a put-back task.
6. Wait for the marketplace's answer to come back by notice or the next read. Do not ship or release anything by hand meanwhile.

## Verify

- Accepted: the order shows cancelled, its stock is released, and any put-back task is open on the warehouse's Home.
- Refused: the hold has cleared and the order is back on the picking list with its reservation unchanged.

## If it stops halfway

The order stays held, with its stock, until the marketplace confirms, declines or lets the request lapse. Vervoro reads an eBay order again when its answer window closes.
