# Runbook: Restore a company, full rewind

| | |
| --- | --- |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 10](../../database-architecture/spec/#restore) |
| **Who runs it** | The operator, only for corruption |
| **Role or credential** | The lifecycle role in the operations job |
| **Takes** | Minutes, as measured by the drill, plus the seller's review |

## Steps

1. Fence the company: pause its outbound marketplace calls, revoke its sessions, set its tenant row to `restoring`.
2. Branch the cell at the restore time; set every tenant row on the branch to `lookback`.
3. Replace the live slice with the branch's slice, in batches.
4. Replay the erasure register for the company and run the anonymisation rule ([ADR-009](../../buyer-data/)).
5. Rebuild the company's directory rows in control.
6. Set counters to at least their live values. Re-register every invoice and credit note in object storage newer than the restore time, and set their counter past the highest ([ADR-011](../../invoicing-and-vat/)).
7. Mark restored outbound sends `unknown`; never resend them. Put every marketplace account back in shadow. Raise the company's sync epoch in control ([ADR-008](../../inventory-sync/)).
8. Re-import the marketplace orders placed since the restore time, then re-read the marketplaces and reconcile.
9. Set the tenant row `open`; delete the branch.
10. The seller confirms the differences on the reconcile screen. Stock pushes resume only then; accounts stay in shadow until they do.

## Verify

- The neighbours' checksums are unchanged.
- No account is live before the seller's confirmation.
- The operator is alerted if a difference is large; nobody has to act at a set hour.

## If it stops halfway

- **Steps 1 to 3:** the tenant row is `restoring`, so nothing serves the company. Re-run step 3 from the start.
- **Steps 4 to 8:** re-run from the failed step; each is safe to repeat. Do not open the company until all of them have finished.
