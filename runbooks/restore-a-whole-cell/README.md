# Runbook: Restore a whole cell

| | |
| --- | --- |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 10](../../database-architecture/spec/#restore) |
| **Who runs it** | The operator, after a disaster |
| **Role or credential** | The operations job's Neon project credential for the branch restore; the lifecycle role for everything after |

## Steps

1. Restore the cell's branch to the chosen time, with every tenant row set to `restoring`.
2. Delete every company tombstoned after the restore time.
3. For the others, replay the erasure register and run the anonymisation rule.
4. Set to `moved_out` every company that control now places in another database.
5. Copy back from its source cell any company that moved in after the restore time.
6. For every remaining company, do steps 5 to 10 of the [full rewind](../restore-a-company-full-rewind/).
7. Run the production audit and the canary check on the cell.

## Verify

- Every company in the cell matches control's registry.
- The audit and canary pass.
- No account is live before its seller's confirmation.

## If it stops halfway

Every tenant row stays `restoring` until its company's step 6 is done, so nothing is served from a half-restored cell. Re-run from the failed step.
