# Runbook: An isolation alarm fired

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 11](../../database-architecture/spec/#11-production-checks) |
| **Who runs it** | The operator, when a production check pages and has closed egress for a database |
| **Role or credential** | The deploy command from the operator's laptop or CI, as in [Deploy and roll back](../deploy-and-roll-back/); the database provider's console to read the cause |

A production check that fails closes egress for the affected database. Egress reopens only by the operator's deliberate step, after the cause is fixed and the whole audit and the canary pass on that database; never automatically.

## Steps

1. **Confirm from the alert row.** Read which check failed and on which database. A canary that could not run (no connection, no credential, the database not bound) closed nothing and is not this procedure: fix what stopped it and run it again.
2. **Decide whether it is a breach.** A finding that could have shown one company's rows to another is a suspected breach: follow [Report a personal-data breach](../report-a-personal-data-breach/). Its 24 hours start when Vervoro becomes aware ([ADR-009 SPEC 13](../../buyer-data/spec/#13-incidents)).
3. **Fix the cause.** Correct the role, grant, configuration or partition the check named, through a migration or the lifecycle tool, never by hand on the live database.
4. **Run the audit and the canary** on that database and read both results. Both must pass.
5. **Reopen egress:** `bun run deploy --env <env> --open <database>`.

## Verify

- The audit and the canary pass on the database, and the alert has cleared.
- Egress is open for that database only, and the reopening is in the incident record.

## If it stops halfway

Egress stays closed. Nothing reopens it but step 5; start again from the step reached.
