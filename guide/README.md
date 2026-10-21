# Architecture map and glossary

How the records fit together, what their shared words mean, and how far each one has got. When this page and a record disagree, the record wins.

## Map

```text
ADR-000  System architecture: modules, the foundation, outbox, egress gate, simulators
│
├── Data and isolation
│   ├── ADR-001  Multi-tenant database: control database, cells, forced RLS, routing
│   ├── ADR-002  Data retention and archiving
│   └── ADR-009  Buyer data and privacy
│
├── People and access
│   ├── ADR-010  Users, roles and access
│   └── ADR-013  Sign-in: the sign-in Worker running Better Auth, passkeys, sessions, recovery
│
├── Products and stock
│   ├── ADR-003  Product model: SKU, packs, bundles, VAT class, charge lines
│   ├── ADR-006  Stock ledger and reservations: the Inventory module
│   └── ADR-014  Fulfilment: picking, packing, shipments, returns
│
├── Marketplaces
│   ├── ADR-004  Channel connectors: the contract, the host, shadow mode
│   │   ├── ADR-004.1  eBay
│   │   ├── ADR-004.2  Amazon Seller
│   │   ├── ADR-004.3  Shopify (Later)
│   │   └── ADR-004.4  Amazon Vendor (planned)
│   ├── ADR-005  Catalogue sync and linking
│   ├── ADR-007  Order ingestion: the Orders module
│   └── ADR-008  Inventory sync: the Stock sync module
│
└── Money
    ├── ADR-011  Invoicing and VAT (the seller's own invoices)
    └── ADR-012  Billing and plans (Vervoro charging the seller)
```

The order to build them in is on the [index](../).

## How the records are organised

Each record is split into up to three documents, so that a person can review the decision in a few minutes:

| Document | For | Holds |
| --- | --- | --- |
| **ADR** | The owner and the developer, to approve | Context, at most 10 decisions in plain words, consequences, alternatives rejected, open items. About 900 words; no SQL or worked examples |
| **SPEC** | The developer and coding agents, to build from | Numbered rule sets, tables and state lists, platform constraints with sources, the tests that prove each rule, and a checklist for reviewing the code |
| **RUNBOOK** | The operator, to carry out | One page per procedure under [runbooks](../runbooks/): who runs it, with which role, numbered steps, how to verify, what to do if it stops halfway |

The ADR decides, the SPEC says exactly how, and a runbook carries it out. When they disagree, the ADR wins. Every record is in this form. The rules every change must keep are in the [engineering rulebook](../rulebook/).

## Status of a record

| Status | Meaning |
| --- | --- |
| **Proposed** | Written and reviewed by the owner, still open to change. Code may follow it, but it is not yet a binding constraint |
| **Accepted** | The developer has reviewed it and the owner has signed it off. Implementation must follow it |
| **Implemented** | Built, with the tests that prove its rules passing |
| **Superseded** | Replaced by a named later record, which is linked from it |
| **Deprecated** | No longer applies, and nothing replaces it |

**Accepted** (21 October 2026): [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-010](../users-and-access/) and [ADR-013](../sign-in/); ADR-013 may be amended by Amazon's answer on passkeys. Every other record is **Proposed**.

A record becomes Accepted only after the developer's review and the owner's sign-off, as the build reaches it: [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-010](../users-and-access/) and [ADR-013](../sign-in/) before the foundation is built; [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/) and [ADR-008](../inventory-sync/) before their phases begin; each other record before the work that follows it.

## Glossary

One word per concept. Where two words appear in the records, the table says whether they mean the same thing.

### Companies, people and databases

| Term | Meaning |
| --- | --- |
| **Company** | One customer of Vervoro: a seller's business. "Tenant" in ADR-001 means the same thing; the **tenant row** is a cell's own record of a company and its state there. Vervoro has no separate "organisation" |
| **Login** | One person's way in: a Better Auth user, with their email address, sign-in methods and sessions, in the control database's auth schema. Its id is the login id every other record uses (ADR-013) |
| **Authentication** | Proving who a person is: sign-in methods, sessions, recovery steps. Done by Better Auth inside the sign-in Worker (ADR-013) |
| **Authorization** | Deciding what a signed-in person may do in a company: memberships, roles, warehouse scope, permissions, operator grants. Done only by the Access module (ADR-010), never by Better Auth |
| **Better Auth** | The open-source authentication library the sign-in Worker runs. A dependency inside Vervoro, writing to Vervoro's own database: not a hosted identity provider, and not Vervoro's authorization (ADR-013) |
| **Sign-in Worker** | The only Worker besides the app. It runs Better Auth, serves the sign-in pages, alone holds the sign-in secret and touches the auth schema, and tells the app over a service binding whether a session is live and whose. The app never sees a typed password (ADR-013) |
| **Auth schema** | The `auth` schema in the control database, where Better Auth keeps its tables, beside `auth_policy`, Vervoro's own sign-in policy tables. Only the sign-in role can reach them (ADR-001, ADR-013) |
| **Access module** | The core module that answers "may this login do this here": it reads the membership and member row and applies the permission matrix (ADR-000, ADR-010) |
| **Session** | Better Auth's record that a login signed in, held in the browser as a cookie: at most 24 hours for everyone, never extended. The only session model (ADR-013) |
| **Passkey** | A key the person's phone, laptop or password manager keeps, unlocked by a fingerprint, a face or the device's PIN. The default way to sign in (ADR-013) |
| **Recovery** | Getting a person back in after they lose a method: Better Auth's steps (reset, backup code, new methods) under Vervoro's rules on who may start it and which company it reopens (ADR-013) |
| **Membership** | A login's place in one company, with one role and an optional warehouse scope. One person can be a member of several companies |
| **Role** | One of six: Owner, Admin, Manager, Warehouse, Accountant, Staff (ADR-010) |
| **Operator** | A person running the Vervoro platform, not a member of any company. Acts on a company only through an audited, time-limited grant |
| **Control database** | The one database that holds who the companies are and where they live: registry, routing, logins (Better Auth's tables in the auth schema), operators, shared quotas, the erasure register. No business data (ADR-001) |
| **Cell** | A database holding the business data of many companies in shared tables, each row carrying `company_id`, fenced by forced row-level security. There is no schema per company |
| **Dedicated database** | A cell holding one company, in its own Neon project, with the same schema and the same code path. Also called a dedicated cell |
| **Routing** | Finding a company's database: `company.database_id` in control, read by `forCompany(id)`. Every transaction then proves it is in the right database |
| **Adding a company / adding a cell** | Two separate operations: `company:add` needs no database and no deploy; `cell:add` and `dedicated:add` add capacity and include a deploy (ADR-001) |

### Code and background work

| Term | Meaning |
| --- | --- |
| **Module** | A feature inside the main application deployable (the sign-in Worker, deployed separately, holds no module). It owns its tables and talks to others only through typed ports and events (ADR-000) |
| **Library** | A package of shared code with no tables, manifest, state or business rule, such as the kernel. Any module may import one (ADR-000) |
| **Foundation** | The always-on core: Products, Listings, Inventory, Orders, Buyer data and Access, each the only writer of its own data. Inventory alone changes stock (ADR-006); Orders alone changes order status. They share one transaction where they must (ADR-000) |
| **Always-on module** | A module outside the core that is never switched off, such as Fulfilment ([ADR-014](../fulfilment/)). It calls the foundation; the foundation never calls it (ADR-000) |
| **Switchable module** | A module a company's plan and settings turn on or off. It calls the foundation; the foundation never calls it (ADR-000) |
| **Outbox** | Notes written in the same transaction as a change, delivered after commit, each handled once |
| **Egress gate** | The one door to marketplaces and suppliers. Records every outbound effect with an idempotency key and sends it only after commit (ADR-000 SPEC 7) |
| **Sweeper** | One background worker per database. Finds due work through the `due` table. `due` and `buyer_ref` are the only tables read across companies, and only through two allow-listed functions that return ids and times (ADR-001) |

### Marketplaces

| Term | Meaning |
| --- | --- |
| **Connector** | Vervoro's code for one marketplace. It only translates; the host owns credentials, HTTP, limits and checks (ADR-004) |
| **Account** | One seller's connection to one marketplace. "Connection" in ADR-012 means the same thing |
| **Account mode** | Shadow (reads happen, writes are only recorded), live, paused, decrease-only (a closed company, ADR-012) or disconnected |
| **Listing** | What a marketplace sells, keyed by the marketplace's own id, never by SKU (ADR-005) |
| **Link** | A versioned tie from a listing to a product, with units per sale. An order uses the link that was valid when the buyer bought |
| **Figure** | The number a listing should show, worked out by Stock sync after each stock change ("D" in ADR-008). The desired state |
| **Believed figure** | What the marketplace is believed to show ("B" in ADR-008). A number, or unknown |
| **Unknown** | An outbound write with no clear answer, a timeout included. It is settled before anything else is sent to that listing: read back by default, or, where the connector's record names the exception, the same absolute figure resent (ADR-004) |
| **Order watermark** | The point up to which a complete read of a marketplace's orders has been done. A raise waits for it |

### Products

| Term | Meaning |
| --- | --- |
| **Product** | One thing the warehouse counts, in whole base units. Simple, pack or bundle (ADR-003) |
| **Base unit** | What one unit of a product is called: a piece, a jar, or a metre or 100 g for goods sold by length or weight |
| **Pack** | A sealed multiple of one simple product, with its own stock. Opened or made by a repack |
| **Bundle** | Several products sold as one item, with no stock of its own; its sellable comes from its scarcest component |
| **Box size** | How many base units one case or pallet holds. Used on documents and scans; never stock |
| **Family** | Products that are one design in several sizes or colours, linked to one variation listing in one step |
| **Charge line** | Something charged that is not stock (a service fee, gift wrap): a name, an amount and a VAT class on an order or invoice. Never reserves or moves stock |
| **Not stock** | A mark on a marketplace listing that sells no stock (a warranty). It is never linked; its order lines are charge lines (ADR-005) |
| **Units setting** | A company's choice of metric or imperial for showing weights and sizes. Storage is always grams and millimetres |

### Stock

| Term | Meaning |
| --- | --- |
| **Ledger** | The append-only record of every stock change. Only a ledger insert changes a balance (ADR-006) |
| **Batch** | Stock of one product received together, with its lot, dates and cost |
| **Warehouse** | A site the seller ships from. An order is reserved and shipped from one warehouse |
| **Spot** | A place in a warehouse: a shelf, a bench, a dispatch area. Optional: each warehouse has a default spot |
| **On hand, reserved, held, sellable** | The four numbers per batch in a warehouse. Sellable = on hand − reserved − held, never below zero; only sellable reaches a listing. Incoming is shown beside them but is never stock |
