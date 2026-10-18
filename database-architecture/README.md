# ADR-001: Multi-tenant database architecture

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026, revised 18 October 2026 |
| **Scope** | How Vervoro stores, isolates, routes and moves each company's data |
| **Revision** | 18 October 2026, after a design review: trials live in a normal cell (no trial database); every transaction checks that its database holds the company; the erasure register moves to control; checks run in production as well as CI; company operations run in batches under their own role |

## Context

Vervoro is an operations system for marketplace sellers: stock, orders and listings synced with Amazon, eBay, Shopify and other channels. Every customer is a company, and one company must never see another company's data. The design has to meet these requirements:

- **Isolation is the top risk.** Cross-company exposure is the worst failure the product can have, so it must be prevented by the database and by the build, not by developer care.
- **Growth:** 5 to 10 companies at launch, about 100 in the first year, 500 to 1,000 within three years. A typical company has 100 to 5,000 SKUs, 100 to 2,000 orders a day and 1 to 5 connected marketplaces.
- **One operator** runs the platform, so the number of moving parts must not grow with the number of companies.
- **Enterprise customers** may need a database of their own, and later a region of their own.
- **Free trials** (14 to 28 days) must never affect paying customers, and a trial that pays must become a normal customer without starting over.
- **Lifecycle promises:** export a company, restore one company after a mistake, move a company, and erase a company provably.
- **Platform:** Postgres on Neon, reached from Cloudflare Workers through Hyperdrive, in the EU.

## Decision

1. **A control database** on its own compute holds only who the companies are, where they live, and which erasures must survive a restore. It stores no business data.
2. **Customer databases ("cells")** hold the business data of up to 200 companies each in **shared tables**. Every row carries `company_id`, and Postgres enforces **forced row-level security** on every table and every partition.
3. **Every transaction proves where it is.** Its first statement sets the company and raises unless this database holds that company and it is open, so a wrong route fails loudly instead of reading nothing.
4. **A dedicated database** for an enterprise customer is its own Neon project: a cell with the same schema holding one company.
5. **A trial is a state, not a place.** A trial company lives in a normal cell with capped shares of background work and marketplace allowances. Paying changes its plan; nothing moves. A trial cell is added only if trials outgrow their share.
6. **Every company-level operation** (export, move, restore, erase, placement) is one generated operation over the rows where `company_id` matches, run in batches by its own role, never by the owner.
7. **Guard rails in the runtime, in CI and in production** make a cross-company read or write impossible to write by accident, and catch configuration that drifts after deploy.
8. **One sweeper per database** finds due work with one query and runs the due companies side by side, waking at the next due time. Events go through an outbox in the same transaction as the change.

## Architecture

<!-- DIAGRAM -->

Every request names one company. The router looks up which database holds that company and opens a transaction there; the transaction's first statement fixes it to that one company and checks that the company lives in this database. The control database only knows where each company lives. Every business row sits in a cell, in tables shared by many companies and fenced by `company_id` and row-level security.

## Tenancy inside a cell

Every business table exists once per cell and carries `company_id`. Postgres itself refuses any row of another company, and the keys make a cross-company reference impossible even with security switched off.

1. **Keys.** `company_id` (uuid) is the first column of every primary key, unique key, foreign key and index. Foreign keys are composite, `(company_id, x)`, so a row cannot point at another company's row. Every table also has `company_id → tenant(id) ON DELETE CASCADE`. Postgres runs key checks outside row-level security, so these keys are the wall that holds even where policies do not apply.
2. **Row-level security, forced.** Every table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and one policy with both `USING` and `WITH CHECK`: `company_id = app.company()`.
3. **Fail loud.** `app.company()` returns `nullif(current_setting('app.company_id', true), '')::uuid` and raises an error when it is null. An unset company is an error, never zero rows: a silent empty stock read could push 0 to a marketplace and delist a seller. The `company_id` column default reads the same function, so an insert without a company also errors.
4. **Function label.** `app.company()` is `STABLE` and `PARALLEL SAFE`, never `SECURITY DEFINER`. Postgres then evaluates it once per statement and uses the `company_id` index.
5. **Roles.** Three roles:
   - **Owner** is the role Neon creates with each project. Neon makes it a member of `neon_superuser`, so it can bypass row-level security. It owns the tables, runs migrations and partition changes, and creates the other roles in SQL. Its credential exists only in the CI migration job; an emergency use goes through that job, records the reason first and alerts the operator ([ADR-009](../buyer-data/)).
   - **Runtime** serves requests and runs the sweeper. It is created in SQL, has `NOBYPASSRLS` and owns nothing.
   - **Lifecycle** runs the slice operation (export, move, restore, erase) and the archiver's row work. It is created in SQL, has `NOBYPASSRLS`, holds no DDL rights, and is the only role allowed to delete rows from append-only tables. Its credential lives only in the operations job that runs those tasks, outside the Worker that serves requests.

   No other role may log in. Any role created in the Neon console, CLI or API would join `neon_superuser`, so no other role is ever created there.
6. **Append-only tables.** A table declared append-only (today the stock ledger, order holds, the outbox and `audit_log`) has `UPDATE`, `DELETE` and `TRUNCATE` revoked from the runtime role when its migration runs, so no bug or raw query can rewrite history. Rows leave only through the slice operation (erase, restore, move), as the lifecycle role, and through whole months detached by the monthly migration run once the archiver has verified them ([ADR-002](../data-retention/)).
7. **Entering a company.** The data layer's first statement in every transaction is `select app.enter_company($1)`. It sets `app.company_id` for this transaction only (`set_config(…, true)`), and raises unless this database's `tenant` row for that company exists in a state this role may enter: `open` for the runtime role; `open`, `moving_out`, `restoring` or `lookback` for the lifecycle role. The `tenant` table's own policy is `id = app.company()`, and the row is read through row-level security like any other: the check needs no special rights and costs no extra round trip. The data layer refuses autocommit for company work. The setting lasts only for that transaction, which keeps it safe behind a transaction-mode pooler.
8. **Tenant states.** The `tenant` row in each cell is the single authority on whether a company is open there: `open`, `moving_out`, `moved_out`, `restoring` or `lookback`. A move or restore changes the source row first, so a stale route to the old cell raises instead of reading an empty company. Nobody enters a `moved_out` company.

## Declaring tables

Modules never write `CREATE TABLE`. They declare tables through `tenantTable()`, and the data layer generates everything tenancy needs.

| Who | Writes |
| --- | --- |
| The module | Columns, its own key columns, foreign keys by its own columns, checks, indexes, and field tags: `pii`, `secret`, `retention` |
| The data layer | `company_id` and its default, composite primary, unique and foreign keys, the cascade to `tenant`, `ENABLE` + `FORCE` RLS and the policy (on the table and every partition), grants (with the append-only revoke where declared), the table's entry in the company-slice manifest, anonymisation hooks |

- **Field tags** drive buyer anonymisation, a buyer's right to be forgotten, AI masking and export redaction from one declaration.
- **Upserts** go through a `conflict('id')` helper that emits `ON CONFLICT (company_id, id)`.
- **IDs** are uuidv7. There are no `serial` or identity columns, so nothing is numbered across companies and an ID never says which database a company lives in.
- **Human numbers and ordering** (PO-0001, an outbox sequence, the stock ledger's gapless sequence) come from a counter table keyed `(company_id, name)`, taken in the writer's transaction. A stock command's first statement updates the company's stock counter row and returns the next number: that row lock is the company's lock ([ADR-006](../stock-ledger/)), so one mechanism gives both the lock and the gapless number. Counters travel with the company when it moves.
- **Marketplace cursors and watermarks** are keyed `(company_id, account)`; idempotency keys are unique per `(company_id, key)`.
- **Logs:** one table per retention class, partitioned by month so retention is a partition drop: `audit_log` (security and access, kept at least a year for live companies) and `event_log` (module activity, 90 days).
- **Partitions.** A partition named directly in a query ignores its parent's policies and grants, because a partitioned table follows Postgres's inheritance rules ([inheritance](https://www.postgresql.org/docs/17/ddl-inherit.html), [partitioning](https://www.postgresql.org/docs/17/ddl-partitioning.html)). So every partition gets its own `ENABLE`, `FORCE` and policy, and no grant to any runtime or lifecycle role; no default privileges grant the runtime role anything. The slice operation and export read and delete through the parent; only the monthly migration run names a partition, to create it or to detach a month.
- **Operational state** (rate buckets, leases, nonces, staging) lives in per-cell tables keyed by `company_id`, like everything else.
- **Secrets:** one table, `secrets(company_id, purpose)`.

## Guard rails

Only the data layer may say which company a transaction belongs to, and these checks make sure nothing else can.

- **Statement filter (runtime).** The data layer refuses any module statement containing `set`, `reset`, `set_config` or the name `app.company_id`, or naming `pg_stats` or `pg_statistic` (their most-common-value statistics show other companies' values). Module-defined functions and `DO` blocks are not allowed, since they would get round the filter. Postgres cannot revoke `set_config` on a custom setting, so this has to be application code.
- **Row check (runtime).** Every row-returning read of a tenant table carries `company_id`, and the data layer compares it with the transaction's company. A mismatch is a P0: it raises, pages the operator and closes the cell's egress. Sums and counts are scoped by row-level security and need no column.
- **Request guard.** Authentication puts the signed-in company in request context; `forCompany(id)` throws when `id` differs. Operator and background code opt in explicitly, and opting in never bypasses RLS: every company read or write still runs in a transaction fixed to exactly one company. An operator acting as a company does so through an explicit, audited grant.
- **Caches.** Hyperdrive's query cache is off ([Platform constraints](#platform-constraints)). Any other cache (key-value storage, the Cache API, module-level state) is reached only through a key builder that takes the company id, and logs carry ids, never field values.
- **How background jobs find work.** Two tables per cell hold ids, hashes and timestamps only: `due(company_id, kind, next_due_at)`, which the cell's sweeper reads with one indexed query, and `buyer_ref(company_id, hash, order_id)`, which holds keyed hashes of eBay buyers' user ids so an eBay account deletion notice is matched with one indexed query per cell ([ADR-009](../buyer-data/)); its rows go when the order's buyer data does. Both are tenant tables like any other: a command writes and reads only its own company's rows. Only the two cross-company reads (which companies have work due, which companies hold this buyer hash) look past one company. They go through two allow-listed `SECURITY DEFINER` functions, owned by a role that cannot log in, with a pinned `search_path`, returning company ids and times only. That role's only rights are a read policy of its own on these two tables. Every other definer function is refused.
- **Catalogue lint (CI).** Fails the build if any cell table or any partition lacks `company_id NOT NULL` leading its primary key, forced RLS, both policy clauses or composite foreign keys. The named exceptions are the `tenant` table, keyed by its own `id`, and the two read policies of the definer functions' owner. It also fails on raw `CREATE TABLE`, `serial` or identity columns, `SECURITY DEFINER` outside the allow-list, views without `security_invoker`, materialized views, grants on partitions, default privileges for the runtime role, `TRUNCATE` grants, `ON CONFLICT` without `company_id`, session-level `SET`, a runtime or lifecycle role with `BYPASSRLS`, a runtime role holding `UPDATE`, `DELETE` or `TRUNCATE` on an append-only table, and `app.company()` not labelled `STABLE`.
- **Change control.** A change to the isolation code (the table declaration helper, `enter_company`, the policies, the lint and the allow-list) needs a person's approval in CI before it merges.

## Production checks

CI proves the schema it builds. These prove the databases actually running, because a role made in a console, a partition made after deploy or a configuration edited by hand are invisible to CI.

- **Audit at every deploy and every night**, over every database and every branch in the Neon project and every Hyperdrive configuration in the Cloudflare account:
  - the only login roles are the owner, the runtime role and the lifecycle role; only the owner has `BYPASSRLS` or belongs to `neon_superuser`, and no runtime or lifecycle role owns a table;
  - the owner of the two definer functions cannot log in, is not in `neon_superuser`, and can only read `due` and `buyer_ref`;
  - every Hyperdrive configuration has caching off;
  - the catalogue lint passes on the live catalogue, and the next two months' partitions exist;
  - the project's history window is 7 days, and scheduled snapshots are kept 30 days, and no manual snapshot exists;
  - every branch was made by the lifecycle tool and is younger than its limit.

  A failure pages the operator and closes egress for the affected database.
- **A canary company in every database.** A second synthetic company must see none of its rows: a few tables every 10 minutes, every table nightly and after each deploy and each new partition. A transaction with no company set must raise. The egress gate scans every outbound payload for the canary's marker strings. A failure pages the operator and closes the cell's egress.

## Background work and events

Every database (each shared cell, each dedicated database) has **one sweeper**: a Durable Object named after the database and created on demand from its registry row. Adding a database brings its sweeper with it.

- **It finds work; it does not visit everyone.** One indexed query on `due` returns the companies with something due now. Each runs in its own transaction fixed to that company, side by side, up to a fixed limit set so the cell's pooled connections keep room for requests. A company with nothing due costs nothing.
- **Fair shares.** One company runs at most about 8 background or bulk jobs at a time, and trial companies together get a capped share of the cell's sweeper slots and bulk jobs, so one company's import cannot take the cell's connections.
- **It wakes at the next due time,** not on a fixed minute. After a run it sets its alarm for the earliest `next_due_at`, or sets none when nothing is due. A request that changes something nudges it within seconds, and an hourly scheduled trigger is the safety net for a lost alarm.
- **Moving a company** moves its `due` rows with the rest of its slice, so the target database's sweeper picks it up and the source's forgets it.

**Events: outbox note, deliver now, handler, receipt.**

1. **Outbox note.** The transaction that makes a change also writes a row in the outbox saying what happened ("order 1001 dispatched"). It is saved with the change or not at all, so it can never be lost.
2. **Deliver now.** Right after commit, the request hands the note to every module that handles that kind of event. This is the normal path, and it takes no sweeper.
3. **Handler.** The module's code that reacts: invoicing raises the invoice, the Channels host tells the marketplace the order shipped. It runs in a transaction that also writes a receipt for (event, handler), so a second delivery does nothing.
4. **The sweeper** delivers any note still missing a receipt, for example after a Worker crashed between commit and delivery.

The outbox, not a queue, is the source of truth. A message put on a queue cannot be part of the database transaction, so a queue would still need the sweeper behind it. The inbound queue carries only marketplace webhooks, which must be answered before anything is written.

**Writes that cross databases** use the same pattern. Sign-up writes the company in its cell together with an outbox note ("control still needs this login"), then writes control. If the second write fails, the sweeper retries the note until it succeeds; the write is idempotent, so a repeat is harmless.

## Control database and routing

The control database is its own database on its own compute. A cell credential can never read the login directory, and restoring a cell's branch can never rewind control.

**What control holds, and nothing else:**

- the company registry: plan (trial or paid), status, subscription, tombstones
- the database registry: `database(id, region, kind shared|dedicated, state open|closed|draining, cap)`, with `company.database_id`
- the login directory (logins, their sign-in methods, sessions and memberships; [ADR-010](../users-and-access/)) and the external directory (marketplace seller id → company)
- the **erasure register**: every buyer erasure and every company tombstone, by id and time only
- each company's sync epoch, raised on every restore ([ADR-008](../inventory-sync/))
- operator accounts and grants, platform settings, the platform security log, the migration ledger per database
- shared marketplace call quotas, usage rollups, alerts

**Emails in control** are stored only as HMAC(normalised email), keyed by a secret held outside Postgres. The address itself lives only in the company's own users table, so a leak of control is not a leak of customer data.

**The erasure register** is also written, entry by entry, to an append-only log in object storage, so even a restore of control cannot lose an erasure.

**Routing.** `forCompany(id)` looks the company's database up in the registry (cached) and uses that database's connection pool. A stale cache cannot do harm: the old database's tenant row is no longer `open`, so `enter_company` raises and the router reloads. A new company, trial or paid, goes to the newest open shared cell; an enterprise to a dedicated database. Adding a database is one command (`db:add`) that creates it, sets up its roles in SQL, migrates and registers it, with Hyperdrive caching disabled. The system recommends a new database; the operator decides.

**Writes that cross databases** (sign-up, adding a user, closing a company) write the company side first, then control, are idempotent, and are repaired from an outbox if the second write fails (see [Background work and events](#background-work-and-events)). No transaction spans two databases.

## Company lifecycle

One operation, generated from the catalogue, does every company-level job: copy or delete every row where `company_id = X`, in foreign-key order. Export, move, restore, dedicated placement and erase all use it, and CI runs it on every build: copy company A from database 1 to database 2, compare row counts and checksums per table, delete A, then confirm every table counts 0 for A.

**How it runs.** In the operations job, as the lifecycle role, over a direct connection to the database (not through Hyperdrive, whose statements stop at 60 seconds), in committed batches of short transactions while the company is fenced in control. One long transaction would hold back vacuum for every company in the cell. It reads from a branch or a read replica where it can, and through parent tables only. When it loads a slice, it refuses a company that has a tombstone, and it does not finish until it has replayed every entry in the erasure register for that company.

**Erase.** Fence the company, delete its rows in batches and then the tenant row, purge its files and any soft-deleted or versioned copies in object storage, and release its marketplace seller ids in control so the seller can connect again later. Erase is done when all three hold, recorded in the erasure register:

1. the deletes committed
2. a generated count over every table is 0 for the company
3. the company's data key is destroyed

The delete also removes the company's `audit_log`, so the one-year retention applies to live companies only.

**Backups.** 7 days of point-in-time recovery plus scheduled snapshots kept 30 days. No manual snapshots, because they never expire. Erasure is complete in backups at day 30. The customer terms state that, and the restore times the drills measure.

**Encryption.** Credentials and buyer contact fields (name, address, phone, notes) are encrypted under a per-company data key in `secrets(company_id, purpose)`, wrapped by a key-encryption key held as a platform secret. `company_id` is bound in as associated data, so a row read under the wrong company fails to decrypt. Exact-match blind indexes exist only for the phone number. The wrapped keys stay in the database: making erasure instant in backups would need a second, never-backed-up key store whose loss makes every company's data unreadable for good, and rotating the key-encryption key cannot end erasure sooner than the backups it protects expire.

**Restore one company.** Most mistakes are partial, such as one bad bulk edit, so a restore starts by looking back:

Every branch the lifecycle tool makes, for a look-back, a rewind or a drill, has every tenant row marked `lookback` before anything else connects to it, so the runtime role can never serve from it, and it is deleted within 24 hours.

1. **Look back.** The lifecycle tool branches the cell at the restore time. The operator, on the seller's request, reads the company's old records through the tool in read-only transactions, and what is needed is copied back as normal commands on the live cell.
2. **Full rewind,** only for corruption:
   1. Fence the company: pause its outbound marketplace calls, revoke its sessions, set its tenant row to `restoring`.
   2. Branch the database at the restore time (marked `lookback`).
   3. Replace the live slice with the branch's slice, in batches.
   4. Replay the erasure register for the company and run the anonymisation rule ([ADR-009](../buyer-data/)) before anything else reads it.
   5. Rebuild the company's directory rows in control; set counters to at least their live values, so numbers already sent to suppliers are not reused. Re-register every issued invoice and credit note found in object storage that is newer than the restore time, and set their counter past the highest number found ([ADR-011](../invoicing-and-vat/)).
   6. Mark restored outbound sends `unknown`, never resend them; bring every marketplace account back in shadow mode. Raise the company's sync epoch, kept in the control database, which every stock write's idempotency key carries ([ADR-008](../inventory-sync/)).
   7. Re-import the marketplace orders placed since the restore time through the once-only import, then re-read the marketplaces and reconcile.
   8. The seller confirms the differences on the reconcile screen before any stock push resumes, because pushing restored stock straight away would oversell. The account stays in shadow mode until then, and the operator is alerted when a difference is large, but no person is needed at any particular hour.
   9. Files in object storage have no point-in-time copy: keep versioning or a 30-day soft delete, and never overwrite a file key.

**Restore a whole cell,** after a disaster: restore the branch with every company set to `restoring`, then, before any company opens:

1. delete every company tombstoned after the restore time, and replay the erasure register and the anonymisation rule for the rest;
2. set to `moved_out` every company the registry now places in another database, and copy back from its source cell any company that moved in after the restore time;
3. treat every company as a full rewind from step 5: counters, outbound sends marked `unknown`, accounts in shadow mode, orders re-imported, and the seller's confirmation before any stock push.

**Move a company** to another database: fence it (`moving_out`), copy the slice in batches, compare checksums, switch the registry row, set the source tenant row to `moved_out`, then delete the source slice.

**Export** is a bundle: a manifest with per-table row counts and hashes, machine-readable files that the slice operation can load again, and readable CSV files. It is bound to the company id, refused if loaded under another company, and logged as a view of buyer data.

**Drills.** Weekly, a random real company, and monthly each cell's largest company, are restored unattended into a temporary branch, timed per gigabyte; the drill checks that the runtime role is refused on that branch and that the neighbours' checksums are unchanged, keeps only timings and checksums, and deletes the branch. Nightly, the canary company is moved between two databases and back, timed and checksummed. Control has a restore drill of its own.

## Dedicated databases and residency

Any enterprise that requires it gets a Neon project of its own: its own compute, its own restore history and backups, and its own region if it asks. In the registry it is a database row with `kind = dedicated` and a cap of 1: the same schema, RLS still on, the same code path, placed by the same slice operation. Each one uses one Hyperdrive configuration.

- **Inside the UK and EU,** the database alone is enough: every database is in Neon's EU region, the Worker is placed next to it, and Durable Objects and object storage use Cloudflare's EU jurisdiction, as long as Hyperdrive caching stays off.
- **Outside the EU,** a dedicated database needs a whole cell: its own Worker placement, Hyperdrive configuration, object-storage bucket, Durable Object jurisdiction, logs and backup location.

## Trials

A trial company lives in a normal shared cell, the newest open one, from sign-up. Paying changes its plan in control at once, and nothing moves.

- **No trial database at launch.** A separate trial database would make every conversion a move: a pause, a copy and a route switch on a company that may already be selling on real marketplaces. It would also be a compute running all the time for a handful of trials.
- **A trial cell when trials outgrow their share.** If trial companies use more than about 25% of a cell's compute for a week, the system recommends a cell for trials only. New trials then start there, and a trial that pays is moved to a paid cell by the slice operation, with the same fencing, `moved_out` source row and checks as any move.
- **Trials cannot crowd out paying companies.** Trials together get a capped share of the cell's sweeper slots and bulk jobs, and a capped, lower-priority share of any marketplace allowance limited for the whole application, except stock decreases on an active connection, which always go first. Sign-up is gated against abuse.
- **Same safety as production.** A trial company may already sell on real marketplaces from its numbers, so it has the same backups, alerts and switch-off rules as everyone else. Demo companies live in a cell like any other company.
- **When a trial lapses** without paying, or a paying company closes, what is kept, for how long, and when the data is erased is decided in [ADR-012](../billing-and-plans/): it is erased 30 days after the company closes. Until it is erased, the data stays in its cell.

## Platform constraints

Checked against Neon's and Cloudflare's documentation on 18 October 2026.

**Neon**

- All databases on one branch share its compute and its `max_connections` (839 for a 0.25–2 CU autoscaling compute) ([compatibility](https://neon.com/docs/reference/compatibility)). So control has a compute of its own.
- Point-in-time restore reaches back as far as the project's history window: 1 day by default on paid plans, at most 7 days on Launch and 30 on Scale. Change records older than the window are deleted ([history window](https://neon.com/docs/postgres/backup-restore/history-window)). **Vervoro sets the window to 7 days** (`history_retention_seconds` 604800), and the production audit checks it. Restore works on a whole branch, never one database or one company ([backup and restore](https://neon.com/docs/guides/backup-restore)): restoring one company is a branch at the restore time plus the slice copy.
- Scheduled snapshots are kept up to 35 days; manual snapshots never expire unless given an expiry ([backup and restore](https://neon.com/docs/guides/backup-restore)). Vervoro keeps scheduled snapshots 30 days and makes no manual ones.
- Roles created in the Neon console, CLI or API join `neon_superuser`, which has `BYPASSRLS`; roles created with `CREATE ROLE` in SQL get only what is granted ([roles](https://neon.com/docs/manage/roles)). **Every role is created in SQL**, and the production audit checks it.
- Scale to zero is off for production databases, so no request waits for a cold start.
- Hyperdrive connects to Neon's direct endpoint, not Neon's own pooler, so two poolers are never stacked. Cloudflare's guide for Neon says the same: copy the connection string with Neon's pooling unchecked, because Hyperdrive pools ([Hyperdrive with Neon](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/)).

**Hyperdrive**

- 25 configurations per paid account, more by request; not every limit can be raised ([limits](https://developers.cloudflare.com/hyperdrive/platform/limits/)). A configuration is one connection string: one database and one user. Each database takes one; staging lives in a separate Cloudflare account.
- About 100 origin connections per configuration on a paid plan, so each cell has at most ~100 pooled database connections. A statement stops after 60 seconds.
- Pooling is in transaction mode: a `SET` inside `BEGIN`/`COMMIT` takes effect, and the connection is reset when it returns to the pool ([how Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/)). This is what the transaction-local company setting relies on.
- **Query caching is on by default and is off on every configuration.** Hyperdrive caches read-only query results and cannot see the company setting, so a cached result could be served to another company ([query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)). `db:add` creates every configuration with caching disabled, and the production audit refuses any configuration in the account with caching on.
- Transactions stay short: each holds one pooled connection until it ends, so no marketplace call runs inside a transaction.

## Operations

- **Timeouts.** The runtime role has a `statement_timeout` and an `idle_in_transaction_session_timeout`, so one slow query or one forgotten transaction cannot hold a cell. Every migration sets a `lock_timeout` and retries, so a migration waiting for a lock on a shared table does not queue every seller behind it.
- **Migrations run as a ring.** They run first on the newest cell, which holds the trials and the canary, then on the others, and finish everywhere before the new code goes live.
- **Partitions.** A monthly scheduled run of the CI migration job creates partitions three months ahead, so a failed run waits for the next one without anyone acting at an hour. It detaches and drops a month only after the archiver has written and verified that month's per-company files ([ADR-002](../data-retention/)).
- **Hot rows.** The `due` table and the counter table are updated by almost every command; both get a lower fillfactor and their own autovacuum thresholds.
- **Alerts** on transaction-id age, long-running transactions and leftover replication slots.

## When to add a database

The system recommends a new cell when any one of these holds for 7 days; the operator decides.

| Signal | Recommend a new cell when | Why |
| --- | --- | --- |
| Companies in the cell | 200 | Limits how many companies one outage, bad migration or misconfiguration reaches: at 1,000 companies, about 5 shared cells |
| Hyperdrive pool | Over 80% of ~100 connections in use at peak, or requests waiting for a connection | The hard ceiling per cell |
| Compute | At its autoscaling maximum for over 20% of the busiest hour | No headroom left for a burst |
| Restore time | The drill's measured restore of the cell's largest company takes over 15 minutes, or the cell holds over 500 GB | Keeps the per-company recovery promise; a branch restore does not grow with size, a slice copy does. A company that alone breaks it is offered a dedicated database |
| Trials | Trial companies use over 25% of a cell's compute | Trials start crowding out paying companies; add a cell for trials only ([Trials](#trials)) |
| Hyperdrive configurations | 15 of 25 used | Ask Cloudflare for more before they are needed |

Large append-only tables (orders, the stock ledger, outbound sends) are partitioned by month, with `company_id` leading every index. How long data stays in a cell, and when older months move to an archive, is [ADR-002: Data retention and archiving](../data-retention/).

## How isolation is proven

Isolation counts as proven only on real Postgres under the runtime role: an embedded or superuser database skips row-level security even when it is forced.

| Test | Where | Proves |
| --- | --- | --- |
| Isolation suite | CI, real Postgres, runtime role | As company A, every read, insert, update and delete of B's rows is refused; an unset company raises an error |
| Suite can fail | CI, scratch database | With one `FORCE` and one composite foreign key removed, the isolation suite and the fuzz fail |
| Append-only | CI, real Postgres, runtime role | An update, delete or truncate of a stock ledger row is refused; the slice operation, as the lifecycle role, still removes a company's rows |
| Two-company fuzz | CI, real Postgres | Every command, run for A and B interleaved, touches only its own rows |
| Catalogue lint | CI and production | Every guard-rail rule holds for every table and partition, including seeded bad tables that must fail |
| Two databases | CI, two real Postgres | Entering a company in a database that does not hold it raises an error, not zero rows; the request guard throws on a mismatched id; the runtime role cannot enter a `moved_out`, `restoring` or `lookback` company, and the lifecycle role cannot enter a `moved_out` one |
| Pooler soak | CI, transaction-mode pooler | 10,000 interleaved transactions for 20 companies each see only their own company; a statement after `COMMIT` errors |
| Hyperdrive run | Staging, real Hyperdrive | The same soak through Hyperdrive itself |
| Roles | CI and production | The Worker binds only the runtime role; no role but the owner has `BYPASSRLS` or `neon_superuser`; only the operations job holds the lifecycle credential |
| Slice round trip | CI | Copy, compare checksums, erase, count 0; a tombstoned company's slice is refused; the erasure register is replayed |
| Canary | Production | Another company sees none of the canary's rows; outbound payloads never carry its markers |
| Restore drill | Production, weekly and monthly | A real company restores unattended into a branch the runtime role cannot enter, neighbours unchanged, time per gigabyte recorded |

## Consequences

**What this gives us**

- The database structure exists once per cell, not once per company: about 1,900 database objects per cell, however many companies it holds. A schema per company would be about 1,780 objects for each company, 1.78 million at 1,000 companies.
- One migration per database, one backup per database, one background query per database: about 7 databases to run at 1,000 companies (5 shared cells, control, and any dedicated ones).
- A wrong route, a stale cache or a stray branch raises an error instead of returning empty stock.
- Trials and paying companies share one path, so paying never moves data.
- Dedicated databases and moves reuse one schema and one slice operation.
- Isolation is enforced by Postgres, checked by CI on every build, and re-checked in production every night.

**What it costs**

- Every table and every query carries `company_id`; the declaration helper and the lint carry that cost so modules do not.
- A mistake in a policy would expose rows rather than fail, which is why the lint, the fail-loud setting, the row check, the canary and the isolation tests are part of the design, not extras.
- Erasing, restoring or moving a company is a generated multi-table operation run in batches, instead of dropping one schema or restoring one database. A full restore of one company takes minutes, measured by the drill, not seconds.
- Sellers can find a buyer only by exact phone number, not by part of a name or address, because buyer fields are encrypted.
- Erasure is complete in backups 30 days after it is made.
- Every company in a cell shares its compute and its ~100 connections, so one company's burst is bounded by fair shares and the cell cap, not by hardware of its own.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Schema per company | About 1,780 database objects per company; dumps lock every table (73,000 at 500 companies), migrations and housekeeping grow with the number of companies, and a wrong `search_path` reads another company silently |
| A Neon project per company (Neon's own recommendation for multi-tenant products) | It would give each company a restore in seconds, erasure from backups in 7 days, a blast radius of one company and no move code. But one Hyperdrive configuration serves one database and user, and an account has 25, so companies would connect without Hyperdrive; each company needs its own always-on compute, so cost and migrations grow with every company, many times the cost of shared cells at 1,000 companies; and one platform credential still reaches every project. Kept for an enterprise that asks, as a dedicated database |
| A Postgres role per company | Adds no isolation over the company setting: the runtime login would have to be able to switch into every company's role. Roles are server-wide, every table's permission list grows with each company, and a move must recreate the role in the new cell |
| A trial database on its own compute from launch | Every conversion becomes a move of a company that may already be selling, and a fixed compute runs for a handful of trials. Fair shares in a normal cell keep trials from crowding out paying companies; a trial cell is added when trials pass 25% of a cell's compute |
| Control data inside the first cell, or on its compute | A cell credential could read the login directory, and restoring the first cell's branch would rewind control and its erasure register |
| An erasure log inside each company's rows | The restore that must replay it would rewind it |
| Slice operations as the owner | The most destructive operations would run with row-level security off and the owner's credential in a running service |
| Per-company backup files and key rotation instead of snapshots | A separate key store whose loss loses every company's data, and machinery one operator must keep working; rotation cannot end erasure before the backups expire |
| Silent zero rows for an unset company, or for a company in another database | Hides bugs; an empty stock read can push 0 and delist a seller |
| One log table for everything, or one per module | Mixed retention on one hot table, or many tables to lint and expire; one per retention class is the middle |
| Logical replication to move companies | Copies no schema changes or sequences, and a forgotten replication slot fills the disk |
