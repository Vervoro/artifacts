# ADR-001 SPEC: Multi-tenant database architecture

| | |
| --- | --- |
| **Decision** | [ADR-001: Multi-tenant database architecture](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-001-multi-tenant-database-architecture) |
| **Date** | 20 October 2026; hosting reviewed 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-001 from. Each section is a rule set, a table or a list of states. The record decides; this page says exactly how. Where this page and the ADR disagree, the ADR wins and this page is fixed. The words used are defined in the [map and glossary](../../guide/).

## 0. At launch and later

At launch there are two databases: control and cell A. Cell A holds every company, trials and the canary included. Everything below is built at launch except the parts in this table, which keep their rules here and are built only when their trigger arrives (owner ruling, 20 October 2026).

Two things are built at launch even with one cell, because they make a later cell cheap: every request reads its company's database from control ([section 7](#7-control-database-and-routing)), and `enter_company` raises in a database that does not hold the company ([section 1](#1-tenancy-inside-a-cell)).

| Later part | Trigger | Rules |
| --- | --- | --- |
| A second cell: the `cell:add` tool with its checked opening, closing a cell at its cap, and the "when to add" signals | Cell A reaches 160 companies, or another signal in [section 8](#when-to-add-a-database) holds | [8](#adding-a-cell) |
| Moving a company, and the nightly canary move | A second cell exists | [10](#move), [drills](#drills) |
| Dedicated cells, and residency outside the EU | The first enterprise contract that needs one | [8](#adding-a-dedicated-database) |
| The trial share of sweeper slots and app-wide allowances, then a cell for trials only | Trials use over 25% of cell A's compute for 7 days | [8](#trials), [9](#fair-shares) |
| Canary checks every 10 minutes, and the egress scan for canary markers | A second cell exists | [11](#11-production-checks) |
| Weekly restore drills (monthly at launch) | 50 companies | [10](#drills) |
| Automated full rewind and whole-cell restore (by the runbook, by hand, at launch) | The first drill or incident that shows the hand procedure is too slow | [10](#restore) |

## 1. Tenancy inside a cell

1. Every business table exists once per cell and carries `company_id uuid NOT NULL`.
2. Every table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and one policy with both `USING` and `WITH CHECK`: `company_id = app.company()`. The same holds for every partition.
3. `app.company()` returns the transaction's company and **raises** when none is set. An unset company is an error, never zero rows: a silent empty stock read could push 0 to a marketplace and delist a seller.
4. The `company_id` column default is `app.company()`, so an insert without a company also raises.
5. The data layer's first statement in every transaction is `select app.enter_company($1)` ([section 4](#4-functions)). The data layer refuses autocommit for company work.
6. The company setting lasts only for its transaction (`set_config(…, true)`). That keeps it safe behind a transaction-mode pooler.
7. A transaction holds **exactly one company**. A request may batch all its reads for its one company into one read-only transaction. It never enters a second company, and it never reads control through the cell's transaction. Background and operator work open one transaction per company.

### Tenant states

Each cell has a `tenant` table, keyed by its own `id`, with policy `id = app.company()`. Its row is the single authority on whether a company is open in that database.

| State | Meaning | Runtime may enter | Lifecycle may enter |
| --- | --- | --- | --- |
| `open` | Served from this database | Yes | Yes |
| `moving_out` | Being copied to another database | No | Yes |
| `moved_out` | Lives elsewhere now; source rows about to be deleted | No | No |
| `restoring` | A full rewind is replacing its rows | No | Yes |
| `lookback` | Every row in a branch made for a look-back, rewind or drill | No | Yes |

A move or restore changes the source row first, so a stale route to the old database raises instead of reading an empty company. Every other role, the owner included, is refused by `enter_company`.

## 2. Keys and identifiers

| Rule | Detail |
| --- | --- |
| `company_id` leads every key | The first column of every primary key, unique key, foreign key and index |
| Composite foreign keys | `(company_id, x)` references `(company_id, x)`, so a row cannot point at another company's row. Postgres runs key checks outside row-level security, so these keys hold even where policies do not |
| Cascade to `tenant` | Every table has `company_id → tenant(id) ON DELETE CASCADE`. Deleting the tenant row is the last step of an erase ([section 10](#10-company-lifecycle)); the cascade guarantees nothing is left |
| IDs | uuidv7. No `serial` or identity columns, so nothing is numbered across companies and no id reveals a company's database |
| Human numbers and ordering | PO numbers, outbox sequence, the stock ledger's gapless sequence: from a counter table keyed `(company_id, name)`, taken in the writer's transaction. Counters travel with the company |
| The company's lock | A stock command's first statement after entering updates the company's stock counter row. That row lock is the company's lock, and the same update returns the next ledger number ([ADR-006](../../stock-ledger/)) |
| Upserts | Only through `conflict('id')`, which emits `ON CONFLICT (company_id, id)` |
| Marketplace cursors and watermarks | Keyed `(company_id, account)` |
| Idempotency keys | Unique per `(company_id, key)` |

## 3. Roles

| Role | Where | Created by | Can log in | Bypasses RLS | Rights | Credential held by |
| --- | --- | --- | --- | --- | --- | --- |
| **Owner** | Every database | Neon, with the project | Yes | Yes (Neon makes it a member of `neon_superuser`) | Owns every table. Migrations, partitions, creating the other roles | The CI migration job only |
| **Runtime** | Every database | SQL | Yes, as itself | No (`NOBYPASSRLS`) | `SELECT, INSERT, UPDATE, DELETE` on tenant tables, minus the append-only revoke. `SELECT` on `tenant`. No right on control's login tables. Owns nothing | The app Worker, through Hyperdrive |
| **Lifecycle** | Every database | SQL | Yes | No | Reads and deletes through parent tables for the slice operation, including append-only tables. Enters the states in [section 1](#tenant-states). No DDL. Owns nothing | The operations job only, never a serving Worker |
| **Sign-in** | Control only | SQL | Yes | No | Alone reads and writes logins, sign-in methods, recovery codes and sessions ([ADR-013 SPEC 6](../../sign-in/spec/#6-the-sign-in-worker)). Owns nothing | The sign-in Worker, through its own Hyperdrive configuration |
| **Definer owner** | Every cell | SQL | No | No | Owns the three allow-listed functions. Its own read policy on `due` and `buyer_ref`; insert on `tenant` | Nobody |

Rules:

1. No other role may log in. A role created in the Neon console, CLI or API joins `neon_superuser`, so no role is ever created there.
2. The runtime role logs in as itself. No login switches role with `SET ROLE` (owner ruling, 20 October 2026).
3. A serving connection refuses to start if its login is a superuser, has `BYPASSRLS`, owns a table, or is a member of the owner, of `neon_superuser` or of any role with those rights.
4. The owner's emergency use goes through the CI migration job, records the reason first and alerts the operator ([ADR-009](../../buyer-data/)). See the [runbook](../../runbooks/use-the-owner-role/).
5. The runtime role has a `statement_timeout` and an `idle_in_transaction_session_timeout`.

## 4. Functions

| Function | Kind | Who may call | What it does |
| --- | --- | --- | --- |
| `app.company()` | `STABLE`, `PARALLEL SAFE`, never `SECURITY DEFINER` | Anyone | `nullif(current_setting('app.company_id', true), '')::uuid`; raises when null. Its labels let Postgres evaluate it once per statement and use the `company_id` index |
| `app.enter_company(id)` | Invoker | Runtime, lifecycle | Sets `app.company_id` for this transaction, then reads `tenant` through row-level security and raises unless the row exists in a state this role may enter. Needs no special rights and no extra round trip |
| `app.open_tenant(id)` | `SECURITY DEFINER`, allow-listed | Runtime | Used at sign-up in place of `enter_company`. Inserts a `tenant` row for `id` in state `open` and sets the company for this transaction. Raises if a row for `id` already exists (owner ruling, 20 October 2026) |
| `app.due_companies(limit)` | `SECURITY DEFINER`, allow-listed | Runtime | Returns `(company_id, next_due_at)` from `due` for companies due now, earliest first |
| `app.buyer_ref_companies(hash)` | `SECURITY DEFINER`, allow-listed | Runtime | Returns the company ids holding an eBay buyer hash ([ADR-009](../../buyer-data/)) |

Rules for the three definers:

1. Owned by the definer owner, which cannot log in.
2. `search_path` pinned in the function definition.
3. Return ids and times only.
4. `EXECUTE` granted to the runtime role only.

Every other `SECURITY DEFINER` function is refused by the lint.

**SQL-executing functions** are revoked from `PUBLIC` in every cell: `query_to_xml`, `query_to_xmlschema`, `query_to_xml_and_xmlschema`, `cursor_to_xml`, `cursor_to_xmlschema`, `table_to_xml`, `table_to_xmlschema` and `table_to_xml_and_xmlschema`. Extensions that run SQL given as text, such as `dblink`, are never installed. `pg_stats` is revoked from `PUBLIC` too: its sample values would show other companies' data. They would let SQL hidden in a string reach `set_config`.

## 5. Declaring tables

Modules never write `CREATE TABLE`. They declare tables through `tenantTable()`, and the data layer generates everything tenancy needs.

| Who | Writes |
| --- | --- |
| The module | Columns, its own key columns, foreign keys by its own columns, checks, indexes, field tags (`pii`, `secret`, `retention`), and whether the table is append-only or partitioned by month |
| The data layer | `company_id` and its default; composite primary, unique and foreign keys; the cascade to `tenant`; `ENABLE` + `FORCE` RLS and the policy, on the table and every partition; grants, with the append-only revoke; the table's entry in the slice manifest; anonymisation hooks |

1. **Field tags** drive buyer anonymisation, a buyer's erasure, AI masking and export redaction from one declaration.
2. **Append-only tables** have `UPDATE`, `DELETE` and `TRUNCATE` revoked from the runtime role. At launch: the stock ledger, the order hold table (every hold and release is a row; the current set is read from it, [ADR-007](../../order-ingestion/)), the outbox and `audit_log`. Rows leave only through the slice operation, as the lifecycle role, or by a whole month detached after the archiver verified it ([ADR-002](../../data-retention/)).
3. **Partitions.** A partition named directly ignores its parent's policies and grants, because partitions follow Postgres's inheritance rules ([inheritance](https://www.postgresql.org/docs/17/ddl-inherit.html), [partitioning](https://www.postgresql.org/docs/17/ddl-partitioning.html)). So every partition gets its own `ENABLE`, `FORCE` and policy, and no grant to the runtime or lifecycle role. No default privileges grant the runtime role anything. Only the monthly migration run names a partition.
4. **Partitioned by month:** `audit_log`, `event_log`, orders, the stock ledger and outbound sends.
5. **Logs:** one table per retention class. `audit_log` holds security and access events, kept at least a year for live companies. `event_log` holds module activity, kept 90 days.
6. **Operational state** (rate buckets, leases, nonces, staging) lives in tenant tables like everything else.
7. **Secrets:** one table, `secrets(company_id, purpose)`.

## 6. Guard rails

| Guard | Where | Rule | On failure |
| --- | --- | --- | --- |
| Query builder | Data layer | See the list below | Type error at build time; the lint fails the build; at run time the query check refuses the query |
| Commit check | Data layer | Before every commit, read `current_setting('app.company_id', true)` and `current_user`, and compare them with the company and role the transaction entered (owner ruling, 20 October 2026). No result reaches the client, and no egress intent is sent, until the transaction commits | Raise, roll back, page the operator, close the database's egress |
| Request guard | Data layer | Sign-in puts the signed-in company in request context. `forCompany(id)` throws when `id` differs. Operator and background code opt in explicitly; an operator does so only under a live grant ([ADR-010 SPEC 7](../../users-and-access/spec/#7-operator-access-to-a-company)). Opting in never bypasses row-level security | Throw |
| Caches | Data layer | Hyperdrive query caching is off. Any other cache is reached only through one key builder that takes the company id. Logs carry ids, never field values | Lint error |
| Catalogue lint | CI and production | [Section 6.1](#61-catalogue-lint) | Fail the build, or page and close egress |
| Change control | Source control | A change to the isolation code (the table helper, the functions in section 4, the policies, the query builder and its function allow-list, the commit check, the lint and the cross-company allow-list) needs a person's approval before it merges | Merge blocked |

**The query builder** (owner ruling, 21 October 2026). Modules never write SQL text. They build every query with a typed query builder ([Kysely](https://kysely.dev/)) that the data layer hands them inside an entered transaction, typed from the tables they declared with `tenantTable()`. The builder they receive:

1. builds only `select`, `insert`, `update` and `delete`, with upserts through `conflict()`;
2. has no raw-SQL helper: the builder's `sql` template, `raw` and `execute` on text are not exported to modules, and a lint refuses importing them;
3. calls only functions on an allow-list (aggregates, date, text and maths functions); `set_config`, `current_setting`, the `app.*` functions and every SQL-executing function are not on it;
4. names only tables and views the module declared, or another module's read views it was given through a port; never `pg_stats`, `pg_statistic` or another catalogue;
5. cannot begin, commit or roll back: the data layer owns the transaction.

**The query check** runs on every module query at run time, because types and lint can be bypassed (a cast, a name built at run time). A plugin on the builder walks each query's tree before it reaches the database and refuses, failing closed, any raw-SQL node, any function off the allow-list and any table or view outside the module's set. A refusal pages the operator.

Raw SQL exists only in the kernel's data layer (entering, the commit check, the lock) and in migrations, both under change control. A query the builder cannot express is solved by extending the builder or adding a view by migration, never by raw SQL in a module.

The commit check stays as the second fence, and SQL-executing functions stay revoked ([section 4](#4-functions)). The foundation's stock ledger trigger is not module SQL: a migration defines it, and it only applies a ledger entry to its balances.

### 6.1 Catalogue lint

Fails if any table or partition in a cell has:

1. no `company_id NOT NULL` leading its primary key, or any unique key or index not led by `company_id`;
2. no forced RLS, a policy missing either clause, or a policy whose expression is not exactly `company_id = app.company()`;
3. a foreign key not composite on `company_id`, or no cascade to `tenant`;
4. a grant on a partition, or a `TRUNCATE` grant;
5. a runtime role holding `UPDATE`, `DELETE` or `TRUNCATE` on an append-only table.

It also fails on:

6. raw `CREATE TABLE`, `serial` or identity columns, `ON CONFLICT` without `company_id`, or session-level `SET` in module source;
7. `SECURITY DEFINER` outside the allow-list, views without `security_invoker`, or materialized views;
8. default privileges for the runtime role;
9. a runtime or lifecycle role with `BYPASSRLS`, or any role but the owner in `neon_superuser`;
10. `app.company()` not `STABLE` and `PARALLEL SAFE`, or labelled `SECURITY DEFINER`;
11. the runtime role able to execute a function in [section 4](#4-functions)'s revoked list.

Named exceptions: the `tenant` table, keyed by its own `id`, and the definer owner's read policies on `due` and `buyer_ref`.

## 7. Control database and routing

Control is its own database on its own compute. A cell credential can never read the login directory, and restoring a cell can never rewind control.

**Control holds, and nothing else:**

| Data | Notes |
| --- | --- |
| Company registry | Plan (trial or paid), status, subscription, tombstones, `database_id` |
| Database registry | `database(id, region, kind shared or dedicated, state open, closed or draining, cap)` |
| Login directory | Logins, sign-in methods, recovery codes, sessions ([ADR-013 SPEC 1](../../sign-in/spec/#1-the-login)); only the sign-in role touches these |
| Memberships and operator data | Memberships, operator accounts and grants. Written by the runtime role |
| External directory | Marketplace seller id → company |
| Erasure register | Every buyer erasure and company tombstone, by id and time only. Also written, entry by entry, to an append-only log in object storage, so a restore of control cannot lose an erasure |
| Sync epoch | Per company, raised on every restore ([ADR-008](../../inventory-sync/)) |
| Platform data | Settings, the platform security log, shared marketplace quotas, usage rollups, alerts |
| Migration summary | Per database, the version the last deploy reached ([section 12](#12-operations)) |

**Emails in control** are stored only as an HMAC of the normalised address, keyed by a secret held outside Postgres by the sign-in Worker. The address lives only in the company's own users table.

**Routing:**

1. `forCompany(id)` reads `company.database_id` from control (cached) and uses that database's connection.
2. A stale cache cannot do harm: the old database's tenant row is no longer `open`, so `enter_company` raises, and the router reloads the route once.
3. Each database in the registry has one Hyperdrive binding in the Worker.
4. Reads of control always use control's own connection, never a cell's transaction.

**Writes across databases** (sign-up, adding a user, closing a company, opening an operator grant):

1. Write the company side first, in one cell transaction, with an outbox note naming the control write still needed.
2. Then write control. The write is idempotent.
3. If the second write fails, the sweeper retries the note until it succeeds.
4. No transaction spans two databases.
5. Repairs run as the runtime role and only rewrite memberships, directory and registry rows. Logins, sign-in methods, recovery codes and sessions are written only by the sign-in Worker. At sign-up the login exists before the company does.

## 8. Adding companies and databases

Every company in a cell shares that cell's database, Hyperdrive configuration and Worker binding, so a new company needs none of them. Adding a company is a product action. Adding a database is infrastructure work done ahead of need.

### Adding a company

Runs at sign-up, or when the operator creates an enterprise company.

1. **Pick the database.** A trial or paid company goes to the newest `open` shared cell. A new enterprise company goes straight to its dedicated database. An existing company that becomes enterprise is moved there by the slice operation.
2. **One cell transaction:** `app.open_tenant(id)`, the company's own rows and its member row, and an outbox note for control.
3. **Write control:** the registry row with its `database_id`, and the membership ([ADR-010 SPEC 6](../../users-and-access/spec/#6-invitations-sign-up-and-removal)).
4. The company is reachable once control routes to it.

Sign-up never runs a migration and never registers a database.

### The cell cap

1. A shared cell's cap is 200 companies; a dedicated database's cap is 1. A shared cap above 200 is refused.
2. Placement counts the companies whose `database_id` is that cell. When the count reaches the cap, it sets the cell `closed`. A closed cell keeps serving the companies it has.
3. The cap is soft (owner ruling, 20 October 2026). The count is read without a lock, so two sign-ups at the same moment may place a cell slightly past 200.

### Adding a cell

`cell:add`. The steps are in the [runbook](../../runbooks/add-a-cell/). The rules:

1. Roles are made in SQL, never in the console.
2. Every Hyperdrive configuration is created with caching off and points at Neon's direct endpoint, not Neon's pooler.
3. The cell is registered in control as `closed` once migrated, so the audit and its sweeper see it.
4. It becomes `open` only after a checked deploy: the deployed Worker opens a transaction through the new binding, as the runtime role, and enters the canary company; then the production audit passes.

### Adding a dedicated database

`dedicated:add` is `cell:add` with `kind = dedicated` and a cap of 1, in a Neon project of its own. Steps: [runbook](../../runbooks/add-a-dedicated-database/).

### Dedicated databases and residency

- **Inside the UK and EU**, the database alone is enough. Every database is in Neon's EU region, the Worker is placed next to it, and Durable Objects and object storage use Cloudflare's EU jurisdiction.
- **Outside the EU**, a dedicated database needs a whole cell of its own: Worker placement, Hyperdrive configuration, object-storage bucket, Durable Object jurisdiction, logs and backup location.

### Trials

1. A trial lives in the newest open shared cell from sign-up. Paying changes its plan in control; nothing moves.
2. Trials have the same backups, alerts and switch-off rules as paying companies: a trial may already sell on real marketplaces. Demo companies live in a cell like any other company.
3. When trials together use more than 25% of a cell's compute for 7 days, the system recommends a cell for trials only. New trials then start there, and a trial that pays is moved to a paid cell by the slice operation.
4. When a trial lapses or a company closes, retention and erasure follow [ADR-012](../../billing-and-plans/). Until erased, the data stays in its cell.

### When to add a database

The system recommends a new cell when any signal holds for 7 days. The operator decides.

| Signal | Recommend a new cell when |
| --- | --- |
| Companies in the cell | 160, 80% of the cap |
| Hyperdrive pool | Over 80% of ~100 connections in use at peak, or requests waiting for a connection |
| Compute | At its autoscaling maximum for over 20% of the busiest hour |
| Restore time | The drill's restore of the cell's largest company takes over 15 minutes, or the cell holds over 500 GB. A company that alone breaks this is offered a dedicated database |
| Trials | Trials use over 25% of a cell's compute |
| Hyperdrive configurations | 15 of 25 used: ask Cloudflare for more |

## 9. Background work and the outbox

### The sweeper

1. Each database (shared cell or dedicated) has one sweeper: a Durable Object named after the database, created on demand from its registry row. It is created in the EU jurisdiction.
2. It reads `app.due_companies` once, then runs each due company in its own transaction, side by side.
3. No background code loops over the company registry or visits a company with nothing due.
4. After a run it sets its alarm for the earliest `next_due_at`, or none when nothing is due.
5. A change nudges the sweeper of the company's own database within seconds.
6. An hourly scheduled trigger reads control's database registry and nudges the sweeper of every database in state `open`, `closed` or `draining`. This is the safety net for a lost alarm.

### The `due` table

`due(company_id, kind, next_due_at)` holds ids, kinds and times only. It is a tenant table, indexed on `next_due_at`.

1. A command that creates future work upserts its `due` row in its own transaction, keeping the earlier time.
2. The job that does the work sets the next time, or deletes the row, in its own transaction.
3. A kind is declared by the module that owns the work. The sweeper refuses an undeclared kind.
4. A move copies the company's `due` rows with its slice.

Launch kinds, taken from the records:

| Kind | Owner | Due when |
| --- | --- | --- |
| Outbox delivery | Kernel | A note has no receipt for one of its handlers |
| Control repair | Kernel | A cross-database note's control write has not landed |
| Egress send and read-back | Channels ([ADR-004](../../channel-connectors/)) | A recorded send is due, or a send passed its deadline unconfirmed |
| Backup order read | Channels, importing into Orders ([ADR-007](../../order-ingestion/)) | An account's scheduled read is due |
| Listing safety read | Channels, handing over to Listings ([ADR-005](../../catalogue-sync/)) | An account's daily read is due |
| Nightly stock check | Inventory ([ADR-006](../../stock-ledger/)) | Once a night |
| Buyer anonymisation | Buyer data ([ADR-009](../../buyer-data/)) | 30 days after delivery |
| Erasure after closing | Billing ([ADR-012](../../billing-and-plans/)) | 30 days after the company closes |

### Fair shares

Platform settings in control, changed without a deploy (owner ruling, 20 October 2026). Starting values:

| Limit | Value | Unit |
| --- | --- | --- |
| Sweeper slots per cell | 40 | Company jobs running at once, each holding one pooled connection; leaves ~60 of ~100 for requests |
| Per company | 8 | Background or bulk jobs running at once |
| Trials, background (*Later*, [section 0](#0-at-launch-and-later)) | 25% of the cell's sweeper slots | All trial companies in the cell together |
| Trials, marketplace (*Later*) | 25% of each allowance shared by the whole application, at lower priority | Stock decreases on a live connection are exempt and always go first |

### The outbox

1. **Outbox note.** The transaction that makes a change also writes the note. Both commit or neither does.
2. **Deliver now.** Right after commit, the request or job that committed hands the note to every handler of that kind. This is the normal path.
3. **Handler.** Runs in a transaction that also writes a receipt for (event, handler). A second delivery does nothing.
4. **Leftovers.** The sweeper delivers any note still missing a receipt.
5. The outbox, not a queue, is the source of truth. The inbound queue carries only marketplace webhooks, which must be answered before anything is written.

**Egress effects** are calls that change something on a marketplace or at a supplier: figures, dispatch, confirmations, messages. They go through the egress gate ([ADR-000 SPEC 7](../../system-architecture/spec/#7-the-egress-gate)). Notice subscriptions made by a connector's connect and disconnect hooks are set-up calls, not egress effects: they run in shadow mode too, through the host's HTTP and rate budgets ([ADR-004](../../channel-connectors/)).

## 10. Company lifecycle

### The slice operation

1. One operation, generated from the catalogue, copies or deletes every row where `company_id = X`, in foreign-key order. Export, move, restore, dedicated placement and erase all use it.
2. It runs in the operations job, as the lifecycle role, over a direct connection (not Hyperdrive, whose statements stop at 60 seconds).
3. It works in committed batches of short transactions while the company is fenced. One long transaction would hold back vacuum for every company in the cell.
4. It reads from a branch or a read replica where it can, and through parent tables only.
5. Loading a slice refuses a company that has a tombstone, and does not finish until every erasure register entry for that company is replayed.
6. Every branch the lifecycle tool makes has every tenant row set to `lookback` before anything else connects, and is deleted within 24 hours.

### Erase

Erase is done when all three hold, recorded in the erasure register:

1. the batch deletes and then the tenant row delete have committed;
2. a generated count over every table is 0 for the company;
3. the company's data key is destroyed.

Erase also purges the company's files and any soft-deleted or versioned copies in object storage, and releases its marketplace seller ids in control. It removes the company's `audit_log`, so the one-year retention applies to live companies only. Steps: [runbook](../../runbooks/erase-a-company/).

### Export

A bundle: a manifest with per-table row counts and hashes, machine-readable files the slice operation can load again, and readable CSV files. Bound to the company id, refused if loaded under another company, and logged as a view of buyer data. Steps: [runbook](../../runbooks/export-a-company/).

### Move

Fence (`moving_out`), copy in batches, compare checksums, switch the registry row, set the source to `moved_out`, delete the source slice. Steps: [runbook](../../runbooks/move-a-company/).

### Restore

| Kind | When | Effect | Runbook |
| --- | --- | --- | --- |
| Look back | Most mistakes, such as one bad bulk edit | Old records read from a branch; what is needed is copied back as normal commands | [Look back](../../runbooks/restore-a-company-look-back/) |
| Full rewind | Corruption only | The company's live slice replaced from a branch, then made safe before stock is pushed | [Full rewind](../../runbooks/restore-a-company-full-rewind/) |
| Whole cell | Disaster | The cell restored, then every company made consistent with control | [Whole cell](../../runbooks/restore-a-whole-cell/) |

After any full rewind, before the company opens:

1. the erasure register and the anonymisation rule ([ADR-009](../../buyer-data/)) are replayed;
2. counters are at least their live values, and invoices and credit notes issued after the restore time are re-registered from object storage ([ADR-011](../../invoicing-and-vat/));
3. restored outbound sends are `unknown`, never resent; every account is back in shadow; the sync epoch is raised ([ADR-008](../../inventory-sync/));
4. orders placed since the restore time are re-imported, and the seller confirms the differences before any stock push.

### Backups

| Rule | Value |
| --- | --- |
| Point-in-time history window | 7 days (`history_retention_seconds` 604800) |
| Scheduled snapshots | Kept 30 days |
| Manual snapshots | None: they never expire |
| Erasure complete in backups | Day 30, stated in the customer terms |
| Files in object storage | Versioning or a 30-day soft delete; a file key is never overwritten |

### Encryption

1. Credentials and buyer contact fields are encrypted under a per-company data key in `secrets(company_id, purpose)`, wrapped by a key-encryption key held as a platform secret.
2. `company_id` is bound in as associated data, so a row read under the wrong company fails to decrypt.
3. The wrapped keys stay in the database. Which buyer fields, and the search they allow, are [ADR-009's](../../buyer-data/).

### Drills

Monthly at launch, a random real company and each cell's largest company are restored unattended; control has a drill of its own. *Later* ([section 0](#0-at-launch-and-later)): the random drill weekly, and the canary moved and moved back nightly. Steps: [runbook](../../runbooks/drills/).

## 11. Production checks

CI proves the schema it builds. These prove the databases running, because a console role, a partition made after deploy or a hand-edited configuration is invisible to CI. Each failure pages the operator and closes egress for the affected database.

**Audit, at every deploy and every night,** over every database and branch in the Neon project and every Hyperdrive configuration in the account:

1. The only login roles are the owner, runtime and lifecycle roles, plus the sign-in role on control.
2. The runtime role has no right on the login tables. Only the owner has `BYPASSRLS` or is in `neon_superuser`. No runtime or lifecycle role owns a table.
3. The definer owner cannot log in, is not in `neon_superuser`, and has only the rights in [section 3](#3-roles).
4. Every Hyperdrive configuration has caching off.
5. The catalogue lint passes on the live catalogue, and the next two months' partitions exist.
6. The history window is 7 days, scheduled snapshots are kept 30 days, and no manual snapshot exists.
7. Every branch was made by the lifecycle tool and is younger than 24 hours.
8. Each database's migration version is the one the deployed code needs.
9. Every Worker is placed next to its databases and has invocation logs off. Every queue and Durable Object namespace is in the EU jurisdiction. No Worker binds a key-value store, SQL database or analytics store. A failure here pages the operator but does not close egress: it concerns where data is processed, not who can see it.

**A canary company in every database.** A second synthetic company must see none of the canary's rows: every table nightly and after each deploy and each new partition. A transaction with no company set must raise. *Later* ([section 0](#0-at-launch-and-later)): a few tables every 10 minutes, and the egress gate scanning every outbound payload for the canary's marker strings.

## 12. Operations

1. **Timeouts.** Every migration sets a `lock_timeout` and retries, so a migration waiting for a lock on a shared table does not queue every seller behind it.
2. **Migrations run as a ring:** first on control, then the newest cell (which holds the trials and the canary), then the others. They finish everywhere before new code goes live ([ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying)).
3. **Migrations only add.** A migration already merged is never edited.
4. **One-time reset before launch** (owner ruling, 20 October 2026). Before launch, every module's migrations were squashed into one new first migration. This was allowed once, only because no production database existed. Development databases from before the reset are recreated, and the data layer refuses to start on a database that still holds objects from before it. From then on rule 3 has no exception.
5. **Migration ledger.** Each database's own ledger, committed with each migration, is the authority on what it has applied. Control keeps, per database, the version the last deploy reached; the deploy writes it after reading each database's ledger.
6. **Partitions.** A monthly scheduled run of the CI migration job creates partitions three months ahead, so a failed run waits for the next. It detaches and drops a month only after the archiver has written and verified that month's per-company files ([ADR-002](../../data-retention/)).
7. **Hot rows.** `due` and the counter table get a lower fillfactor and their own autovacuum thresholds.
8. **Alerts** on transaction-id age, long-running transactions and leftover replication slots.
9. **Scale to zero is off** for production databases.

## 13. Platform constraints

Checked against Neon's, Cloudflare's and AWS's documentation on 18 and 21 October 2026. Re-check before launch.

| Constraint | Consequence for Vervoro | Source |
| --- | --- | --- |
| All databases on one Neon branch share its compute and `max_connections` (839 for a 0.25–2 CU compute) | Control has a compute of its own | [Neon compatibility](https://neon.com/docs/reference/compatibility) |
| Point-in-time restore reaches back as far as the history window: 1 day by default, at most 7 on Launch, 30 on Scale | The window is set to 7 days, and the audit checks it | [History window](https://neon.com/docs/postgres/backup-restore/history-window) |
| Restore works on a whole branch, never one database or one company | Restoring one company is a branch plus the slice copy | [Backup and restore](https://neon.com/docs/guides/backup-restore) |
| Scheduled snapshots are kept up to 35 days; manual ones never expire unless given an expiry | Scheduled 30 days; no manual snapshots | [Backup and restore](https://neon.com/docs/guides/backup-restore) |
| Roles created in the Neon console, CLI or API join `neon_superuser`, which has `BYPASSRLS`; roles created in SQL get only what is granted | Every role is created in SQL; the audit checks it | [Neon roles](https://neon.com/docs/manage/roles) |
| Hyperdrive pools connections itself | Hyperdrive connects to Neon's direct endpoint, never Neon's pooler | [Hyperdrive with Neon](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/) |
| 25 Hyperdrive configurations per paid account, more by request. One configuration is one database and one user | One configuration per database and role: three at launch (control as runtime, control as sign-in, cell A), about ten at 1,000 companies; staging in a separate account | [Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/) |
| About 100 origin connections per configuration; a statement stops after 60 seconds | ~100 pooled connections per cell; slice operations use a direct connection | [Hyperdrive limits](https://developers.cloudflare.com/hyperdrive/platform/limits/) |
| Transaction-mode pooling: a `SET` inside a transaction takes effect, and the connection is reset when it returns | The transaction-local company setting relies on it | [How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) |
| Query caching is on by default and cannot see the company setting | Caching off on every configuration; the audit refuses any with caching on | [Query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/) |
| A Worker reaches a Hyperdrive configuration only through a binding in its deployed configuration | Adding a database needs a deploy | [Hyperdrive](https://developers.cloudflare.com/hyperdrive/get-started/) |
| Each transaction holds one pooled connection until it ends | No marketplace or other outside call runs inside a transaction | [How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) |
| A Neon major Postgres upgrade is a new project and a copy | A runbook before the first major upgrade | [Neon upgrade](https://neon.com/docs/postgresql/postgres-upgrade) |
| Placement is a hint and covers fetch handlers only | Queue, alarm and cron handlers are not placed; the placed-work test measures their lock time | [Placement](https://developers.cloudflare.com/workers/configuration/placement/) |
| Queues and Durable Objects can be held to the EU jurisdiction; a Durable Object's id is still logged outside it | Both created in the EU jurisdiction; ids carry no company or buyer data | [Queues data location](https://developers.cloudflare.com/queues/configuration/data-location/), [Durable Objects data location](https://developers.cloudflare.com/durable-objects/reference/data-location/) |
| One invocation waits on at most six connections at once | A sweep or a queue batch runs at most six company jobs per invocation | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Durable Object alarms are retried up to six times, then not run until set again | The hourly safety net and the outside check stay | [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) |
| Work handed off after the response is cancelled 30 seconds later | A lease covers the cancelled delivery; the sweeper takes it | [Context](https://developers.cloudflare.com/workers/runtime-apis/context/) |
| Workers Logs keep 7 days; their storage location is not stated; invocation logs can be switched off | Ids-only lines; invocation logs off; the 12-month security log stays in Postgres | [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) |
| Cloudflare's data-localisation list does not cover Hyperdrive, Queues or Workers Logs | Caching off; ids-only queue messages and logs | [Compatibility](https://developers.cloudflare.com/data-localization/compatibility/) |
| Amazon's notifications are delivered only to SQS or EventBridge | An AWS bridge posts them to the app's webhook | [SP-API notifications](https://developer-docs.amazon/sp-api/docs/notifications-api-v1-use-case-guide) |
| EventBridge API destinations wait 5 seconds for an answer and retry for 24 hours | The queue takes the notice in time; the backup order read covers one dropped after 24 hours | [API destinations](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-api-destinations.html) |

## 14. Tests that prove each rule

Isolation counts as proven only on real Postgres under the runtime role. An embedded or superuser database skips row-level security even when it is forced.

| Test | Where | Proves | Rules |
| --- | --- | --- | --- |
| Isolation suite | CI, real Postgres, runtime role | As company A, every read, insert, update and delete of B's rows is refused, for every tenant table; an unset company raises | 1, 2 |
| Suite can fail | CI, scratch database | With one `FORCE` and one composite foreign key removed, the isolation suite and the fuzz fail | 1, 2 |
| Append-only | CI, real Postgres | As runtime, an update, delete or truncate of an append-only row is refused; as lifecycle, the slice operation still removes a company's rows | 5 |
| Two-company fuzz | CI, real Postgres | Every command, run for A and B interleaved, touches only its own rows | 1 |
| Query builder | CI | Run-time tests with casts and names built at run time: a raw node, an off-list function and an undeclared table are refused by the query check; type tests: a module cannot build `set_config`, a function off the allow-list, transaction control, DDL or an undeclared table; the lint fails a module that imports the raw-SQL helpers | 4, 6 |
| Commit check | CI, real Postgres | A transaction whose company setting or role changed after entering is rolled back and alerts | 6 |
| Catalogue lint | CI and production | Every lint rule holds for every table and partition; seeded bad tables fail | 6.1 |
| Two databases | CI, two real Postgres | Entering a company a database does not hold raises; the request guard throws on a mismatched id; each role enters only the states in [section 1](#tenant-states) | 1, 6, 7 |
| Pooler soak | CI, transaction-mode pooler | 10,000 interleaved transactions for 20 companies each see only their own company; a statement after `COMMIT` errors | 1 |
| Hyperdrive run | Staging, real Hyperdrive | The same soak through Hyperdrive | 1, 13 |
| Roles | CI and production | The Worker binds only the runtime role; only the owner has `BYPASSRLS` or `neon_superuser`; only the operations job holds the lifecycle credential; a serving login with a bypassing membership refuses to start | 3 |
| Sign-up | CI, real Postgres, runtime role | Sign-up writes the tenant row, company rows and note in one transaction through `open_tenant`; a second `open_tenant` for the same id raises | 4, 8 |
| Sweeper | CI | Only due companies run; at most 40 at once and 8 per company; no code path visits a company with nothing due | 9 |
| Slice round trip | CI | Copy, compare checksums, erase, count 0; a tombstoned company's slice is refused; the erasure register is replayed | 10 |
| Canary | Production | Another company sees none of the canary's rows; outbound payloads never carry its markers | 11 |
| Restore drill | Production, monthly (weekly later) | A real company restores unattended into a branch the runtime role cannot enter, neighbours unchanged, time per gigabyte recorded | 10 |
| Kill test | Staging, before launch and after a platform change | Killing the app mid-transaction and mid-send leaves the ledger and the egress log consistent; every effect is either recorded and sent once or recorded as `unknown` and read back | 9 |
| Placed work | Staging, before launch | A job run by the sweeper or the queue consumer holds its company's lock about as long as the same work in a request | 13 |

## 15. Questions the review raised, answered

A code review found 17 places where the record was unclear. Each is answered by a rule above.

| # | Question | Answer | Where |
| --- | --- | --- | --- |
| 1 | May a plain login switch into the runtime role with `SET ROLE`? | No. The runtime role logs in itself (owner ruling) | [3](#3-roles) |
| 2 | Which role writes the tenant row at sign-up? | The runtime role, through the allow-listed definer `app.open_tenant` (owner ruling) | [4](#4-functions), [8](#adding-a-company) |
| 3 | Is a keyword filter enough? | No. Modules write no SQL; they use a typed query builder with a function allow-list, and SQL-executing functions are revoked (owner ruling, 21 October 2026) | [4](#4-functions), [6](#6-guard-rails) |
| 4 | Are order holds append-only, or only their log? | The hold table itself: every hold and release is a row ([ADR-007](../../order-ingestion/)) | [5](#5-declaring-tables) |
| 5 | Does the cascade from `tenant` break append-only? | No. It is the erase path's last step, open only to the lifecycle role | [2](#2-keys-and-identifiers), [10](#erase) |
| 6 | Are notice subscriptions egress effects? | No. They are set-up calls run on connect, in shadow too ([ADR-004](../../channel-connectors/)) | [9](#the-outbox) |
| 7 | How does the row check work? | A check of the company setting and role before every commit (owner ruling) | [6](#6-guard-rails) |
| 8 | How hard is the cap, and do half-added companies count? | Soft (owner ruling). A company counts once control places it | [8](#the-cell-cap) |
| 9 | Who writes and clears `due`, and which kinds exist? | The command that creates the work writes it; the job clears it; launch kinds listed | [9](#the-due-table) |
| 10 | How does the hourly trigger reach one sweeper per database? | It reads control's database registry and nudges each | [9](#the-sweeper) |
| 11 | What are "about 8 jobs" and "the trial share"? | 40 slots per cell, 8 jobs per company, 25% for trials (owner ruling) | [9](#fair-shares) |
| 12 | Is an enterprise added directly or moved? | New: added directly. Existing: moved | [8](#adding-a-company) |
| 13 | Which migration ledger is the authority? | Each database's own; control keeps a summary | [12](#12-operations) |
| 14 | When does a new cell become `open`? | After a checked deploy and the audit; until then `closed` | [8](#adding-a-cell) |
| 15 | Which role repairs login rows? | None. Repairs touch memberships and directories only, as runtime; logins are the sign-in Worker's | [7](#7-control-database-and-routing) |
| 16 | Was the pre-launch migration squash allowed? | Once, before launch (owner ruling) | [12](#12-operations) |
| 17 | May one transaction read several companies, or control? | No. One company per transaction; control on its own connection | [1](#1-tenancy-inside-a-cell), [7](#7-control-database-and-routing) |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Cell catalogue:** every table and partition has `relrowsecurity` and `relforcerowsecurity` true (`pg_class`).
- [ ] **Cell catalogue:** every policy's expression is exactly `company_id = app.company()`, in both `qual` and `with_check` (`pg_policies`).
- [ ] **Cell catalogue:** every primary key, unique key, foreign key and index starts with `company_id` (`pg_index`, `pg_constraint`).
- [ ] **Cell catalogue:** every foreign key to `tenant` is `ON DELETE CASCADE`; no other foreign key is single-column.
- [ ] **Roles:** only the owner, runtime and lifecycle roles can log in, plus sign-in on control; only the owner has `rolbypassrls` (`pg_roles`, `pg_auth_members`).
- [ ] **Roles:** the runtime role is not a member of any role (`pg_auth_members`), and the app connects as it directly, with no `SET ROLE` anywhere in the data layer.
- [ ] **Grants:** the runtime role has no `UPDATE`, `DELETE` or `TRUNCATE` on the stock ledger, order holds, outbox or `audit_log` (`information_schema.role_table_grants`).
- [ ] **Grants:** no partition has a grant, and the runtime role cannot execute `query_to_xml` (`has_function_privilege`).
- [ ] **Functions:** exactly three `SECURITY DEFINER` functions in a cell, each with a `search_path` setting, owned by a role that cannot log in (`pg_proc.prosecdef`, `proconfig`).
- [ ] **Functions:** `app.company()` is `STABLE`, `PARALLEL SAFE`, not a definer, and raises when unset: run `select app.company()` in a fresh transaction.
- [ ] **Data layer:** every transaction's first statement is `enter_company` or `open_tenant`; there is no autocommit path for company work.
- [ ] **Data layer:** no module imports the query builder's raw-SQL helpers (`sql`, `raw`) or a database driver; search the module packages. The function allow-list does not hold `set_config`, `current_setting` or any `app.*` function.
- [ ] **Data layer:** the commit check runs before every commit, read-only transactions included, and a mismatch pages and closes egress.
- [ ] **Data layer:** no code path keeps one transaction open across two companies, or reads control through a cell's transaction.
- [ ] **Worker configuration:** the app Worker holds only runtime credentials; no serving process holds the owner or lifecycle credential, or runs migrations.
- [ ] **Worker configuration:** one Hyperdrive binding per database in control's registry, none a placeholder, each with caching off.
- [ ] **Control:** holds no business table; the login directory stores an email HMAC, never an address; the erasure register, sync epoch and migration summary exist.
- [ ] **Control:** the runtime role has no right on logins, sign-in methods, recovery codes or sessions.
- [ ] **Routing:** every request reaches its database through `forCompany`, and a request for company A with a session for B throws.
- [ ] **Sign-up:** writes `open_tenant`, the company rows and the outbox note in one cell transaction, then control; it runs no migration.
- [ ] **Sweeper:** no background job loops over the company registry; each writer upserts `due`; the hourly trigger nudges every database in control's registry.
- [ ] **Slice operation:** erase, export, move and restore run in the operations job as the lifecycle role, never the owner.
- [ ] **CI:** the catalogue lint runs over all modules on real Postgres and is green; the isolation suite covers every tenant table.
- [ ] **Production:** the nightly audit and the canary run, and a seeded failure in staging pages and closes egress.
- [ ] **Source control:** a change to the isolation code needs a named approver before it merges.
