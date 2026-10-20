# Runbook: Drills

| | |
| --- | --- |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 10](../../database-architecture/spec/#drills) |
| **Who runs it** | The operations job, unattended. The operator reads the results |
| **Role or credential** | The lifecycle role |

## Restore drill: monthly

Monthly a random real company and each cell's largest company (the random one weekly from 50 companies):

1. Branch the cell; set every tenant row on the branch to `lookback`.
2. Check that the runtime role is refused on the branch.
3. Restore the company's slice into the branch, timing it per gigabyte.
4. Check that the neighbours' checksums are unchanged.
5. Keep only the timings and checksums; delete the branch.

## Canary move: nightly, once a second cell exists

1. Move the canary company to another database and back, by [move a company](../move-a-company/).
2. Record the time and the checksums.

## Control drill

Restore control into a branch, check it, and delete it. The written procedure for restoring control itself is an open item of ADR-001.

## Verify

- Timings are recorded. The largest company's restore over 15 minutes recommends a new cell ([SPEC 8](../../database-architecture/spec/#when-to-add-a-database)).
- The audit finds no drill branch older than 24 hours.

## If it stops halfway

Delete the branch. A failed drill alerts the operator. It changes nothing live.
