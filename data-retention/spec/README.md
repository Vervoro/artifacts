# ADR-002 SPEC: Data retention and archiving

| | |
| --- | --- |
| **Decision** | [ADR-002: Data retention and archiving](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-002-data-retention-and-archiving) |
| **Date** | 21 October 2026; suppliers and their contacts added to the first row of the schedule (2) by owner ruling, 27 October 2026 ([ADR-015](../../purchasing/)); amended by owner rulings of 25 October 2026: `audit_log` kept 13 months, never archived, a whole table's month deleted in batches (1, 3); and SPEC batch 3: an expired invitation's member-row address (2); Inventory's command keys named as operational state (2), owner ruling, 29 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-002 from: how long a company's data stays in its cell, the archive, and deletion. Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

At launch only the deletions in [section 2](#2-the-retention-schedule) run (`event_log` at 90 days; `audit_log` at 13 months; outbound sends, sync attempts, operational state and delivered outbox notes at 30 days), and buyer anonymisation runs by [ADR-009](../../buyer-data/spec/#8-retention-and-anonymisation). Every other month stays in the cell.

| Later part | Trigger | Rules |
| --- | --- | --- |
| The archiver, the archive bucket and its catalogue, checkpoints, the older-history report, archive files in exports | A cell passes 500 GB, or the start of year 2, whichever comes first | [3](#3-archiving-a-month)–[6](#6-the-company-lifecycle) |
| Deleting archived months, and the 90-day notice before it | The first archived month reaches 7 years after its end | [7](#7-deleting-a-month) |

## 1. Who does what

1. **The archiver** exports, verifies and catalogues a month, and writes the stock checkpoints through Inventory's rules ([ADR-006 SPEC 14](../../stock-ledger/spec/#14-the-nightly-check-and-checkpoints)). It reads through parent tables only, never a partition ([ADR-001 SPEC 10](../../database-architecture/spec/#the-slice-operation)).
2. **The monthly migration run** detaches and drops a month of an archived partitioned table (a whole table's month is deleted by the archiver instead, [section 3](#3-archiving-a-month)), drops a month of `event_log` once its newest row is 90 days old, and a month of `audit_log` once its newest row is 13 months old, as the owner role ([ADR-001 SPEC 12](../../database-architecture/spec/#12-operations)).

## 2. The retention schedule

| Data | In the cell | Archive | Then |
| --- | --- | --- | --- |
| Products, listings, stock levels, open orders and purchase orders, suppliers and their contacts, product–supplier links and reorder levels, settings, users | Always | Never | Deleted with the company |
| Closed orders, their lines, holds and cancellations | 24 months | Until 7 years after the month ends | Deleted |
| Invoices, credit notes, VAT records, export evidence and payments ([ADR-011](../../invoicing-and-vat/)) | 24 months | Until 7 years after the month ends | Deleted |
| Stock ledger entries | 24 months, then a checkpoint | Until 7 years after the month ends | Deleted |
| Batches with no stock left | 24 months after the last movement | Until 7 years after the month ends | Deleted |
| `audit_log` (security and access) | 13 months, by whole months: a month is dropped once its newest row is 13 months old ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables); owner ruling, 25 October 2026) | Never | Dropped; a company's export holds its log, for a seller who must keep it longer |
| `event_log` (module activity) | 90 days, by whole months: a month is dropped once its newest row is 90 days old, so a row stays 90 to about 121 days | Never | Dropped |
| Outbound sends, sync attempts, operational state (including Inventory's `stock_command` keys, [ADR-006 SPEC 12.4](../../stock-ledger/spec/#12-the-lock-keys-and-the-sequence)) | 30 days | Never | Dropped |
| Invitations used, withdrawn or expired ([ADR-010 SPEC 6](../../users-and-access/spec/#6-invitations-sign-up-and-removal)) | 30 days after use, withdrawal or expiry | Never | Deleted, with the address of a member row still invited; `audit_log` keeps the event (owner ruling, 22 October 2026) |
| Outbox notes every handler has received ([ADR-001 SPEC 9](../../database-architecture/spec/#the-outbox)) | 30 days after the last receipt | Never | Deleted (owner ruling, 21 October 2026) |
| Buyer personal data | 30 days after delivery, dispatch as the fallback ([ADR-009 SPEC 8](../../buyer-data/spec/#8-retention-and-anonymisation)) | Only anonymised, except on issued invoices | Deleted with the order or the invoice |

Every period applies while the company exists. A closed company is erased by [ADR-012](../../billing-and-plans/spec/#16-cancellation-export-erasure-and-refunds), archive included.

## 3. Archiving a month

1. **Pick the month** that has just passed 24 months. A month that still holds an open order is not archived: its open orders are shown to the seller and the operator, and the month waits until they close. Later months go ahead.
2. **Checkpoint the stock ledger** for every company in the cell ([ADR-006 SPEC 14](../../stock-ledger/spec/#14-the-nightly-check-and-checkpoints)).
3. **Export the month** per company: one file per table per company, encrypted with the company's data key ([ADR-001 SPEC 10](../../database-architecture/spec/#encryption)).
4. **Verify:** row counts and checksums of each file match the month in the cell, per company and table.
5. **Record** each file in the archive catalogue: company, table, month, object key, row count, checksum.
6. **Remove the month** only when every company's files for that month are verified. A partitioned table (the stock ledger) detaches and drops it, which is instant and rewrites no rows; a whole table (orders, their lines, holds and cancellations, VAT records) has the month deleted in small batches at night, as the lifecycle role, one company at a time through the parent tables, each company's deleted count checked against its catalogue row (owner ruling, 25 October 2026).

A run that stops part way resumes from the catalogue. A month left unverified stays attached; the operator follows [Check an archive month](../../runbooks/check-an-archive-month/).

## 4. Storage

1. One private object-storage bucket per region. Versioning or a 30-day soft delete; a key is never overwritten ([ADR-001 SPEC 10](../../database-architecture/spec/#backups)).
2. Object keys are `company/<company_id>/<table>/<yyyy-mm>.<format>`. No personal data in a key.
3. A compressed columnar format, so a report reads only the columns it needs.

## 5. Reading archived data

1. **Export:** a company's full export includes its archive files, decrypted for that company ([ADR-001 SPEC 10](../../database-architecture/spec/#export)).
2. **Older-history report:** reads the requested months on demand, within a time and size limit, and says it is slower.
3. **Lot trace:** includes archived months ([ADR-006 SPEC 10](../../stock-ledger/spec/#10-lot-trace-and-recalls)).

Nothing else reads the archive.

## 6. The company lifecycle

1. **Erase** deletes the company's archive files and their versioned copies, and destroys its data key ([ADR-001 SPEC 10](../../database-architecture/spec/#erase)).
2. **Move** does not move the archive; the catalogue is keyed by company, not by cell.
3. **Restore** needs no archive restore: archive files never change.
4. **Residency:** the archive bucket is in the company's region, like the rest of its data ([ADR-001 SPEC 8](../../database-architecture/spec/#dedicated-databases-and-residency)).

## 7. Deleting a month

1. A company's files for a month are deleted 7 years after the month ends.
2. The company's owners are told 90 days before, with the month's export. Longer cases ([section 8](#8-constraints)) depend on facts only the seller has.

## 8. Constraints

Checked against GOV.UK and the Companies Act on 18 October 2026.

| Record | Keep for | Source |
| --- | --- | --- |
| VAT records | At least 6 years | [VAT Notice 700/21, 2.4](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021) |
| A limited company's tax records | 6 years from the end of the financial year; longer for a transaction across periods, an asset kept over 6 years, a late return or an open compliance check | [Company and accounting records](https://www.gov.uk/running-a-limited-company/company-and-accounting-records) |
| A sole trader's records | 5 years after the 31 January filing deadline, within the 6 years above | [Self-employed records](https://www.gov.uk/self-employed-records/how-long-to-keep-your-records) |
| A company's accounting records under company law | 3 years from when made for a private company, 6 for a public one | [Companies Act 2006, section 388(4)](https://www.legislation.gov.uk/ukpga/2006/46/section/388) |

## 9. Tests that prove each rule

| Test or check | Where | Proves |
| --- | --- | --- |
| Deletions | CI | `audit_log` months whose newest row is older than 13 months, `event_log` months whose newest row is older than 90 days, and outbound sends, sync attempts, operational state and delivered outbox notes older than 30 days, are gone; an undelivered note and everything else stay |
| Removal waits for verification | CI | A month with one company's file missing or its checksum wrong stays, attached or undeleted |
| Open orders | CI | A month holding an open order stays in the cell and is listed; the next month is archived |
| Resume | CI | An archiver stopped after some companies resumes from the catalogue and writes no file twice |
| Checkpoint | CI | After a ledger month is archived, the nightly check still passes for every company |
| Deletion date | CI | Files are deleted 7 years after the month ends, and the notice goes 90 days before |
| Keys | CI | No object key holds anything but the company id, table and month |
| Everyday paths | CI | Lists, searches, stock figures and sync make no archive read |
| Erase | CI | Erasing a company leaves no archive file or version for it |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Later parts:** no archiver, bucket or catalogue at launch; the deletions run from day one.
- [ ] **Parent tables:** the archiver's reads name parent tables, never a partition.
- [ ] **Removal:** only the monthly migration run detaches, and the archiver's batched delete runs, only after the catalogue query shows every company verified.
- [ ] **Encryption:** each file is encrypted with the company's data key before upload.
- [ ] **Bucket:** versioning or soft delete is on in its configuration; uploads never overwrite.
- [ ] **Checkpoint:** written through Inventory's code under the company's lock, not by the archiver directly.
- [ ] **Reads:** only the export, the older-history report and the lot trace import the archive reader.
- [ ] **Deletion:** the deletion job computes the date from the month, never from a seller setting.
