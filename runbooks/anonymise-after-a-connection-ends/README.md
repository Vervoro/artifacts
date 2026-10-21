# Runbook: Anonymise after a connection ends

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-009](../../buyer-data/), rules in [SPEC 8](../../buyer-data/spec/#8-retention-and-anonymisation) and [SPEC 16.1](../../buyer-data/spec/#161-amazon) |
| **Who runs it** | The operator, when a marketplace connection ends: the seller disconnects it, the marketplace revokes approval, Amazon sends a deletion notice, or Vervoro leaves a marketplace's programme. The anonymisation itself runs by itself |
| **Role or credential** | The operator console. No grant: the steps read counts and dates, never buyer data |

Ending a connection sets every one of its orders' buyer data due within 30 days, whatever the order's state. Amazon also asks that everything about that seller from Amazon goes within 30 days, except what the law requires to be kept.

## Steps

1. Open the ended connection. Note its end time and why it ended.
2. Check that its orders' due times are set no later than 30 days after that end. A connection ended by Amazon's notice or by Vervoro leaving eBay's programme is due sooner: Amazon's notice within its 30 days, eBay within 10 days.
3. If the seller reconnects the same account before the due time, nothing changes: orders already due keep their due time.
4. After the due time, check the connection's count of orders still holding buyer data: it must be 0.
5. For Amazon, check that nothing else from Amazon about that seller remains beyond the accounting records the law requires. If Amazon asks, send written certification of the deletion.

## Verify

- The count in step 4 is 0, and the nightly check raised nothing for the company.

## If it stops halfway

Due times are set when the connection ends and are kept across restarts; the sweep picks them up. If a due time is missing, follow [Check the anonymisation job](../check-the-anonymisation-job/).
