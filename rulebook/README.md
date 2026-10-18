# Engineering rulebook

The rules every change to Vervoro must keep, for people and for coding agents. Each rule is a short summary of a decision that a record makes, and links to it. **The record wins:** if a rule here and its record disagree, follow the record and fix this page. Nothing here decides anything new.

Load this page with any task. Load the linked record before changing the area it covers. The words used here are defined in the [map and glossary](../guide/).

## 1. When in doubt, stop

1. **Never guess when correctness is uncertain.** A wrong company, an unknown write, an incomplete order read or a broken stock rule stops the work, records what is uncertain and settles it. It never carries on with a best guess. [ADR-001](../database-architecture/#tenancy-inside-a-cell), [ADR-004](../channel-connectors/#retries-and-outcomes), [ADR-008](../inventory-sync/#decision)
2. **Cross-company exposure and corrupted stock are the worst failures.** A sign of cross-company exposure pages the operator and closes the database's egress. A stock difference found by the nightly check alerts the operator and holds raises on the affected listings, while decreases still go. [ADR-001](../database-architecture/#guard-rails), [ADR-006](../stock-ledger/#the-nightly-check-and-checkpoints)

## 2. Companies and databases

3. **One control database and many cells; no schema per company.** Control holds who the companies are and where they live, never business data. A cell holds many companies in shared tables. A dedicated database is a cell with one company, using the same schema and code path. [ADR-001](../database-architecture/#decision)
4. **Every transaction enters exactly one company first.** Its first statement is `app.enter_company`, which raises unless this database holds that company and it is open. An unset company is an error, never zero rows. No autocommit for company work. [ADR-001](../database-architecture/#tenancy-inside-a-cell)
5. **Isolation is enforced by the database, not by remembering a filter.** Every tenant table has `company_id` first in every key, composite foreign keys, and forced row-level security. The runtime role has `NOBYPASSRLS`, and no role is ever created in the Neon console. [ADR-001](../database-architecture/#tenancy-inside-a-cell)
6. **Modules never write `CREATE TABLE`.** They declare tables through `tenantTable()`, and upserts go through `conflict()`. There are no serial or identity columns; ids are uuidv7. [ADR-001](../database-architecture/#declaring-tables)
7. **Only the data layer sets the company.** Module SQL may not contain `set`, `reset`, `set_config` or `app.company_id`, define functions, or use `DO` blocks. Only two tables, `due` and `buyer_ref`, are read across companies, and only through two allow-listed functions that return ids and times. [ADR-001](../database-architecture/#guard-rails)
8. **Every cache key includes the company id, and Hyperdrive query caching stays off.** Logs carry ids, never field values. [ADR-001](../database-architecture/#guard-rails)
9. **A company's database is found through routing, never configured.** `forCompany(id)` reads `company.database_id` from control. Adding a company needs no new database and no deploy; adding a cell does. [ADR-001](../database-architecture/#adding-a-company-adding-a-cell)
10. **No transaction spans two databases.** A write that touches a cell and control writes the company side first, with an outbox note, then control, and is safe to repeat. [ADR-001](../database-architecture/#control-database-and-routing)
11. **Company-level operations use the one slice operation,** under the lifecycle role, in batches: export, move, restore, dedicated placement and erase. [ADR-001](../database-architecture/#company-lifecycle)
12. **Migrations only add, and run on every database before new code goes live.** A migration already merged is never edited. [ADR-000](../system-architecture/#runtime), [ADR-001](../database-architecture/#operations)

## 3. Modules and the foundation

13. **One deployable; every feature is a module.** A module owns its tables and talks to other modules only through their typed ports and events. [ADR-000](../system-architecture/#decision)
14. **Only the foundation changes stock, order status, or the figure a listing should show.** Order import, reservations and the ledger, and the figures for listings are separate responsibilities inside it, and share one transaction where they must. Other modules call its command ports. [ADR-000](../system-architecture/#decision)
15. **Expected failures are typed `Result` values.** No silent catches. [ADR-000](../system-architecture/#decision)
16. **Events are written with the change.** An outbox note goes in the same transaction, is delivered after commit, and is handled once, with a receipt per handler. [ADR-001](../database-architecture/#background-work-and-events)

## 4. Stock

17. **Only a ledger insert changes a balance or a reservation.** The ledger is append-only, and every entry has a reason, an actor and a source. [ADR-006](../stock-ledger/#decision)
18. **Stock never goes below zero and is never quietly set to zero.** Reserved plus held never exceeds on hand. Only sellable ever reaches a listing. [ADR-006](../stock-ledger/#the-four-numbers)
19. **Every stock command takes the company's lock first and carries a key.** A repeat with the same key returns the first answer and moves nothing. [ADR-006](../stock-ledger/#concurrency-and-repeats)
20. **An order reserves when it is imported, in the same transaction.** Each reservation names a batch, never a spot. A bundle reserves its components in whole sets. [ADR-006](../stock-ledger/#reserving-on-order)
21. **Stock leaves only when a shipment is confirmed,** or when the marketplace reports a line shipped outside Vervoro. A cancellation request releases nothing; only a confirmed cancellation does. [ADR-006](../stock-ledger/#deducting-on-dispatch), [ADR-007](../order-ingestion/#decision)
22. **A use-by batch is never reserved, packed or dispatched on or after its date,** by any route, with no override. [ADR-006](../stock-ledger/#decision)

## 5. Marketplaces

23. **Nothing reaches a marketplace or a supplier except through the egress gate.** Every outbound effect is recorded in the transaction with an idempotency key and sent only after commit. [ADR-000](../system-architecture/#talking-to-marketplaces)
24. **Nothing leaves Vervoro during a database transaction.** No marketplace or other outside call runs inside one, so transactions stay short. [ADR-000](../system-architecture/#talking-to-marketplaces), [ADR-001](../database-architecture/#platform-constraints), [ADR-006](../stock-ledger/#concurrency-and-repeats)
25. **A connector only translates.** It has no network access, credentials, clock or database. The host owns credentials, HTTP, retries, rate limits and shared allowances. Core code knows marketplace concepts such as listings, links and FBA, but not marketplace protocols. [ADR-004](../channel-connectors/#decision)
26. **Orders come in by notice.** A notice is a hint: the order is fetched and imported. The scheduled read is only the backup, and only a complete read moves the order watermark. [ADR-004](../channel-connectors/#decision), [ADR-007](../order-ingestion/#decision)
27. **Each marketplace order is imported once,** keyed by account and marketplace order id. A fetch older than the stored one changes nothing. An order that cannot be imported becomes a problem row; it is never dropped. [ADR-007](../order-ingestion/#decision)
28. **Vervoro never sends a cancellation.** The seller cancels on the marketplace, and only a confirmed cancellation releases stock. [ADR-007](../order-ingestion/#decision)
29. **A timeout is `unknown`, not failed.** An unknown write is read back and settled before anything else is sent to that listing. It is never retried blind. [ADR-004](../channel-connectors/#retries-and-outcomes), [ADR-008](../inventory-sync/#decision)
30. **Figures go only to linked listings,** and only the quantity and the offers the seller asks for are ever written. [ADR-005](../catalogue-sync/#decision)
31. **No raise leaves before a complete order read covers the moment it became due.** Near zero, every change is sent; above that, a figure is sent once it is 20 away from what the channel shows. A held raise never holds a decrease. [ADR-008](../inventory-sync/#decision), [ADR-005](../catalogue-sync/#linking)
32. **One writer per listing, one open write at a time, and every write confirmed.** Amazon's `accepted` is not applied. [ADR-008](../inventory-sync/#decision)
33. **Every account starts in shadow,** and returns to shadow after a restore or a reconnect. A restore raises the company's sync epoch, so no earlier write is mistaken for a later one. [ADR-004](../channel-connectors/#decision), [ADR-008](../inventory-sync/#decision)
34. **Tests and development use simulators, never a real marketplace.** No simulator code reaches production. [ADR-000](../system-architecture/#decision)

## 6. People and buyer data

35. **Every request is checked on the server** against the person's role, warehouse scope and status in that company, read in the same transaction as the work. [ADR-010](../users-and-access/#decision)
36. **Operators have no standing access.** They use a grant with a reason and an end time, which the seller sees and can end. [ADR-010](../users-and-access/#decision)
37. **Buyer data comes only from the fetched order,** only the fields ADR-009 allows, encrypted per field under the company's key. It never goes to control, queues, logs, URLs, caches, emails, client storage or the AI provider. [ADR-009](../buyer-data/#decision)
38. **Every view of buyer data is logged.** It is anonymised 30 days after delivery. [ADR-009](../buyer-data/#decision)
39. **No real buyer data outside production.** Tests, fixtures and demos use synthetic buyers. [ADR-009](../buyer-data/#decision)

## 7. Money and countries

40. **Money always carries its currency,** and amounts in different currencies are never added. [ADR-000](../system-architecture/#decision), [ADR-003](../product-model/#product-fields)
41. **Country rules live only where the country matters:** VAT and invoices, Vervoro's billing, food law, and each marketplace's site. A product has a VAT class, and every line stores the country, class and rate it used. [ADR-000](../system-architecture/#decision), [ADR-011](../invoicing-and-vat/#decision)
42. **Nothing that moves orders or stock is ever refused for a billing reason.** [ADR-012](../billing-and-plans/#decision)

## Changing a rule

A rule changes only when its record changes. Amend or replace the record first, with the owner's approval, then update this page in the same change.
