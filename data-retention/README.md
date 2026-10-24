# ADR-002: Data retention and archiving

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026; amended by owner rulings of 25 October 2026: `audit_log` kept 13 months, a whole table's month deleted in batches |
| **Scope** | How long each kind of a company's data stays in its cell, where older months go, and when they are deleted |
| **Builds on** | [ADR-001](../database-architecture/), [ADR-006](../stock-ledger/), [ADR-009](../buyer-data/); used by [ADR-010](../users-and-access/), [ADR-011](../invoicing-and-vat/) and [ADR-012](../billing-and-plans/) |
| **SPEC** | [The rules to build from, the evidence and how to check them](spec/) |
| **RUNBOOK** | [The procedures for this record](../runbooks/#adr-002-data-retention-and-archiving) |

## Context

- **History only grows.** A company at 1,000 orders a day adds about 150 MB a month. A cell of 300 such companies grows about 540 GB a year and reaches 1.5–2 TB after three years.
- **Storage is cheap; old data slows everything else.** Indexes outgrow memory, and exporting, moving or restoring a company ([ADR-001](../database-architecture/spec/#10-company-lifecycle)), vacuum and every database branch carry the full history. Almost nobody reads data older than two years.
- **Accounting records must be kept.** In the UK the longest general rule is 6 years from the end of the financial year they belong to ([SPEC 8](spec/#8-constraints)). Only the seller knows their year-end, and only the seller knows when HMRC needs longer.
- **Old orders hold almost no personal data.** Buyer data is anonymised 30 days after delivery ([ADR-009](../buyer-data/spec/#8-retention-and-anonymisation)); only issued VAT invoices keep the buyer details the law requires.
- **Append-only rows leave only as [ADR-001 SPEC 5](../database-architecture/spec/#5-declaring-tables) says:** a whole month removed after the archiver verified it, or dropped when its retention ends.

## Decision

1. **History stays in the cell for 24 months:** closed orders with their lines, holds and cancellations, invoices, credit notes, VAT records, export evidence, payments, stock ledger entries, and batches with no stock left (counted from their last movement). That covers year-on-year reports.
2. **Current state is never archived:** products, listings, stock levels, open orders, open purchase orders, settings and users. It is deleted only with the company.
3. **Older months move to an archive, then leave the cell.** The archive is object storage: compressed files, one per table per company per month, encrypted with the company's key. A month is archived for the whole cell at once, because partitions are shared. It leaves the cell only after every company's files are verified against it ([SPEC 3](spec/#3-archiving-a-month)).
4. **Stock still proves itself after its history leaves.** Before a ledger month is archived, the archiver writes a checkpoint (an opening balance) so the nightly check sums from it ([ADR-006 SPEC 14](../stock-ledger/spec/#14-the-nightly-check-and-checkpoints)).
5. **The archive is kept 7 years from the end of each month, then that month is deleted** per company. Any financial year ends within 12 months of the month, so this always covers the statutory 6 years and needs no year-end setting. The seller is told 90 days before a month is deleted, with its export, and keeps what a longer case needs.
6. **Archived data is read only on request:** a company's export, the older-history report, and a lot trace ([ADR-006](../stock-ledger/spec/#10-lot-trace-and-recalls)). Everyday screens, searches, stock figures and marketplace sync use the cell only.
7. **Logs and working data keep their own clocks.** `audit_log` (security and access) 13 months, by whole months (owner ruling, 25 October 2026); `event_log` (module activity) 90 days, by whole months ([SPEC 2](spec/#2-the-retention-schedule)); outbound sends, sync attempts, operational state and outbox notes every handler has received, 30 days. These are deleted when their time is up, never archived, from launch (owner ruling, 21 October 2026).
8. **The archive follows the company, not the cell.** Erasing a company deletes its archive files; moving it leaves them where they are; restoring it needs no archive restore, because the files never change; the bucket sits in the company's region ([SPEC 6](spec/#6-the-company-lifecycle)).
9. **Archiving is switched on by a trigger.** *Later: when a cell passes 500 GB, or at the start of year 2, whichever comes first.* Until then every month stays in the cell; only decision 7's deletions run at launch.

**Retention owned by other records:** backups, 7 days of point-in-time history and 30 days of snapshots ([ADR-001 SPEC 10](../database-architecture/spec/#backups)); sign-in data in the control database ([ADR-013 SPEC 2](../sign-in/spec/#2-the-login-and-its-data)); the platform security log, 12 months ([ADR-010 SPEC 8](../users-and-access/spec/#8-audit)); a closed company ([ADR-012 SPEC 16](../billing-and-plans/spec/#16-cancellation-export-erasure-and-refunds)) and Vervoro's own billing records ([ADR-012 SPEC 18](../billing-and-plans/spec/#18-records-kept)); what an invoice must hold ([ADR-011](../invoicing-and-vat/)). The full schedule is [SPEC 2](spec/#2-the-retention-schedule).

## Consequences

**Gives**

- A cell's size is bounded by about 24 months of activity, so speed, moves, restores and upkeep stay predictable as the platform ages.
- Statutory records are kept as long as the law asks, and deleted when that ends.
- Erasure still reaches everything, through per-company files and the company's key.
- No seller setting to ask for or keep right.

**Costs**

- A second store to run: the archive bucket, its catalogue and the archiver.
- History older than 24 months is slower to read and absent from everyday screens.
- The stock ledger gains checkpoint entries.
- A month is archived per cell, and must finish for every company before it leaves: a partition dropped, or a whole table's month deleted in batches.
- Up to a year more archived data than the law needs.

## Alternatives rejected

- **Keep everything in the cell:** simple, but speed, moves, restores and upkeep degrade every year.
- **Delete after 3 years:** breaks the statutory retention of accounting records.
- **Ask each seller's year-end and delete exactly 6 years after it:** a setting to keep right; a wrong or changed year-end deletes records too early.
- **A separate archive database:** still a database to run, size and back up; object storage is cheaper and its files never change.
- **Archive at launch:** not needed until a cell is large; the trigger avoids running a second store before it pays off.

## Open items

- **Where the archive catalogue lives** (control or the cell) is not stated. "Moving a company leaves its files" implies control, which holds no company business data.
- **Which job runs the archiver** is not stated. A partitioned table's detach is the monthly migration run, as the owner role ([ADR-001 SPEC 12](../database-architecture/spec/#12-operations)); a whole table's batched delete is the lifecycle role's ([SPEC 3](spec/#3-archiving-a-month)).
- **Statutory periods** were checked on 18 October 2026; recheck before archiving is switched on.
