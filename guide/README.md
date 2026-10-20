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
│   └── ADR-013  Sign-in: passkeys, sessions, recovery, the sign-in Worker
│
├── Products and stock
│   ├── ADR-003  Product model: SKU, packs, bundles, VAT class
│   └── ADR-006  Stock ledger and reservations
│
├── Marketplaces
│   ├── ADR-004  Channel connectors: the contract, the host, shadow mode
│   │   ├── ADR-004.1  eBay
│   │   ├── ADR-004.2  Amazon Seller
│   │   ├── ADR-004.3  Shopify
│   │   └── ADR-004.4  Amazon Vendor (planned)
│   ├── ADR-005  Catalogue sync and linking
│   ├── ADR-007  Order ingestion
│   └── ADR-008  Inventory sync
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

The ADR decides, the SPEC says exactly how, and a runbook carries it out. When they disagree, the ADR wins. [ADR-001](../database-architecture/) and [ADR-000](../system-architecture/) are in this form; the others follow one at a time. The rules every change must keep are in the [engineering rulebook](../rulebook/).

## Status of a record

| Status | Meaning |
| --- | --- |
| **Proposed** | Written and reviewed by the owner, still open to change. Code may follow it, but it is not yet a binding constraint |
| **Accepted** | The developer has reviewed it and the owner has signed it off. Implementation must follow it |
| **Implemented** | Built, with the tests that prove its rules passing |
| **Superseded** | Replaced by a named later record, which is linked from it |
| **Deprecated** | No longer applies, and nothing replaces it |

Every record is **Proposed** today. A record becomes Accepted only after the developer's review and the owner's sign-off.

## Glossary

One word per concept. Where two words appear in the records, the table says whether they mean the same thing.

### Companies, people and databases

| Term | Meaning |
| --- | --- |
| **Company** | One customer of Vervoro: a seller's business. "Tenant" in ADR-001 means the same thing; the **tenant row** is a cell's own record of a company and its state there. Vervoro has no separate "organisation" |
| **Login** | One person's way in: email, sign-in methods and sessions, held in the control database (ADR-013) |
| **Sign-in Worker** | The only Worker besides the app: it serves the sign-in pages, alone holds the sign-in keys and writes the login tables, and tells the app whether a session is live. The app never sees a typed password (ADR-013) |
| **Membership** | A login's place in one company, with one role and an optional warehouse scope. One person can be a member of several companies |
| **Role** | One of six: Owner, Admin, Manager, Warehouse, Accountant, Staff (ADR-010) |
| **Operator** | A person running the Vervoro platform, not a member of any company. Acts on a company only through an audited, time-limited grant |
| **Control database** | The one database that holds who the companies are and where they live: registry, routing, logins, operators, shared quotas, the erasure register. No business data (ADR-001) |
| **Cell** | A database holding the business data of many companies in shared tables, each row carrying `company_id`, fenced by forced row-level security. There is no schema per company |
| **Dedicated database** | A cell holding one company, in its own Neon project, with the same schema and the same code path. Also called a dedicated cell |
| **Routing** | Finding a company's database: `company.database_id` in control, read by `forCompany(id)`. Every transaction then proves it is in the right database |
| **Adding a company / adding a cell** | Two separate operations: `company:add` needs no database and no deploy; `cell:add` and `dedicated:add` add capacity and include a deploy (ADR-001) |

### Code and background work

| Term | Meaning |
| --- | --- |
| **Module** | A feature inside the one deployable. It owns its tables and talks to others only through typed ports and events (ADR-000) |
| **Library** | A package of shared code with no tables, manifest, state or business rule, such as the kernel. Any module may import one (ADR-000) |
| **Foundation** | The always-on core: Products, Listings, Inventory, Orders, Buyer data and Access, each the only writer of its own data. Inventory alone changes stock; Orders alone changes order status. They share one transaction where they must (ADR-000) |
| **Always-on module** | A module outside the core that is never switched off, such as Fulfilment. It calls the foundation; the foundation never calls it (ADR-000) |
| **Switchable module** | A module a company's plan and settings turn on or off. It calls the foundation; the foundation never calls it (ADR-000) |
| **Outbox** | Notes written in the same transaction as a change, delivered after commit, each handled once |
| **Egress gate** | The one door to marketplaces and suppliers. Records every outbound effect with an idempotency key and sends it only after commit |
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
| **Unknown** | An outbound write with no clear answer, a timeout included. It is read back before anything else is sent to that listing, never retried blind |
| **Order watermark** | The point up to which a complete read of a marketplace's orders has been done. A raise waits for it |

### Stock

| Term | Meaning |
| --- | --- |
| **Ledger** | The append-only record of every stock change. Only a ledger insert changes a balance (ADR-006) |
| **Batch** | Stock of one product received together, with its lot, dates and cost |
| **Warehouse** | A site the seller ships from. An order is reserved and shipped from one warehouse |
| **Spot** | A place in a warehouse: a shelf, a bench, a dispatch area. Optional: each warehouse has a default spot |
| **On hand, reserved, held, sellable** | The four numbers per batch in a warehouse. Sellable = on hand − reserved − held, never below zero; only sellable reaches a listing. Incoming is shown beside them but is never stock |
