# Runbook: Export a company

| | |
| --- | --- |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 10](../../database-architecture/spec/#export) |
| **Who runs it** | Started by the seller's Owner, or by the operator on their written request; run by the operations job |
| **Role or credential** | The lifecycle role, reading from a branch or a read replica |

## Steps

1. Record the request in the company's `audit_log` as a view of buyer data.
2. Read the slice through parent tables, from a branch or read replica where one exists.
3. Write the bundle: a manifest with per-table row counts and hashes, machine-readable files the slice operation can load again, and readable CSV files.
4. Bind the bundle to the company id.
5. Hand the bundle to the seller.

## Verify

- The manifest's counts match a generated count of the company's rows.
- Loading the bundle under another company id is refused.

## If it stops halfway

Nothing changed in the company. Delete any partial bundle and start again.
