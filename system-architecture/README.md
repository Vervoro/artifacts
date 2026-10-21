# ADR-000: System architecture

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026; revised 18 October 2026; split into ADR, SPEC and RUNBOOK, with the module map, 20–21 October 2026; hosting reviewed 21 October 2026; sign-in on Better Auth ([ADR-013](../sign-in/)) 21 October 2026; convergence pass (one main deployable plus the sign-in Worker, layered testing, expand then contract) 21 October 2026 |
| **Scope** | The overall shape of the system and the rules every module follows |
| **Related** | [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-002: Data retention and archiving](../data-retention/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-000-system-architecture) |

## Context

- **A seller's stock is the top risk.** A wrong figure sent to a marketplace oversells or delists a seller. Every rule that keeps a seller safe must hold everywhere, not only where a developer remembered it.
- **Marketplaces are unreliable neighbours.** They throttle, time out, accept a call and apply it later, and sometimes apply a call without saying so.
- **One operator** runs the platform, and **a very small team with AI coding agents** builds it. Anything that needs a person at a set hour is a defect, and a rule only review can catch will be broken: the build, the tests or the database must enforce it. A change must be checkable in minutes, so a module must be testable without the others.
- **Features come and go per company.** Plans include different modules, a company switches modules on and off, and a new marketplace must be addable without touching the rest.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **A modular monolith.** One codebase and, per environment, one main application deployable, plus the sign-in Worker, kept separate on purpose ([ADR-013](../sign-in/)). Every capability is a module that declares itself in one manifest and owns its tables, ports, routes, screens and tests; the app only mounts what modules contribute. Modules talk only through typed ports and typed events, and calls point toward the core: other modules call the core, never the reverse. A module is core, always on (Fulfilment, Billing) or switchable per company and plan. *Later: variants (an alternative provider of a port for a named company), at the first experiment the operator wants to run.*
2. **The foundation is six always-on core modules,** each the only writer of its own data: Products ([ADR-003](../product-model/)), Listings ([ADR-005](../catalogue-sync/)), Inventory ([ADR-006](../stock-ledger/)), Orders ([ADR-007](../order-ingestion/)), Buyer data ([ADR-009](../buyer-data/)) and Access ([ADR-010](../users-and-access/)). Inventory alone changes stock ([ADR-006](../stock-ledger/#decision)); Orders alone changes order status. Stock sync alone works out each listing's figure, from each committed stock change ([ADR-008](../inventory-sync/#decision)).
3. **Expected failures are typed `Result` values,** never exceptions and never silent catches.
4. **Events are written with the change** in an outbox in the same transaction, delivered right after commit (or later by the sweeper), and handled once through a receipt per handler.
5. **Nothing reaches a marketplace or a supplier except through one egress gate.** Every effect is recorded with an idempotency key, sent after commit, rate-limited per account, and sent only when the account is live. Every connection starts in shadow mode, where nothing is sent ([ADR-004](../channel-connectors/#testing-sandboxes-and-shadow-mode)). The gate's rules are [SPEC 7](spec/#7-the-egress-gate).
6. **Marketplace connectors are plugins behind a fixed contract.** A connector only translates; Channels, the host, owns credentials, HTTP, rate budgets, notice checks and the sending half of the gate ([ADR-004](../channel-connectors/)). Orders arrive by webhook; a scheduled read is only the completeness check behind it.
7. **Serverless on Cloudflare, Postgres on Neon, in the EU.** An app Worker serves the API, the client and webhooks; a separate sign-in Worker runs Better Auth, an authentication library, and alone holds its secret and its tables ([ADR-013](../sign-in/)). Better Auth is a dependency of that Worker, not a module; who a person is and what they may do are split by [ADR-013 decision 3](../sign-in/#decision). Both are placed next to the databases and reach every database through Hyperdrive, with caching off. Queues and Durable Objects live in the EU jurisdiction and carry ids only. Nothing leaves Vervoro during a database transaction. Tenancy, storage and retention follow [ADR-001](../database-architecture/) and [ADR-002](../data-retention/).
8. **A phone-first React client,** built only from one UI package and styled only from one token package. Every word comes from a catalogue, English first.
9. **The build enforces the rules.** Testing is layered: pure logic runs as fast unit tests with no database; the database, row-level security, locking, routing and triggers run on real Postgres; marketplace behaviour runs on the simulators; critical flows run end to end ([SPEC 15](spec/#15-testing-and-verification)). Every outside service has a simulator that speaks its real API; development and tests never call a real marketplace, and no simulator code reaches production. One verify command means green. A test that protects accepted behaviour is removed or weakened only together with an accepted change to that behaviour or its SPEC. Schema changes expand, then contract ([SPEC 11](spec/#11-deploying)); new modules start from a scaffold, and docs change with the code.
10. **UK first, not UK hard-coded.** Money always carries its currency, VAT rates come from a per-country table, and UK rules live only in the records that need them ([SPEC 14](spec/#14-money-and-countries)). *Later: selling into the EU, a record of its own.*

## Architecture

<!-- DIAGRAM -->

A request reaches the app Worker, which asks the sign-in Worker over a service binding whose session it carries, has Access check that login's membership and role, finds the company's database in control, opens a transaction fixed to that company, and builds the company's set of modules: only those switched on for it. A stock change goes through Inventory, which writes the ledger and an outbox note in one transaction; an order that reserves stock does so in that same transaction, through Inventory's port. After commit, the note reaches Stock sync, which works out each affected listing's figure and hands the send to the egress gate, which records it (shadow) or sends it through the connector (live). Orders come back by webhook, through the inbound queue, into Orders. The [SPEC](spec/) draws where the code runs, who depends on whom, and who calls whom for each event.

## Consequences

**Gives**

- One deploy, one log and one transaction for a stock change: changed in one place, by one set of rules, under one lock.
- A module can be added, removed or switched off without touching the others. A new marketplace is one new module.
- Shadow mode, idempotency and rate limits exist once, in the gate, so no module can forget them.
- A change to one module runs its own tests, and those of the modules that need it only when its contract changes; an agent works with one module and a few contracts in view.
- Marketplace failures (throttling, late notices, a timeout after a change applied) are reproduced on demand.

**Costs**

- Nothing physical stops a developer reaching across modules inside one deploy; package exports, lint rules, the composition test and review hold the boundaries.
- One company's stock writes are serialised by its lock, so transactions stay short and the Worker stays next to the database.
- Production runs on the Workers runtime; development and tests run on Bun. A smoke run on the Workers runtime in CI catches the gap, and every job fits one invocation's limits: its memory, six open connections, and 30 seconds of work after the response.
- Data at rest stays in the EU. Processing runs on Cloudflare's network, placed in the EU but not guaranteed there ([SPEC 10](spec/#10-runtime), rule 12).
- Every outbound effect is two steps, record then send, and every handler must be idempotent; a listing's figure is worked out moments after the stock change commits, not inside it.
- The simulators are a large second codebase that can drift from the real APIs; recorded real replies keep them honest.
- An in-process database for running the app on a laptop, which no test proves; an order that reserves stock crosses two modules inside one transaction.

## Alternatives rejected

- **Separate services per feature:** one operator cannot run a fleet, and a stock change would lose its single transaction.
- **One foundation package for products, links, stock and orders:** every core change re-runs nearly every test, and nothing stops its parts reaching into each other.
- **Routes and feature logic in the app:** the app becomes the hub that every module and every test passes through.
- **Every module writes stock directly:** the safety rules would be re-implemented, and kept right, in every module.
- **A queue of push messages per listing:** order and replay become the guarantee; one desired figure per listing needs neither.
- **Inventory writes each listing's figure in the stock transaction:** Inventory would have to know listings, links and pack sizes, and the company's lock would cover link reads.
- **Exceptions for expected failures:** a missed catch becomes a crash or a silent failure.
- **Live marketplace reads in a request:** a slow marketplace blocks a screen and spends rate budget on page views.
- **Managed containers next to managed Postgres in the EU** (for example a container service with its cloud's Postgres): no machines, but one engineer would own a container image to patch, access policies, a private network and connection arithmetic. Revisit if processing must be guaranteed in the EU and Cloudflare cannot guarantee it.

## Open items

- **Paging alerts have no written first steps.** The stalled order watermark, the dead-letter queue, the nightly stock check and a failed migration page the operator; only the deploy has a runbook. Each owning record writes its own.
- **Hosting checks before launch** (owner, 21 October 2026): how long a company's lock is held when the sweeper or the queue consumer runs a job, compared with a request; which EU region Amazon accepts for its notification queue; the residency of Hyperdrive and Workers Logs ([SPEC 10](spec/#10-runtime), rule 12). Processing placed in the EU, without a guarantee, meets the data-location limit (owner ruling, 21 October 2026).
- **MCP access, soon after launch** (owner, 21 October 2026). A seller connects an AI assistant to ask about stock, sales and orders, get reorder advice from their history, see which products make money, and have a purchase order drafted. It needs its own record: a switchable module calling the core's ports, revising ADR-010's "no API tokens at launch", with no buyer data. Reorder advice, profit and purchase orders depend on Purchasing and Profit, which are parked.
- **Other records still say "the foundation"** where they mean one of its modules. That stays true; each record names the exact module when it is split into ADR, SPEC and RUNBOOK.
- **Owner rulings of 20 and 21 October 2026** (library packages, table prefixes, stored copies on screens, variants *Later*, the core split into six modules, Fulfilment and Billing always on outside it, routes and screens in modules, links in Listings, each listing's figure worked out by Stock sync, dependents re-run only on a contract change) are in the [SPEC](spec/#17-questions-the-review-raised-answered).
