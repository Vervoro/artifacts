# ADR-010 SPEC: Users, roles and access

| | |
| --- | --- |
| **Decision** | [ADR-010: Users, roles and access](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-010-users-roles-and-access) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-010 from. The record decides; this page says exactly how. Where this page and the ADR disagree, the ADR wins and this page is fixed. How a person signs in is [ADR-013](../../sign-in/spec/). The words used are defined in the [map and glossary](../../guide/).

## 0. At launch and later

Everything below is built at launch except these parts, which keep their rules here and are built only when their trigger arrives.

| Later part | Trigger | Rules |
| --- | --- | --- |
| An end date on a membership, removed by the sweeper | Agency or seasonal staff need it; until then an Owner or Admin removes them, inside ADR-009's 24 hours | [6](#6-invitations-sign-up-and-removal) |
| Integration access for sellers (tokens, outbound notices or connected apps) | A record of its own | [9](#9-integration-access) |
| Single sign-on and custom roles | Enough sellers ask; each needs a record | — |

## 1. The people

| Who | Signs in to | Holds |
| --- | --- | --- |
| **Seller's users** | The app, on their own phone or laptop, in one or more companies | One role per company |
| **Operators** | The operator console only, never the app ([ADR-013 SPEC 10](../../sign-in/spec/#10-operators)) | Platform work, and grants to look inside a company. No standing access |
| **Developers** | Source control and the build pipeline only | No production data ([ADR-009](../../buyer-data/spec/#7-who-can-see-it)). Deploys run under the pipeline's identity; the sign-in Worker has a deploy identity of its own |
| **System actors** | Nothing | The sweeper, the queue consumer and the egress gate act for a company under a named system actor, recorded on every entry they write |

Buyers and suppliers sign in to nothing. Every login belongs to one person, identified by their own email address; generic logins ("packing desk") do not exist. The customer terms forbid sharing, and the audit log makes it visible: one name packing at two benches at once.

## 2. Logins and member rows

1. **The login** is a Better Auth user in control's auth schema and belongs to [ADR-013](../../sign-in/spec/#2-the-login-and-its-data). Its id is the only thing this record takes from it: Better Auth establishes who the person is; memberships, roles, scope, permissions and grants are decided here. Nothing here reads Better Auth's tables.
2. **The membership** (login id, company) is in control, written by the app's runtime role. It is `paused` after a reset in another company until this company's Owner or Admin confirms it ([ADR-013 SPEC 6](../../sign-in/spec/), owner ruling, 22 October 2026). It holds the login id with no foreign key into the auth schema, so a Better Auth upgrade never touches it.
3. **The member row** is in the company's own users table, in its cell: email address, name, role, warehouse scope, status (`invited`, `active`, `removed`) and when each changed. It alone decides what the person may do in that company, and it is exported, restored and erased with the company.
4. **Switching company** is a menu that lists each of the login's companies by its name, read in that company's own transaction (owner ruling, 23 October 2026). The session belongs to the login, and every request names its company, so two tabs can work in two companies. Switching asks for no new sign-in; account changes still ask for a fresh check ([ADR-013 SPEC 5](../../sign-in/spec/#5-sessions)).
5. **Email to a person** from the app reads their address from any company where they are active. Sign-in mail (address proofs, resets, sign-in notices) is the sign-in Worker's, to the login's own address ([ADR-013 SPEC 8](../../sign-in/spec/#8-the-sign-in-worker)).
6. **A login's email address is not changed.** To use a new address, an Owner or Admin invites the person at it and removes the old membership; the old login's history keeps its name and id. Changing an address in place is revisited only if a real need arises (owner ruling, 23 October 2026).
7. **Correcting one's name:** each person can correct their own name on their profile. It changes in every company where they are a member, then the app asks the sign-in Worker to set the login's name, retried from the outbox. Past audit entries keep the name they were written with. Two corrections moments apart may end different; the next correction settles them. A name is 2 to 70 characters once trimmed: the sign-in Worker's sign-up page and `setName` refuse any other ([ADR-013 SPEC 8](../../sign-in/spec/#8-the-sign-in-worker)), and the app checks it before saving a correction (owner rulings, 22 October 2026).

## 3. Roles and warehouse scope

| Role | For | In short |
| --- | --- | --- |
| **Owner** | Whoever owns the business | Everything, including the plan and billing, closing the company, and making or removing Owners |
| **Admin** | The office lead | Everything except the plan and billing, closing the company, and Owners and Admins. Manages people below Admin, connects marketplaces |
| **Manager** | The operations lead | Day-to-day work and the approvals that need a manager ([ADR-006](../../stock-ledger/), [ADR-007](../../order-ingestion/)). No people, roles, connections or billing |
| **Warehouse** | Pickers, packers, goods-in | Floor work. Sees a buyer's address only while packing and shipping its order. No costs, margins or exports |
| **Accountant** | A bookkeeper, inside or outside | Reads what a report or an invoice needs, costs and the audit log included. Exports without buyer data. Changes nothing |
| **Staff** | Anyone who looks things up | Reads products, stock and orders, without buyer data or costs. Changes nothing |

**Warehouse scope:**

1. Only a Manager, Warehouse or Staff member can be scoped. Owners, Admins and Accountants never are.
2. Outside their warehouses, stock, batches, movements, receiving, counts, returns, orders and shipments do not exist for that person, and reports cover only their warehouses. The catalogue and the connection settings are not scoped.
3. The core modules' read and command ports take the person's scope with every call and enforce it. Row-level security stays company-only ([ADR-001](../../database-architecture/)).

**Buyer data** by role is [ADR-009's](../../buyer-data/spec/#7-who-can-see-it): the matrix below follows it.

## 4. Who may do what

A module declares each action in its manifest ([ADR-000 SPEC 1](../../system-architecture/spec/#1-modules-and-the-manifest)); this table grants it. Where another record decided an action's roles, the last column names it.

| Action | Owner | Admin | Manager | Warehouse | Accountant | Staff | Decided in |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Company and people** | | | | | | | |
| Plan, billing, close the company | Yes | No | No | No | No | No | ADR-010 |
| Make, remove or transfer an Owner; manage Admins | Yes | No | No | No | No | No | ADR-010 |
| Invite, remove, change role or scope | Yes | Below Admin | No | No | No | No | ADR-010 |
| Reset a person's sign-in | Yes | Below Admin | No | No | No | No | ADR-010 |
| Switch on buyer data for an operator grant; end a grant | Yes | Yes | No | No | No | No | ADR-010 |
| Read the company's audit log | Yes | Yes | No | No | Yes | No | ADR-010 |
| Handle a buyer's privacy request | Yes | Yes | No | No | No | No | [ADR-009](../../buyer-data/spec/#10-buyers-requests) |
| Change the company's name | Yes | Yes | No | No | No | No | ADR-010 (owner ruling, 23 October 2026) |
| Change the company's units (metric or imperial) | Yes | Yes | No | No | No | No | [ADR-003](../../product-model/spec/#15-units-of-measure) |
| Correct your own name | Yes | Yes | Yes | Yes | Yes | Yes | ADR-010 (owner ruling, 23 October 2026) |
| Leave the company yourself | Yes, unless the last Owner | Yes | Yes | Yes | Yes | Yes | ADR-010 (owner ruling, 22 October 2026) |
| Switch a module on or off | Yes | Yes | No | No | No | No | [ADR-000 SPEC 3](../../system-architecture/spec/#3-assembly-per-company) (owner ruling, 22 October 2026) |
| **Marketplaces and listings** | | | | | | | |
| Connect or disconnect an account; switch a connector on or off | Yes | Yes | No | No | No | No | ADR-010; [ADR-004](../../channel-connectors/) |
| Go live on an account | Yes | Yes | No | No | No | No | ADR-010 |
| Stop sends on a live account (with its stop choice) | Yes | Yes | Yes | No | No | No | ADR-010; [ADR-000](../../system-architecture/) |
| Link and unlink listings; mark a listing not stock; answer shared-stock listings | Yes | Yes | Yes | No | No | No | [ADR-005](../../catalogue-sync/) |
| Change the low-stock policy settings | Yes | Yes | Yes | No | No | No | [ADR-008](../../inventory-sync/) |
| **Products** | | | | | | | |
| Read products and stock | Yes | Yes | Yes | Yes | Yes | Yes | ADR-010 |
| Create, edit, import products | Yes | Yes | Yes | No | No | No | [ADR-003](../../product-model/spec/#13-creating-products) |
| See costs, landed cost and margins | Yes | Yes | Yes | No | Yes | No | ADR-010 |
| **Stock** | | | | | | | |
| Receive, move between spots, repack between a pack and its singles, count | Yes | Yes | Yes | Yes | No | No | [ADR-006](../../stock-ledger/) |
| Record a receipt without a purchase order (quarantined, waits for a manager) | Yes | Yes | Yes | Yes | No | No | [ADR-006](../../stock-ledger/) |
| Approve a count; confirm reserved units are gone (packed outside Vervoro) | Yes | Yes | Yes | No | No | No | [ADR-006](../../stock-ledger/) |
| Adjust, write off (reason required) | Yes | Yes | Yes | No | No | No | [ADR-006](../../stock-ledger/) |
| Accept or refuse a quarantined receipt | Yes | Yes | Yes | No | No | No | [ADR-006](../../stock-ledger/) |
| Assemble a product from others; send an expired best-before batch on a manual order | Yes | Yes | Yes | No | No | No | [ADR-006](../../stock-ledger/) |
| Inspect a return: restock or keep as damaged; mark damaged or quarantined; "not found" at a pick | Yes | Yes | Yes | Yes | No | No | [ADR-006](../../stock-ledger/) |
| Inspect a return: write off, or restock a use-by unit; restore damaged units | Yes | Yes | Yes | No | No | No | [ADR-006](../../stock-ledger/) |
| Block or unblock a lot | Yes | Yes | Yes | No | No | No | [ADR-006](../../stock-ledger/) |
| **Orders** | | | | | | | |
| Read orders (buyer data as ADR-009 decides) | Yes | Yes | Yes | Yes | Yes | Yes | [ADR-009](../../buyer-data/spec/#7-who-can-see-it) |
| Pick, pack (and take another eligible batch, recorded), print labels (*Later*, with shipping labels; owner ruling, 22 October 2026), confirm a shipment | Yes | Yes | Yes | Yes | No | No | [ADR-006](../../stock-ledger/), [ADR-007](../../order-ingestion/) |
| Place or clear a floor hold (including an address check on an order being picked or packed) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../../order-ingestion/spec/#11-holds) |
| Place or clear an office hold; release an Amazon buyer's cancellation request to ship anyway | Yes | Yes | Yes | No | No | No | [ADR-007](../../order-ingestion/spec/#11-holds) |
| Create, confirm, edit or cancel a phone or email order (a warehouse user confirms with a payment reference, or it is held for a manager; their copies of earlier orders carry no buyer details) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../../order-ingestion/spec/#18-manual-orders) |
| Confirm a manual order without payment (account terms), or release its payment hold | Yes | Yes | Yes | No | No | No | [ADR-007](../../order-ingestion/spec/#18-manual-orders) |
| Make a counter sale (paid and collected at once) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../../order-ingestion/spec/#18-manual-orders) |
| Attach an order line to a product (its listing stays unlinked) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../../order-ingestion/spec/#14-orders-for-unlinked-listings) |
| Pin a batch for a line, resolve a line again | Yes | Yes | Yes | No | No | No | [ADR-006](../../stock-ledger/), [ADR-007](../../order-ingestion/) |
| Reverse a shipment reported outside Vervoro | Yes | Yes | Yes | No | No | No | [ADR-006](../../stock-ledger/), [ADR-007](../../order-ingestion/spec/#17-shipped-outside-vervoro) |
| **Invoicing** | | | | | | | |
| Issue an invoice; confirm a credit note | Yes | Yes | Yes | No | No | No | [ADR-011](../../invoicing-and-vat/) |
| Issue on Vervoro's figure despite a VAT flag (reason required) | Yes | Yes | No | No | No | No | [ADR-011](../../invoicing-and-vat/) |
| Read and download issued documents | Yes | Yes | While the order holds buyer data | No | Yes | No | [ADR-011](../../invoicing-and-vat/) |
| Change the invoicing settings | Yes | Yes | No | No | No | No | [ADR-011](../../invoicing-and-vat/) |
| Make the accounting export | Yes | Yes | Yes | No | Yes | No | [ADR-011](../../invoicing-and-vat/) |
| **Billing** | | | | | | | |
| Choose, change or cancel the plan; the payment method and billing details; pay an open invoice | Yes | No | No | No | No | No | [ADR-012](../../billing-and-plans/spec/#19-who-may-manage-billing) |
| Set a connection's stop choice when it goes live; name the stock contact | Yes | Yes | No | No | No | No | [ADR-012](../../billing-and-plans/spec/#19-who-may-manage-billing) |
| Change a connection's stored stop choice | Yes | Yes | Yes | No | No | No | [ADR-012](../../billing-and-plans/spec/#19-who-may-manage-billing) |
| See the plan, the state, the order count and the next charge | Yes | Yes | No | No | No | No | [ADR-012](../../billing-and-plans/spec/#19-who-may-manage-billing) |
| Read and download Vervoro's invoices and credit notes | Yes | Yes | No | No | Yes | No | [ADR-012](../../billing-and-plans/spec/#19-who-may-manage-billing) |
| **Reports and exports** | | | | | | | |
| Reports | Yes | Yes | Yes | No | Yes | No | ADR-010 |
| Export with buyer data | Yes | Yes | No | No | No | No | [ADR-009](../../buyer-data/spec/#12-exports) |
| Export without buyer data | Yes | Yes | Yes | No | Yes | No | ADR-010 |

While a company is restricted or closed, [ADR-012 SPEC 8](../../billing-and-plans/spec/#8-what-runs-in-each-state) narrows this table. A later module adds its rows here when its record is written, in the same six roles.

## 5. Rules for every action

1. **The server decides.** The client mounts only what the person may use, but every request is checked again on the server, in the transaction that does the work. The member row is that transaction's first read.
2. **A grant needs every condition:** the module is on for the company, the role holds the action, the scope covers the warehouse, the person is `active`, and the membership in control is not `paused`.
3. **Every refusal carries its reason** ("needs a manager", "outside your warehouses"), so the screen can show it.
4. **A role or scope change applies to the next request,** because it is read in the request's own transaction.
5. **Account changes need a fresh check** ([ADR-013 SPEC 5](../../sign-in/spec/#5-sessions)): inviting, removing or changing anyone's role or scope; resetting anyone's sign-in; connecting, disconnecting, going live on or switching off a marketplace account; an export with buyer data; switching on buyer data for an operator grant; closing the company or changing an Owner; the billing steps [ADR-012 SPEC 19](../../billing-and-plans/spec/#19-who-may-manage-billing) names. Picking, packing, printing and counting never ask.

**Who manages whom:**

1. Owners manage everyone. Only an Owner makes, removes, resets or demotes an Owner or an Admin.
2. Nobody changes their own role or scope, or resets their own sign-in through someone else's powers.
3. The last Owner cannot be removed or demoted, and cannot leave, until another person is Owner.
4. Nobody is an Owner or Admin by default except the person who signs a company up.

## 6. Invitations, sign-up and removal

**Sign-up:**

1. The person enters their email address on the sign-in Worker's page and passes the bot check; a link valid for 24 hours proves the address.
2. The address proved, the sign-up form asks first for the company's name (1 to 100 characters once trimmed), then the person's name, the password and the authenticator app. The sign-in Worker creates the login, a Better Auth user, with a password, a confirmed authenticator and its backup codes, then offers a passkey ([ADR-013 SPEC 3](../../sign-in/spec/#3-sign-in-methods), owner rulings, 22 and 23 October 2026). It keeps the company's name with the new login until the app opens the company, at most 24 hours.
3. At the login's first full session, the app takes the company's name from the sign-in Worker, once, and opens the company. Its name lives in the company's cell (Access), never in control; an Owner or Admin changes it (owner ruling, 23 October 2026). One cell transaction in the newest open shared cell opens the company as a trial and writes its name, its member row (Owner) and an outbox note; then control gets the registry row and the membership ([ADR-001 SPEC 8](../../database-architecture/spec/#adding-a-company)). A failed control write is repaired from the outbox. Each sign-up opens one company: the name is taken once, and asking again answers the company it opened (owner ruling, 23 October 2026).
4. An address that is already a login makes no second login. A signed-in login opens another company from the company switcher, naming it from a full session; the Owner's member row takes the login's own name and address from the sign-in Worker's `loginFacts` call, as at sign-up; this includes a login left with no company after leaving or removal, until it is deleted (owner ruling, 23 October 2026).
5. **The sign-up route is a bootstrap route, not a company route** (owner ruling, 22 October 2026). Access owns `/api/access/sign-up-company`, mounted from Access's manifest in its own pre-company context: no company is entered and no company id is faked or bypassed. It accepts only a signed-in login, and does exactly step 3 through `app.open_tenant` (the company, its first Owner member row and the outbox note), then nothing else. The sign-in Worker never touches a cell.
6. A login whose sign-up company was never opened is deleted with its sign-up record after 24 hours. No company is refused or limited by its email domain (owner ruling, 23 October 2026).

**Invitations:**

1. An Owner, or an Admin for roles below Admin, invites by the person's own email address, with a role and, where it applies, a scope. The invitation email links Vervoro's privacy notice (owner ruling, 22 October 2026). Only the link's hash is kept, so each mail carries a new link and the newest works (owner ruling, 24 October 2026).
2. The link is single-use, valid for 7 days, and works only for the address it names. Accepting proves the address. A person who already has a login joins only if the sign-in Worker's `matchesAddress` call ([ADR-013 SPEC 8](../../sign-in/spec/#8-the-sign-in-worker)) answers yes for the invitation's address; otherwise acceptance is refused. Access still learns only the login id (owner ruling, 22 October 2026).
3. A new person sets up sign-in on their own device, from a one-time link the app gets from the sign-in Worker's `enrol` call, asked from the invitation's page once the app has found the invitation live; the invitation is used when the person, signed in, joins (owner ruling, 24 October 2026). A person with a login signs in, and the company joins their memberships. On joining, the member row takes the person's own name and address from the sign-in Worker's `loginFacts` call, as at sign-up. An invitation names only the person's address, a role and, where it applies, a scope: until they join, the member row has no name and the address stands in for it on the company's screens. If the sign-in Worker does not answer, joining is refused with "try again" and nothing is used up (owner rulings, 24 October 2026).
4. An invitation can be withdrawn until accepted. Acceptance, expiry and withdrawal are logged. An invitation used, withdrawn or expired is deleted 30 days later; the audit log keeps the event (owner ruling, 22 October 2026).

**Trials and paying.** Paying changes the plan and nothing moves, so nobody signs in again ([ADR-001](../../database-architecture/)). If a company moves cell, its member rows move with it; logins, memberships and sessions stay in control.

**Removing a person** (an Owner, or an Admin for roles below Admin, with a fresh check):

1. The member row becomes `removed` and its email address is cleared; the name stays, because the ledger, the audit log and every record they made name them.
2. Their next request in that company is refused, because the membership check fails; if they have no membership left, the sign-in Worker revokes every session of the login.
3. Their membership in control is removed, through the outbox if that write fails.
4. A login left with no membership, by removal or by the company's erasure, is deleted after 30 days with its sign-in methods, email address and sessions, by the sign-in Worker through Better Auth; the security log keeps only its id.

**Leaving a company:** any person can remove themselves, with a fresh check; it runs the same steps as a removal, and the company's Owners and Admins are told. The last Owner cannot leave until another person is Owner (owner ruling, 22 October 2026).

All of it happens within minutes, inside ADR-009's 24 hours.

## 7. Operator access to a company

**Repairs need no grant.** They are recorded commands that run as system actors and show no company data: rebuilding a balance from the ledger ([ADR-006](../../stock-ledger/)), re-importing an order, and [ADR-001's](../../database-architecture/spec/#10-company-lifecycle) export, move and restore by the lifecycle tool. Each writes an `audit_log` entry naming the operator and the reason. So do the operator's billing levers ([ADR-012 SPEC 19](../../billing-and-plans/spec/#19-who-may-manage-billing)) and switching a module on or off at an Owner's or Admin's request ([ADR-000 SPEC 3](../../system-architecture/spec/#3-assembly-per-company)), which also need no grant (owner ruling, 22 October 2026). Erasure is never an operator command; it runs on the seller's privacy request ([ADR-009](../../buyer-data/)) or 30 days after the company closes ([ADR-012 SPEC 16](../../billing-and-plans/spec/); owner ruling, 22 October 2026).

**A grant is for looking**, at a company's screens or, at the seller's request, at old records in a restore branch ([ADR-001's look-back](../../runbooks/restore-a-company-look-back/)):

1. One company, a written reason, at most 8 hours ([ADR-009](../../buyer-data/spec/#7-who-can-see-it)).
2. Read-only: the operator sees the screens as a viewer and changes nothing. They never sign in as, or act in the name of, a seller's user, and never change a role, a person, a sign-in method, a connection or stock.
3. Every Owner and Admin is told at once, in the app and by email, with the reason and the end time; any of them can end it.
4. Buyer fields stay encrypted unless an Owner or Admin switches them on for that grant. The decrypting code refuses an operator actor whose grant does not name buyer data.

**How a grant fits row-level security:**

1. Opening a grant writes its `audit_log` entry first, then the grant row in control; access needs both. A failed second write is repaired from the outbox.
2. Each operator request is checked against a live grant in control (company, end time), then opens the company's transaction as usual. The request guard accepts the company only because a grant names it ([ADR-001 SPEC 6](../../database-architecture/spec/#6-guard-rails)). The runtime role keeps `NOBYPASSRLS`.
3. The data layer sets the actor (operator, grant) for the transaction, as it sets the company; every entry written carries the grant.
4. Every operator request writes one `audit_log` entry: the grant, the screen and the time, never the data shown.

**The seller sees every grant and repair** in a "Vervoro access" view of their audit log: who, the reason, buyer data or not, start and end, every screen opened. Every grant also goes to the platform security log, alerts Vervoro's owner, and is in ADR-009's quarterly access review. The database's own roles are no way around a grant ([ADR-001 SPEC 3](../../database-architecture/spec/#3-roles)).

## 8. Audit

| | Company `audit_log` | Platform security log |
| --- | --- | --- |
| **Where** | The company's cell, a tenant table | Control |
| **Records** | Invitations; role, scope and status changes; resets and recoveries; every view of buyer data; exports; connections connected, gone live, stopped or disconnected; operator grants with every request under them; operator repairs; privacy requests; billing actions | Every sign-in attempt and its result; methods added or removed; password changes; backup codes used; recoveries; resets, paused and un-paused memberships, bursts of resets; sessions revoked; sign-in frozen; lockouts; bot-check failures; operator sign-ins; grants opened and ended; use of the database owner role |
| **Each entry** | Time, actor (person, operator with grant, or system actor), action, the ids it named, result | Time, login or operator id, event, network address and device kind, result |
| **Never holds** | Buyer data (a view records which fields were shown, not their values) | Buyer data, email addresses, names, passwords or codes |
| **Read by** | Owner, Admin, Accountant | The operator; each person sees their own sign-ins |
| **Kept** | At least a year in the cell, then 6 years in the archive ([ADR-002 SPEC 2](../../data-retention/spec/#2-the-retention-schedule)); erased with the company | 12 months ([ADR-009](../../buyer-data/spec/#14-security-controls)) |
| **Protected** | Append-only: the runtime role cannot update, delete or truncate it ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)) | The same |

ADR-009's alerts read these trails: every grant, every use of the owner role, a burst of failed sign-ins, a last-Owner recovery, and a person viewing far more buyers than their packing explains.

## 9. Integration access

*Later.* No API tokens at launch: a token skips multi-factor sign-in, Amazon asks a documented owner and access rules for every service credential, and a token reaching buyer data would put addresses where Vervoro cannot log them. A later record starts from these rules: created only by an Owner with a fresh check; named and scoped to actions; short-lived and revocable; shown once; listed with when it was last used; never with buyer data.

## 10. Platform constraints

Checked against the official sources on 18 October 2026. Re-check before launch.

| Constraint | Figure | Source |
| --- | --- | --- |
| Amazon: accounts | A unique identifier per user; no generic, shared or default accounts; a documented process to request, approve, provision, review and revoke access | [Data Protection Policy, 1.2.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: reviews | Access reviewed quarterly | [Data Protection Policy, 1.2.2](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: removal | Access removed within 24 hours of termination or role change | [Data Protection Policy, 1.2.3](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: least privilege | Denied by default, granted on a need-to-know basis | [Data Protection Policy, 1.3](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: logs | Access attempts logged, protected from tampering, kept at least 12 months | [Data Protection Policy, 2.6.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Shopify: level 2 | Staff access to protected customer data limited; an access log | [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data) |

## 11. Tests that prove each rule

Database tests run on real Postgres under the runtime role ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)).

| Test | Proves |
| --- | --- |
| Permission matrix | Each action is allowed or refused on the server for each role exactly as section 4 says; a declared action missing from the table fails the build |
| Warehouse scope | A scoped person never reads or changes stock, orders or reports outside their warehouses, through any port |
| Removal and revocation | After removal, a role change or a revoked session, the very next request is refused |
| Who manages whom | Nobody changes their own role; an Admin cannot invite, change, reset or remove an Owner or an Admin; the last Owner cannot leave |
| Fresh check | Each account change in section 5 is refused without a fresh check |
| Sign-up and invitation | Sign-up writes login, then cell, then control, and a failed control write is repaired; an invitation works once, for its address, within 7 days |
| Operator grants | Without a live grant an operator request reaches no company; with one it reaches exactly that company, read-only, writes an entry per request, and decrypts buyer fields only when allowed; ending the grant stops the next request |
| Audit content | No audit or security entry holds a buyer field value, an email address, a password, a code or a session id |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look and which test proves it.

- [ ] **Matrix:** every action a manifest declares is a row of section 4; the build check fails on a missing row; the matrix test has one case per action and role.
- [ ] **One check path:** every route goes through one resolver that reads the member row first in the work's transaction; no route checks a role by hand (search for role names outside the resolver).
- [ ] **Reasons:** every refusal returns a reason code the screen shows; none is a bare 403.
- [ ] **Scope:** every read and command port of the core modules takes the scope argument; the scope test covers each port; row-level security policies mention only the company.
- [ ] **Self-change:** the role-change, scope-change and reset commands refuse the actor's own login; the last-Owner guard runs in the same transaction as the change.
- [ ] **Fresh check:** each account-change command asks the sign-in Worker for the fresh check; none trusts a flag from the client.
- [ ] **Sign-up order:** the login is created by the sign-in Worker before the cell transaction; control writes go through the outbox repair path.
- [ ] **Hand-off:** the Access resolver takes only the login id from the sign-in Worker's answer; no code here reads or writes the auth schema or uses Better Auth's organisation or role features.
- [ ] **Removal:** removing clears the email address and removes the membership, and the next request there is refused; a login with no membership left loses every session; the revocation test is green.
- [ ] **Grants:** operator code reaches a company only through the request guard with a live grant; the actor (operator, grant) is set on the transaction; no operator route writes business data.
- [ ] **Buyer fields:** the decrypting code checks the grant's buyer-data flag for an operator actor.
- [ ] **Seller notice:** opening a grant notifies every Owner and Admin and writes the audit entry before the control row.
- [ ] **Audit:** `audit_log` and the security log are append-only for the runtime role (database catalogue); the audit-content test is green.
- [ ] **No tokens:** no route accepts a bearer token or an API key from a seller.
