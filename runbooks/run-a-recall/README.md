# Runbook: Run a recall

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-014](../../fulfilment/), rules in [SPEC 7](../../fulfilment/spec/#7-the-recall-list); the lot trace in [ADR-006 SPEC 10](../../stock-ledger/spec/#10-lot-trace-and-recalls) |
| **Who runs it** | The seller's Manager, Admin or Owner, when a supplier or an authority recalls a lot, the same day. The operator helps only on request, through an operator grant |
| **Role or credential** | Manager or above in the app. An operator grant ([Open an operator grant](../open-an-operator-grant/)) only reads |

A recall must name whom the seller supplied, and the seller needs every buyer to reach them. Vervoro finds them from the lots that actually left, and lists separately the lines where the lot was assumed.

## Steps

1. Open the recall list and enter the lot number from the recall notice. Until Fulfilment's recall list exists, Stock › Lot trace (`/inventory/lots`) lists the same from Inventory ([ADR-006 SPEC 10.1](../../stock-ledger/spec/#10-lot-trace-and-recalls)) and blocks the lot.
2. Block the lot at once from the list. Every batch of that lot is held in every warehouse, and its unpacked reservations move to other batches or leave lines short.
3. Check the parcels waiting in the packing spot. A unit of a blocked lot is refused at dispatch; the packer swaps it.
4. Download the list: the orders that received the lot, with the order id, date and the order's destination country, then the lines that may have received it ("batch assumed", "lot not traced" or "label unchecked"), then any units handed to a marketplace's warehouse.
5. Contact each buyer through the marketplace's own messaging, using the order id. Contact the "may have received it" buyers too, unless the recall notice says otherwise.
6. For the stock still on hand, write it off with the reason "recall", or return it to the supplier, as the notice says.
7. Keep the downloaded list with the recall notice. If the lot is old, the list includes archived months.

## Verify

- The lot shows as blocked, with no sellable units in any warehouse, and the affected listings' figures have fallen.
- Every order on the list is marked contacted.

## If it stops halfway

The block is the urgent step and takes effect at once; everything after it can be resumed from the list, which is the same each time it is opened. If the lot was blocked by mistake, a manager unblocks it and its free units return to sale.
