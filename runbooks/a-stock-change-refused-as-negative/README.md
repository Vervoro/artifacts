# Runbook: A stock change refused as negative

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-006](../../stock-ledger/), rules in [SPEC 11](../../stock-ledger/spec/#11-negative-stock) |
| **Who runs it** | The operator, when a "would go negative" refusal alerts |
| **Role or credential** | The operator console to read the refusal and the company's activity. No write to the seller's stock |

Stock is never negative and never clamped. A command plans its change, and the database checks are the last line, so a refusal means a command planned wrongly: a bug. The change was not written. If the command was an order import, the order is retried and becomes an import problem after three attempts ([ADR-007](../../order-ingestion/spec/#8-reserving-on-import)), and its units come off every figure meanwhile ([ADR-008 SPEC 1](../../inventory-sync/spec/#1-the-figure-per-listing)).

## Steps

1. Read the refusal: the command, its key, the product, batch and spot, and the check that failed.
2. Run the nightly check for that company now. If it fails, follow [Settle a stock check difference](../settle-a-stock-check-difference/) first: the stored numbers may be wrong, not the command.
3. If the check passes, the plan was wrong. Reproduce it from the command's input on a test company or the simulators, and open a defect with the failing case as a test.
4. Tell the seller what did not happen (an order not reserved, a count not approved), and that it will be retried or should be redone after the fix.
5. If the shelf really has fewer units than the books, the seller's manager records it with a count, which takes the units out of sale at once. Never adjust the numbers to make the command fit.
6. After the fix is deployed, retry the import or ask the seller to repeat the action. Its key makes a repeat safe.

## Verify

- The command succeeds after the fix, and the nightly check passes.
- No import problem from this refusal is left open.

## If it stops halfway

Nothing was written by the refused command, so there is nothing to undo. An order stays an import problem, with its units held off every figure, until it imports.
