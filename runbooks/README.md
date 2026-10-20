# Runbooks

The operator's procedures, one page each, with numbered steps. Each page says who runs it, which role or credential it uses, how to verify it, and what to do if it stops halfway. A runbook carries out a record; it decides nothing. Where a runbook and its record disagree, the record wins.

## ADR-001: Multi-tenant database architecture

Rules: [ADR-001 SPEC](../database-architecture/spec/).

| Procedure | When |
| --- | --- |
| [Add a cell](add-a-cell/) | The system recommends a new cell, or a trial cell (*Later*) |
| [Add a dedicated database](add-a-dedicated-database/) | An enterprise customer needs a database of its own (*Later*) |
| [Move a company](move-a-company/) | Rebalancing, dedicated placement, or a paying trial leaving a trial cell (*Later*) |
| [Export a company](export-a-company/) | The seller asks for their data |
| [Erase a company](erase-a-company/) | A privacy request, or 30 days after the company closes |
| [Restore a company: look back](restore-a-company-look-back/) | A seller made a mistake, such as one bad bulk edit |
| [Restore a company: full rewind](restore-a-company-full-rewind/) | A company's data is corrupt |
| [Restore a whole cell](restore-a-whole-cell/) | A cell is lost |
| [Drills](drills/) | Weekly, monthly and nightly, unattended |
| [Use the owner role](use-the-owner-role/) | An emergency that no other role can fix |
