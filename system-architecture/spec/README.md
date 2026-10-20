# ADR-000 SPEC: System architecture

| | |
| --- | --- |
| **Decision** | [ADR-000: System architecture](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-000-system-architecture) |
| **Date** | 20–21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-000 from. Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

Everything below is built at launch except these parts, which keep their rules here (owner ruling, 20 October 2026).

| Later part | Trigger | Rules |
| --- | --- | --- |
| Variants: an alternative provider of a port, assigned by the operator to a named company | The first experiment the operator wants to run | [3](#3-assembly-per-company) |
| Selling into the EU: rates, rules and marketplace sites | Its own record ([ADR-011](../../invoicing-and-vat/)) | [14](#14-money-and-countries) |
| A Worker placement outside the EU | A dedicated cell outside the EU ([ADR-001](../../database-architecture/spec/#dedicated-databases-and-residency)) | [10](#10-runtime) |
| The sweeper and the queue consumer hand each company's run to the app's placed request path | The placed-work test shows their jobs hold a company's lock clearly longer than a request does ([ADR-001 SPEC 14](../../database-architecture/spec/#14-tests-that-prove-each-rule)) | [10](#10-runtime) |

Extension points (several providers of one port, chosen per key, such as connectors) are built at launch.

## 1. Modules and the manifest

1. Every capability is a module. Each module exports one manifest, which the build, the server, the client and the tests all read. The app holds no feature route, table or screen: it mounts what manifests contribute.

| Part | What it says |
| --- | --- |
| Id and needs | A stable id, and the modules that must be on for this one to work |
| Provides and uses | The ports it offers and the ports it calls. A call to a port it did not declare is refused at runtime |
| Contributes | Providers for an extension point, such as one marketplace connector |
| Publishes and handles | The events it writes and the events it reacts to |
| Permissions | Named actions a role can be granted ([ADR-010](../../users-and-access/)) |
| Routes | Its server routes, each with the permission and warehouse scope it needs |
| Slots | Its screens and menu entries |
| Migrations | Ordered, forward-only changes to its own tables |
| Settings | A typed schema, validated at start-up, with its secrets named so they are never printed |

2. **A port** is a typed call that returns a typed `Result`: use it when the caller needs an answer now. **An event** is a typed fact that has already happened: use it to react to another module's change. Modules talk in no other way.
3. **An extension point** is a port that many modules provide, chosen per key. The marketplace connector is one.
4. **The module boundary is its package.** A module's package exports only its contract (ports, events, their types) and its manifest. Nothing else is importable from it.
5. **Library packages** hold code that several modules share (owner ruling, 20 October 2026). A library has no tables, no manifest, no state and no business rule, and may be imported by any module. The kernel is one. Code with state or a business rule is a module and is reached through a port.
6. **The kernel** is the library every module is built on: typed results and ids, a controllable clock, one database port over real Postgres (an in-process database only for running the app on a laptop), transactions, the outbox, a keyed dispatcher, the egress record (the recording half of the gate), configuration and composition.

## 2. Tables

1. A module owns its tables and prefixes them with its id. Core modules do the same, each with its own prefix, and the kernel's tables (tenant, outbox, receipts, `due`, counters) live in the kernel's own namespace (owner ruling, 20 October 2026). A table in another module's prefix is refused by the catalogue lint.
2. A table may reference a core module's tables, never those of a module outside the core: a foreign key would make switching off and migration order depend on that module. A link to another module is a plain id, resolved through its port.
3. A module never writes raw table definitions. It declares its tables, and the data layer adds everything tenancy needs ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)).
4. Only the data layer says which company a transaction belongs to ([ADR-001 SPEC 1](../../database-architecture/spec/#1-tenancy-inside-a-cell)).

## 3. Assembly per company

1. On every request and background job, composition reads the company's plan, modules, roles and variants. A module is available when its plan includes it, it is switched on, and every module it needs is available. An action is available when its module is and the person's role allows it.
2. A module whose needs are off waits; it is not an error. Every "no" carries a reason, so the screen can say why.
3. *Later* ([section 0](#0-at-launch-and-later)): **variants.** A port may have a `standard` provider and alternatives. The operator assigns a variant to a named company. The safety rules never change with a variant.

## 4. The foundation and the launch modules

1. Modules come in three kinds (owner rulings, 20 October 2026):
   - **Core** (the foundation): always on, and other modules depend on it. Each core module is the only writer of its own tables.
   - **Always on:** never switched off, but nothing depends on it. It calls the core and is never called by it.
   - **Switchable:** on per company and plan. It calls the core and the modules in its needs.

| Module | Kind | Record | Only it writes | Needs | Where it shows |
| --- | --- | --- | --- | --- | --- |
| **Products** | Core | ADR-003 | Products, families, packs, bundles, barcodes, VAT classes | — | Products |
| **Listings** | Core | ADR-005 | Marketplace listings, listing groups, versioned links, suggestions | Products | Products: listings to link; a product's channels |
| **Inventory** | Core | ADR-006 | Warehouses and spots, batches, the ledger and balances, reservations, receipts, counts, transfers | Products | Inventory; Settings: warehouses |
| **Orders** | Core | ADR-007 | Orders, lines, statuses, holds, cancellations, refunds, manual orders | Products, Listings, Inventory, Buyer data | Orders |
| **Buyer data** | Core | ADR-009 | Buyers' names and addresses, their anonymisation, the record of who viewed them | — | Inside an order |
| **Access** | Core | ADR-010 | People, memberships, roles, invitations, the activity view, company settings | — | Settings |
| **Fulfilment** | Always on | ADR-006, ADR-007 | Pick lists, packing, shipments, returns inspection | Orders, Inventory, Buyer data | Orders: pick and pack, returns |
| **Billing** | Always on | ADR-012 | The company's plan and payments | Access | Settings: billing |
| **Channels** (ADR-004's host) | Switchable | ADR-004 | Connections, sealed credentials, modes, rate budgets, notices, egress records | Listings, Orders | Channels |
| **Connectors** (one per marketplace) | Switchable | ADR-004.1–004.3 | Nothing: translators, contributed to Channels | Channels | — |
| **Stock sync** | Switchable | ADR-008 | The figure each listing should show, what each marketplace was last told and confirmed, read-backs, held raises | Inventory, Listings, Channels | Channels; a product's channels |
| **Invoicing** | Switchable | ADR-011 | Invoices, VAT records, invoiced customers | Orders | Invoices |

2. **Calls point toward the core.** A core module calls only other core modules and the kernel. Any other module calls the core and the modules in its needs. The core learns of other modules' work only through events. The build refuses a cycle in needs: when a module must react to a module that needs it, it reacts by event (a new link reaches Stock sync as an event from Listings).
3. **Imports come in through the core.** Channels fetches orders and listings through the connectors and hands them to Orders' and Listings' ports; neither core module knows a marketplace exists.
4. **Stock commands** follow ADR-006: one lock per company, database checks, an append-only ledger and a nightly check ([concurrency](../../stock-ledger/#concurrency-and-repeats), [nightly check](../../stock-ledger/#the-nightly-check-and-checkpoints)). Orders reserves stock by calling Inventory's port inside its own transaction, so an order and its reservation commit together.
5. **One order per marketplace order.** Importing again updates it; an older state is ignored ([ADR-007](../../order-ingestion/#one-order-per-marketplace-order)).
6. **Desired state per listing** (owner ruling, 21 October 2026). Inventory writes each stock change with its ledger sequence and an outbox note in one transaction. Stock sync hears the note right after commit, reads the links through Listings' port, and keeps one row per linked listing with the figure the marketplace should show and the ledger sequence it came from. A figure from an older sequence never replaces a newer one, and a note is never lost, because it commits with the stock change. The work list is a query, never a queue of messages ([ADR-006](../../stock-ledger/#what-gives-listings-a-new-figure), [ADR-008](../../inventory-sync/#the-figure-per-listing)).
7. **Parked.** Purchasing, Amazon Vendor (ADR-004.4, planned), FBA shipments (stock the seller sends into Amazon's warehouses), profit, ads, AI, shipping labels, order routing and MCP access (a seller's AI assistant asking Vervoro questions, owner ruling 21 October 2026: soon after launch) have no record yet. They stay switched off and are not built further until a record and a launch-bar row need them.

### Who depends on whom

<!-- DIAGRAM:dependencies -->

An arrow from A to B means A calls B's port, so A's tests run when B's contract changes ([15.8](#15-testing-and-verification)). A dashed arrow means A tells B something by event; B is tested against the event's type, not against A. A module at the bottom of the map is reached by many; a module at the top by none. That is the intended shape: the core changes rarely, and the modules that change often sit at the edge.

When a change alters a module's contract, it re-runs the tests of:

| A change to the contract of | Re-runs the tests of |
| --- | --- |
| Fulfilment, Billing, Stock sync, Invoicing, a connector | Itself only |
| Access | Itself and Billing |
| Channels | Itself, the connectors and Stock sync |
| Orders | Itself, Channels, the connectors, Stock sync, Fulfilment and Invoicing |
| Inventory, Buyer data | Those of Orders, plus Inventory or Buyer data |
| Listings | Itself, Orders, Channels, the connectors, Stock sync, Fulfilment and Invoicing |
| Products | Every module except Buyer data, Access and Billing |

### Who calls whom, event by event

<!-- DIAGRAM:calls -->

Solid arrows are port calls inside the caller's transaction; dashed arrows are events delivered after commit; dotted arrows are outside calls, never inside a transaction. In shadow mode the gate records what it would send and sends nothing. What the diagram leaves out:

- **Set-up calls.** Connecting runs the seller's approval, seals the credentials and subscribes to notices, in shadow too ([ADR-004](../../channel-connectors/)).
- **A cancellation the seller wants** starts in Orders; Channels sends it to the marketplace by event ([ADR-007](../../order-ingestion/#cancellations)).
- **Invoices and refunds.** Orders records refunds; Invoicing hears shipped and refunded orders and acts by its own rules ([ADR-011](../../invoicing-and-vat/)).
- *Later:* **purchase orders.** Purchasing calls Inventory's receive port when a supplier delivers; Amazon Vendor brings Amazon's purchase orders through Channels into Orders once a person approves them.

## 5. Results

1. Every expected failure is a typed `Result` (`ok` or `err` with a typed reason). A port never throws for an expected failure.
2. An exception means a defect. It is logged with its correlation id and fails the request or job; it is never caught and ignored.
3. A caller must handle the `err` case; the typecheck refuses code that reads a value without it.

## 6. Events and the outbox

The rules are [ADR-001 SPEC 9](../../database-architecture/spec/#the-outbox): the note is written in the change's transaction, delivered right after commit, handled in a transaction with a receipt per (event, handler), and any leftover is delivered by the sweeper.

1. **Every commit delivers its own notes,** in a request or in a background job alike. An import by the completeness check or the queue consumer delivers right after its commit, not on the next sweep.
2. Every handler is idempotent: a second delivery finds the receipt and does nothing.
3. Events never go through a queue. Durable Objects keep nothing Postgres does not hold.

## 7. The egress gate

The gate has two halves: the kernel records an effect in the caller's transaction, and Channels sends it after commit. No other code sends.

An **egress effect** is a call that changes something on a marketplace or at a supplier: figures, dispatch, confirmations, messages. Notice subscriptions made by a connector's connect and disconnect hooks are set-up calls, not egress effects: they run in shadow mode too, through the host's HTTP and rate budgets ([ADR-004](../../channel-connectors/#notices-in)).

1. An effect is recorded inside the transaction with an idempotency key and sent only after commit. A repeat with the same key cannot send twice.
2. For every send the gate reads the account's mode from the database, never from a cache. Only `live` sends; `shadow` records what it would have sent. The modes and the stop choice are [ADR-004](../../channel-connectors/#testing-sandboxes-and-shadow-mode).
3. Channels opens the account's credentials, takes a token from its rate budget and calls the connector. No connector, handler or screen ever sees an opened credential.
4. Every answer becomes one outcome: `applied`, `accepted` (awaiting processing), `throttled`, `compare_mismatch`, `rejected` or `unknown`. A timeout is `unknown`: the listing is read back before anything is sent again ([ADR-004](../../channel-connectors/#retries-and-outcomes)).
5. Work is claimed with leases, never open-ended locks. A crash costs one lease period, and a result is written only if the claim is still its own.
6. Where a marketplace offers compare-and-set, the gate uses it.
7. When a figure is sent, and the read-back deadline, are [ADR-008](../../inventory-sync/#when-a-figure-is-sent).

## 8. Connectors and orders in

1. Each marketplace is its own module that contributes one connector definition. The host, the gate, the server and the screens name no marketplace, so removing the module removes the marketplace.
2. What a connector declares and what the host does with it: [ADR-004](../../channel-connectors/#what-a-connector-declares).
3. A connector has no network access of its own. A lint rule refuses any network call in a connector.
4. Orders arrive by notice: verified before any database read, queued, answered at once; the consumer fetches and imports. A failed delivery is retried with growing delays for about 40 minutes, then goes to the dead-letter queue, which alerts the operator. The completeness check and its intervals are [ADR-004](../../channel-connectors/#notices-in). A queue message carries ids only (the account, the topic, and the marketplace's notice and resource ids), never the notice's body.
5. **Amazon's notices** arrive only through an AWS queue or event bus. A small AWS bridge, built once with no code (queue, pipe, API destination) in an EU region, posts them to the app's webhook like any other notice.

## 9. Simulators

1. Every outside service has a simulator: each marketplace, the parcel carriers, mail and the AI provider. It is a real HTTP server that speaks the real API shapes.
2. Each has a control interface to change its world (orders, stock, the clock) and its behaviour (latency, failures, throttling, late or repeated notices), and a typed log of every request.
3. Code is written against the real APIs; only the base address differs. Production refuses a simulator address.
4. Recorded real replies keep simulators honest ([ADR-004](../../channel-connectors/#testing-sandboxes-and-shadow-mode)).
5. A build check refuses any simulator code in the production bundle.

## 10. Runtime

<!-- DIAGRAM -->

1. **The app Worker,** one per environment, serves the built client as static files, the API and every webhook. **The sign-in Worker** is the only other one: it serves the sign-in pages, answers the app's "is this session live?", and reaches only the control database, through its own Hyperdrive configuration ([ADR-010](../../users-and-access/#the-sign-in-worker)). Deployed code uses web-standard APIs and platform bindings only.
2. **Background work** runs on one sweeper per database, a Durable Object driven by its alarm, that runs only companies with work due ([ADR-001 SPEC 9](../../database-architecture/spec/#9-background-work-and-the-outbox)).
3. **Webhooks** go through one inbound queue with retries and a dead-letter queue.
4. **Live updates** come from one Durable Object per company that holds its open screens' connections, so a screen updates when a background job changes what it shows. They carry ids and statuses, never buyer data ([ADR-009](../../buyer-data/)).
5. **Postgres on Neon, through Hyperdrive:** one configuration per database, transaction-mode pooling, query caching off on every one ([ADR-001 SPEC 13](../../database-architecture/spec/#13-platform-constraints)).
6. **Placement.** The app Worker is placed in the databases' EU region, not near the visitor, because a stock command holds its company's lock for its whole transaction. One placement serves every UK and EU cell. Queues and Durable Objects are created in the EU jurisdiction, near the databases.
7. **Nothing leaves during a transaction.** No marketplace or other outside call runs inside a database transaction. The host's HTTP refuses a call while the caller holds a transaction, so the rule is enforced, not remembered. Postgres backs the rule: the runtime role's `transaction_timeout` ends any transaction before Hyperdrive's 60-second limit, so a stuck request cannot hold a company's lock.
8. **Screens show stored copies** (owner ruling, 20 October 2026). A request never calls a marketplace. Marketplace data a screen shows is read by a background job and stored; the screen shows it with its age and may ask for a refresh, which becomes background work.
9. **Slow work runs in the background,** never in a request: the request writes the work's `due` row and the sweeper runs it. The inbound queue carries only marketplace notices.
10. **Telemetry** (one point per marketplace call, sweep, alert pass and queue batch) is a structured log line, never written to the database. It carries the company, the account and a correlation id that follows one change from import to applied, never a field value. Invocation logs are off. Nothing goes to an analytics store, whose data location cannot be held to the EU.
11. **Alerts page the operator** on: a stalled order watermark, a non-empty dead-letter queue, a difference in the nightly stock check, and a failed migration. Other records add their own. A scheduled check from outside Cloudflare, in the AWS account Amazon's notices already need, pages the operator when the app cannot be reached or any background work is more than 5 minutes overdue. It covers a lost alarm, a stuck queue and the cron itself.
12. **Where data goes.** Company and buyer data are stored only in the EU databases. Queue messages, Durable Object state and live updates carry ids and statuses only. No Worker binds a key-value store, SQL database or analytics store. Hyperdrive caches nothing. Logs carry ids only. Processing runs on Cloudflare's network, placed in the EU but not guaranteed there; that meets the data-location limit (owner ruling, 21 October 2026).

## 11. Deploying

1. Deploying is one command. Migrations run first, on control and every cell in the ring of [ADR-001 SPEC 12](../../database-architecture/spec/#12-operations), and finish before new code goes live.
2. Migrations only add, so the previous code version runs on the new schema, and a rollback is switching back to it. A migration is never rolled back.
3. A database below the version the code needs is an error that alerts, never a state the code handles.
4. Each Worker deploys on its own, only when its code changes; when both change, the sign-in Worker goes first ([ADR-010](../../users-and-access/#the-sign-in-worker)).

Procedure: [Deploy and roll back](../../runbooks/deploy-and-roll-back/).

## 12. The client

1. One React single-page app, phone first. At sign-in it asks for the person's capabilities and mounts only the modules and actions available to them. A switched-off module's screens are never downloaded.
2. The client is not a security boundary: the server checks every request again.
3. Only the UI package imports the UI libraries (accessible components, tables, the barcode scanner, icons, charts). A lint rule bans them everywhere else, and a test proves the rule fires.
4. Only the token package holds colours, sizes, spaces and breakpoints. Styling uses tokens only.
5. Every status has an icon and a word, never colour alone. Every control is at least one touch target. Focus is always visible.
6. Every interactive element has a stable test id.
7. No screen waits for a marketplace ([section 10](#10-runtime), rule 8).

## 13. Languages and formats

1. Every word on screen comes from a catalogue. Other languages are typed against the English keys, so a missing key fails the typecheck. While building, only English is required; a batched pass fills the rest before release.
2. Numbers, money, dates and times come from one set of formatters. Every moment is shown in the company's time zone.

## 14. Money and countries

1. Money always carries its currency. Adding amounts in different currencies is refused.
2. A product has a VAT class; rates come from a table keyed by country and class.
3. Every order line stores the country, class and rate it used.
4. Country rules live only in the records that name them (ADR-006, ADR-011, ADR-012, each marketplace's sub-record). Selling into the EU (*Later*) changes nothing in stock, orders, listings or tenancy.

## 15. Testing and verification

1. Tests run on the real kernel, with real databases and the simulators. Nothing is mocked.
2. **One test database: real Postgres** (owner ruling, 21 October 2026), the same major version as production, started locally by the test runner. The in-process database allows one connection and runs as a superuser, so it cannot prove locking or row-level security; it is used only by `dev` to run the app on a laptop, and no test depends on it.
3. Concurrency, duplicate delivery, database roles and isolation are proved only on real Postgres, under the runtime role.
4. **One verify command** means green: lint, typecheck and the tests the change can affect. Every test runs before a release.
5. Every code example in the core packages' documentation is executed by a test.
6. A test is never deleted, skipped or weakened to go green.
7. **A module is tested alone.** Its tests start only the kernel, the modules in its needs and the simulators. The app's own tests check the wiring only.
8. **Dependents re-run only when a contract changes** (owner ruling, 20 October 2026). A module's contract is its exported ports, events and their types. When a change leaves the contract as it was, only the module's own tests run; when it alters the contract, the tests of every module that needs it run too. The build decides by comparing the contract with the base, never by a person's judgement.
9. **A contract is pinned by its owner's tests.** Every port and event of a module has tests in that module's own suite that fix its behaviour, so a change behind an unchanged contract that would break a caller fails there first. Every test still runs before a release.

## 16. How work is done

1. A new module starts from the scaffold, in the reference shape: contract and screens first, then one vertical slice (data and commands, server routes with access and warehouse scoping, the client page, tests), then one review of the whole change.
2. A migration already merged is never edited. The one pre-launch reset is [ADR-001 SPEC 12](../../database-architecture/spec/#12-operations).
3. Docs follow the code in the same change: the design decision, the package's own documentation, and the launch checklist row the work serves.
4. AI coding agents follow the same rules, with checks they cannot skip: a hook refuses edits that delete or skip tests or touch secrets; verify runs at the end of any turn that changed code; parallel work runs in separate worktrees with disjoint files; one read-only review runs on each integrated change.

## 17. Questions the review raised, answered

A review of the first implementation listed where ADR-000 was unclear.

| # | Question | Answer | Where |
| --- | --- | --- | --- |
| 1 | What exactly is a module boundary? | Its package: it exports only contract and manifest. Shared code goes in a library package with no tables, manifest, state or rules (owner ruling) | [1](#1-modules-and-the-manifest) |
| 2 | Do the core modules and the kernel prefix their tables? | Yes: each core module its own prefix, the kernel its own namespace; the lint refuses a table in another module's prefix (owner ruling) | [2](#2-tables) |
| 3 | May a request read a marketplace live? | No. Screens show stored copies with their age; a refresh becomes background work (owner ruling) | [10](#10-runtime) |
| 4 | How is "no call inside a transaction" enforced? | The host's HTTP refuses a call while the caller holds a transaction | [10](#10-runtime) |
| 5 | Do connect-time subscriptions go through the gate, and do they run in shadow? | Not through the gate: they are set-up calls. They run in shadow too, through the host's HTTP and rate budgets (ADR-001, ADR-004) | [7](#7-the-egress-gate) |
| 6 | May the sweeper visit every company? | No. It runs only companies with work due (ADR-001) | [10](#10-runtime) |
| 7 | Does a background commit deliver its events at once? | Yes, every commit delivers its own notes | [6](#6-events-and-the-outbox) |
| 8 | Are variants built at launch? | No, *Later* (owner ruling) | [0](#0-at-launch-and-later) |
| 9 | Was the pre-launch migration squash allowed? | Once, before launch (ADR-001) | [16](#16-how-work-is-done) |
| 10 | Is the foundation one module? | No: six core modules, each the only writer of its data; Fulfilment and Billing are always on but outside the core (owner rulings) | [4](#4-the-foundation-and-the-launch-modules) |
| 11 | Who owns routes and screens? | The module; the app only mounts them (owner ruling) | [1](#1-modules-and-the-manifest) |
| 12 | Who owns listing links and each listing's figure? | Listings owns links; Stock sync works out each figure after the stock change commits, and sends it (owner rulings) | [4](#4-the-foundation-and-the-launch-modules) |
| 13 | When do a module's dependents re-run their tests? | Only when its contract changes, decided by the build (owner ruling) | [15](#15-testing-and-verification) |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look and which test proves it.

- [ ] **Packages:** a module exports only contract and manifest (its export map); a library has no tables, manifest, state or business rule. Each boundary lint has a test that it fires: no import of a module's internals, no table outside its prefix, no network call in a connector, UI libraries only in the UI package.
- [ ] **Manifests:** every port a module calls is in its `uses`. The composition test wires only declared ports, refuses an undeclared call, a core module calling outside the core, and a cycle in needs.
- [ ] **Tables:** every table carries its owner's prefix, the kernel's in its own namespace; no foreign key points to a table outside the core (database catalogue).
- [ ] **Owners:** only Inventory writes stock, only Orders writes order status, only Listings writes links, only Stock sync writes listing figures; no stock transaction reads a link (search for writes to their tables).
- [ ] **Direction:** no core module imports or calls a module outside the core; the build's cycle check is green; the dependency map in section 4 matches the manifests.
- [ ] **App:** the server and client hold no feature route, table or screen; everything comes from manifests.
- [ ] **Isolation:** each module's suite passes with only the kernel, its needs and simulators started. The selection test shows a change behind an unchanged contract selects only its own module, a contract change also selects its dependents, and none is missed. Every exported port and event has a test in its owner's suite.
- [ ] **Stock:** every stock command's first statement takes the company lock. The round-trip count test, and the race where many orders want the last unit and exactly one gets it, are green on real Postgres.
- [ ] **Results:** ports return `Result`; no empty or logging-only catch block anywhere (lint).
- [ ] **Outbox:** every commit path, request and background job, delivers its notes after commit; the background-delivery test is green; handlers write a receipt in their own transaction.
- [ ] **Gate:** every marketplace or supplier write goes through it; mode read from the database on each send; no credential opened outside it; a timeout is `unknown` and read back, never resent.
- [ ] **Connectors:** set-up calls run through the host's HTTP, in shadow too; the shadow set-up test shows a new account subscribes and sends no figure.
- [ ] **Host HTTP:** the transaction guard test shows a call made while a transaction is open is refused; no route calls a marketplace.
- [ ] **Sweeper:** no background code loops over every company (search for loops over the company registry).
- [ ] **Screens:** marketplace data comes from stored copies, shown with their age.
- [ ] **Simulators:** production refuses a simulator address; the bundle check finds no simulator code in the production bundle.
- [ ] **Hyperdrive:** caching off on every configuration; the app Worker placed in the EU region.
- [ ] **Telemetry:** no telemetry table in Postgres; logs carry company, account and correlation id, never buyer data.
- [ ] **Alerts:** the four paging alerts exist and a seeded failure in staging pages.
- [ ] **Deploy:** migrations finish everywhere before the Worker switches; the code refuses a database below its version.
- [ ] **Client:** no raw colour or size outside the tokens; every interactive element has a test id.
- [ ] **Languages:** no literal on-screen text outside the catalogue; formatters used for every number, amount and date.
- [ ] **Money:** no addition of amounts without a currency check; order lines store country, class and rate.
- [ ] **Tests:** no mocks of the kernel, the database or a marketplace; the driver contract suite runs on both drivers and agrees.
