# Runbook: Hold raises or pause an account

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-008](../../inventory-sync/), rules in [SPEC 7](../../inventory-sync/spec/#7-held-raises), [SPEC 10](../../inventory-sync/spec/#10-listing-modes-and-stopping) and [SPEC 15](../../inventory-sync/spec/#15-recovery) |
| **Who runs it** | The operator, when figures may be wrong on the way up (a suspected import gap, a nightly check difference, a marketplace behaving oddly), or when an account must stop sending |
| **Role or credential** | The operator console. Holding every send to a marketplace is ADR-004's platform switch |

Choose the smallest tool that makes it safe. Holding raises keeps every decrease flowing, so listings can only fall. Pausing an account stops every write, so use it only when even decreases are wrong.

## Steps

1. Decide the scope: one listing, a product's listings, one account, or one marketplace for every company.
2. **To hold raises** on listings or an account, add the operator's hold with a reason. D is still worked out, and every decrease still goes.
3. **To pause an account,** step it back to shadow. Answer the stop question for it: leave the figures, or send 0. A 0 is confirmed applied before the mode changes.
4. **To stop a marketplace** during an incident on its side, use the platform hold ([ADR-004](../../channel-connectors/)). Figures wait as rows, and nothing is replayed later.
5. Tell the affected sellers in the app what is held and why. The seller's screen shows those listings as held.
6. When the cause is fixed, remove the hold or take the account live again ([Take a company live](../take-a-company-live/), later-account path). Released raises wait for the next order read, and `unknown` writes are settled first.

## Verify

- While held, no raise for the scope is sent; decreases still appear in the send log.
- After release, the account's health returns to "right" within one order read.

## If it stops halfway

A hold that was added is in force until removed; one that was not added changed nothing. An account stepped back to shadow stays in shadow until it is taken live again.
