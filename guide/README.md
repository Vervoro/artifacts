# Architecture map and glossary

How the records fit together, what their shared words mean, and how far each one has got. When this page and a record disagree, the record wins.

## Map

The records follow [ADR-000's module map](../system-architecture/spec/#4-the-foundation-and-the-launch-modules): the platform under every module, the six core modules, the always-on modules outside the core, and the switchable modules.

```text
ADR-000  System architecture: modules and the module map, the outbox, the egress gate, simulators
│
├── Platform (no module of its own)
│   ├── ADR-001  Multi-tenant database: control and cells, forced row-level security, routing
│   ├── ADR-002  Data retention and archiving
│   └── ADR-013  Sign-in: the sign-in Worker running Better Auth, passkeys, sessions, recovery
│
├── Core modules: the foundation, always on, each the only writer of its own data
│   ├── ADR-003  Products: SKU, packs, bundles, VAT class, charge lines
│   ├── ADR-005  Listings: catalogue sync and versioned links
│   ├── ADR-006  Inventory: the stock ledger and reservations
│   ├── ADR-007  Orders: order ingestion
│   ├── ADR-009  Buyer data and privacy
│   └── ADR-010  Access: users, roles and permissions
│
├── Always-on modules, outside the core
│   ├── ADR-014  Fulfilment: picking, packing, shipments, returns
│   └── ADR-012  Billing and plans (Vervoro charging the seller)
│
└── Switchable modules
    ├── ADR-004  Channels: the connector contract, the host, shadow mode
    │   ├── ADR-004.1  eBay connector
    │   ├── ADR-004.2  Amazon Seller connector
    │   ├── ADR-004.3  Shopify connector (Later)
    │   └── ADR-004.4  Amazon Vendor connector (planned, not written)
    ├── ADR-008  Stock sync: inventory sync
    └── ADR-011  Invoicing and VAT (the seller's own invoices)
```

**Parked, with no record yet** ([ADR-000 SPEC 4.7](../system-architecture/spec/#4-the-foundation-and-the-launch-modules)): Purchasing, FBA shipments, profit, ads, AI, shipping labels, order routing, and MCP access for a seller's AI assistant (soon after launch). They stay switched off and are not built further until a record and a launch-bar row need them.

The order to build them in is on the [index](../).

## How the records are organised

Each record is split into up to three documents, so that a person can review the decision in a few minutes:

| Document | For | Holds |
| --- | --- | --- |
| **ADR** | The owner and the developer, to approve | Status and scope, context, at most 10 decisions in plain words, often a short section with a diagram showing how it works, consequences, alternatives rejected, open items. No SQL or worked examples |
| **SPEC** | The developer and coding agents, to build from | Section 0, the parts that are *Later* and the trigger for each; who writes what; numbered rule sets, tables and state lists; storage; platform constraints with sources; the tests that prove each rule; and a checklist for reviewing the code |
| **RUNBOOK** | The operator, to carry out | One page per procedure under [runbooks](../runbooks/): when it is built, its record, who runs it, with which role, numbered steps, how to verify, and what to do if it stops halfway |

The ADR decides, the SPEC says exactly how, and a runbook carries it out. When they disagree, the ADR wins. Every record is in this form; ADR-004.3, which is *Later*, has no runbook of its own yet. A rule another record owns is linked, never restated ([which record owns which rule](../rulebook/)). A part marked *Later* keeps its rules in the SPEC and is built only when its trigger arrives; a *parked* area has no record yet. A change to an Accepted record is an amendment that names the owner's ruling and its date. The rules every change must keep are in the [engineering rulebook](../rulebook/).

## Status of a record

| Status | Meaning |
| --- | --- |
| **Proposed** | Written and reviewed by the owner, still open to change. Code follows it, and its rules bind until the record changes |
| **Accepted** | The developer has reviewed it and the owner has signed it off. It changes only by a dated amendment with the owner's ruling |
| **Implemented** | Built, with the tests that prove its rules passing |
| **Superseded** | Replaced by a named later record, which is linked from it |
| **Deprecated** | No longer applies, and nothing replaces it |

**Accepted** (21 October 2026, amended since by dated owner rulings): [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-010](../users-and-access/) and [ADR-013](../sign-in/); ADR-013 may be amended by Amazon's answer on passkeys. Every other record is **Proposed**.

A record becomes Accepted only after the developer's review and the owner's sign-off, as the build reaches it: [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-010](../users-and-access/) and [ADR-013](../sign-in/) before the foundation is built; [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/) and [ADR-008](../inventory-sync/) before their phases begin; each other record before the work that follows it.

## Glossary

One word per concept, defined once, with the record that owns it. Where two words appear in the records, the table says whether they mean the same thing; words that look alike but mean different things are listed at the end.

### Companies, people and databases

| Term | Meaning |
| --- | --- |
| **Company** | One customer of Vervoro: a seller's business. "Tenant" in ADR-001 means the same thing; the **tenant row** is a cell's own record of a company and its state there. Vervoro has no separate "organisation" (ADR-001) |
| **Company state** | Trial, active, restricted or closed, worked out from a few dates in control and never stored; an erased company is only a tombstone. **Restricted** makes everything off the stock path read-only (ADR-012 SPEC 7–8) |
| **Login** | One person's way in: a Better Auth user, with their email address, sign-in methods and sessions, in the control database's auth schema. Its id is the login id every other record uses (ADR-013) |
| **Authentication** | Proving who a person is: sign-in methods, sessions, recovery steps. Done by Better Auth inside the sign-in Worker (ADR-013) |
| **Authorization** | Deciding what a signed-in person may do in a company: memberships, roles, warehouse scope, permissions, operator grants. Done only by the Access module (ADR-010), never by Better Auth |
| **Better Auth** | The open-source authentication library the sign-in Worker runs. A dependency inside Vervoro, writing to Vervoro's own database: not a hosted identity provider, and not Vervoro's authorization (ADR-013) |
| **Sign-in Worker** | The only Worker besides the app. It runs Better Auth, serves the sign-in pages, alone holds the sign-in secret and touches the `auth` and `auth_policy` schemas, and tells the app over a service binding whether a session is live and whose. The app never sees a typed password (ADR-013) |
| **Auth schema** | The `auth` schema in the control database, where Better Auth keeps its tables, beside `auth_policy`, Vervoro's own sign-in policy tables. Only the sign-in role can reach them (ADR-001, ADR-013) |
| **Access module** | The core module that answers "may this login do this here": it reads the membership and member row and applies the permission matrix (ADR-000, ADR-010) |
| **Session** | Better Auth's record that a login signed in, held in the browser as a cookie: at most 24 hours for everyone, never extended. The only session model (ADR-013) |
| **Fresh check** | A session started within the last 5 minutes. Account changes need one, and only the sign-in Worker can vouch for it (ADR-013 SPEC 5, ADR-010 SPEC 5) |
| **Setup-only session** | A session that can only finish setting up sign-in: a password without a confirmed authenticator, a backup code just used, or a password past 365 days. The app treats it as no session (ADR-013 SPEC 5) |
| **Passkey** | A key the person's phone, laptop or password manager keeps, unlocked by a fingerprint, a face or the device's PIN. The default way to sign in (ADR-013) |
| **Recovery** | Getting a person back in after they lose a method: Better Auth's steps (reset, backup code, new methods) under Vervoro's rules on who may start it and which company it reopens (ADR-013) |
| **Membership** | A login's place in one company: the (login, company) pair in control. It is **paused** after the person is reset in another company, until this company's Owner or Admin confirms it. The person's role, warehouse scope and status are on their member row in the company's cell; a request needs both an active member row and a membership that is not paused (ADR-010 SPEC 2, 5). One person can be a member of several companies |
| **Role** | One of six: Owner, Admin, Manager, Warehouse, Accountant, Staff (ADR-010). Not a database role |
| **Operator** | A person running the Vervoro platform, not a member of any company. Looks inside a company only through a **grant**: read-only, one company, a written reason, at most 8 hours, seen and endable by the seller, buyer data masked unless an Owner or Admin switches it on (ADR-010 SPEC 7) |
| **Repair** | A recorded command an operator runs without a grant, as a system actor, showing no company data: rebuilding a balance from the ledger, re-importing an order, an export or restore by the lifecycle tool (ADR-010 SPEC 7) |
| **System actor** | The named actor background work (the sweeper, the queue consumer, the egress gate) runs as and records on every entry. Never a person (ADR-010 SPEC 1) |
| **Control database** | The one database that holds who the companies are and where they live: registry, routing, memberships, logins (Better Auth's tables in the auth schema), operators and grants, plans, shared quotas, the sync epoch, the erasure register and the platform security log. No business data (ADR-001 SPEC 7) |
| **Cell** | A database holding the business data of many companies in shared tables, each row carrying `company_id`, fenced by forced row-level security. There is no schema per company. At launch there is one, cell A (ADR-001) |
| **Neon project and branch** | Control and every cell are each a Neon project of their own, with their own storage, compute, history and credentials. A branch is only a short-lived copy of one database (a rehearsal, a restore, a look-back), never holds live data, and is deleted within 24 hours (ADR-001 SPEC 7, 10) |
| **Dedicated database** | *Later.* A cell holding one company, with the same schema and the same code path. Also called a dedicated cell (ADR-001) |
| **Routing** | Finding a company's database: `company.database_id` in control, read by `forCompany(id)`. Every transaction then proves it is in the right database (ADR-001 SPEC 7) |
| **Adding a company / adding a cell** | Two separate operations: `company:add` needs no database and no deploy; `cell:add` and `dedicated:add` (both *Later*) add capacity and include a deploy (ADR-001 SPEC 8) |
| **Database roles** | Owner (migrations, from the CI job only), runtime (serves requests, cannot bypass row-level security), lifecycle (company operations), sign-in (control's `auth` and `auth_policy` only) and the definer owner (cannot log in). Neon's own internal roles, today `neon_service`, are the one named exception to the role rules (ADR-001 SPEC 3) |
| **Slice operation** | The one generated operation that copies or deletes every row of one company, in batches, as the lifecycle role: export, restore and erase; moves and dedicated placement when they are built (ADR-001 SPEC 10) |
| **Erasure register** | Control's record, by ids and times only, of every buyer erasure and company tombstone, also written to an append-only log in object storage. Every restore replays it before anyone reads the data (ADR-001 SPEC 7, ADR-009 SPEC 11) |
| **Security boundary and defence in depth** | The boundary is what keeps one company from another's rows: forced row-level security, restricted roles, entering one company, the commit check, routing and composite keys. Defence in depth stops a mistake before it gets there: the query builder and query check, the catalogue lint, the audit and the canary (ADR-001 SPEC 6) |
| **Commit check** | The data layer's check, before every commit, that the company setting and the role are still those the transaction entered; a mismatch rolls back, pages and closes egress (ADR-001 SPEC 6) |
| **Canary company** | A synthetic company in every database whose rows no other company may ever see; checked nightly and after each deploy and new partition (ADR-001 SPEC 11) |
| **Catalogue lint and audit** | The lint checks every table and partition against the tenancy rules, in CI and on the live catalogue. The audit checks, at every deploy and nightly, every Neon project and branch, every role, every Hyperdrive configuration and every Worker in the account. A failure pages, and closes egress except where ADR-001 SPEC 11 says (ADR-001 SPEC 6.1, 11) |
| **Staging** | The environment before production: production's roles, row-level security, migration order and EU placement, with simulators and synthetic data only. Until launch it may be deployed from the owner's laptop by the CI deploy script (ADR-001 SPEC 3, ADR-009 SPEC 15) |

### Code and background work

| Term | Meaning |
| --- | --- |
| **Module** | A feature inside the main application deployable (the sign-in Worker, deployed separately, holds no module). It owns its tables, prefixed with its id, and talks to others only through typed ports and events (ADR-000) |
| **Port, event and contract** | A port is a typed call that returns a typed `Result`, for an answer now; an event is a typed fact that already happened. A module's contract is its exported ports, events and their types; only a contract change re-runs the tests of the modules that need it (ADR-000 SPEC 1, 15) |
| **Library** | A package of shared code with no tables, manifest, state or business rule, such as the kernel. Any module may import one (ADR-000) |
| **Foundation** | The six core modules: Products, Listings, Inventory, Orders, Buyer data and Access, always on, each the only writer of its own data. Inventory alone changes stock (ADR-006); Orders alone changes order status. They share one transaction where they must (ADR-000) |
| **Always-on module** | A module outside the core that is never switched off: Fulfilment ([ADR-014](../fulfilment/)) and Billing ([ADR-012](../billing-and-plans/)). It calls the foundation; the foundation never calls it (ADR-000) |
| **Switchable module** | A module a company's plan and settings turn on or off: Channels and its connectors, Stock sync, Invoicing. It calls the foundation; the foundation never calls it (ADR-000) |
| **Query builder and query check** | The typed query builder (Kysely) the data layer hands a module inside an entered transaction, with no raw SQL and only allow-listed functions; the query check is its run-time plugin that refuses, failing closed, any raw-SQL node, function off the allow-list or table outside the module's set (ADR-001 SPEC 6) |
| **Outbox** | Notes written in the same transaction as a change, delivered after commit, each handled once (ADR-001 SPEC 9) |
| **Egress gate** | The one door to marketplaces and suppliers. The kernel's **egress record** writes every outbound effect, with an idempotency key, in the caller's transaction; Channels sends it after commit, reading the account's mode from the database on each send (ADR-000 SPEC 7) |
| **Egress effect** | A call that changes something on a marketplace or at a supplier: figures, dispatch, confirmations, messages. A notice subscription is a **set-up call**, not an egress effect, and runs in shadow too (ADR-000 SPEC 7) |
| **Key** | What makes a repeat harmless: the gate's idempotency key on an outbound effect (ADR-000 SPEC 7), a stock command's key (ADR-006 SPEC 12), and the key a client makes for a tap and keeps across retries (ADR-000 SPEC 12) |
| **Lease** | A time-limited claim on work, never an open-ended lock. A crash costs one lease period, and a result is written only if the claim is still its own (ADR-000 SPEC 7) |
| **Sweeper** | One background worker per database. Finds due work through the `due` table. `due` and `buyer_ref` are the only tables read across companies, and only through two allow-listed functions that return ids and times (ADR-001) |
| **Stored copy** | Marketplace data a screen shows, read by a background job and shown with its age. A request never calls a marketplace (ADR-000 SPEC 10) |
| **Simulator** | A real HTTP server that speaks an outside service's real API, with a control interface for its world and its failures. Development and tests never call the real service (ADR-000 SPEC 9) |
| **Layered testing** | Each rule proved at the cheapest layer that can: pure logic in unit tests with no database; the database on real Postgres; marketplace behaviour on the simulators; critical flows end to end (ADR-000 SPEC 15) |
| **Expand, migrate, contract** | How every schema change ships: add in a backward-compatible form, deploy code that reads both shapes and move the data, then remove the old shape in a later release after the **rollback window** of at least 24 hours and one successful nightly cycle (ADR-000 SPEC 11) |

### Marketplaces

| Term | Meaning |
| --- | --- |
| **Channels** | The switchable module that hosts the connectors: credentials, HTTP, retries, rate budgets, shared pools, notices and the sending half of the egress gate. Also called the host (ADR-004) |
| **Connector** | Vervoro's code for one marketplace. It only translates; the host owns credentials, HTTP, limits and checks (ADR-004) |
| **Account** | One company's connection to one marketplace account: on eBay one site, on Amazon one seller id in one region. "Connection" in ADR-012 means the same thing (ADR-004) |
| **Account mode** | Shadow, live, paused, decrease-only or disconnected (ADR-004 SPEC 12) |
| **Shadow mode** | Every account's first mode: orders are imported and reserved and listings read, and the gate records each figure it would send without sending it (ADR-004 SPEC 11) |
| **Launch gates** | The three measures shadow must pass on a marketplace before any of its accounts goes live: lost notices, detection delay and unreserved orders. The figures are proposals (ADR-004 SPEC 11) |
| **Stop choice** | Each account's stored answer to "if Vervoro stops sending, leave the figures or send zero?", first asked at going live. Every stop asks the same question, and closing a company carries out the stored answer (ADR-008 SPEC 10, ADR-012 SPEC 6, 9) |
| **Decrease-only** | The account mode of a closed company until erasure: orders still import and reserve, and a figure may fall but is never raised (ADR-008 SPEC 10, ADR-012 decision 7) |
| **Notice** | A marketplace's message that something changed: a webhook, or an Amazon notification brought by the AWS bridge. A hint only: it causes a fetch and is never imported itself (ADR-004 SPEC 8) |
| **Completeness check** | The scheduled order read behind the notices, hourly on eBay and every 10 minutes on Amazon. "Backup read" and "scheduled read" mean the same thing (ADR-004 SPEC 9) |
| **Order watermark** | The point up to which a complete read of a marketplace's orders has been done. Only a complete read moves it, and a raise waits for it (ADR-007 SPEC 2) |
| **Shared pool** | A marketplace allowance shared by every seller, such as eBay's Trading API calls, counted exactly in control. Its **safety lane** carries decreases and any figure near zero, its **bulk lane** the rest, and a tenth is a reserve split between its accounts (ADR-004 SPEC 7) |
| **External directory** | Control's map from a marketplace's seller id to the one company that connected it (ADR-001 SPEC 7, ADR-004 SPEC 3) |
| **Listing** | What a marketplace sells and counts on its own, keyed by the marketplace's most stable id and never by the bare SKU; an eBay inventory item and an Amazon seller SKU are keyed by their SKU on that account (ADR-005 SPEC 2) |
| **Listing group** | A marketplace parent (an eBay listing with variations, an Amazon parent ASIN): shown, never linked (ADR-005) |
| **Link** | A versioned tie from a listing to a product, with units per sale and who ships it. An order uses the link that was valid when the buyer bought (ADR-005, ADR-003 SPEC 8) |
| **Marketplace-shipped** | A link or line the marketplace ships from its own stock, such as Amazon FBA. Recorded, never reserved, and its listing gets no figure. The opposite is seller-shipped (ADR-003 SPEC 8, ADR-007 SPEC 15) |
| **Shared-stock listing** | An unlinked, seller-shipped listing that looks like it shares stock with a linked product. Going live needs an answer for each (ADR-005 SPEC 12) |
| **Figure** | The number a listing should show, worked out by Stock sync after each stock change ("D" in ADR-008). The desired state. **No figure** is never sent as zero (ADR-008 SPEC 1) |
| **Believed figure** | What the marketplace is believed to show ("B" in ADR-008). A number, or unknown. Vervoro lowers it only on evidence (ADR-008 SPEC 4) |
| **Zone near zero and tolerance** | Near zero every change is sent; above the zone a figure is sent once it is the tolerance (20 listing units) away from the believed figure, where the listing's own sales are **vouched** to come out of Vervoro's figure (ADR-008 SPEC 2–3) |
| **Drift** | A figure set on the marketplace outside Vervoro, found by notices or reads (ADR-008 decision 2) |
| **Held raise** | A raise Stock sync keeps back while a listing has any hold reason, such as a failed nightly check, a conflict or an unconfirmed bulk link. The figure is still worked out, and every decrease goes (ADR-008 SPEC 7) |
| **Managed listing** | A listing Stock sync sends figures to. A listing not managed gets none; its orders still reserve (ADR-008 SPEC 10) |
| **Sync epoch** | One number per company in control, raised by every restore and part of every write's idempotency key, so no write from before a restore is taken for one after it (ADR-008 SPEC 13) |
| **Unknown** | An outbound write with no clear answer, a timeout included. It is settled before anything else is sent to that listing: read back by default, or, where the connector's record names the exception, the absolute figure Vervoro wants now resent (ADR-004) |

### Orders and fulfilment

| Term | Meaning |
| --- | --- |
| **Order status** | Pending, open, picking, packed, part shipped, shipped or cancelled, worked out by one function from the order's facts. An unexpected move is written and alarms, never refused (ADR-007 SPEC 6) |
| **Hold** | A reason that pauses an order: it keeps the reservation, sends nothing, and stops picking, packing and dispatch. Its kind (marketplace, office or floor) decides who clears it. A **floor stop** is the hold set when the marketplace changes a picked or packed order (ADR-007 SPEC 11, 13) |
| **Import problem** | An order that cannot be read into the contract's types. Never dropped: a problem row, retried on every notice and read, its lines' units kept off the figures (ADR-007 SPEC 9) |
| **Waiting line** | An order line whose listing is unlinked or unknown. It reserves nothing until the listing is linked or a person attaches the line to a product (ADR-006 SPEC 6, ADR-007 SPEC 14) |
| **Short line** | A line with part of its units reserved and the rest recorded missing. It fills when stock arrives; a short order waits (ADR-006 SPEC 5.3, ADR-007 SPEC 10) |
| **Shipped outside Vervoro** | Units the marketplace says shipped that no Vervoro shipment covers. Deducted once, in shadow too. A label bought on the marketplace for an order Vervoro has not closed is "label bought", not shipped outside, unless nothing was picked or packed by leave-by (ADR-007 SPEC 17.8) |
| **Label bought** | A marketplace's report that its own label was bought for an order Vervoro has not closed. It moves no stock; the shipment closes once the order is packed, with no dispatch notice (ADR-007 SPEC 17, ADR-014 SPEC 4) |
| **Label unchecked** | A shipment closed by a marketplace label without the label being scanned. A recall lists it apart (ADR-014 SPEC 4, 7) |
| **Manual order** | A phone, email or business order, or a counter sale, made in Vervoro. A draft reserves nothing; confirming reserves (ADR-007 SPEC 18) |
| **Ship-by and leave-by** | Ship-by is the marketplace's deadline; leave-by is the warehouse's last collection cut-off at or before it, by which the picking list is sorted (ADR-007 SPEC 20) |
| **Shipment** | One per order, possibly in several boxes. Confirming it deducts exactly what was packed for it, once (ADR-014 SPEC 4) |
| **Batch assumed** | A line packed or shipped without anyone saying which batch left: it records the reserved batch, and a recall lists it apart. "Lot not traced" marks units deducted in shadow (ADR-014 SPEC 3, ADR-006 SPEC 7) |

### Products

| Term | Meaning |
| --- | --- |
| **Product** | One thing the warehouse counts, in whole base units. Simple, pack or bundle (ADR-003) |
| **Base unit** | What one unit of a product is called: a piece, a jar, or a metre or 100 g for goods sold by length or weight (ADR-003) |
| **Pack** | A sealed multiple of one simple product, with its own stock. Opened or made by a repack (ADR-003) |
| **Bundle** | Several products sold as one item, with no stock of its own; its sellable comes from its scarcest component (ADR-003) |
| **Box size** | How many base units one case or pallet holds. Used on documents and scans; never stock (ADR-003) |
| **Family** | Products that are one design in several sizes or colours, linked to one variation listing in one step (ADR-003) |
| **Charge line** | Something charged that is not stock (a service fee, gift wrap): a name, an amount and a VAT class on an order or invoice. Never reserves or moves stock (ADR-003 SPEC 1.1) |
| **Not stock** | A mark on a marketplace listing that sells no stock (a warranty). It is never linked; its order lines are charge lines (ADR-003 SPEC 1.1) |
| **Units setting** | A company's choice of metric or imperial for showing weights and sizes. Storage is always grams and millimetres (ADR-003) |

### Stock

| Term | Meaning |
| --- | --- |
| **Ledger** | The append-only record of every stock change. Only a ledger insert changes a balance (ADR-006) |
| **Ledger sequence** | The ledger's number, gapless per company and in commit order. Stock sync records the sequence each figure came from (ADR-006 SPEC 12) |
| **Company's lock** | The row lock on the company's stock counter, taken by the first statement of every stock command and held until commit (ADR-006 SPEC 12, ADR-001 SPEC 2) |
| **Batch** | Stock of one product received together, with its lot, dates and cost (ADR-006) |
| **Warehouse** | A site the seller ships from. An order is reserved and shipped from one warehouse (ADR-006) |
| **Spot** | A place in a warehouse: a shelf, a bench, a dispatch area. Optional: each warehouse has a default spot (ADR-006) |
| **On hand, reserved, held, sellable** | The four numbers per batch in a warehouse. Sellable = on hand − reserved − held, never below zero; only sellable reaches a listing. Held is quarantined plus damaged, plus everything free in an expired, short-dated or blocked batch. Incoming is shown beside them but is never stock (ADR-006 SPEC 3) |
| **Use-by, best-before and sell-by** | A dated batch is use-by or best-before. It is sellable while its date is at least the product's days to sell away; below that it is **short-dated**, past its date **expired**, and both are held. A use-by batch is never reserved, packed or dispatched on or after its date (ADR-006 SPEC 4) |
| **Date pass** | The run just after midnight, in the company's time zone, that moves unpacked reservations off batches that crossed their sell-by date (ADR-006 SPEC 4) |
| **Nightly check** | The proof, per company, that every balance equals its ledger entries and every reserved number its open reservations. A difference alerts and holds raises (ADR-006 SPEC 14) |
| **Lot trace** | One search from a lot to every demand that received it and the stock still on hand; the recall list joins it with the orders (ADR-006 SPEC 10, ADR-014 SPEC 7) |
| **Marketplace stock reading** | What a marketplace holds in its own warehouses (Amazon FBA), read and shown beside the four numbers, never added to them (ADR-006 SPEC 6, ADR-004.2) |

### Money and VAT

| Term | Meaning |
| --- | --- |
| **Plan** | A row in control: the modules it includes, a monthly order ceiling and a support level; prices live only at the payment provider (ADR-012) |
| **Stock contact** | The person a company names to hear about stock if billing goes wrong; needed, with a payment method and a stop choice, before a connection first goes live (ADR-012 decision 4) |
| **Issuer** | Who issues a sale's invoices: the marketplace (Amazon through its VAT Calculation Service, eBay when the seller opted in) or Vervoro in the seller's name. One per sale (ADR-011 SPEC 2) |
| **VAT record** | The append-only record of each sale line's VAT, written when the order is imported, invoiced or not; corrections and reversals are new records (ADR-011 SPEC 6) |
| **Tax point** | The date that fixes a sale's VAT rate and period: for a marketplace order its payment, for a manual order its dispatch or an earlier payment (ADR-011 SPEC 3) |
| **Rate table** | The VAT rates by country and class, platform data in control, changed only by the operator (ADR-003 SPEC 11) |

### Data and retention

| Term | Meaning |
| --- | --- |
| **`audit_log`** | The company's own record, in its cell, of what happened in that company, read by the seller. Append-only, never holds buyer data (ADR-010 SPEC 8) |
| **Platform security log** | Control's record of sign-in and security events, with no buyer data and no email address (ADR-010 SPEC 8) |
| **Field tags** | The `pii`, `secret` and `retention` tags a module puts on its columns, which drive encryption, the logger's drop, anonymisation, erasure, export and the AI mask (ADR-001 SPEC 5, ADR-009 SPEC 4) |
| **Recipient fields** | A buyer's name, delivery address and phone. Taken from marketplaces only once Vervoro prints labels; at launch held only for manual orders (ADR-009 SPEC 4) |
| **Anonymisation** | Clearing every `pii` field of an order 30 days after delivery, dispatch as the fallback, or at once on a buyer's erasure. An anonymised order never stores personal data again (ADR-009 SPEC 8) |
| **Archive** | *Later.* Compressed files in object storage, one per table per company per month, for months older than 24 months; a **checkpoint** keeps the stock proof when a ledger month leaves (ADR-002) |

### Words that look alike

| Words | Not the same |
| --- | --- |
| **Owner, owner role, Vervoro's owner** | A seller's top role (ADR-010); the database role that migrates (ADR-001); the person who owns Vervoro and rules on its records |
| **Hold, held, held raise** | A reason pausing an order (ADR-007); stock that is not sellable (ADR-006); a raise Stock sync keeps back (ADR-008) |
| **Short, short-dated** | A line missing stock (ADR-006 SPEC 5); a batch too close to its date to sell (ADR-006 SPEC 4) |
| **Paused** | An account mode (ADR-004); a membership waiting for an Owner or Admin to confirm it (ADR-010) |
| **Restricted** | A company state (ADR-012); Amazon's restricted role for buyer data, *Later*, with shipping labels (ADR-004.2) |
| **Audit, `audit_log`** | The production check of every database and Worker (ADR-001 SPEC 11); the company's own activity record (ADR-010) |
| **Variant** | *Later:* an alternative provider of a port for a named company (ADR-000); a Shopify product option, which is a listing (ADR-004.3) |
| **Lock, lockout** | The company's stock lock (ADR-006); a sign-in method locked after failures (ADR-013) |
| **Erasure** | A buyer's erasure anonymises that buyer's orders at once (ADR-009); erasing a company deletes all its data and destroys its key (ADR-001, ADR-012) |
