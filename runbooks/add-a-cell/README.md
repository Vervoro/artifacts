# Runbook: Add a cell

| | |
| --- | --- |
| **Built** | *Later*: Cell A reaches 160 companies ([SPEC 0](../../database-architecture/spec/#0-at-launch-and-later)) |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 8](../../database-architecture/spec/#adding-a-cell) |
| **Who runs it** | The operator, ahead of need. Never part of a sign-up |
| **Role or credential** | The CI migration job, as the owner, for steps 1 to 5. The deploy pipeline for step 6. Steps 7 to 9 are the job's checks |

## Steps

1. Create the database in the EU region.
2. In SQL, create the runtime, lifecycle and definer-owner roles, each `NOBYPASSRLS`; the definer owner `NOLOGIN`. Never create a role in the Neon console, CLI or API.
3. Run every migration, including the next three months' partitions and the catalogue revokes. Where Neon refuses a revoke, the lint warns and the cell may still be registered; the query check is the fence ([SPEC 4](../../database-architecture/spec/#4-functions)).
4. Seed the canary company.
5. Register the cell in control as `closed`, with a cap of 200. Its sweeper exists from this row on, and the audit now covers it.
6. Create its Hyperdrive configuration on the direct endpoint with caching **off**, add the binding to the Worker, and deploy.
7. Ask the deployed Worker to open a transaction through the new binding, as the runtime role, and enter the canary company.
8. Run the production audit over the new cell.
9. Set the cell `open` in control. New companies now start there.

## Verify

- The audit passes: login roles, no caching, partitions, history window, lint.
- The canary check passes on the new cell.
- The next sign-up is placed in the new cell.

## If it stops halfway

- **Before step 5:** nothing points at the database. Fix and continue, or delete it and start again.
- **Steps 5 to 8:** the cell is `closed`, so no company is placed there. Fix the failing step and repeat from it. To give up, remove the registry row, the binding and the database, in that order.
- **After step 9:** the cell is live. Treat any failure as an incident: set it `closed` again, and page.
