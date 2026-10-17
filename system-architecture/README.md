# ADR-000: System architecture

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026 |
| **Scope** | The overall shape of the system and the rules every module follows |
| **Related** | [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-002: Data retention and archiving](../data-retention/) |

## Context

Vervoro is an operations system for marketplace sellers who run their own warehouse: products, stock, orders, purchasing and listings, kept in step with Amazon, eBay, Shopify and other channels. This record collects the decisions that give the system its shape. Most are in force today and enforced by the build, the tests or the database. The data decisions, and the background work that runs per database, follow ADR-001 and ADR-002, which are the target. Later records build on this one.

The design has to meet these requirements:

- **A seller's stock is the top risk.** A wrong number sent to a marketplace oversells or delists a seller. Every rule that keeps a seller safe must hold everywhere, not only where a developer remembered it.
- **Marketplaces are unreliable neighbours.** They throttle, time out, accept a call and apply it later, and sometimes apply a call without saying so.
- **One operator** runs the platform. Anything that needs a person at a particular hour is a defect.
- **A very small team, working with AI coding agents,** builds the product. A rule that only review can catch will be broken; the build has to catch it.
- **Features come and go per company.** A company switches modules on and off, plans include different modules, and a new marketplace must be addable without touching the rest.
- **Phone first.** Warehouse staff work on a phone, often with gloves and patchy Wi-Fi.

## Decision

1. **A modular monolith.** One codebase and one deployable per environment. Every feature is a module inside it, not a separate service.
2. **Every capability is a module** that declares itself in one manifest, owns its own tables, and talks to other modules only through their contract: typed ports and typed events.
3. **One core, the foundation,** is always on and is the only code that changes stock, order status and the stock figure each listing should show.
4. **Stock is an append-only ledger.** Every physical change is a permanent entry; balances always equal the sum of the entries, and the database refuses stock below zero.
5. **Expected failures are typed `Result` values,** never exceptions and never silent catches.
6. **Events are written with the change,** in an outbox in the same transaction, delivered right after commit (or later by the sweeper), and handled once through a receipt per handler.
7. **Nothing reaches a marketplace or a supplier except through one egress gate.** Every such effect is recorded with an idempotency key, sent after commit, rate-limited per account, and only sent when the account is live. Every connection starts in shadow mode, where nothing is sent.
8. **Marketplace connectors are plugins behind a fixed contract.** A connector only translates. The host owns credentials, HTTP, authentication, rate budgets and webhook checks.
9. **Orders arrive by webhook;** a scheduled read is only the completeness check behind it.
10. **Every marketplace has a simulator.** Development and tests talk to simulators that speak the real APIs, never to a real marketplace, and no simulator code reaches production.
11. **Serverless on Cloudflare, Postgres on Neon, in the EU.** Workers serve the API, the client and webhooks; a queue and Durable Objects carry background work; Hyperdrive pools connections to Postgres, with caching off.
12. **Tenancy, storage and retention follow ADR-001 and ADR-002.** This record does not repeat them.
13. **A phone-first React client,** built only from one UI package, styled only from one token package.
14. **English first, every word in a catalogue.** Other languages are typed against the English keys and filled in a batched pass before release.
15. **Tests run on the real kernel against real databases, with no mocks.** "Green" means one verify command passed, and nobody weakens a test to get there.
16. **Every change follows one path:** new modules start from a scaffold, migrations only add, and the docs change with the code.

## Architecture

<!-- DIAGRAM -->

A request from the client reaches the Worker. The Worker works out the company and the user, opens a transaction fixed to that company, and builds the company's set of modules: only the ones switched on for it. A module that wants to change stock calls the foundation through a port. The foundation changes stock, writes the figure each listing should show, and writes an event to the outbox, all in one transaction.

After commit, background work takes over. The Channels host compares what each listing should show with what the marketplace last confirmed, decides what to send, and hands each send to the egress gate. The gate records it in shadow mode, or sends it through the connector in live mode. Orders come back the other way: a marketplace calls a webhook, the Worker checks it and puts it on a queue, and the consumer imports the order through the foundation.

## Modules and the kernel

Every module is built on **the kernel**, a small library with no business rules. It gives modules typed results and ids, a controllable clock, one database port over two drivers, transactions, the outbox, a keyed dispatcher, the egress gate, configuration and composition.

**What a module declares.** Each module exports one manifest, and the build, the server, the client and the tests all read it.

| Part | What it says |
| --- | --- |
| Id and needs | A stable id, and the modules that must be on for this one to work |
| Provides and uses | The ports it offers, and the ports it calls; a port it did not declare is refused at runtime |
| Contributes | Providers for an extension point, such as one marketplace connector |
| Publishes and handles | The events it writes, and the events it reacts to |
| Permissions | Named actions a role can be granted |
| Slots | Its screens and menu entries |
| Migrations | Ordered, forward-only changes to its own tables, optionally append-only |
| Settings | A typed schema, validated at start-up, with its secrets named so they are never printed |

**Ports and events.** Modules talk in exactly two ways. A **port** is a typed call that returns a typed result: use it when the caller needs an answer now, such as a command to the foundation or a read. An **event** is a typed fact that has already happened: use it to react to another module's change. A port that many modules provide, chosen per key, is an **extension point**; the marketplace connector is one.

**Tables.** A module owns its tables and prefixes them with its id. Its tables may reference the foundation's, never another module's, because a foreign key would make switching off and migration order depend on the other module. A link to another module is a plain id, resolved through a port. How a table is declared and isolated per company is in ADR-001.

**Assembly per company.** On every request, and for every background job, the composition step reads the company's state (plan, switched-on modules, roles, variants) and decides what is available. A module is available when its plan includes it, it is switched on, everything it needs is available, and the user's role allows the action. A module whose needs are off waits; it is not an error. Unavailability flows down without touching any module. The resolver gives a reason with every "no", so the screen can say why.

**Variants.** A port can have more than one provider: `standard` and alternatives. The operator assigns a variant to a named company to try a different approach. The safety rules never change with a variant.

**Boundaries are enforced by the build.**

- Each module's package exports only its contract and its manifest, so its internals cannot be imported.
- Lint rules ban the UI libraries outside the UI package, and any network call of its own in a connector.
- A composition test wires each module with only the ports it declares.
- The database refuses updates and deletes on append-only tables.

## The foundation and the stock ledger

The foundation is always on and cannot be switched off. It holds the catalogue, stock, orders, the links between listings and products, users and roles, settings, the activity view and the warehouse work area (receiving, picking, packing, dispatch and returns inspection). It exposes **command ports** (reserve, release, dispatch, adjust, receive, ingest an order) and **read ports** (stock, orders, listings). No other code writes its tables, and screens read through its ports, not its tables.

**Every stock command follows the same rules:**

- **One writer per company.** The first statement of every stock command takes the company's lock, held until commit. The transaction is short: about eight round trips for an order, counted by a test.
- **The database is the hard stop.** Checks refuse a balance below zero, a negative reservation, or more reserved than is on hand. A wrong plan fails the transaction instead of inventing stock.
- **Append only.** Ledger entries are never updated or deleted. Each carries a quantity, batch, spot, reason, person and source, and a gapless sequence number per company gives a total order of every change.
- **Proved every night.** A nightly check compares every balance with the sum of its entries and alerts on any difference. Archiving old entries keeps this true through checkpoints (ADR-002).
- **One order per marketplace order.** Importing again updates the order, never duplicates it, and an older state is ignored.

**Desired state per listing.** Pushes are not messages in a queue. Each linked listing has one row holding the figure the marketplace should show, written by the foundation in the same transaction as the stock change, with the ledger sequence it was computed from. The figure applies pack sizes, kits, buffers and the low-stock policy. Ten changes to one listing update one row, so the latest figure is sent once, nothing old is ever replayed, and losing a background worker loses nothing: the work list is a query.

## Talking to marketplaces

**Every connection starts in shadow.** Orders come in and stock is reserved inside Vervoro, but no stock figure, dispatch notice or confirmation leaves. The gate records what it would have sent. A seller goes live once every difference is explained. Stopping sends on a live connection always asks first: leave the figures as they are, or send zero.

**The egress gate is the one door to marketplaces and suppliers.**

- An outbound effect is recorded inside the transaction with an idempotency key and sent only after commit, so nothing leaves during a transaction and a repeat cannot send twice.
- For every send, the gate reads the account's mode from the database, never from a cache.
- It decrypts the account's credentials, takes a token from the account's rate budget and calls the connector. No connector, handler or screen ever sees a decrypted credential.
- Every answer becomes one of: applied, accepted and awaiting processing, throttled, compare mismatch, rejected, or unknown. A timeout is unknown, not failed: the real state is read back before anything is sent again.
- Work is claimed with leases, never open-ended locks. A crash costs one lease period, and a result is written only if the claim is still its own.

**The send rules** sit in the Channels host. A decrease, or any change while the shelf is low, goes at once. An increase waits until that channel's orders are known to be imported. A well-stocked figure is sent again only once the channel has drifted from it. Every send has a deadline, after which the listing is read back. Where a marketplace offers compare-and-set, the gate uses it.

**Connectors are plugins.** Each marketplace is its own module that contributes one connector definition. The host and the server name no marketplace, so removing the module removes the marketplace.

| The connector declares | The host does |
| --- | --- |
| A translator between the marketplace's API and the connector contract | Builds one per account, over HTTP bound to that account |
| Credential and settings schemas, and its authentication kind | Validates, seals and refreshes credentials; runs authentication with them |
| A rate budget per operation, and which operations change the marketplace | Keeps token buckets per account and operation; only the gate may send a change |
| How a webhook is verified, and which account it names | Verifies before any database read, finds the company, queues the notice |
| How a seller approves Vervoro on the marketplace | Runs the approval flow and everything that touches a secret |

**Orders arrive by webhook.** A webhook is verified, put on the inbound queue, and answered at once. The consumer fetches and imports the order afterwards. A failed delivery is retried with growing delays for about 40 minutes, then moves to a dead-letter queue that alerts the operator. A scheduled read of each account is the completeness check behind the webhooks: it catches what a marketplace failed to send and moves the order watermark, which only moves forward. Amazon delivers order notices only to its own cloud queue, so a small relay in AWS forwards them to the same webhook.

**Simulators.** Every marketplace, the parcel carriers, mail and the AI provider has a simulator: a real HTTP server that speaks the real API shapes, with a control interface to change its world (orders, stock, the clock) and its behaviour (latency, failures, throttling, late or repeated notices), and a typed log of every request. Connectors are written against the real APIs, so the same code runs against the simulators and against the marketplaces. Where a simulator is simpler than the real service, its documentation says how. Before launch, every call the launch connectors make is checked against a recorded real reply, and each difference is fixed in the simulator. A build check refuses any simulator code in the production bundle.

## Runtime

- **One Worker per environment** serves the built client as static files, the API and every webhook. Deployed code uses web-standard APIs and platform bindings only; Bun is the build, package and test tool.
- **Background work** runs on one sweeper per database, a Durable Object driven by its alarm. It finds the companies with work due in one query and runs them side by side. It wakes at the next due time, sets no alarm when nothing is due (so the database may sleep), is nudged within seconds by a change, and has an hourly scheduled trigger as the safety net for a lost alarm ([ADR-001](../database-architecture/#background-work-and-events)).
- **Webhooks** go through one inbound queue with retries and a dead-letter queue.
- **Live updates** come from one Durable Object per company that holds its open screens' connections, so a screen updates when a background job changes what it shows.
- **The outbox, not a queue, is the source of truth.** An event is delivered right after commit, and the sweeper delivers any that a crash left behind. A queue message cannot be part of the database transaction, so events do not go through a queue. Durable Objects only make the common case fast; everything they need to rebuild is in Postgres.
- **Postgres on Neon, through Hyperdrive.** Hyperdrive pools connections in transaction mode. Query caching is off on every configuration, because a cached stock figure, mode or session would be wrong.
- **Placement.** The Worker is placed in the database's EU region, not near the visitor. A stock command holds the company's lock for its whole transaction, so the distance to the database is the throughput of one company's stock writes.
- **No long work in a request.** No marketplace call runs inside a database transaction, and slow work is always queued.
- **Telemetry** (one point per marketplace call, sweep, alert pass and queue batch) goes to the platform's analytics store, never to the database. Structured logs carry the company, the account and a correlation id that follows one change from import to applied.
- **Alerts page the operator** on the failures that matter: a stalled order watermark, a non-empty dead-letter queue, a difference in the nightly stock check, a failed migration.
- **Deploying is one command.** Migrations run first and finish before the new code goes live. Migrations only add, so a rollback is switching back to the previous version. A database below the version the code needs is an error that alerts, never a state the code handles.

## Data

How data is stored and isolated is decided in two records of its own. They are the target this architecture builds towards.

- **[ADR-001: Multi-tenant database architecture](../database-architecture/).** A control database knows only who the companies are and where they live. Customer databases ("cells") hold many companies in shared tables, each row carrying its company and fenced by forced row-level security. Every company-level operation (export, move, restore, erase) is one generated operation over that company's rows, and guard rails in the runtime and in CI make a cross-company read or write impossible to write by accident.
- **[ADR-002: Data retention and archiving](../data-retention/).** About 24 months of history stay in a cell, current state never leaves, and older months move to compressed per-company files in object storage for the statutory period.

Two architecture rules hold across both: only the data layer says which company a transaction belongs to, and a module never writes raw table definitions; it declares its tables, and the data layer adds everything tenancy needs.

## The client

- **One React single-page app,** phone first. At sign-in it asks for the user's capabilities and mounts only the modules and actions available to them. A disabled module's screens are never downloaded. The client is a convenience, not a security boundary: the server checks every request again.
- **One UI package** is the only place that imports the UI libraries (accessible components, tables, the barcode scanner, icons, charts). A lint rule bans them everywhere else, and a test proves the rule fires. A library can change without any screen's code or test ids changing.
- **One token package** holds every colour, size, space and breakpoint. Styling uses tokens only, so dark mode and density follow from one file.
- **Accessible by default.** Every status has an icon and a word, never colour alone. Every control is at least one touch target. Focus is always visible.
- **Every interactive element has a stable test id,** so end-to-end tests do not depend on layout or wording.
- **Slow marketplaces never block a screen.** Talking to a marketplace always happens in the background.

## Languages and formats

Every word on screen comes from a catalogue. English is written first; other languages (Turkish first) are typed against the English keys, so a missing translation fails the typecheck. While building, only English is required, and a batched pass fills the rest before release. Numbers, money, dates and times come from one set of formatters: money keeps its currency and is never added across currencies, and every moment is shown in the company's time zone.

## Testing and verification

- **Tests run on the real kernel,** with real databases and the simulators. Nothing is mocked.
- **Two database drivers, one contract.** The fast local mode uses an embedded Postgres in the process; everything else uses real Postgres. One contract test suite runs against both, so they cannot drift. Concurrency, duplicate delivery and database roles are proved only on real Postgres: many orders racing for the last unit reserve it exactly once.
- **Isolation is proved on real Postgres** under the runtime role, as ADR-001 sets out.
- **One verify command** means green: lint, typecheck and the tests the change can affect, in seconds to minutes. A fuller run uses both databases for changes to the data layer, migrations, locking or the ledger. Every test runs before a release.
- **Every code example in the core packages' documentation is executed** by a test, so the documentation always runs.
- **Never weaken a test to go green.** Fix the code, or ask.

## How work is done

- **A new module starts from a scaffold** in the reference shape: contract and screens agreed first, then one vertical slice (data and commands, server routes with access and warehouse scoping, the client page, tests), then one review of the whole change.
- **Migrations are forward-only.** A migration already merged is never edited, because other copies and databases have applied it.
- **Docs follow the code** in the same change: the design decision, the package's own documentation, and the launch checklist row the work serves.
- **AI coding agents follow the same rules,** with checks they cannot skip: a hook refuses edits that delete or skip tests or touch secrets, verify runs automatically at the end of any turn that changed code, parallel work runs in separate worktrees with disjoint files, and one read-only review runs on each integrated change.

## Consequences

**What this gives us**

- One deploy, one log and one database transaction for a stock change. A seller's stock is changed in one place, by one set of rules, under one lock.
- A module can be added, removed, switched off or tried as a variant without touching the others. A new marketplace is one new module.
- Shadow mode, idempotency and rate limits for marketplaces and suppliers exist once, in the gate, so no module can forget them.
- An agent can work on one module with only that module and a handful of contracts in view.
- Development and tests reproduce marketplace failures (throttling, late notices, timeouts after a change was applied) on demand.

**What it costs**

- Nothing physical stops a developer reaching across modules inside one deploy, so the boundaries rely on package exports, lint rules, the composition test and review.
- One company's stock writes are serialised by its lock, so transactions must stay short and the Worker must stay next to the database.
- Every outbound effect is two steps, record then send, and every handler must be idempotent.
- The simulators are a large second codebase and can drift from the real APIs; recorded real replies are what keep them honest.
- Two database drivers and two local modes to keep working.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Separate services per feature | One operator cannot run a fleet; a stock change would span services and lose its single transaction |
| Modules that extend a base class or call each other's code | Makes a module impossible to remove; ports and events keep it removable |
| Every module writes stock directly | The safety rules would have to be re-implemented, and kept right, in every module |
| A queue of push messages per listing | Order and replay become the guarantee; one desired figure per listing needs neither |
| Exceptions for expected failures | A missed catch becomes a crash or a silent failure; a typed result must be handled |
| Each connector calls its marketplace itself | Credentials, rate limits and shadow mode would be scattered across connectors |
| Polling as the main way to get orders | Slower, and it spends the marketplace's call allowance; webhooks with a completeness check are faster and complete |
| Testing against marketplace sandboxes | Slow, rate-limited, not deterministic, and unable to produce the failures that matter |
| A long-running server | A server to patch and watch; serverless removes it at the cost of short requests |
