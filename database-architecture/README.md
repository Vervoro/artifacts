# ADR-001: Multi-tenant database architecture

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026 |
| **Scope** | How Vervoro stores, isolates, routes and moves each company's data |

## Context

Vervoro is an operations system for marketplace sellers: stock, orders and listings synced with Amazon, eBay, Shopify and other channels. Every customer is a company, and one company must never see another company's data. The design has to meet these requirements:

- **Isolation is the top risk.** Cross-company exposure is the worst failure the product can have, so it must be prevented by the database and by the build, not by developer care.
- **Growth:** about 100 companies in the first year, 500 to 1,000 within three years. A typical company has 100 to 5,000 SKUs, 100 to 2,000 orders a day and 1 to 5 connected marketplaces.
- **One operator** runs the platform, so the number of moving parts must not grow with the number of companies.
- **Enterprise customers** may need a database of their own, and later a region of their own.
- **Free trials** (14 to 28 days) must never affect paying customers, and a trial that pays must become a normal customer without starting over.
- **Lifecycle promises:** export a company, restore one company after a mistake, move a company, and erase a company provably.
- **Platform:** Postgres on Neon, reached from Cloudflare Workers through Hyperdrive, in the EU.

## Decision

1. **A control database** holds only who the companies are and where they live. It stores no business data.
2. **Customer databases ("cells")** hold the business data of many companies in **shared tables**. Every row carries `company_id`, and Postgres enforces **forced row-level security** on every table.
3. **A dedicated database** for an enterprise customer is a cell with the same schema holding one company.
4. **A trial database** on its own compute holds every company from sign-up until it pays. A paying company is moved into a paid cell.
5. **Every company-level operation** (export, move, restore, erase, placement) is one generated operation over the rows where `company_id` matches.
6. **Guard rails in the runtime and in CI** make a cross-company read or write impossible to write by accident.

## Architecture

<!-- DIAGRAM -->

Every request names one company. The router looks up which database holds that company and opens a transaction there that is fixed to that one company. The control database only knows where each company lives. Every business row sits in a cell, in tables shared by many companies and fenced by `company_id` and row-level security.

## Tenancy inside a cell

Every business table exists once per cell and carries `company_id`. Postgres itself refuses any row of another company, and the keys make a cross-company reference impossible even with security switched off.

1. **Keys.** `company_id` (uuid) is the first column of every primary key, unique key, foreign key and index. Foreign keys are composite, `(company_id, x)`, so a row cannot point at another company's row. Every table also has `company_id → tenant(id) ON DELETE CASCADE`.
2. **Row-level security, forced.** Every table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and one policy with both `USING` and `WITH CHECK`: `company_id = app.company()`.
3. **Fail loud.** `app.company()` returns `nullif(current_setting('app.company_id', true), '')::uuid` and raises an error when it is null. An unset company is an error, never zero rows: a silent empty stock read could push 0 to a marketplace and delist a seller. The `company_id` column default reads the same function, so an insert without a company also errors.
4. **Function label.** `app.company()` is `STABLE` and `PARALLEL SAFE`, never `SECURITY DEFINER`. Postgres then evaluates it once per statement and uses the `company_id` index.
5. **Roles.** An owner role runs migrations. The runtime role is not the owner and has `NOBYPASSRLS`. No runtime role has `BYPASSRLS`, operator and background code included.
6. **Setting the company.** The data layer sends `set_config('app.company_id', $1, true)` as the first statement of every transaction and refuses autocommit for company work. The setting lasts only for that transaction, which keeps it safe behind a transaction-mode pooler.

## Declaring tables

Modules never write `CREATE TABLE`. They declare tables through `tenantTable()`, and the data layer generates everything tenancy needs.

| Who | Writes |
| --- | --- |
| The module | Columns, its own key columns, foreign keys by its own columns, checks, indexes, and field tags: `pii`, `secret`, `retention` |
| The data layer | `company_id` and its default, composite primary, unique and foreign keys, the cascade to `tenant`, `ENABLE` + `FORCE` RLS and the policy, grants, the table's entry in the company-slice manifest, anonymisation hooks |

- **Field tags** drive buyer anonymisation, a buyer's right to be forgotten, AI masking and export redaction from one declaration.
- **Upserts** go through a `conflict('id')` helper that emits `ON CONFLICT (company_id, id)`.
- **IDs** are uuidv7. There are no `serial` or identity columns, so nothing is numbered across companies and an ID never says which database a company lives in.
- **Human numbers and ordering** (PO-0001, an outbox sequence) come from a counter table keyed `(company_id, name)`, taken in the writer's transaction. Counters travel with the company when it moves.
- **Marketplace cursors and watermarks** are keyed `(company_id, account)`; idempotency keys are unique per `(company_id, key)`.
- **Logs:** one table per retention class, partitioned by month so retention is a partition drop: `audit_log` (security and access, kept at least a year for live companies) and `event_log` (module activity, 90 days). Direct access to partitions is revoked, because a query naming a partition skips the parent's policy.
- **Operational state** (rate buckets, leases, nonces, staging) lives in per-cell tables keyed by `company_id`, like everything else.
- **Secrets:** one table, `secrets(company_id, purpose)`.

## Guard rails

Only the data layer may say which company a transaction belongs to, and four checks make sure nothing else can.

- **Statement filter (runtime).** The data layer refuses any module statement containing `set`, `reset`, `set_config` or the name `app.company_id`. Module-defined functions and `DO` blocks are not allowed, since they would get round the filter. Postgres cannot revoke `set_config` on a custom setting, so this has to be application code.
- **Catalogue lint (CI).** Fails the build if any cell table lacks `company_id NOT NULL` leading its primary key, forced RLS, both policy clauses or composite foreign keys. It also fails on raw `CREATE TABLE`, `serial` or identity columns, `SECURITY DEFINER`, views without `security_invoker`, materialized views, direct grants on partitions, `TRUNCATE` grants, `ON CONFLICT` without `company_id`, session-level `SET`, a runtime role with `BYPASSRLS`, and `app.company()` not labelled `STABLE`.
- **Request guard.** Authentication puts the signed-in company in request context; `forCompany(id)` throws when `id` differs. Operator and background code opt in explicitly, and opting in never bypasses RLS: every company read or write still runs in a transaction fixed to exactly one company.
- **How background jobs find work.** Through one non-tenant table per cell, `due(company_id, kind, next_due_at)`, holding ids and timestamps only. A sweeper reads it with one indexed query, then opens one transaction per due company.

## Control database and routing

The control database is its own database, so a cell credential can never read the login directory.

**What control holds, and nothing else:**

- the company registry: plan, status, subscription, tombstones
- the database registry: `database(id, region, kind shared|dedicated|trial, state open|closed|draining, cap)`, with `company.database_id`
- the login directory and the external directory (marketplace seller id → company)
- operator accounts and grants, platform settings, the migration ledger per database
- shared marketplace call quotas, usage rollups, alerts

**Emails in control** are stored only as HMAC(normalised email), keyed by a secret held outside Postgres. The address itself lives only in the company's own users table, so a leak of control is not a leak of customer data.

**Routing.** `forCompany(id)` looks the company's database up in the registry (cached) and uses that database's connection pool. A new company goes to the open trial database; a paying company to the open shared cell with the most room, or to a dedicated database. Adding a database is one command (`db:add`) that creates it, sets up roles, migrates and registers it. The system recommends a new database; the operator decides.

**Writes that cross databases** (sign-up, adding a user, closing a company) write the company side first, then control, are idempotent, and are repaired from an outbox if the second write fails. No transaction spans two databases.

## Company lifecycle

One operation, generated from the catalogue, does every company-level job: copy or delete every row where `company_id = X`, in foreign-key order. Export, move, restore, dedicated placement and erase all use it, and CI runs it on every build: copy company A from database 1 to database 2, compare row counts and checksums per table, delete A, then confirm every table counts 0 for A.

**Erase.** Delete the tenant row; the cascade removes the rest. Erase is done when all four hold, recorded in an erase ledger:

1. the transaction committed
2. a generated count over every table is 0 for the company
3. the company's data key is destroyed
4. `VACUUM` ran on the touched tables within 24 hours

The cascade also deletes the company's `audit_log`, so the one-year retention applies to live companies only.

**Backups.** 7 days of point-in-time recovery plus nightly encrypted snapshots kept 30 days. Erasure is complete in backups at day 30.

**Encryption.** Credentials and buyer contact fields (name, address, phone, email, notes) are encrypted under a per-company data key in `secrets(company_id, purpose)`, wrapped by a key-encryption key held as a platform secret. `company_id` is bound in as associated data, so a row read under the wrong company fails to decrypt. Exact-match blind indexes exist only for email and phone. The wrapped keys stay in the database: making erasure instant in backups would need a second, never-backed-up key store whose loss makes data unreadable for good, which is not worth it while backups expire after 30 days.

**Restore one company:**

1. Pause the company's outbound marketplace calls and revoke its sessions.
2. Branch the database at the restore time.
3. Replace the live slice with the branch's slice in one transaction.
4. Rebuild the company's directory rows in control; set counters to at least their live values, so numbers already sent to suppliers are not reused.
5. Mark restored outbound sends `unknown`, never resend them; bring every marketplace account back in shadow mode.
6. Re-read the marketplaces and reconcile; the operator signs off the differences before any stock push resumes, because pushing restored stock straight away would oversell.
7. Files in object storage have no point-in-time copy: keep versioning or a 30-day soft delete, and never overwrite a file key.

**Move a company** to another database: pause its sync, copy the slice, compare checksums, switch the registry row, delete the source slice. Logical replication is kept for very large companies later.

## Dedicated databases and residency

A dedicated database is a database row with `kind = dedicated` and a cap of 1: the same schema, RLS still on, the same code path, placed by the same slice operation.

- **Inside the UK and EU,** the database alone is enough, as long as Workers stay placed in the EU and Hyperdrive caching stays off.
- **Outside the EU,** a dedicated database needs a whole cell: its own Worker placement, Hyperdrive configuration, object-storage bucket, Durable Object jurisdiction, logs and backup location.

## Trial database

Every new company starts in a trial database on its own compute, so trials can never slow down or reach paying customers. When a company pays, the slice operation moves it into a paid cell.

- **Its own compute, not just its own database.** Databases on one Neon compute share its CPU, memory and connections, so a burst of trial imports would still slow paying customers. The trial database gets its own Neon compute and its own Hyperdrive configuration. It runs the same schema, RLS and code path as every other cell.
- **What lives there:** every company from sign-up until it pays, including the read-only weeks after an unpaid trial ends until it is cancelled and erased, plus demo companies.
- **Same safety as production.** A trial company may already sell on real marketplaces from its numbers, so the trial database keeps the same backups, alerts and switch-off rules. It is only smaller: 0.25–2 CU autoscaling to start.
- **Shared marketplace allowances.** Where a marketplace limits calls for the whole application, trial companies get a capped share and a lower priority than paying companies, except stock decreases on an active connection, which always go first.

**Moving to paid**

1. Payment succeeds: the plan changes at once in control, so paid features are available immediately. No data has to move for that.
2. The physical move is scheduled for the company's quietest hour within 24 hours: pause its sync, copy the slice to the paid cell with the most room (or a dedicated database), compare checksums, switch the registry row, delete the trial copy.
3. A trial holds only a few weeks of data, so the pause lasts a minute or two. Marketplace notices wait in the queue and are imported right after.

## Platform constraints

Checked against Neon's and Cloudflare's documentation on 17 October 2026.

**Neon**

- A branch holds several databases on one compute, which share its `max_connections` (839 for a 0.25–2 CU autoscaling compute) ([compatibility](https://neon.com/docs/reference/compatibility)).
- Point-in-time restore covers 7 days on the Launch plan and 30 days on Scale ([plans](https://neon.com/docs/introduction/plans)); scheduled snapshots are kept up to 35 days ([backup and restore](https://neon.com/docs/guides/backup-restore)). Restoring one company is a branch at the restore time plus the slice copy.
- Roles created in the Neon console, CLI or API join `neon_superuser`, which has `BYPASSRLS` ([roles](https://neon.com/docs/manage/roles)). **The runtime role is created in SQL by the owner, never in the console**, and the lint checks it.
- Scale to zero is off for production databases, so no request waits for a cold start.
- Hyperdrive connects to Neon's direct endpoint, not Neon's own pooler, so two poolers are never stacked.

**Hyperdrive**

- 25 configurations per paid account, more by request ([limits](https://developers.cloudflare.com/hyperdrive/platform/limits/)). Each database takes one; staging lives in a separate Cloudflare account.
- About 100 origin connections per configuration, so each cell has at most ~100 database connections.
- Pooling is in transaction mode: a `SET` inside `BEGIN`/`COMMIT` takes effect, and the connection is reset when it returns to the pool ([how Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/)). This is what the transaction-local company setting relies on.
- **Query caching is off on every configuration.** Hyperdrive caches read-only queries by their text and cannot see the company setting, so a cached result could be served to another company ([query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)). `db:add` creates every configuration with caching disabled, and a deploy check refuses one with caching on.
- Transactions stay short: each holds one pooled connection until it ends, so no marketplace call runs inside a transaction.

## When to add a database

The system recommends a new cell when any one of these holds for 7 days; the operator decides.

| Signal | Recommend a new cell when | Why |
| --- | --- | --- |
| Companies in the cell | 500 (about 300 for companies at 1,000 orders a day) | Limits how many companies one outage or bad migration reaches |
| Hyperdrive pool | Over 80% of ~100 connections in use at peak, or requests waiting for a connection | The hard ceiling per cell |
| Compute | At its autoscaling maximum for over 20% of the busiest hour | No headroom left for a burst |
| Speed | p95 of reserving stock or importing an order over 100 ms at peak | Users feel it; marketplace sync depends on it |
| Restore time | Restoring the whole cell from a snapshot takes over 1 hour | Keeps the recovery promise |
| Hyperdrive configurations | 20 of 25 used | Ask Cloudflare before adding more |

Large append-only tables (orders, the stock ledger, outbound sends) are partitioned by month, with `company_id` leading every index. How long data stays in a cell, and when older months move to an archive, is [ADR-002: Data retention and archiving](../data-retention/).

## How isolation is proven

Isolation counts as proven only on real Postgres under the runtime role: an embedded or superuser database skips row-level security even when it is forced.

| Test | Where | Proves |
| --- | --- | --- |
| Isolation suite | CI, real Postgres, runtime role | As company A, every read, insert, update and delete of B's rows is refused; an unset company raises an error |
| Two-company fuzz | CI, real Postgres | Every command, run for A and B interleaved, touches only its own rows |
| Catalogue lint | CI | Every guard-rail rule holds for every table, including seeded bad tables that must fail |
| Two databases | CI, two real Postgres | A company in database B is unreachable through database A's handle; the request guard throws on a mismatched id |
| Pooler soak | CI, transaction-mode pooler | 10,000 interleaved transactions for 20 companies each see only their own company; a statement after `COMMIT` errors |
| Hyperdrive run | Staging, real Hyperdrive | The same soak through Hyperdrive itself |
| Slice round trip | CI | Copy, compare checksums, erase, count 0 |
| RLS cost | Benchmark on hot paths | The policy adds an acceptable cost to stock reservation, order import and marketplace sync |

## Consequences

**What this gives us**

- The database structure exists once per cell, not once per company: about 1,900 database objects per cell, however many companies it holds. A schema per company would be about 1,780 objects for each company, 1.78 million at 1,000 companies.
- One migration per database, one backup per database, one background query per database.
- Dedicated databases, trial isolation and moves all reuse one schema and one slice operation.
- Isolation is enforced by Postgres and checked by CI on every build.

**What it costs**

- Every table and every query carries `company_id`; the declaration helper and the lint carry that cost so modules do not.
- A mistake in a policy would expose rows rather than fail, which is why the lint, the fail-loud setting and the isolation tests are part of the design, not extras.
- Erasing or moving a company is a generated multi-table operation instead of dropping one schema.
- Sellers can find a buyer only by exact email or phone, not by part of a name or address, because buyer fields are encrypted.
- Erasure is complete in backups 30 days after a company closes.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Schema per company | About 1,780 database objects per company; dumps lock every table (73,000 at 500 companies), migrations and housekeeping grow with the number of companies |
| Database per company | Thousands of databases for one operator to run and pay for |
| Control data inside the first cell | A cell credential could read the login directory, and the cross-database write path would first run in production |
| Silent zero rows for an unset company | Hides bugs; an empty stock read can push 0 and delist a seller |
| One log table for everything, or one per module | Mixed retention on one hot table, or many tables to lint and expire; one per retention class is the middle |
| Logical replication to move companies | Copies no schema changes or sequences, and a forgotten replication slot fills the disk; kept for very large companies later |
