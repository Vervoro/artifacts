# Runbook: Erase a company

| | |
| --- | --- |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 10](../../database-architecture/spec/#erase) |
| **Who runs it** | The operations job, on the seller's privacy request ([ADR-009](../../buyer-data/spec/#11-erasure-backups-and-restores)) or 30 days after the company closes ([ADR-012 SPEC 16](../../billing-and-plans/spec/#16-cancellation-export-erasure-and-refunds); [Close and reopen a company for non-payment](../close-and-reopen-a-company/)). Never an operator command; the operator watches it |
| **Role or credential** | The lifecycle role, over a direct connection |

## Steps

1. Fence the company in control: no sign-in, no outbound calls.
2. Write the company's tombstone in the erasure register.
3. Delete its rows in batches, in foreign-key order, through parent tables.
4. Delete its tenant row. The cascade removes anything left.
5. Run the generated count over every table; it must be 0 for the company.
6. Purge its files in object storage, with any soft-deleted or versioned copies.
7. Destroy its data key.
8. Release its marketplace seller ids in control.
9. Record in the erasure register that all three conditions hold: deletes committed, count 0, key destroyed.

## Verify

- Step 9's record exists, with the count.
- The company no longer appears in control's registry.

## If it stops halfway

- Re-run from step 3. Every step is safe to repeat.
- The tombstone written in step 2 stops any restore from bringing the company back.
- Backups still hold the company until day 30; that is stated in the customer terms.
