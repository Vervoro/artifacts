# Engineering rulebook

The rules every change to Vervoro must keep, for people and for coding agents. Each rule is a short summary of a decision that a record makes, and links to it. **The record wins:** if a rule here and its record disagree, follow the record and fix this page. Nothing here decides anything new.

Load this page with any task. Load the linked record before changing the area it covers. The words used here are defined in the [map and glossary](../guide/).

**Which record owns which rule.** Each of these rules is stated in full in one place. Every other record links there instead of restating it; a copy that drifts from its owner is fixed to a link.

| Rule | Owner |
| --- | --- |
| Vervoro never sends a cancellation | [ADR-007 decision 7](../order-ingestion/#decision) and [SPEC 12](../order-ingestion/spec/#12-cancellations-and-refunds) |
| Only Inventory writes stock | [ADR-006 decision 1](../stock-ledger/#decision) |
| Only Stock sync writes each listing's figure, worked out after the stock commit | [ADR-008 decision 1](../inventory-sync/#decision) and [SPEC 1](../inventory-sync/spec/#1-the-figure-per-listing) |
| An unknown write is settled before anything else is sent | [ADR-004 SPEC 5: Retries and outcomes](../channel-connectors/spec/#5-retries-and-outcomes) |
| Tenant isolation: the security boundary and defence in depth | [ADR-001 SPEC 1](../database-architecture/spec/#1-tenancy-inside-a-cell) and [SPEC 6](../database-architecture/spec/#6-guard-rails) |
| Authentication (who) and authorization (what) | [ADR-013 decision 3](../sign-in/#decision) for the split; [ADR-010 SPEC 5](../users-and-access/spec/#5-rules-for-every-action) for what Access decides |
| A listing's link: made by a person, versioned, the one valid at purchase decides | [ADR-005 decision 9](../catalogue-sync/#decision) and [SPEC 11](../catalogue-sync/spec/#11-linking) |
| Shadow mode | [ADR-004 SPEC 11: Shadow mode and launch gates](../channel-connectors/spec/#11-shadow-mode-and-launch-gates) |
| The egress gate | [ADR-000 SPEC 7](../system-architecture/spec/#7-the-egress-gate) |
| Schema changes expand, then contract | [ADR-000 SPEC 11](../system-architecture/spec/#11-deploying) |
| How long each kind of company data is kept, the archive, and deletion | [ADR-002 decisions 1–9](../data-retention/#decision) and [SPEC 2](../data-retention/spec/#2-the-retention-schedule) |
| Buyer data: what is kept, where it lives, who sees it | [ADR-009 decisions 2–4](../buyer-data/#decision) and [SPEC 4, 5 and 7](../buyer-data/spec/#4-what-is-kept) |
| Buyer data anonymised 30 days after delivery, and erasure through backups and restores | [ADR-009 SPEC 8](../buyer-data/spec/#8-retention-and-anonymisation) and [SPEC 11](../buyer-data/spec/#11-erasure-backups-and-restores) |
| Who is told of an incident, and when | [ADR-009 SPEC 13](../buyer-data/spec/#13-incidents) |
| Nothing that moves orders or stock is refused for a billing reason | [ADR-012 decision 3](../billing-and-plans/#decision) and [SPEC 3](../billing-and-plans/spec/#3-what-billing-may-refuse) |
| Layered testing, and when a test may change | [ADR-000 SPEC 15](../system-architecture/spec/#15-testing-and-verification) |
| VAT on a sale: one issuer, a VAT record per line from import, what the buyer paid wins, the 1p difference flag | [ADR-011 decisions 2, 5 and 6](../invoicing-and-vat/#decision) and [SPEC 6–8](../invoicing-and-vat/spec/#6-the-vat-record) |
| VAT rounding and splits: per line half up, bundles by cost, delivery following the goods | [ADR-011 SPEC 7](../invoicing-and-vat/spec/#7-working-out-the-vat) |

## 1. When in doubt, stop

1. **Never guess when correctness is uncertain.** A wrong company, an unknown write, an incomplete order read or a broken stock rule stops the work, records what is uncertain and settles it. It never carries on with a best guess. [ADR-001](../database-architecture/spec/#1-tenancy-inside-a-cell), [ADR-004](../channel-connectors/spec/#5-retries-and-outcomes), [ADR-008](../inventory-sync/#decision)
2. **Cross-company exposure and corrupted stock are the worst failures.** A sign of cross-company exposure pages the operator and closes the database's egress. A stock difference found by the nightly check alerts the operator and the company's managers and holds raises on the affected listings, while decreases still go. [ADR-001](../database-architecture/spec/#6-guard-rails), [ADR-006](../stock-ledger/spec/#14-the-nightly-check-and-checkpoints)

## 2. Companies and databases

3. **One control database and many cells; no schema per company.** Control holds the platform's own data (companies and where they live, logins and Better Auth's sign-in tables, operators, plans, quotas, the erasure register), never company business data. A cell holds many companies in shared tables. A dedicated database is a cell with one company, using the same schema and code path. [ADR-001](../database-architecture/#decision)
4. **Every transaction enters exactly one company first.** Its first statement is `app.enter_company`, which raises unless this database holds that company and it is open. An unset company is an error, never zero rows. No autocommit for company work. [ADR-001](../database-architecture/spec/#1-tenancy-inside-a-cell)
5. **Isolation is enforced by the database, not by remembering a filter.** This rule, rule 4, rule 7's commit check and rule 9's routing are the security boundary; rule 6 is defence in depth. Every tenant table has `company_id` first in every key, composite foreign keys, and forced row-level security. The runtime role logs in as itself with `NOBYPASSRLS`, and no role is ever created in the Neon console. [ADR-001](../database-architecture/spec/#1-tenancy-inside-a-cell)
6. **Modules never write SQL.** They declare tables through `tenantTable()` and query through the typed query builder the data layer gives them, which has no raw-SQL helper and calls only allow-listed functions; upserts go through `conflict()`. Raw SQL lives only in the kernel's data layer and in migrations. A query the builder cannot express gets a reviewed view or builder extension, never raw SQL. There are no serial or identity columns; ids are uuidv7. [ADR-001](../database-architecture/spec/#5-declaring-tables)
7. **Only the data layer sets the company.** Module queries cannot set or read the company setting, control transactions or change the schema, and the data layer checks the company is unchanged before every commit. That commit check is part of the boundary, because any SQL inside a transaction could change the company setting, which row-level security does not fence. Only two tables, `due` and `buyer_ref`, are read across companies, and only through two allow-listed functions that return ids and times. [ADR-001](../database-architecture/spec/#6-guard-rails)
8. **Every cache key includes the company id, and Hyperdrive query caching stays off.** Logs carry ids, never field values, and invocation logs are off. Queue messages, Durable Objects and live updates carry ids and statuses only, in the EU jurisdiction. No Worker binds a key-value store, SQL database or analytics store. [ADR-001](../database-architecture/spec/#6-guard-rails), [ADR-000](../system-architecture/spec/#10-runtime)
9. **A company's database is found through routing, never configured.** `forCompany(id)` reads `company.database_id` from control. Adding a company needs no new database and no deploy; adding a cell does. [ADR-001](../database-architecture/spec/#8-adding-companies-and-databases)
10. **No transaction spans two databases.** A write that touches a cell and control writes the company side first, with an outbox note, then control, and is safe to repeat. [ADR-001](../database-architecture/spec/#7-control-database-and-routing)
11. **Company-level operations use the one slice operation,** under the lifecycle role, in batches: export, move, restore, dedicated placement and erase. [ADR-001](../database-architecture/spec/#10-company-lifecycle)
12. **Schema changes expand, then contract, and run on every database before new code goes live.** A change first adds in a backward-compatible form; code that understands both shapes deploys; the data is moved; after the rollback window, a later release removes the old shape. A destructive change never ships in the same release that first depends on the new schema. A migration already merged is never edited. [ADR-000](../system-architecture/spec/#11-deploying), [ADR-001](../database-architecture/spec/#12-operations)

## 3. Modules and the foundation

13. **One main application deployable, plus the separate sign-in Worker; every feature is a module.** The sign-in Worker is kept apart on purpose ([ADR-013](../sign-in/#decision)). A module owns its tables and talks to other modules only through their typed ports and events. [ADR-000](../system-architecture/#decision)
14. **Only Inventory changes stock, only Orders changes order status, and only Stock sync works out the figure a listing should show.** The foundation is six always-on core modules, each the only writer of its own data; Listings alone changes links. They share one transaction where they must. Stock sync works out a listing's figure from each committed stock change, through the outbox, and never replaces a newer figure with an older one ([ADR-008](../inventory-sync/spec/#1-the-figure-per-listing) owns this). Other modules call their ports, and calls always point toward the core. [ADR-000](../system-architecture/#decision), [SPEC 4](../system-architecture/spec/#4-the-foundation-and-the-launch-modules)
15. **Expected failures are typed `Result` values.** No silent catches. [ADR-000](../system-architecture/#decision)
16. **Events are written with the change.** An outbox note goes in the same transaction, is delivered after commit, and is handled once, with a receipt per handler. [ADR-001](../database-architecture/spec/#9-background-work-and-the-outbox)

## 4. Stock

17. **Only a ledger insert changes a balance or a reservation.** The ledger is append-only, and every entry has a reason, an actor and a source. [ADR-006](../stock-ledger/#decision)
18. **Stock never goes below zero and is never quietly set to zero.** Reserved plus held never exceeds on hand. Only sellable ever reaches a listing. [ADR-006](../stock-ledger/spec/#3-the-four-numbers)
19. **Every stock command takes the company's lock first and carries a key.** A repeat with the same key returns the first answer and moves nothing. [ADR-006](../stock-ledger/spec/#12-the-lock-keys-and-the-sequence)
20. **An order reserves when it is imported, in the same transaction.** Each reservation names a batch, never a spot. A bundle reserves its components in whole sets. [ADR-006](../stock-ledger/spec/#53-reserving-an-order-line)
21. **Stock leaves only when a shipment is confirmed,** or when the marketplace reports a line shipped outside Vervoro. A cancellation request releases nothing; only a confirmed cancellation does. [ADR-014](../fulfilment/#decision), [ADR-006](../stock-ledger/spec/#7-ports-fulfilment-and-orders-call), [ADR-007](../order-ingestion/#decision)
22. **A use-by batch is never reserved, packed or dispatched on or after its date,** by any route, with no override. [ADR-006](../stock-ledger/#decision)
23. **Every quantity is a whole number of base units of one product,** and weights and sizes are stored in whole grams and millimetres. Other units are converted only on entry and display. [ADR-003 SPEC 2.1](../product-model/spec/#21-numbers-and-money), [SPEC 15](../product-model/spec/#15-units-of-measure)
24. **A charge that is not stock is a charge line, never a product.** It never reserves or moves stock; a marketplace listing that is not stock is marked so, never linked. [ADR-003 SPEC 1.1](../product-model/spec/#11-charge-lines-and-listings-that-are-not-stock)

## 5. Marketplaces

25. **Nothing reaches a marketplace or a supplier except through the egress gate.** Every outbound effect is recorded in the transaction with an idempotency key and sent only after commit. [ADR-000](../system-architecture/spec/#7-the-egress-gate)
26. **Nothing leaves Vervoro during a database transaction.** No marketplace or other outside call runs inside one, so a company's lock is held only for database work, and Postgres's transaction timeout ends a transaction that runs too long. [ADR-000](../system-architecture/spec/#10-runtime), [ADR-001](../database-architecture/spec/#13-platform-constraints), [ADR-006](../stock-ledger/spec/#12-the-lock-keys-and-the-sequence)
27. **A connector only translates.** It has no network access, credentials, clock or database. Channels, the host, owns credentials, HTTP, retries, rate limits, shared allowances, notice checks and the sending half of the egress gate. Core code knows marketplace concepts such as listings, links and FBA, but not marketplace protocols. [ADR-004](../channel-connectors/#decision)
28. **Orders come in by notice.** A notice is a hint: the order is fetched and imported. The scheduled read is only the backup, and only a complete read moves the order watermark. Amazon's notices reach the same path through an AWS bridge. [ADR-004](../channel-connectors/#decision), [ADR-007](../order-ingestion/#decision)
29. **Each marketplace order is imported once,** keyed by account and marketplace order id. A fetch older than the stored one changes nothing. An order that cannot be imported becomes a problem row; it is never dropped. [ADR-007](../order-ingestion/spec/#3-one-order-per-marketplace-order)
30. **Vervoro never sends a cancellation.** The seller cancels on the marketplace, and only a confirmed cancellation releases stock. [ADR-007](../order-ingestion/spec/#12-cancellations-and-refunds)
31. **A timeout is `unknown`, not failed.** An unknown write is settled before anything else is sent to that listing. Read-back is the default; a connector may instead send again the absolute figure Vervoro wants now only when the write sets a value (never adds to one), repeating it cannot compound, and its record names the exception (eBay's Trading API). [ADR-004](../channel-connectors/spec/#5-retries-and-outcomes), [ADR-004.1](../ebay-connector/spec/#4-listings-and-stock)
32. **Figures go only to linked listings,** and only the quantity and the offers the seller asks for are ever written. [ADR-005](../catalogue-sync/#decision)
33. **No raise leaves before a complete order read covers the moment it became due.** A raise also waits two minutes for clocks. Near zero, every change is sent; above that, a figure is sent once it is 20 away from what the channel shows, only where a channel's own sales are known to come out of Vervoro's figure; everywhere else every change is sent. A held raise never holds a decrease. [ADR-008](../inventory-sync/#decision), [ADR-005 SPEC 11.3](../catalogue-sync/spec/#113-bulk-accept)
34. **One writer per listing, one open write at a time, and every write confirmed.** Amazon's `accepted` is not applied. [ADR-008](../inventory-sync/#decision)
35. **Every account starts in shadow,** and returns to shadow after a restore or a reconnect. No account on a marketplace goes live until shadow there passes its launch gates (lost notices, detection delay, unreserved orders). A restore raises the company's sync epoch, so no earlier write is mistaken for a later one. [ADR-004](../channel-connectors/spec/#11-shadow-mode-and-launch-gates), [ADR-008](../inventory-sync/#decision)
36. **Testing is layered, and development uses simulators, never a real marketplace.** Pure logic runs as fast unit tests with no database; the database, row-level security, locking, routing and triggers run on real Postgres; marketplace behaviour runs on the simulators; critical flows run end to end. No simulator code reaches production. A test that protects accepted behaviour is removed or weakened only together with an accepted change to that behaviour or its SPEC. [ADR-000 SPEC 15](../system-architecture/spec/#15-testing-and-verification)

## 6. People and buyer data

37. **Every request is checked on the server** against the person's role, warehouse scope and status in that company, read in the same transaction as the work. [ADR-010 SPEC 5](../users-and-access/spec/#5-rules-for-every-action)
38. **Operators have no standing access.** They use a grant with a reason and an end time, which the seller sees and can end. [ADR-010 SPEC 7](../users-and-access/spec/#7-operator-access-to-a-company)
39. **Sign-in is Better Auth inside the sign-in Worker, and nothing else.** Only the sign-in Worker runs Better Auth, holds its secret, shows a password field and touches the `auth` and `auth_policy` schemas; no other code queries or writes Better Auth's tables. Nobody writes passkey, authenticator-code, password-hashing or session code beside it, forks it or patches it. The app asks the sign-in Worker whether a session is live and never records a fresh check itself; its pages and calls are a closed list. [ADR-013 SPEC 8](../sign-in/spec/#8-the-sign-in-worker)
40. **Better Auth says who; ADR-010 says what.** The sign-in Worker hands the app a login id and the session's facts; companies, roles, scope, permissions and operator grants are decided only by Access. Better Auth's organisation and access features stay off. [ADR-013](../sign-in/#decision), [ADR-010 SPEC 5](../users-and-access/spec/#5-rules-for-every-action)
41. **A passkey, or a password with its second factor; never a password alone.** Passkeys are the default and need the fingerprint, face or PIN check. Only the methods ADR-013 names are switched on. Better Auth and its plugins are exact-pinned and upgraded only through a reviewed, committed schema migration and the sign-in tests, never at start-up; no agent changes its setup or schema without the record. [ADR-013 SPEC 1](../sign-in/spec/#1-better-auth-and-what-is-switched-on), [SPEC 13](../sign-in/spec/#13-upgrades-and-migrations)
42. **Buyer data comes only from the fetched order,** only the fields ADR-009 allows, encrypted per field under the company's key. It never goes to control, queues, logs, URLs, caches, emails, client storage or the AI provider. [ADR-009](../buyer-data/#decision), [SPEC 4](../buyer-data/spec/#4-what-is-kept) and [SPEC 5](../buyer-data/spec/#5-where-it-lives)
43. **Every view of buyer data is logged.** It is anonymised 30 days after delivery, dispatch as the fallback. [ADR-009](../buyer-data/#decision), [SPEC 7](../buyer-data/spec/#7-who-can-see-it) and [SPEC 8](../buyer-data/spec/#8-retention-and-anonymisation)
44. **No real buyer data outside production.** Tests, fixtures and demos use synthetic buyers. [ADR-009](../buyer-data/#decision), [SPEC 15](../buyer-data/spec/#15-no-real-buyer-data-outside-production)

## 7. Money and countries

45. **Money always carries its currency,** and amounts in different currencies are never added. [ADR-000](../system-architecture/spec/#14-money-and-countries), [ADR-003](../product-model/spec/#21-numbers-and-money)
46. **Country rules live only where the country matters:** VAT and invoices, Vervoro's billing, food law, and each marketplace's site. A product has a VAT class, and every line stores the country, class and rate it used. [ADR-000](../system-architecture/spec/#14-money-and-countries), [ADR-011 SPEC 6](../invoicing-and-vat/spec/#6-the-vat-record)
47. **Nothing that moves orders or stock is ever refused for a billing reason.** A plan refuses only switching on a module it does not include. [ADR-012 decision 3](../billing-and-plans/#decision), [SPEC 3](../billing-and-plans/spec/#3-what-billing-may-refuse)

## Changing a rule

A rule changes only when its record changes. Amend or replace the record first, with the owner's approval, then update this page in the same change.
