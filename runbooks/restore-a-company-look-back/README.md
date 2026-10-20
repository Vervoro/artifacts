# Runbook: Restore a company, look back

| | |
| --- | --- |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 10](../../database-architecture/spec/#restore) |
| **Who runs it** | The operator, on the seller's request |
| **Role or credential** | The lifecycle tool, as the lifecycle role, in read-only transactions on the branch |

For most mistakes, such as one bad bulk edit. Nothing in the live cell is replaced.

## Steps

1. Write the seller's request and the restore time in the company's `audit_log`.
2. Branch the cell at the restore time. Before anything else connects, set every tenant row on the branch to `lookback`.
3. Read the company's old records through the tool, in read-only transactions.
4. With the seller, copy back what is needed as normal commands on the live cell.
5. Delete the branch, within 24 hours at most.

## Verify

- The seller confirms the copied-back records.
- The branch is gone, and the audit shows no branch older than 24 hours.

## If it stops halfway

The live cell is unchanged except for the commands already run, each of which stands on its own. Delete the branch.
