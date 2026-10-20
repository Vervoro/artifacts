# Runbook: Use the owner role

| | |
| --- | --- |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 3](../../database-architecture/spec/#3-roles) |
| **Who runs it** | The operator, only when no other role can fix the problem |
| **Role or credential** | The owner, only inside the CI migration job. The credential never leaves it |

## Steps

1. Write the reason in the platform security log. The job alerts the operator ([ADR-009](../../buyer-data/)).
2. Run the fix as a reviewed script through the CI migration job. Never connect by hand.
3. Run the production audit and the catalogue lint.

## Verify

- The security log holds the reason and the script.
- The audit passes: no new login role, no bypass outside the owner, caching off.

## If it stops halfway

Run the audit. Fix what it reports through the same job, with a new reason entry.
