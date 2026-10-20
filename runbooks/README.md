# Runbooks

The operator's procedures, one page each, with numbered steps. Each page says who runs it, which role or credential it uses, how to verify it, and what to do if it stops halfway. A runbook carries out a record; it decides nothing. Where a runbook and its record disagree, the record wins.

## ADR-000: System architecture

Rules: [ADR-000 SPEC](../system-architecture/spec/).

| Procedure | When |
| --- | --- |
| [Deploy and roll back](deploy-and-roll-back/) | New code or migrations go out, or a release must be undone |

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

## ADR-010: Users, roles and access

Rules: [ADR-010 SPEC](../users-and-access/spec/).

| Procedure | When |
| --- | --- |
| [Open an operator grant](open-an-operator-grant/) | The operator needs to see a company's screens to help, or to read its old records at the seller's request |

## ADR-013: Sign-in

Rules: [ADR-013 SPEC](../sign-in/spec/).

| Procedure | When |
| --- | --- |
| [Sign-in incident commands](sign-in-incident-commands/) | Sessions, passwords or sign-in itself must be stopped in an incident |
| [Rotate the sign-in key](rotate-the-sign-in-key/) | The sign-in Worker may be compromised, or the yearly rotation is due |
| [Rotate the email-hash key](rotate-the-email-hash-key/) | The email-hash key may have leaked (*Later* as a job) |
| [Contain a poisoned package](contain-a-poisoned-package/) | A dependency of the app or the sign-in Worker is found compromised |
| [Recover a company's last Owner](recover-a-last-owner/) | A company's last Owner has lost every way in |
| [Recover an operator's access](recover-an-operator/) | An operator or Vervoro's owner has lost their passkeys |
