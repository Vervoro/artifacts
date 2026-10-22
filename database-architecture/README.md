# ADR-001: Multi-tenant database architecture

| | |
| --- | --- |
| **Status** | Accepted, 21 October 2026, after the developer's review and the owner's sign-off |
| **Date** | 17 October 2026; revised 18 October 2026; split into ADR, SPEC and RUNBOOK 20 October 2026; hosting reviewed 21 October 2026; sign-in data aligned with Better Auth ([ADR-013](../sign-in/)) 21 October 2026; isolation tiers named 21 October 2026; amended by owner rulings: control unreachable and the sign-in role's rights, 21 October 2026; one Neon project per database, Neon's internal roles, the staging rule, the audit over every project, append-only and partitioned tables declared per table, an audit failure on control, and the sign-in role reading the security log for a data request, 22 October 2026 |
| **Scope** | How Vervoro stores, isolates, routes and moves each company's data |
| **Builds on** | [ADR-000: System architecture](../system-architecture/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-001-multi-tenant-database-architecture) |

## Context

- **Isolation is the top risk.** One company seeing another's data is the worst possible failure. The database and the build must prevent it, not developer care.
- **Growth:** 5 to 10 companies at launch, about 100 in year one, up to 1,000 in three years; each up to 5,000 SKUs and 2,000 orders a day.
- **One operator** runs Postgres on Neon, reached from Cloudflare Workers through Hyperdrive, in the EU. Moving parts must not grow with the number of companies.
- **Trials** must not affect paying companies or start over when they pay. Enterprises may need a database, later a region, of their own.
- **Promises:** export, restore and provably erase one company.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **A control database** on its own compute holds the platform's data: companies and where each lives, memberships, operators, plans, shared quotas and the erasure register, and, in an auth schema of their own, the logins Better Auth keeps for the sign-in Worker ([ADR-013](../sign-in/)). No company business data, and no sign-in data in any cell.
2. **Cells (customer databases)** hold many companies in shared tables. `company_id` leads every key, and row-level security (Postgres itself refusing another company's rows) is forced on every table. A dedicated cell holds one company in its own Neon project, on the same code path. *Later: dedicated cells, at the first enterprise that needs one.*
3. **Every transaction enters one company first.** Its first statement raises unless this database holds that company in a state the role may enter. An unset or wrong company is an error, never zero rows.
4. **Only the data layer sets the company**, and it checks the company is unchanged before every commit. Modules write no SQL: they query through a typed query builder that cannot set the company, control a transaction, change the schema or call a function outside an allow-list (owner ruling, 21 October 2026). A CI lint checks every table; a nightly audit and a canary company (a synthetic company no other may ever see) check production. Any sign of cross-company exposure pages the operator and stops that database's outbound calls. Forced row-level security, the runtime role, entering one company, the commit check, routing, composite keys and restricted roles are the security boundary; the builder, the query check, the allow-list, the lint, the audit and the canary are defence in depth ([SPEC 6](spec/#6-guard-rails)).
5. **Every role is created in SQL, never in the Neon console.** The owner migrates, from CI only. The runtime role, which serves requests, logs in as itself and cannot bypass row-level security. The lifecycle role runs company operations; a sign-in role serves only the sign-in Worker.
6. **Control says where each company lives**, from day one. Adding a company needs no new database and no deploy; adding a cell does. A shared cell closes to new companies at about 200. *Later: a second cell, at about 160 companies.*
7. **A trial is a state, not a place.** Trials live in normal cells; paying moves nothing. *Later: a capped trial share, then a trial cell, when trials crowd a cell.*
8. **One slice operation** (a generated tool that copies or deletes every row of one company) exports, restores and erases a company, in batches, as the lifecycle role, never the owner. *Later: moves between cells.*
9. **Backups** keep 7 days of point-in-time history and 30 days of snapshots; an erasure reaches backups at day 30.
10. **One sweeper per database** (a background worker that runs only companies with work due) finds work with one query. Events go through an outbox: a note written in the change's transaction, delivered after commit. No transaction spans two databases.

## Architecture

<!-- DIAGRAM -->

**At launch there are two databases: control and cell A**, which holds every company. Dashed parts are *Later* ([SPEC 0](spec/#0-at-launch-and-later)). Requests are routed through control even with one cell, so a second cell is a new row, not a rewrite.

## Consequences

**Gives**

- Structure once per cell, not per company: two databases at launch, about 7 at 1,000 companies.
- A wrong route, stale cache or stray restore branch raises instead of returning empty stock.
- Paying never moves data.
- Later cells, dedicated cells and moves reuse one schema and one slice operation.
- Isolation enforced by Postgres, checked in CI on every build and in production nightly.

**Costs**

- Every table and query carries `company_id`; the table helper and the lint carry it for modules.
- A query the builder cannot express needs the builder extended, or a view added by migration, under the isolation change control.
- A policy mistake exposes rows rather than failing, so the lint, commit check, canary and isolation tests are part of the design.
- Restoring or erasing a company takes minutes, not seconds.
- Erasure reaches backups only after 30 days.
- Companies in a cell share its compute and ~100 connections.

## Alternatives rejected

- **Schema per company:** ~1,780 objects each; a wrong `search_path` reads another company silently.
- **A Neon project per company:** 25 Hyperdrive configurations per account, a compute each. Kept for enterprises.
- **A Postgres role per company:** no isolation beyond the company setting.
- **A login that switches role (`SET ROLE`):** a switch module SQL could abuse.
- **A trial database:** every conversion becomes a move.
- **Control inside the first cell:** a cell credential could read logins; a cell restore rewinds control.
- **An erasure log in company rows:** the restore that replays it would rewind it.
- **Slice operations as the owner:** row-level security off, owner credential in a running service.
- **Per-company backup keys:** a key store whose loss loses everyone.
- **Module SQL behind a statement filter:** a hand-written SQL reader is a fence with gaps; a review got past it twice.
- **Silent zero rows:** an empty stock read pushes 0 and delists a seller.
- **One log table, or one per module:** mixed retention, or many tables to lint.
- **Logical replication for moves:** a forgotten slot fills the disk.

## Open items

- **Re-check before launch** the Neon, Hyperdrive and Workers limits ([SPEC 13](spec/#13-platform-constraints)), last checked 21 October 2026.
- **Fair-share numbers** (40 sweeper slots per cell, 8 jobs per company) are guesses until a load test.
- **The cell cap is soft** (owner, 20 October 2026): simultaneous sign-ups may pass 200 slightly.
- **Restoring control** has a drill but no written procedure.
- **A major Postgres upgrade on Neon** is a new project per database and a copy, not an in-place upgrade. It needs a runbook before the first one.
- **Owner rulings of 20 October 2026** (runtime login, sign-up definer, commit check, migration reset, launch and later) are in the [SPEC](spec/#15-questions-the-review-raised-answered).
