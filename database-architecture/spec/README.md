# ADR-001 SPEC: Multi-tenant database architecture

| | |
| --- | --- |
| **Decision** | [ADR-001: Multi-tenant database architecture](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-001-multi-tenant-database-architecture) |
| **Date** | 20 October 2026; hosting reviewed 21 October 2026; sign-in data aligned with Better Auth ([ADR-013](../../sign-in/)) 21 October 2026; amended by owner rulings: control unreachable (7) and the sign-in role's rights (3), 21 October 2026; one Neon project per database (7, 8), Neon's internal roles and the staging rule (3), append-only and partitioned tables declared per table (5), the audit over every project, staging's audit and an audit failure on control (11), the sign-in role reading the security log for a data request (3, 11), and who refuses a database from before the reset (12), 22 October 2026; a sign-up link's address in control (7), the sign-up company name (7) and request keys (5, 9), 23 October 2026; an invitation's page in the request guard (6), 24 October 2026; amended by owner rulings of 25 October 2026: the sync epoch read once per sending job (7), `audit_log` kept 13 months (5, 10), orders not partitioned (5, 12), restore drills quarterly at launch (0, 10, 14), request keys deleted daily (5), fair shares kept 5 minutes and one nightly job per company (9), the session pass and the cached route (7), the commit check on writing transactions and `enter_company` refusing a second company (4, 6, 14, 15), pipelining off by default (1, 13), the serving check once per isolate (3), `due_companies` returning kinds (4), the outbox's receipts, retry window and low-water mark (9), traces off in production, on staging for the app Worker only (11, 13) |
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
| Unattended monthly restore drills (quarterly by the runbook at launch), then the random drill weekly | 50 companies | [10](#drills) |
| Automated full rewind and whole-cell restore (by the runbook, by hand, at launch) | The first drill or incident that shows the hand procedure is too slow | [10](#restore) |

## 1. Tenancy inside a cell

1. Every business table exists once per cell and carries `company_id uuid NOT NULL`.
2. Every table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and one policy with both `USING` and `WITH CHECK`: `company_id = app.company()`. The same holds for every partition.
3. `app.company()` returns the transaction's company and **raises** when none is set. An unset company is an error, never zero rows: a silent empty stock read could push 0 to a marketplace and delist a seller.
4. The `company_id` column default is `app.company()`, so an insert without a company also raises.
5. The data layer's first statement in every transaction is `select app.enter_company($1)` ([section 4](#4-functions)). The data layer refuses autocommit for company work. The data layer may send the statements behind it before it answers (pipelining): they run after it, inside the same transaction, and fail with it if it raises; nothing is decided on their answers until the entry has answered (owner decision, 25 October 2026; off by default, [section 13](#13-platform-constraints)).
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
| `company_id` leads every key | The first column of every primary key, unique key, foreign key and index, but one: a definer-only lookup across companies may have an index that does not, and `app.buyer_ref (hash)`, read by `app.buyer_ref_companies`, is the one case; the catalogue lint names it (owner ruling, 23 October 2026) |
| Composite foreign keys | `(company_id, x)` references `(company_id, x)`, so a row cannot point at another company's row. Postgres runs key checks outside row-level security, so these keys hold even where policies do not |
| Cascade to `tenant` | Every table has `company_id → tenant(id) ON DELETE CASCADE`. Deleting the tenant row is the last step of an erase ([section 10](#10-company-lifecycle)); the cascade guarantees nothing is left |
| IDs | uuidv7. No `serial` or identity columns, so nothing is numbered across companies and no id reveals a company's database |
| Human numbers and ordering | PO numbers, outbox sequence, the stock ledger's gapless sequence: from a counter table keyed `(company_id, name)`, taken in the writer's transaction. Counters travel with the company |
| The company's lock | A stock command's first statement after entering updates the company's stock counter row. That row lock is the company's lock, and the same update returns the next ledger number ([ADR-006](../../stock-ledger/)) |
| Upserts | Only through `conflict('id')`, which emits `ON CONFLICT (company_id, id)` |
| Marketplace cursors and watermarks | Keyed `(company_id, account)` |
| Idempotency and request keys | Unique per `(company_id, key)`, or per `(company_id, actor, key)` for request keys ([section 5](#5-declaring-tables) rule 8), in an unpartitioned table where the rows they guard are partitioned ([section 5](#5-declaring-tables)) |

## 3. Roles

| Role | Where | Created by | Can log in | Bypasses RLS | Rights | Credential held by |
| --- | --- | --- | --- | --- | --- | --- |
| **Owner** | Every database | Neon, with the project | Yes | Only if it holds `BYPASSRLS` itself. Neon makes it a member of `neon_superuser`, but Postgres does not pass `BYPASSRLS` on through membership, so `FORCE` binds it otherwise (checked on the project; owner ruling, 21 October 2026) | Owns every table. Migrations, partitions, creating the other roles | The CI migration job only |
| **Runtime** | Every database | SQL | Yes, as itself | No (`NOBYPASSRLS`) | `SELECT, INSERT, UPDATE, DELETE` on tenant tables, minus the append-only revoke. `SELECT` on `tenant`. No usage on control's `auth` and `auth_policy` schemas. Owns nothing | The app Worker, through Hyperdrive |
| **Lifecycle** | Every database | SQL | Yes | No | Reads and deletes through parent tables for the slice operation, including append-only tables. Enters the states in [section 1](#tenant-states). No DDL. Owns nothing | The operations job only, never a serving Worker |
| **Sign-in** | Control only | SQL | Yes | No | `SELECT, INSERT, UPDATE, DELETE` on the `auth` schema (Better Auth's tables) and the `auth_policy` schema (Vervoro's sign-in policy tables); `INSERT` and `SELECT` on the platform security log (`SELECT` for a login's own data request: the `export` call, [ADR-013 SPEC 8](../../sign-in/spec/#8-the-sign-in-worker); owner ruling, 22 October 2026), with `USAGE` on its schema; nothing else (owner ruling, 21 October 2026; [ADR-013 SPEC 8](../../sign-in/spec/#8-the-sign-in-worker)). Owns nothing; the owner role creates both schemas by migration | The sign-in Worker, through its own Hyperdrive configuration |
| **Definer owner** | Every cell | SQL | No | No | Owns the three allow-listed functions. Its own read policy on `due` and `buyer_ref`; insert on `tenant` | Nobody |

Rules:

1. No other role may log in, except Neon's own internal roles (rule 7). A role created in the Neon console, CLI or API joins `neon_superuser`, so no role is ever created there.
2. The runtime role logs in as itself. No login switches role with `SET ROLE` (owner ruling, 20 October 2026).
3. A serving connection refuses to start if its login is a superuser, has `BYPASSRLS`, owns a table, or is a member of the owner, of `neon_superuser` or of any role with those rights. It is checked once per isolate for a connection and its roles; a refusal is checked again (owner ruling, 24 October 2026).
4. The owner's emergency use goes through the CI migration job, records the reason first and alerts the operator ([ADR-009](../../buyer-data/spec/#7-who-can-see-it)). See the [runbook](../../runbooks/use-the-owner-role/).
5. The runtime role has a `statement_timeout` (30 seconds) and an `idle_in_transaction_session_timeout`. The data layer ends a query with no answer after 35 seconds, just above it, so a pipelined query that never answers fails (owner ruling, 25 October 2026).
6. **Staging** (owner ruling, 22 October 2026). Until launch, staging may be migrated and deployed from the owner's laptop, by the same deploy script the CI job runs, with staging-only credentials passed in at run time and synthetic data only. Staging keeps production's roles, row-level security, migration order and EU placement, so its tests prove production. Production is migrated and deployed only by the CI job.
7. **Neon's internal roles** (owner ruling, 22 October 2026). Neon creates and manages roles of its own on every project, today `neon_service`, which can log in and is in `neon_superuser`, and acts on Neon's behalf. These are the one exception to rules 1 and 3 and to the audit's role checks: the catalogue lint and the audit name them exactly, refuse any other unknown role, and alert the operator when Neon's list changes. Vervoro never uses their credentials.

## 4. Functions

| Function | Kind | Who may call | What it does |
| --- | --- | --- | --- |
| `app.company()` | `STABLE`, `PARALLEL SAFE`, never `SECURITY DEFINER` | Anyone | `nullif(current_setting('app.company_id', true), '')::uuid`; raises when null. Its labels let Postgres evaluate it once per statement and use the `company_id` index |
| `app.enter_company(id)` | Invoker | Runtime, lifecycle | Sets `app.company_id` for this transaction, then reads `tenant` through row-level security and raises unless the row exists in a state this role may enter. Raises (`VV002`) when the transaction already entered a different company; entering the same one again is allowed. Needs no special rights and no extra round trip; pipelined, it shares one with `begin` and the transaction's first read |
| `app.open_tenant(id)` | `SECURITY DEFINER`, allow-listed | Runtime | Used at sign-up in place of `enter_company`. Inserts a `tenant` row for `id` in state `open` and sets the company for this transaction. Raises if a row for `id` already exists (owner ruling, 20 October 2026) |
| `app.due_companies(limit)` | `SECURITY DEFINER`, allow-listed | Runtime | Returns `(company_id, next_due_at, first_due_at, kinds)` from `due` for companies due now, earliest first, `kinds` naming the declared kinds due (owner ruling, 25 October 2026), plus one row with no company holding the earliest future `next_due_at`, so the sweeper can set its alarm (owner ruling, 21 October 2026) |
| `app.buyer_ref_companies(hash)` | `SECURITY DEFINER`, allow-listed | Runtime | Returns the company ids holding an eBay buyer hash ([ADR-009](../../buyer-data/spec/#162-ebay)) |

Rules for the three definers:

1. Owned by the definer owner, which cannot log in.
2. `search_path` pinned in the function definition.
3. Return ids, times and the declared kind names of `due` only; never a payload or a seller's data (owner ruling, 25 October 2026).
4. `EXECUTE` granted to the runtime role only.
5. The owner is a member of the definer owner only while a migration hands it a function, and the membership is revoked straight after: a member would inherit the definer owner's read policies on `due` and `buyer_ref`, which see every company (owner ruling, 21 October 2026).

Every other `SECURITY DEFINER` function is refused by the lint.

**SQL-executing functions and `pg_stats`.** `query_to_xml`, `query_to_xmlschema`, `query_to_xml_and_xmlschema`, `cursor_to_xml`, `cursor_to_xmlschema`, `table_to_xml`, `table_to_xmlschema` and `table_to_xml_and_xmlschema` would let SQL hidden in a string reach `set_config`; `pg_stats` would show other companies' sample values. Every cell tries to revoke them from `PUBLIC`. On Neon the owner is no superuser and the platform may refuse the revoke; no revoke is then needed (owner ruling, 21 October 2026): the lint reports it as a warning, and the query check, which refuses every function off the allow-list and every catalogue table, is the fence ([section 6](#6-guard-rails)). Extensions that run SQL given as text, such as `dblink`, are never installed.

## 5. Declaring tables

Modules never write `CREATE TABLE`. They declare tables through `tenantTable()`, and the data layer generates everything tenancy needs.

| Who | Writes |
| --- | --- |
| The module | Columns, its own key columns, foreign keys by its own columns, checks, indexes, field tags (`pii`, `secret`, `retention`), and whether the table is append-only or partitioned by month |
| The data layer | `company_id` and its default; composite primary, unique and foreign keys; the cascade to `tenant`; `ENABLE` + `FORCE` RLS and the policy, on the table and every partition; grants, with the append-only revoke; the table's entry in the slice manifest; anonymisation hooks |

1. **Field tags** drive buyer anonymisation, a buyer's erasure, AI masking and export redaction from one declaration.
2. **Append-only tables** have `UPDATE`, `DELETE` and `TRUNCATE` revoked from the runtime role. Each table declares it through `tenantTable()`, and the lint reads the declarations; the tables named here are examples (owner ruling, 22 October 2026). At launch they include the stock ledger, the order hold table (every hold and release is a row; the current set is read from it, [ADR-007](../../order-ingestion/spec/#11-holds)), the outbox and `audit_log`. Rows leave only through the slice operation, as the lifecycle role, by a whole month detached, or deleted in batches from a whole table, after the archiver verified it ([ADR-002 SPEC 3](../../data-retention/spec/#3-archiving-a-month)), or, for outbox notes every handler has received, deleted 30 days after the last receipt by the lifecycle role ([ADR-002 SPEC 2](../../data-retention/spec/#2-the-retention-schedule), owner ruling, 21 October 2026), or, for `audit_log`, a whole month dropped by the monthly migration run once its newest row is 13 months old, never archived ([ADR-002 SPEC 2](../../data-retention/spec/#2-the-retention-schedule), owner ruling, 25 October 2026).
3. **Partitions.** A partition named directly ignores its parent's policies and grants, because partitions follow Postgres's inheritance rules ([inheritance](https://www.postgresql.org/docs/17/ddl-inherit.html), [partitioning](https://www.postgresql.org/docs/17/ddl-partitioning.html)). So every partition gets its own `ENABLE`, `FORCE` and policy, and no grant to the runtime or lifecycle role. No default privileges grant the runtime role anything. Only the monthly migration run names a partition.
4. **Partitioned by month:** each table declares it through `tenantTable()`, and the monthly migration run reads the declarations (owner ruling, 22 October 2026). At launch they are `audit_log`, `event_log`, the stock ledger and outbound sends. Orders, their lines, holds and cancellations and the VAT records are whole tables: once archiving is switched on ([ADR-002 SPEC 0](../../data-retention/spec/#0-at-launch-and-later)) the archiver copies their months and deletes them in small batches ([ADR-002 SPEC 3](../../data-retention/spec/#3-archiving-a-month); owner ruling, 25 October 2026). A unique index on a partitioned table must hold the partition column, so outbound sends keep their idempotency keys in an unpartitioned `(company_id, key)` table kept for the retention window. Until that table exists, outbound sends are unpartitioned (owner ruling, 21 October 2026).
5. **Logs:** one table per retention class. `audit_log` holds security and access events, kept 13 months for live companies (owner ruling, 25 October 2026). `event_log` holds module activity, kept 90 days by whole months ([ADR-002 SPEC 2](../../data-retention/spec/#2-the-retention-schedule)).
6. **Operational state** (rate buckets, leases, nonces, staging) lives in tenant tables like everything else.
7. **Secrets:** one table, `secrets(company_id, purpose)`.
8. **Request keys:** `app.request_key(company_id, actor, key, route, request_hash, answer, at)`, unique per company, actor and key, a tenant table under the company policy like every other. It is written in the transaction of the person's change it names, so a repeat with the same key gets the first answer and changes nothing. A repeat is answered only for the same actor, route and request, after the current request's own access check; any difference is refused, never replayed. `answer` holds ids and an outcome only: never a secret, a tagged field or a page of rows. A key is kept at least 7 days, and deleted by the sweeper within a day after (owner ruling, 25 October 2026); until then it is still replayed. Stock commands keep theirs in `stock_command` ([ADR-006 SPEC 12](../../stock-ledger/spec/#12-the-lock-keys-and-the-sequence)). Sign-up keeps none: it opens a company that does not exist yet, and taking its name once is its key (owner ruling, 23 October 2026).

## 6. Guard rails

This section and [section 1](#1-tenancy-inside-a-cell) own tenant isolation; other records link here. Isolation has two tiers.

| Tier | What it is | Guards |
| --- | --- | --- |
| **The security boundary** | What keeps one company from another's rows. Each part must hold; a failure in any is a cross-company exposure | Forced row-level security ([1](#1-tenancy-inside-a-cell)); the runtime role without `BYPASSRLS`, and restricted roles ([3](#3-roles)); one company per transaction, refused at the source ([1](#1-tenancy-inside-a-cell)); the commit check, on writing transactions (below); correct routing ([7](#7-control-database-and-routing)); composite keys ([2](#2-keys-and-identifiers)) |
| **Defence in depth** | What stops a mistake before it reaches the boundary, and finds one that got through | The typed query builder and its function allow-list, the run-time query check (part of the boundary for read-only transactions, which skip the commit check: there it is what refuses `set_config`, so it fails closed and is never weakened; owner decision, 25 October 2026), the catalogue lint ([6.1](#61-catalogue-lint)), the catalogue audit and the canary ([11](#11-production-checks)) |

**Why the commit check is part of the boundary.** Row-level security fences rows by the company setting, but it does not fence the setting itself: any SQL that runs inside a transaction could change it. The code review of the first implementation reproduced exactly that, as its most serious finding: module SQL switched its transaction to another company. Row-level security alone therefore does not fence the company context. The commit check does: it compares the setting and the role with what the transaction entered, before anything commits, and refuses the commit if either changed. On read-only transactions the fence is `enter_company`'s refusal of a second company; module SQL cannot call `set_config` (the query check).

| Guard | Where | Rule | On failure |
| --- | --- | --- | --- |
| Query builder | Data layer | See the list below | Type error at build time; the lint fails the build; at run time the query check refuses the query |
| Commit check | Data layer | Before every commit of a transaction that may write, read `current_setting('app.company_id', true)` and `current_user` and compare them with the company and role it entered (owner ruling, 20 October 2026). A read-only transaction (`begin read only`) commits without the check: `enter_company` refuses a second company at the source, and the transaction writes nothing (owner decision, 25 October 2026). No result of a writing transaction reaches the client, and no egress intent is sent, until it commits | Raise, roll back, page the operator, close the database's egress |
| Request guard | Data layer | Sign-in puts the signed-in company in request context. `forCompany(id)` throws when `id` differs. Operator and background code opt in explicitly; an operator does so only under a live grant ([ADR-010 SPEC 7](../../users-and-access/spec/#7-operator-access-to-a-company)). A pre-session route of the guard's module (an invitation's page, [ADR-010 SPEC 6](../../users-and-access/spec/#6-invitations-sign-up-and-removal)) puts the company its request names in request context, and reads it read-only as a system actor; it finds nothing without a secret held only as its hash (owner ruling, 24 October 2026). Opting in never bypasses row-level security | Throw |
| Caches | Data layer | Hyperdrive query caching is off. Any other cache is reached only through one key builder that takes the company id; platform data from control that is the same for every company (the VAT rate table, the fair shares) may be kept up to 5 minutes under a platform key; a value held in a Worker's memory that is the same for every company counts as one, and never holds a company's or a request's data (owner ruling, 25 October 2026). The one per-company value a Worker keeps is the route, keyed by company id ([section 7](#7-control-database-and-routing)). Logs carry ids, never field values | Lint error |
| Catalogue lint | CI and production | [Section 6.1](#61-catalogue-lint) | Fail the build, or page and close egress |
| Change control | Source control | A change to the isolation code (the table helper, the functions in section 4, the policies, the query builder and its function allow-list, the commit check, the lint and the cross-company allow-list) needs a person's approval before it merges. The approvers are named in a code-owners file; enforcing their review is off for now (owner ruling, 21 October 2026) | Merge blocked once enforced |

**The query builder** (owner ruling, 21 October 2026). Modules never write SQL text. They build every query with a typed query builder ([Kysely](https://kysely.dev/)) that the data layer hands them inside an entered transaction, typed from the tables they declared with `tenantTable()`. The builder they receive:

1. builds only `select`, `insert`, `update` and `delete`, with upserts through `conflict()`;
2. has no raw-SQL helper: the builder's `sql` template, `raw` and `execute` on text are not exported to modules, and a lint refuses importing them;
3. calls only functions on an allow-list (aggregates, date, text and maths functions); `set_config`, `current_setting`, the `app.*` functions and every SQL-executing function are not on it;
4. names only tables and views the module declared, or another module's read views it was given through a port; never `pg_stats`, `pg_statistic` or another catalogue;
5. cannot begin, commit or roll back: the data layer owns the transaction.

**The query check** runs on every module query at run time, because types and lint can be bypassed (a cast, a name built at run time). A plugin on the builder walks each query's tree before it reaches the database and refuses, failing closed, any raw-SQL node, any function off the allow-list and any table or view outside the module's set. A refusal pages the operator.

Raw SQL exists only in the kernel's data layer (entering, the commit check, the lock) and in migrations, both under change control. Modules still never write SQL. A query the builder cannot express has one escape route: a reviewed view added by migration, or a reviewed extension of the builder, both under change control. Never raw SQL in a module.

The builder, the query check and the allow-list are defence in depth; the commit check stays part of the boundary, and SQL-executing functions are revoked where the platform allows ([section 4](#4-functions)). Inventory's stock ledger trigger is not module SQL: its migration defines it, and it only applies a ledger entry to its balances.

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
9. a runtime or lifecycle role with `BYPASSRLS`, or any role but the owner and Neon's named internal roles ([section 3](#3-roles), rule 7) in `neon_superuser`;
10. `app.company()` not `STABLE` and `PARALLEL SAFE`, or labelled `SECURITY DEFINER`;
11. an extension that runs SQL given as text, such as `dblink`. The runtime role still able to execute a function in [section 4](#4-functions)'s list, or to read `pg_stats`, is a **warning**, not a failure, where the platform refused the revoke (owner ruling, 21 October 2026).

Named exceptions: the `tenant` table, keyed by its own `id`; the definer owner's read policies on `due` and `buyer_ref`; and each cell's migration ledger, which is the owner's alone, in its own schema, with no grants (owner ruling, 21 October 2026). The two views of the `pg_stat_statements` extension, `public.pg_stat_statements` and `public.pg_stat_statements_info`, by name: Neon's admin role owns them, so they cannot be made `security_invoker`. They read no table, only the statistics function, which shows each login its own statements with constants replaced; the lint fails if either view comes to depend on a table (owner ruling, 22 October 2026).

## 7. Control database and routing

Control is its own database on its own compute. A cell credential can never read sign-in data, and restoring a cell can never rewind control.

**One Neon project per database** (owner ruling, 22 October 2026). Control and every cell are each a Neon project of their own, never a branch of another project's database: each has its own storage, compute, history, restore and credentials, and is deleted on its own. A dedicated database is the same. A Neon branch is only a short-lived copy of one database (a migration or restore rehearsal, a preview), never holds a company's live data, and is deleted after use.

**Three kinds of data, kept apart:** sign-in data (the `auth` and `auth_policy` schemas, the sign-in role only), platform data (everything else in control, the runtime role), and company data (the cells). Sign-in data is never copied into a cell; a company's users table keeps its own copy of the person's address and name.

**Control holds, and nothing else:**

| Data | Notes |
| --- | --- |
| Company registry | Plan (trial or paid), tombstones and `database_id`. No stored status: a company's state is computed from dates ([ADR-012 SPEC 7](../../billing-and-plans/spec/#7-company-states)), and billing adds its own fields (owner ruling, 21 October 2026) |
| Database registry | `database(id, region, kind shared or dedicated, state open, closed or draining, cap)` |
| Sign-in data | Better Auth's tables in the `auth` schema (logins with their email address and name, sessions, passwords, passkeys, authenticators, backup codes, verifications, rate counts) and Vervoro's sign-in policy tables in `auth_policy`, including the company name a sign-up gave until the app opens it (`auth_policy.sign_up_company`; owner ruling, 23 October 2026) ([ADR-013 SPEC 2](../../sign-in/spec/#2-the-login-and-its-data)); only the sign-in role touches these |
| Memberships and operator data | Memberships, operator accounts and grants. Written by the runtime role |
| External directory | Marketplace seller id → company |
| Erasure register | Every buyer erasure and company tombstone, by id and time only. Also written, entry by entry, to an append-only log in object storage, so a restore of control cannot lose an erasure |
| Sync epoch | Per company, raised on every restore ([ADR-008](../../inventory-sync/)) |
| Platform data | Settings, the platform security log, shared marketplace quotas, usage rollups, alerts |
| Migration summary | Per database, the version the last deploy reached ([section 12](#12-operations)) |

**Emails in control** are stored readable, once per login, in Better Auth's user table in the `auth` schema, and a sign-up link's address in `auth_policy.address_proof` until the link is used or 24 hours pass (owner ruling, 23 October 2026), reachable only by the sign-in role; storage encryption covers it at rest and control's backups hold it for their 30 days. No outside identity service holds it ([ADR-009](../../buyer-data/spec/#17-the-sellers-users-sign-in-data)). Each company's users table holds its own copy.

**Routing:**

1. `forCompany(id)` reads `company.database_id` from control, cached up to 5 minutes per Worker isolate and up to 60 seconds in the session pass, and uses that database's connection; a stale cache is caught by rule 2 (owner decision, 25 October 2026).
2. A stale cache cannot do harm: the old database's tenant row is no longer `open`, so `enter_company` raises, and the router reloads the route once.
3. Each database in the registry has one Hyperdrive binding in the Worker.
4. Reads of control always use control's own connection, never a cell's transaction.

**Writes across databases** (sign-up, adding a user, closing a company, opening an operator grant):

1. Write the company side first, in one cell transaction, with an outbox note naming the control write still needed.
2. Then write control. The write is idempotent.
3. If the second write fails, the sweeper retries the note until it succeeds. The note is an ordinary outbox note whose handler writes control ([section 9](#the-outbox)).
4. No transaction spans two databases.
5. Repairs run as the runtime role and only rewrite memberships, directory and registry rows. Sign-in data is written only by the sign-in Worker. At sign-up the login exists before the company does.

**When control is unreachable** (owner, 21 October 2026). Every session check, route, shared pool token and sync epoch comes from control, so work stops safely and waits rather than guessing:

1. **People:** a session check needs control ([ADR-013 SPEC 1](../../sign-in/spec/#1-better-auth-and-what-is-switched-on)), so screens say Vervoro is unavailable. A session pass under 60 seconds old still answers for its session and the companies it names ([ADR-013 SPEC 5](../../sign-in/spec/#5-sessions), owner decision, 25 October 2026). A tap that got no answer shows "not sure" ([ADR-000 SPEC 12](../../system-architecture/spec/#12-the-client)).
2. **Background work and sends:** a job that needs control waits and retries. Nothing is sent to a marketplace, a decrease included, without its pool token and the sync epoch read from control by the job that sends it (the epoch once per job: [ADR-008 SPEC 13](../../inventory-sync/spec/#13-one-writer-per-listing); owner ruling, 25 October 2026). Inbound notices wait in the inbound queue; any that reach the dead-letter queue are replayed ([Replay dead letters](../../runbooks/replay-dead-letters/)).
3. **Nothing is trusted from a cache** in its place: no session beyond the session pass's 60 seconds, and no pool count or epoch. A stale route is still harmless (rule 2 above).
4. **Paging:** control unreachable for 5 minutes pages the operator (owner ruling, 21 October 2026). Procedure: [Control database unreachable](../../runbooks/control-database-unreachable/).
5. **Recovered** when sign-in works, every account's order watermark has caught up, the dead-letter queue is empty, and every `unknown` write is settled before new sends ([ADR-004 SPEC 5](../../channel-connectors/spec/#5-retries-and-outcomes)).

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

`dedicated:add` is `cell:add` with `kind = dedicated` and a cap of 1, in a Neon project of its own, like every database ([section 7](#7-control-database-and-routing)). Steps: [runbook](../../runbooks/add-a-dedicated-database/).

### Dedicated databases and residency

- **Inside the UK and EU**, the database alone is enough. Every database is in Neon's EU region, the Worker is placed next to it, and Durable Objects and object storage use Cloudflare's EU jurisdiction.
- **Outside the EU**, a dedicated database needs a whole cell of its own: Worker placement, Hyperdrive configuration, object-storage bucket, Durable Object jurisdiction, logs and backup location.

### Trials

1. A trial lives in the newest open shared cell from sign-up. Paying changes its plan in control; nothing moves.
2. Trials have the same backups, alerts and switch-off rules as paying companies: a trial may already sell on real marketplaces. Demo companies live in a cell like any other company.
3. When trials together use more than 25% of a cell's compute for 7 days, the system recommends a cell for trials only. New trials then start there, and a trial that pays is moved to a paid cell by the slice operation.
4. When a trial lapses or a company closes, retention and erasure follow [ADR-012 SPEC 9](../../billing-and-plans/spec/#9-closing-a-company) and [SPEC 16](../../billing-and-plans/spec/#16-cancellation-export-erasure-and-refunds). Until erased, the data stays in its cell.

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

`due(company_id, kind, next_due_at)` holds ids, kinds and times only. It is a tenant table, indexed on `(company_id, next_due_at)` like every other index; the sweeper's one cross-company read scans a table of a few rows per company (owner ruling, 21 October 2026).

1. A command that creates future work upserts its `due` row in its own transaction, keeping the earlier time.
2. The job that does the work sets the next time, or deletes the row, in its own transaction.
3. A kind is declared by the module that owns the work. The sweeper refuses an undeclared kind.
4. A move copies the company's `due` rows with its slice.
5. **A company's nightly work is one job** (owner ruling, 25 October 2026): each module declares its nightly step (Inventory's stock check and date pass, Buyer data's anonymisation proof, Orders' census), and the sweeper runs a company's steps in one job, each step in its own transaction and alerting on its own, so one failing step never stops the others.

Launch kinds, taken from the records:

| Kind | Owner | Due when |
| --- | --- | --- |
| Request key expiry | Kernel | A key in `app.request_key` is older than 7 days ([section 5](#5-declaring-tables)) |
| Outbox delivery | Kernel | A note has a receipt not yet settled for one of its handlers. A control write still needed is an outbox note too, whose handler runs outside the transaction: one kind, not two (owner ruling, 21 October 2026) |
| Egress send and read-back | Channels ([ADR-004](../../channel-connectors/)) | A recorded send is due, or a send passed its deadline unconfirmed |
| Backup order read | Channels, importing into Orders ([ADR-007](../../order-ingestion/spec/#2-how-an-order-comes-in)) | An account's scheduled read is due |
| Listing safety read | Channels, handing over to Listings ([ADR-005](../../catalogue-sync/)) | An account's daily read is due |
| Nightly work | Each module's nightly step, such as Inventory's stock check ([ADR-006](../../stock-ledger/)); rule 5 | Once a night |
| Buyer anonymisation | Buyer data ([ADR-009](../../buyer-data/spec/#8-retention-and-anonymisation)) | Once a day, for orders due within 48 hours |
| Erasure after closing | Billing ([ADR-012 SPEC 16](../../billing-and-plans/spec/#16-cancellation-export-erasure-and-refunds)) | 30 days after the company closes |

### Fair shares

Platform settings in control, changed without a deploy (owner ruling, 20 October 2026); a sweeper keeps them at most 5 minutes (owner ruling, 25 October 2026). Starting values:

| Limit | Value | Unit |
| --- | --- | --- |
| Sweeper slots per cell | 40 | Company jobs running at once, each holding one pooled connection; leaves ~60 of ~100 for requests |
| Per company | 8 | Background or bulk jobs running at once |
| Trials, background (*Later*, [section 0](#0-at-launch-and-later)) | 25% of the cell's sweeper slots | All trial companies in the cell together |
| Trials, marketplace (*Later*) | 25% of each allowance shared by the whole application, at lower priority | Stock decreases on a live connection are exempt and always go first |

### The outbox

1. **Outbox note.** The transaction that makes a change also writes the note. Both commit or neither does.
2. **Deliver now.** Right after commit, the request or job that committed hands the note to every handler of that kind. This is the normal path.
3. **Handler.** A note is written with a receipt for each (event, handler) and its due row in one statement: a handler that does not take it gets its receipt as delivered there, and nothing is delivered for it; a handler that does has its receipt claimed under a lease, runs right after commit, and settles the receipt in its own transaction. A settled receipt makes a second delivery do nothing (owner ruling, 25 October 2026).
4. **Leftovers.** The sweeper delivers any note with a receipt not yet settled. A receipt is tried for about a day (24 attempts, each wait doubled up to 2 hours, about 22 hours in all), then it is dead and pages the operator. Each handler keeps a low-water mark, so a delivery reads only notes past it, never the company's whole history (owner ruling, 24 October 2026).
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

Erase also purges the company's files and any soft-deleted or versioned copies in object storage, and releases its marketplace seller ids in control. It removes the company's `audit_log`, so the 13-month retention applies to live companies only. Steps: [runbook](../../runbooks/erase-a-company/).

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

1. the erasure register and the anonymisation rule ([ADR-009](../../buyer-data/spec/#11-erasure-backups-and-restores)) are replayed;
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
| Files in object storage | Versioning or a 30-day soft delete; a file key is never overwritten. Label files excepted: their own bucket, no versioning, so anonymising deletes them ([ADR-009 SPEC 6](../../buyer-data/spec/#6-encryption-and-keys)) |

### Encryption

1. Credentials and buyer contact fields are encrypted under a per-company data key in `secrets(company_id, purpose)`, wrapped by a key-encryption key held as a platform secret.
2. `company_id` is bound in as associated data, so a row read under the wrong company fails to decrypt.
3. The wrapped keys stay in the database. Which buyer fields, and the search they allow, are [ADR-009's](../../buyer-data/spec/#6-encryption-and-keys).

### Drills

Quarterly at launch, by the runbook, a random real company and each cell's largest company are restored; control has a drill of its own. That meets Amazon's quarterly backup test ([ADR-009 SPEC 14](../../buyer-data/spec/#14-security-controls); owner ruling, 25 October 2026). *Later* ([section 0](#0-at-launch-and-later)): monthly and unattended from 50 companies, then the random drill weekly, and the canary moved and moved back nightly. Steps: [runbook](../../runbooks/drills/).

## 11. Production checks

CI proves the schema it builds. These prove the databases running, because a console role, a partition made after deploy or a hand-edited configuration is invisible to CI. Each failure pages the operator and closes egress for the affected database.

**Audit, at every deploy and every night,** over every Neon project and branch in the account and every Hyperdrive configuration in the account:

1. The only login roles are the owner, runtime and lifecycle roles, plus the sign-in role on control.
2. The runtime role has no usage on the `auth` and `auth_policy` schemas; the sign-in role has no right outside them but its insert into and read of the security log (owner ruling, 22 October 2026). No role but the owner and Neon's named internal roles may hold `BYPASSRLS` or be in `neon_superuser`; a change to Neon's list alerts. No runtime or lifecycle role owns a table.
3. The definer owner cannot log in, is not in `neon_superuser`, has no members, and has only the rights in [section 3](#3-roles).
4. Every Hyperdrive configuration has caching off.
5. The catalogue lint passes on the live catalogue, and the next two months' partitions exist.
6. The history window is 7 days, scheduled snapshots are kept 30 days, and no manual snapshot exists. Staging is exempt from this check; production keeps it (owner ruling, 22 October 2026).
7. Every branch was made by the lifecycle tool and is younger than 24 hours.
8. Each database's migration version is the one the deployed code needs.
9. Every Worker that reaches a database is placed next to it (owner ruling, 22 October 2026), and every Worker has invocation logs off, and traces off on every production Worker (owner ruling, 25 October 2026). Every queue and Durable Object namespace is in the EU jurisdiction. No Worker binds a key-value store, SQL database or analytics store. A failure here pages the operator but does not close egress: it concerns where data is processed, not who can see it.

**A failure on control** (owner ruling, 22 October 2026). Control holds no company data, but every route and membership comes from it, so its failures close egress only where they could let one company reach another's data. Checks 1–5 and 8 failing on control close egress for every cell. Checks 6, 7 and 9 failing on control page the operator and close nothing.

**Staging's audit** (owner ruling, 22 October 2026) covers only staging's own Neon projects and Workers. Those of the earlier system, named in the deploy's staging configuration, are left out until they are removed; any other unknown project or Worker still fails.

**A canary company in every database.** A second synthetic company must see none of the canary's rows: every table nightly and after each deploy and each new partition. A transaction with no company set must raise. *Later* ([section 0](#0-at-launch-and-later)): a few tables every 10 minutes, and the egress gate scanning every outbound payload for the canary's marker strings.

## 12. Operations

1. **Timeouts.** Every migration sets a `lock_timeout` and retries, so a migration waiting for a lock on a shared table does not queue every seller behind it.
2. **Migrations run as a ring:** first on control, then the newest cell (which holds the trials and the canary), then the others. They finish everywhere before new code goes live ([ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying)).
3. **Schema changes expand, then contract,** by [ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying). A migration already merged is never edited.
4. **One-time reset before launch** (owner ruling, 20 October 2026). Before launch, every module's migrations were squashed into one new first migration. This was allowed once, only because no production database existed. Development databases from before the reset are recreated, and a database that still holds objects from before it is refused by the catalogue lint at `cell:add` and by every deploy's audit, before the data layer serves it (owner ruling, 22 October 2026: the data layer opens a database on every request, so it does not scan the catalogue itself). From then on rule 3 has no exception.
5. **Migration ledger.** Each database's own ledger, committed with each migration, is the authority on what it has applied. Control keeps, per database, the version the last deploy reached; the deploy writes it after reading each database's ledger.
6. **Partitions.** A monthly scheduled run of the CI migration job creates partitions three months ahead, so a failed run waits for the next. It detaches and drops a month of an archived partitioned table (the archiver deletes a whole table's month in batches) only after the archiver has written and verified that month's per-company files ([ADR-002 SPEC 3](../../data-retention/spec/#3-archiving-a-month)). A table that is never archived, such as `event_log`, loses a month when its retention ends ([ADR-002 SPEC 2](../../data-retention/spec/#2-the-retention-schedule), owner ruling, 21 October 2026).
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
| Roles created in the Neon console, CLI or API join `neon_superuser`, which has `BYPASSRLS`; a member does not inherit it but can switch into it. Roles created in SQL get only what is granted | Every role is created in SQL; the audit checks it | [Neon roles](https://neon.com/docs/manage/roles) |
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
| Workers traces keep 7 days, their storage location not stated; they record each request's URL (query included), user agent and city, and each outside call's URL; no client address, bodies or call arguments | Off in production; on staging for the app Worker only (owner ruling, 25 October 2026) | [Traces](https://developers.cloudflare.com/workers/observability/traces/) |
| Cloudflare's data-localisation list does not cover Hyperdrive, Queues or Workers Logs | Caching off; ids-only queue messages and logs | [Compatibility](https://developers.cloudflare.com/data-localization/compatibility/) |
| Amazon's notifications are delivered only to SQS or EventBridge | An AWS bridge posts them to the app's webhook | [SP-API notifications](https://developer-docs.amazon/sp-api/docs/notifications-api-v1-use-case-guide) |
| Pipeline mode in the Postgres driver, and Hyperdrive's handling of pipelined messages in transaction mode: not stated in Hyperdrive's documentation | Pipelining is off by default (owner, 25 October 2026); the Hyperdrive run ([section 14](#14-tests-that-prove-each-rule)) runs it pipelined, and `VERVORO_DB_PIPELINE=on` turns it on only if that run shows it is worth it. The 35-second query timeout of [section 3](#3-roles) rule 5 ends a pipelined query that never answers. Open item: Hyperdrive's behaviour, unverified until the staging run | [How Hyperdrive works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) |
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
| Commit check | CI, real Postgres | A writing transaction whose company setting or role changed after entering is rolled back and alerts; a second `enter_company` for another company raises; a read-only transaction commits without the check | 6 |
| Catalogue lint | CI and production | Every lint rule holds for every table and partition; seeded bad tables fail | 6.1 |
| Two databases | CI, two real Postgres | Entering a company a database does not hold raises; the request guard throws on a mismatched id; each role enters only the states in [section 1](#tenant-states) | 1, 6, 7 |
| Pooler soak | CI, transaction-mode pooler | 10,000 interleaved transactions for 20 companies each see only their own company; a statement after `COMMIT` errors | 1 |
| Hyperdrive run | Staging, real Hyperdrive | The same soak through Hyperdrive, with pipelining off and on | 1, 13 |
| Roles | CI and production | The Worker binds only the runtime role; no role but the owner has `BYPASSRLS` or `neon_superuser`; only the operations job holds the lifecycle credential; a serving login with a bypassing membership refuses to start | 3 |
| Sign-up | CI, real Postgres, runtime role | Sign-up writes the tenant row, company rows and note in one transaction through `open_tenant`; a second `open_tenant` for the same id raises | 4, 8 |
| Sweeper | CI | Only due companies run; at most 40 at once and 8 per company; no code path visits a company with nothing due | 9 |
| Slice round trip | CI | Copy, compare checksums, erase, count 0; a tombstoned company's slice is refused; the erasure register is replayed | 10 |
| Canary | Production | Another company sees none of the canary's rows; outbound payloads never carry its markers | 11 |
| Restore drill | Production, quarterly at launch (monthly from 50 companies, weekly later) | A real company restores (by the runbook at launch, unattended from 50 companies) into a branch the runtime role cannot enter, neighbours unchanged, time per gigabyte recorded | 10 |
| Kill test | Staging, before launch and after a platform change | Killing the app mid-transaction and mid-send leaves the ledger and the egress log consistent; every effect is either recorded and sent once or recorded as `unknown` and read back | 9 |
| Placed work | Staging, before launch | A job run by the sweeper or the queue consumer holds its company's lock about as long as the same work in a request | 13 |

## 15. Questions the review raised, answered

A code review found 17 places where the record was unclear. Each is answered by a rule above.

| # | Question | Answer | Where |
| --- | --- | --- | --- |
| 1 | May a plain login switch into the runtime role with `SET ROLE`? | No. The runtime role logs in itself (owner ruling) | [3](#3-roles) |
| 2 | Which role writes the tenant row at sign-up? | The runtime role, through the allow-listed definer `app.open_tenant` (owner ruling) | [4](#4-functions), [8](#adding-a-company) |
| 3 | Is a keyword filter enough? | No. Modules write no SQL; they use a typed query builder with a function allow-list, and SQL-executing functions are revoked (owner ruling, 21 October 2026) | [4](#4-functions), [6](#6-guard-rails) |
| 4 | Are order holds append-only, or only their log? | The hold table itself: every hold and release is a row ([ADR-007](../../order-ingestion/spec/#11-holds)) | [5](#5-declaring-tables) |
| 5 | Does the cascade from `tenant` break append-only? | No. It is the erase path's last step, open only to the lifecycle role | [2](#2-keys-and-identifiers), [10](#erase) |
| 6 | Are notice subscriptions egress effects? | No. They are set-up calls run on connect, in shadow too ([ADR-004](../../channel-connectors/)) | [9](#the-outbox) |
| 7 | How does the row check work? | A check of the company setting and role before every writing commit (owner ruling); `enter_company` refuses a second company | [6](#6-guard-rails) |
| 8 | How hard is the cap, and do half-added companies count? | Soft (owner ruling). A company counts once control places it | [8](#the-cell-cap) |
| 9 | Who writes and clears `due`, and which kinds exist? | The command that creates the work writes it; the job clears it; launch kinds listed, control repairs being outbox notes | [9](#the-due-table) |
| 10 | How does the hourly trigger reach one sweeper per database? | It reads control's database registry and nudges each | [9](#the-sweeper) |
| 11 | What are "about 8 jobs" and "the trial share"? | 40 slots per cell, 8 jobs per company, 25% for trials (owner ruling) | [9](#fair-shares) |
| 12 | Is an enterprise added directly or moved? | New: added directly. Existing: moved | [8](#adding-a-company) |
| 13 | Which migration ledger is the authority? | Each database's own; control keeps a summary | [12](#12-operations) |
| 14 | When does a new cell become `open`? | After a checked deploy and the audit; until then `closed` | [8](#adding-a-cell) |
| 15 | Which role repairs login rows? | None. Repairs touch memberships and directories only, as runtime; sign-in data is the sign-in Worker's | [7](#7-control-database-and-routing) |
| 16 | Was the pre-launch migration squash allowed? | Once, before launch (owner ruling) | [12](#12-operations) |
| 17 | May one transaction read several companies, or control? | No. One company per transaction; control on its own connection | [1](#1-tenancy-inside-a-cell), [7](#7-control-database-and-routing) |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look, and when it can be ticked: **[Skeleton]** once the database layer and the app exist, **[Before launch]** once the deployed Workers, the sweeper and the operations job do (owner ruling, 21 October 2026).

- [ ] **[Skeleton]** **Cell catalogue:** every table and partition has `relrowsecurity` and `relforcerowsecurity` true (`pg_class`).
- [ ] **[Skeleton]** **Cell catalogue:** every policy's expression is exactly `company_id = app.company()`, in both `qual` and `with_check` (`pg_policies`).
- [ ] **[Skeleton]** **Cell catalogue:** every primary key, unique key, foreign key and index starts with `company_id` (`pg_index`, `pg_constraint`).
- [ ] **[Skeleton]** **Cell catalogue:** every foreign key to `tenant` is `ON DELETE CASCADE`; no other foreign key is single-column.
- [ ] **[Skeleton]** **Roles:** only the owner, runtime and lifecycle roles can log in, plus sign-in on control and Neon's named internal roles ([section 3](#3-roles), rule 7); no other role has `rolbypassrls` (`pg_roles`, `pg_auth_members`).
- [ ] **[Skeleton]** **Roles:** the runtime role is not a member of any role (`pg_auth_members`), and the app connects as it directly, with no `SET ROLE` anywhere in the data layer.
- [ ] **[Skeleton]** **Grants:** the runtime role has no `UPDATE`, `DELETE` or `TRUNCATE` on the stock ledger, order holds, outbox or `audit_log` (`information_schema.role_table_grants`).
- [ ] **[Skeleton]** **Grants:** no partition has a grant; no `dblink` or similar extension is installed (`pg_extension`). Where `has_function_privilege` shows the runtime role can still execute `query_to_xml`, the query check's tests must refuse it.
- [ ] **[Skeleton]** **Functions:** exactly three `SECURITY DEFINER` functions in a cell, each with a `search_path` setting, owned by a role that cannot log in (`pg_proc.prosecdef`, `proconfig`).
- [ ] **[Skeleton]** **Functions:** `app.company()` is `STABLE`, `PARALLEL SAFE`, not a definer, and raises when unset: run `select app.company()` in a fresh transaction.
- [ ] **[Skeleton]** **Data layer:** every transaction's first statement is `enter_company` or `open_tenant`; there is no autocommit path for company work.
- [ ] **[Skeleton]** **Data layer:** no module imports the query builder's raw-SQL helpers (`sql`, `raw`) or a database driver; search the module packages. The function allow-list does not hold `set_config`, `current_setting` or any `app.*` function.
- [ ] **[Skeleton]** **Data layer:** the commit check runs before every writing transaction's commit, and a mismatch pages and closes egress; a read-only one skips it, and `enter_company` refuses a second company (kernel/0009).
- [ ] **[Skeleton]** **Data layer:** no code path keeps one transaction open across two companies, or reads control through a cell's transaction.
- [ ] **[Skeleton]** **Worker configuration:** the app Worker holds only runtime credentials; no serving process holds the owner or lifecycle credential, or runs migrations.
- [ ] **[Before launch]** **Worker configuration:** one Hyperdrive binding per database in control's registry, none a placeholder, each with caching off.
- [ ] **[Skeleton]** **Control:** holds no business table; sign-in data is only in the `auth` and `auth_policy` schemas; the erasure register, sync epoch and migration summary exist.
- [ ] **[Skeleton]** **Control:** the runtime role has no usage on `auth` or `auth_policy`; the `auth` schema's migrations are Better Auth's reviewed `generate` output, committed like any other.
- [ ] **[Skeleton]** **Routing:** every request reaches its database through `forCompany`, and a request for company A with a session for B throws.
- [ ] **[Skeleton]** **Sign-up:** writes `open_tenant`, the company rows and the outbox note in one cell transaction, then control; it runs no migration.
- [ ] **[Before launch]** **Sweeper:** no background job loops over the company registry; each writer upserts `due`; the hourly trigger nudges every database in control's registry.
- [ ] **[Before launch]** **Slice operation:** erase, export, move and restore run in the operations job as the lifecycle role, never the owner.
- [ ] **[Skeleton]** **CI:** the catalogue lint runs over all modules on real Postgres and is green; the isolation suite covers every tenant table.
- [ ] **[Before launch]** **Production:** the nightly audit and the canary run, and a seeded failure in staging pages and closes egress.
- [ ] **[Before launch]** **Source control:** a change to the isolation code needs a named approver before it merges.
