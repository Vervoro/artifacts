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

## ADR-002: Data retention and archiving

Rules: [ADR-002 SPEC](../data-retention/spec/).

| Procedure | When |
| --- | --- |
| [Check an archive month](check-an-archive-month/) | The monthly run leaves a month attached because a company's archive files are not verified (*Later*) |

## ADR-003: Product model

Rules: [ADR-003 SPEC](../product-model/spec/).

| Procedure | When |
| --- | --- |
| [Change a VAT rate](change-a-vat-rate/) | A law changes a VAT rate or sets a temporary one |

## ADR-004: Channel connectors

Rules: [ADR-004 SPEC](../channel-connectors/spec/).

| Procedure | When |
| --- | --- |
| [Check a marketplace's launch gates](check-a-marketplaces-launch-gates/) | Before the first account on a marketplace goes live, or after a gate fails |
| [Handle a marketplace outage](handle-a-marketplace-outage/) | A marketplace incident alert pages |
| [A shared pool runs low](a-shared-pool-runs-low/) | A shared daily pool nears its limit, or an account's reserve would fall below 50 calls |
| [Repair a notice subscription](repair-a-notice-subscription/) | An account shows "not notified", or orders arrive with no notice |
| [Rotate a marketplace app secret](rotate-a-marketplace-app-secret/) | A marketplace app secret or the Amazon bridge's secret is due, or may have leaked |
| [Replay dead letters](replay-dead-letters/) | The inbound dead-letter queue is not empty |

## ADR-004.1: eBay connector

Rules: [ADR-004.1 SPEC](../ebay-connector/spec/).

| Procedure | When |
| --- | --- |
| [Set up eBay notices](set-up-ebay-notices/) | Once per environment, or if eBay's destination is lost |

## ADR-004.2: Amazon Seller connector

Rules: [ADR-004.2 SPEC](../amazon-seller-connector/spec/).

| Procedure | When |
| --- | --- |
| [Set up the Amazon notice bridge](set-up-the-amazon-notice-bridge/) | Once per environment |

## ADR-005: Catalogue sync and linking

Rules: [ADR-005 SPEC](../catalogue-sync/spec/).

| Procedure | When |
| --- | --- |
| [Link a catalogue at onboarding](link-a-catalogue-at-onboarding/) | A seller has connected an account and is preparing to go live |
| [Settle a held catalogue read](settle-a-held-catalogue-read/) | A read is held because it would mark too many listings missing, or an account has no complete read for 48 hours |

## ADR-006: Stock ledger and reservations

Rules: [ADR-006 SPEC](../stock-ledger/spec/).

| Procedure | When |
| --- | --- |
| [Settle a stock check difference](settle-a-stock-check-difference/) | The nightly stock check pages |
| [A stock change refused as negative](a-stock-change-refused-as-negative/) | A "would go negative" refusal alerts |

## ADR-007: Order ingestion

Rules: [ADR-007 SPEC](../order-ingestion/spec/).

| Procedure | When |
| --- | --- |
| [Order ingestion stalled](order-ingestion-stalled/) | The order watermark of a marketplace's accounts is more than 60 minutes behind |
| [Work the problem-orders list](work-the-problem-orders-list/) | An import problem alerts, or a connector fix ships |
| [Handle a buyer's cancellation request](handle-a-buyers-cancellation-request/) | The cancellation list shows a request; run by the seller's Manager |
| [Settle an order shipped outside Vervoro](settle-an-order-shipped-outside-vervoro/) | An order in the daily digest did not leave the warehouse, or is held "step undone"; run by the seller's Manager |

## ADR-008: Inventory sync

Rules: [ADR-008 SPEC](../inventory-sync/spec/).

| Procedure | When |
| --- | --- |
| [Hold raises or pause an account](hold-raises-or-pause-an-account/) | Figures may be wrong on the way up, or an account must stop sending |
| [Take a company live](take-a-company-live/) | A company leaves shadow for the first time, or a later account goes live |
| [Recover stock sync after a restore](recover-stock-sync-after-a-restore/) | After a full rewind or a whole-cell restore, before any figure is sent |

## ADR-009: Buyer data and privacy

Rules: [ADR-009 SPEC](../buyer-data/spec/). Also: [Erase a company](erase-a-company/), [Export a company](export-a-company/), [Sign-in incident commands](sign-in-incident-commands/).

| Procedure | When |
| --- | --- |
| [Answer a buyer's data request](answer-a-buyers-data-request/) | A buyer asks the seller to see, correct or erase their data |
| [Answer a seller's data request](answer-a-sellers-data-request/) | A seller's user asks Vervoro, as controller, for their own data |
| [Report a personal-data breach](report-a-personal-data-breach/) | Personal data may have been read, changed, lost or sent where it should not be |
| [Anonymise after a connection ends](anonymise-after-a-connection-ends/) | A marketplace connection is disconnected, revoked or ended by a marketplace's notice |
| [Check the anonymisation job](check-the-anonymisation-job/) | The nightly check finds orders past their due time still holding buyer data |
| [Run the quarterly access review](run-the-quarterly-access-review/) | Every quarter: every operator, developer and service account checked |

## ADR-010: Users, roles and access

Rules: [ADR-010 SPEC](../users-and-access/spec/).

| Procedure | When |
| --- | --- |
| [Open an operator grant](open-an-operator-grant/) | The operator needs to see a company's screens to help, or to read its old records at the seller's request |

## ADR-011: Invoicing and VAT

Rules: [ADR-011 SPEC](../invoicing-and-vat/spec/). Also: [Change a VAT rate](change-a-vat-rate/) (ADR-003).

| Procedure | When |
| --- | --- |
| [Correct or credit an issued invoice](correct-or-credit-an-issued-invoice/) | A refund is recorded on an order Vervoro invoiced, or an issued invoice is wrong; run by the seller's Manager |
| [Settle a VAT difference](settle-a-vat-difference/) | A VAT difference from the marketplace flags an order and blocks its invoice; run by the seller's Manager |

## ADR-012: Billing and plans

Rules: [ADR-012 SPEC](../billing-and-plans/spec/). Also: [Erase a company](erase-a-company/), [Export a company](export-a-company/), [Take a company live](take-a-company-live/), [Replay dead letters](replay-dead-letters/).

| Procedure | When |
| --- | --- |
| [Work a failed payment](work-a-failed-payment/) | A billing alert: a bounced notice, a lost dispute, a cancelled mandate, a payment that cannot settle before closing |
| [Close and reopen a company for non-payment](close-and-reopen-a-company/) | A company reaches its closing date, or a closed company pays before erasure |
| [Refund a seller](refund-a-seller/) | A seller was charged by Vervoro's mistake |

## ADR-013: Sign-in

Rules: [ADR-013 SPEC](../sign-in/spec/).

| Procedure | When |
| --- | --- |
| [Sign-in incident commands](sign-in-incident-commands/) | Sessions, passwords or sign-in itself must be stopped in an incident |
| [Rotate the Better Auth secret](rotate-the-better-auth-secret/) | The sign-in Worker or its secret may be compromised, or the yearly rotation is due |
| [Contain a poisoned package](contain-a-poisoned-package/) | A dependency of the app or the sign-in Worker, Better Auth included, is found compromised |
| [Recover a company's last Owner](recover-a-last-owner/) | A company's last Owner has lost every way in |
| [Recover an operator's access](recover-an-operator/) | An operator or Vervoro's owner has lost their passkeys |

## ADR-014: Fulfilment

Rules: [ADR-014 SPEC](../fulfilment/spec/).

| Procedure | When |
| --- | --- |
| [Run a recall](run-a-recall/) | A supplier or an authority recalls a lot; run by the seller's Manager |
