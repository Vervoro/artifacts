# ADR-002: Data retention and archiving

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026 |
| **Scope** | How long each kind of data stays in a cell, where older data goes, and when it is deleted |
| **Builds on** | [ADR-001: Multi-tenant database architecture](../database-architecture/) |

## Context

Each cell ([ADR-001](../database-architecture/)) holds many companies in shared tables. Order and stock history only grows. A company at 1,000 orders a day adds about 150 MB a month, about 1.8 GB a year, so a cell of 300 such companies grows about 540 GB a year and reaches 1.5–2 TB after three years.

Storage itself is cheap and has no hard cap. What degrades with old data is everything else:

- **Speed:** indexes outgrow memory, so everyday queries slow down although almost nobody reads data older than two years.
- **Company operations:** the slice copy that moves, exports or restores a company takes longer the more history the company has.
- **Housekeeping:** vacuum, index maintenance and every database branch carry the full history.

Two rules limit what can be deleted:

- **Accounting records** (invoices, payments, the orders behind them) must be kept for the statutory period, about 6 years in the UK. To be confirmed with an accountant.
- **Buyer personal data** is anonymised 30 days after delivery, or after dispatch when no delivery date is known ([ADR-009](../buyer-data/)), so old order history holds almost no personal data. Issued VAT invoices keep the buyer details the law requires.

## Decision

1. **Hot data stays in the cell for 24 months:** orders, stock movements and logs from the last 24 months. That covers year-on-year reports.
2. **Current state is never archived:** products, listings, stock levels, open orders, open purchase orders, settings and users.
3. **Older months move to an archive in object storage,** as compressed files per company per month, then leave the cell.
4. **The archive is kept for the statutory period** (6 years from the end of the financial year), then deleted per company.
5. **Archived data is read only on request:** through an export or an "older history" report, never by everyday screens.
6. **Archiving is switched on by a trigger,** not at launch: when a cell passes 500 GB, or at the start of year 2, whichever comes first.

## How data moves to the archive

The large append-only tables are already partitioned by month with `company_id` leading every index (ADR-001), so archiving works on whole months:

1. **Pick the month** that has just passed 24 months.
2. **Checkpoint the stock ledger** (below) for every company in the cell.
3. **Export the month's partition** per company to object storage as compressed files: one file per table per company per month. Each file is encrypted with that company's data key.
4. **Verify:** row counts and checksums of the files match the partition, per company and table.
5. **Record the month** in an archive catalogue: company, table, month, object key, row count, checksum.
6. **Detach and drop the partition.** Detaching is instant and rewrites no rows.

A month is archived for the whole cell at once, because partitions are shared by every company in it. A run that stops part way resumes from the archive catalogue; a partition is dropped only after every company's files are verified.

## Stock ledger checkpoints

Every stock balance must equal the sum of its ledger entries, and a nightly check proves it. Old entries cannot simply leave.

- Before a ledger month is archived, the archiver writes one **opening-balance entry** per company, product, batch and spot, dated the first day of the next month, equal to the sum of all entries up to then.
- The nightly check then sums from the latest checkpoint, and still proves balances equal entries.
- The archived entries stay available for traceability (where a batch went) through the archive.

## What is archived, and for how long

| Data | In the cell | Archive | Then |
| --- | --- | --- | --- |
| Products, listings, stock levels, open orders and purchase orders, settings, users | Always | Never | Deleted with the company |
| Closed orders and their lines | 24 months | Until 6 years after the financial year ends | Deleted |
| Invoices and payments | 24 months | Until 6 years after the financial year ends | Deleted |
| Stock ledger entries | 24 months, then a checkpoint | Until 6 years after the financial year ends | Deleted |
| Batches with no stock left | 24 months after the last movement | Until 6 years after the financial year ends | Deleted |
| `audit_log` (security and access) | At least 1 year | 6 years | Deleted |
| `event_log` (module activity) | 90 days | Never | Dropped |
| Outbound sends, sync attempts, operational state | 30 days | Never | Dropped |
| Buyer personal data | 30 days after delivery (or dispatch when no delivery date is known), then anonymised | Archived only anonymised, except on issued invoices | Deleted with the order, or with the invoice |

## Reading archived data

- **Export:** a company's full export includes its archive files, decrypted for that company.
- **Older-history report:** reads the requested months from the archive on demand, within a time and size limit, and shows that it is slower.
- **Never in everyday screens:** lists, searches, stock figures and marketplace sync use the cell only.

## Archive and the company lifecycle

- **Erase:** the company's archive files are deleted with the company, and destroying the company's data key makes any remaining copy (in backups or object-storage versions) unreadable.
- **Move:** moving a company between cells does not move its archive; the archive catalogue is keyed by company, not by cell.
- **Restore one company:** restores the cell data as in ADR-001; archive files are immutable, so they need no restore.
- **Dedicated databases and residency:** the archive bucket follows the company's region, like the rest of its data.

## Storage

- One object-storage bucket per region, private, with versioning or a 30-day soft delete, and keys never overwritten.
- Object keys: `company/<company_id>/<table>/<yyyy-mm>.<format>`; no personal data in keys.
- A compressed columnar format for the files, so an older-history report can read only the columns it needs.

## Consequences

**What this gives us**

- A cell's size is bounded by about 24 months of activity, so speed, moves, restores and housekeeping stay predictable as the platform ages.
- Statutory records are kept for as long as required and deleted when that ends.
- Erasure still reaches everything, through per-company files and per-company keys.

**What it costs**

- A second store to run: the archive bucket, its catalogue and the archiver job.
- History older than 24 months is slower to read and is not in everyday screens.
- The stock ledger gains checkpoint entries, and the nightly check sums from the latest one.
- Archiving runs per cell and must finish for every company before a partition is dropped.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep everything in the cell | Simple, but speed, moves, restores and housekeeping degrade every year |
| Delete after 3 years | Breaks the statutory retention of accounting records |
| A separate archive database | Still a database to run, size and back up; object storage is cheaper and immutable |
| Archive at launch | Not needed until a cell is large; the trigger avoids running a second store before it pays off |
