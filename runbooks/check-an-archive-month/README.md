# Runbook: Check an archive month

| | |
| --- | --- |
| **Built** | *Later*, with archiving ([ADR-002 SPEC 0](../../data-retention/spec/#0-at-launch-and-later)) |
| **Record** | [ADR-002](../../data-retention/), rules in [SPEC 3](../../data-retention/spec/#3-archiving-a-month) |
| **Who runs it** | The operator, when the monthly run leaves a month attached because some company's archive files are not verified |
| **Role or credential** | The operator console. The archive catalogue shows company ids, tables, row counts and checksums, never row contents, and needs no grant |

A month that stays in the cell costs nothing but space. Never detach, drop or delete a month by hand: once every company is verified, the monthly migration run detaches a partitioned table's month and the archiver deletes a whole table's month in batches.

## Steps

1. Open the alert: the cell, the month, and the companies and tables not verified.
2. For each, read the catalogue entry: a missing file, a row count that differs, or a checksum that differs.
3. **If a slice operation** (move, restore or erase) ran on that company during the run, it changed rows under the archiver. Wait for it to finish.
4. Start the archiver again for the month. It resumes from the catalogue and redoes only the companies and tables not verified.
5. **The same company fails twice:** stop. Record it as an incident with the catalogue entries, and leave the month attached until it is fixed.
6. Check that the month's stock checkpoints exist for every company in the cell ([ADR-006 SPEC 14](../../stock-ledger/spec/#14-the-nightly-check-and-checkpoints)). A missing one is an archiver fault: treat it as step 5.

## Verify

- The catalogue shows every company in the cell verified for that month, for every table.
- The month leaves the cell (the next monthly run detaches a partitioned table's month; the archiver deletes a whole table's), and the next nightly stock check passes.

## If it stops halfway

Nothing is lost: the partition stays attached until every company is verified, and the archiver resumes from the catalogue. Run the steps again from step 1.
