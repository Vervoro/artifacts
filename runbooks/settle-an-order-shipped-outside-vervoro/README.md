# Runbook: Settle an order shipped outside Vervoro

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-007](../../order-ingestion/), rules in [SPEC 17](../../order-ingestion/spec/#17-shipped-outside-vervoro); the stock entries in [ADR-006 SPEC 7.5](../../stock-ledger/spec/#7-ports-fulfilment-and-orders-call) |
| **Who runs it** | The seller's Manager, from the daily digest, or when an order is held "step undone" |
| **Role or credential** | Vervoro as Manager or above. Tapping the lot that left can be done by anyone in the warehouse |

The marketplace said units shipped that no Vervoro shipment covers, and nothing was picked or packed in Vervoro by the order's leave-by ([ADR-007 SPEC 17.8](../../order-ingestion/spec/#17-shipped-outside-vervoro)), so Vervoro deducted what the line held. Most of the time that is right: the parcel left without being packed in Vervoro. This procedure is for the times it is not.

## Steps

1. Open the order from the digest. Ask the warehouse whether the parcel left from the shelf.
2. If it did, nothing more is needed. If the warehouse also confirmed a Vervoro shipment for it and was refused "already shipped outside", choose "this was our parcel": its carrier and tracking stay on the shipment and nothing moves.
3. If it did not leave the warehouse (it shipped from elsewhere), choose "Not from our stock" with a reason. The units come back and become sellable. A line can be reversed once.
4. If the order has a task to tap the lot that left (a use-by product, or a business buyer's line), have the warehouse tap it from the unit's date or lot. Until then the entry stays "batch assumed".
5. If the order is held "step undone" (the marketplace now says fewer units shipped), find out whether the parcel left. "The parcel did not leave" reverses the deduction and the line reserves again; "it left" closes the hold.
6. For a line that was waiting for a link when it shipped, nothing was deducted. Attach it to the product if it came from the shelf; otherwise choose "Not from our stock".

## Verify

- The order's lines show the right units deducted or returned, and the product's on-hand matches the shelf.
- No hold or batch task is left open on the order.

## If it stops halfway

Each choice is one transaction and can be made once, so a half-done settlement leaves the order as the last confirmed choice left it.
