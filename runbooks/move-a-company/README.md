# Runbook: Move a company

| | |
| --- | --- |
| **Built** | *Later*: A second cell exists ([SPEC 0](../../database-architecture/spec/#0-at-launch-and-later)) |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 10](../../database-architecture/spec/#move) |
| **Who runs it** | The operator starts it; the operations job runs it |
| **Role or credential** | The lifecycle role, over a direct connection to each database |
| **Takes** | Minutes per company; the company is fenced throughout |

## Steps

1. Confirm the target database is `open` (or the company's dedicated database) and has room.
2. Fence the company: pause its outbound marketplace calls, set its source tenant row to `moving_out`. Requests now raise and retry.
3. Copy the slice to the target in committed batches, reading through parent tables, `due` rows included.
4. Compare row counts and checksums per table between source and target.
5. Replay the erasure register for the company on the target.
6. Set the target tenant row `open`, then switch `company.database_id` in control.
7. Set the source tenant row to `moved_out`.
8. Delete the source slice in batches.
9. Resume outbound calls.

## Verify

- A generated count over every table is 0 for the company in the source.
- The company signs in and its counts match step 4.
- The target's sweeper has picked up the company's `due` rows.

## If it stops halfway

- **Steps 2 to 5:** the source is still the truth. Delete whatever reached the target, set the source back to `open`, resume calls.
- **Step 6 or 7:** finish them. Control decides the route; a stale route raises at the source and reloads.
- **Step 8:** re-run it; the delete is safe to repeat.
