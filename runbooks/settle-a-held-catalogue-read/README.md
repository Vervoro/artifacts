# Runbook: Settle a held catalogue read

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-005](../../catalogue-sync/), rules in [SPEC 8](../../catalogue-sync/spec/#8-new-and-ended-listings) |
| **Who runs it** | The operator, when a read is held because it would mark too many listings missing, or an account has had no complete read for 48 hours |
| **Role or credential** | The operator console. Releasing a read is a recorded command and needs no grant |

A held read changes nothing: every listing keeps its state, link and figure. The danger is releasing a read that was cut off, which would start ending listings that still sell.

## Steps

1. Open the read. Note its scope (eBay's report, one Amazon marketplace), how many listings it would mark missing, and whether the previous read of that scope was complete.
2. Check for an incident on the marketplace's side. Many accounts held on one marketplace at once is an incident: follow [Handle a marketplace outage](../handle-a-marketplace-outage/) and release nothing.
3. Compare the read's size with the last complete read. A report much smaller than usual, or one that stops at a round number, is cut off: release nothing, and let the next read run.
4. If the size looks right, ask the seller whether they ended or moved those listings on the marketplace, for example a bulk end or a move to another account.
5. If the seller confirms, release the read. Its missing listings then follow the second proof as usual; linked ones are each read singly before they end.
6. If an account has had no complete read for 48 hours, read the reason on the account: a spent page cap, a switched-off account, or repeated failures. Fix the cause, or ask the seller to refresh once it is fixed.

## Verify

- The account's next complete read is not held, and the held alert has cleared.
- No linked listing ended without a single-listing read saying so.

## If it stops halfway

Until the read is released, nothing changes, and the next read is due within an hour. Releasing can be done once only; a later read of the same scope replaces it.
