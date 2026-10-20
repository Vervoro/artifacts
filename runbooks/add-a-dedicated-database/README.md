# Runbook: Add a dedicated database

| | |
| --- | --- |
| **Built** | *Later*: The first enterprise contract that needs one ([SPEC 0](../../database-architecture/spec/#0-at-launch-and-later)) |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 8](../../database-architecture/spec/#adding-a-dedicated-database) |
| **Who runs it** | The operator, when an enterprise customer needs a database of its own |
| **Role or credential** | As [add a cell](../add-a-cell/). For an existing company, the lifecycle role in the operations job |

## Steps

1. Create a Neon project of its own for the company, in the EU unless the contract names another region.
2. Outside the EU: also set up the Worker placement, object-storage bucket, Durable Object jurisdiction, logs and backup location for that region ([SPEC 8](../../database-architecture/spec/#dedicated-databases-and-residency)).
3. Follow [add a cell](../add-a-cell/) steps 2 to 9, registering `kind = dedicated` with a cap of 1.
4. Place the company:
   - **a new company:** add it straight into this database (sign-up or the operator's enterprise form, naming the database);
   - **an existing company:** [move it](../move-a-company/) here.
5. Once the company is in, the cell is at its cap, and placement sets it `closed`.

## Verify

- As in [add a cell](../add-a-cell/).
- Control routes the company to the dedicated database, and the company signs in and sees its data.

## If it stops halfway

- **Before step 4:** as in [add a cell](../add-a-cell/).
- **During a move:** follow [move a company](../move-a-company/).
