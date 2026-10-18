# ADR-010: Users, roles and sign-in

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026 |
| **Scope** | Who signs in to Vervoro and how: the people, one sign-in across several companies, sign-in methods and multi-factor, sessions on phones and laptops, account recovery, the seller's roles and what each may do, warehouse scope, invitations, sign-up and removal, operator access to a company's data, the audit trail, and API tokens |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-002: Data retention and archiving](../data-retention/), [ADR-004: Channel connectors](../channel-connectors/), [ADR-006: Stock ledger and reservations](../stock-ledger/), [ADR-007: Order ingestion](../order-ingestion/), [ADR-008: Inventory sync](../inventory-sync/), [ADR-009: Buyer data and privacy](../buyer-data/) |

## Context

Every screen, every command and every view of a buyer's address starts with two questions: who is this, and what may they do here? Earlier records already answer parts of it:

- **ADR-000:** each module declares named permissions that a role can be granted; the foundation holds users and roles; the client is a convenience and the server checks every request again.
- **ADR-001:** the control database holds the login directory, with each email stored only as a keyed hash, and the operator accounts and grants. A person's email address lives only in the company's own users table. Every transaction is fixed to one company, and the runtime role cannot bypass row-level security, operator code included.
- **ADR-002:** `audit_log` stays in the cell for at least a year and in the archive for 6 years.
- **ADR-006 and ADR-007:** who may do what with stock, and the order actions that need a manager: office holds, manual orders, reversals; and which holds anyone in the warehouse may clear.
- **ADR-009:** which roles see buyer data and when, every view logged, multi-factor sign-in for everyone, the password rules wherever passwords are used, the operator's time-limited grant, no standing access for anyone at Vervoro, and access removed within 24 hours.

This record ties those pieces into one design and makes them consistent. It is part of the skeleton every later module relies on: a module only names its actions, and this record decides who holds them.

The design has to meet these requirements:

- **Buyer data sets the bar.** Warehouse staff see buyers' addresses while they pack. Amazon's Data Protection Policy asks for multi-factor sign-in on every user account, one account per person, the password rules it lists, lockout after at most 10 failures, and access removed within 24 hours. Losing a marketplace's approval ends the product for every seller on it.
- **Phone first, on the worker's own phone.** Pickers and packers work on their own phones, often wearing gloves. Every person uses a phone of their own; a phone shared by the shift is not supported. Signing in must be quick, or people will share one account.
- **Small sellers, not IT departments.** A company has 1 to about 30 people. Nobody runs a directory or a device-management service, and nobody hands out hardware. Seasonal and agency staff start on a Monday and leave on a Friday. Accountants often work outside the company, for several sellers, on their own laptops.
- **One person, several companies.** An owner may run more than one company; an accountant or a consultant serves many.
- **One operator.** Every lockout that needs a person at Vervoro costs the operator time. Every operator action on a seller's data must be visible to the seller.

## Decision

1. **Three kinds of people sign in:** the seller's users, Vervoro's operators and Vervoro's developers. Buyers and suppliers never sign in. Background work is a system actor, never a person.
2. **One login per person, any number of companies.** The login, its sign-in methods and its sessions live in the control database. Each company's own users table holds the person's email address, name, role, warehouse scope and status in that company. That table decides what they may do there.
3. **Two ways to sign in, both multi-factor:** a password with a code from an authenticator app, or a passkey. A passkey verifies the person on their device (a fingerprint, a face or the device's PIN), so it counts as both factors on its own. Every person must have one of the two; anyone may have both.
4. **Passwords follow Amazon's rules,** as ADR-009 decided: at least 12 characters with mixed character types, none of the person's name, at least a day old before a change, changed at least once a year, and the last 10 not reused. They are also checked against a list of common and breached passwords.
5. **Nothing else signs anyone in:** no codes by text message or email, no email sign-in links, no Google or Microsoft sign-in at launch.
6. **One person, one phone, one account.** Every person signs in on their own device. There are no shared accounts and no shared warehouse phones.
7. **Sessions follow the shift.** A session lasts at most 12 hours, then the person signs in again. The app has no idle lock of its own; the phone's or laptop's own screen lock covers idle time. Account changes, exports with buyer data and connecting a marketplace need a full sign-in check within the last 5 minutes.
8. **Six fixed roles:** Owner, Admin, Manager, Warehouse, Accountant and Staff. One role per person per company, plus an optional warehouse scope. There are no custom roles at launch.
9. **Permissions are named actions.** Each module declares its actions, and one table grants them to roles. The server checks every request against the person's role, scope and status in that company, read in the same transaction as the work.
10. **Nobody changes their own access.** Owners manage everyone; Admins manage everyone below Admin. The last Owner cannot leave until there is another.
11. **People join only by invitation,** sent to their own email address. Sign-up creates a new trial company in a normal cell (ADR-001), with its creator as Owner.
12. **Removal takes effect on the person's next request.** It ends their sessions in that company and clears their email address there. Their name stays on the history they made.
13. **Recovery goes through the company first.** A person comes back with their other factor, their recovery codes, or a reset by someone above them. Only a company's last Owner, with nothing left, goes to Vervoro. That case follows a fixed procedure: proof of the company's marketplace account, then a 72-hour wait with notice to everyone.
14. **Operators have no standing access.** An operator looks inside a company only through a grant with a written reason and an end time. The seller is told at once and can end it. Buyer data stays masked unless an Owner or Admin switches it on for that grant. Repairs run as recorded commands, without reading the company's screens. An operator never signs in as a seller's user, and every request still runs as one company under row-level security.
15. **Two audit trails.** The company's `audit_log` records what happened in that company, for the seller to see. The platform security log records every sign-in and security event across the platform, with no buyer data and no email address.
16. **No API tokens for sellers at launch.** A later record may add integration access that is scoped, revocable and without buyer data.

## Architecture

<!-- DIAGRAM -->

A request carries a session cookie and names the company it is for. The Worker reads the session from the control database and checks that it is live. It then confirms that the login has a membership in that company and routes to the company's cell. There it opens the usual transaction, fixed to the company (ADR-001). The first read in that transaction is the person's row in the company's users table: role, warehouse scope and status. The action is allowed only if the role holds it, the scope covers it and the person is active. Revoking a session in control, or removing the person in the cell, therefore stops their very next request.

An operator's request takes the same path from a separate console. The control database holds the operator's grant instead of a membership. The transaction is fixed to the one company in the same way, under the same runtime role, and every request writes an entry in the company's `audit_log`.

## The people

| Who | Signs in to | Holds |
| --- | --- | --- |
| **Seller's users** | The app, on their own phone or laptop, as a member of one or more companies | One role per company: Owner, Admin, Manager, Warehouse, Accountant or Staff |
| **Operators** | The operator console, never the app | Platform work: databases, connectors, alerts, quotas, repairs, and grants to look inside a company. No standing access to any company |
| **Developers** | Source control and the build pipeline only | No access to production data (ADR-009). Deploys run from the pipeline under its own service identity |
| **Buyers, suppliers** | Nothing | Their data arrives through marketplaces and the seller |
| **System actors** | Nothing: they are not people | The sweeper, the queue consumer and the egress gate act for a company with a named system actor, recorded on every entry they write |

**One account per person.** Every login belongs to one person, identified by their own email address. Generic logins ("packing desk", "warehouse") do not exist, and nobody signs in on someone else's phone or account. The customer terms say so, and the audit log makes a shared account visible: one name packing at two benches at once.

## One login, several companies

- **The login** lives in the control database: a random id, the keyed hash of the normalised email (ADR-001), the password's hash, the authenticator app's secret (encrypted under a platform key), its passkeys' public keys, the hashes of its recovery codes, its sessions, and its memberships (login, company). It holds no name and no clear email address.
- **The member row** lives in each company's own users table, in that company's cell: the email address, the name, the role, the warehouse scope, the status (invited, active, removed), and when each changed. It is the authority for what the person may do in that company. Being in the company's cell, it moves, exports and is erased with the company.
- **Switching company** is a menu in the app. The session belongs to the login, not to one company. Every request names the company it is for, so two browser tabs can work in two companies. Switching asks for no new sign-in; account changes in the new company still ask for a fresh check.
- **Sending email to a person.** Control has only the hash. A notice to a person reads their address from any company where they are active. Recovery and invitation emails go to the address the person types, once its hash matches.
- **Changing email** changes the hash in control and the address in every company where the person is a member. It follows ADR-001's cross-database pattern: company side first, then control, repaired from the outbox. Both the old and the new address are told.

## Signing in

### Password and authenticator app

- **First the password, then the code.** The person enters their email address and password, then a 6-digit code from an authenticator app on their phone. The code changes every 30 seconds, and each code is accepted once.
- **The password rules** are Amazon's (above, and ADR-009). Vervoro also refuses a password found on a list of common or breached passwords, allows passwords up to 64 characters, and lets password managers fill and paste them. The password is stored only as a salted, slow hash, with a platform key held outside the database added to it.
- **The yearly change:** a password past 365 days must be changed at the next sign-in.
- **Setting up the app** happens at the first sign-in: the app scans a code shown on screen, and the person types one code back to prove it works. A worker who signs in on their own phone keeps the authenticator app on that same phone; the password is still something only they know.
- **Recovery codes** are shown once, when the second factor is set up: 10 single-use codes, to print or save. Setup does not finish until the person confirms they have saved them. Each is stored only as a hash.

### Passkeys

A passkey is a WebAuthn credential that the person's phone, laptop or password manager keeps. It works only on Vervoro's own site, which makes it resistant to phishing. Vervoro stores only its public key.

- **User verification is required:** the device checks a fingerprint, a face or its own PIN. With it, one gesture is two factors: the device that holds the key, and the person who unlocks it. A response without the user-verified flag is refused.
- **Synced passkeys are accepted.** A person who loses a phone keeps their passkey on the new one.
- **A laptop without a passkey** can use the person's phone through the browser's cross-device sign-in (a QR code and Bluetooth), or the password and app code.
- **Offered, not forced.** After a password sign-in on a phone that can hold a passkey, the app offers one. Warehouse staff gain the most: a fingerprint unlocks the app with gloves off, instead of typing a 12-character password.

### Everyone's security page

Each person sees their sign-in methods and recent sign-ins, and can remove a lost passkey. Adding or removing a method, changing the password, and using a recovery code are told to the person by email.

### What is not used

| Method | Why not |
| --- | --- |
| Codes by text message | Open to SIM swaps, cost money per message, and do not resist phishing |
| Codes or links by email | NIST does not allow email as a sign-in factor; email carries invitations, password resets and notices only |
| Google or Microsoft sign-in | Vervoro cannot confirm that the provider checked a second factor, so its own would still be needed |
| Shared warehouse phones | Not supported: one person, one phone, one account |
| Hardware security keys handed out by Vervoro or the seller | Hardware to buy, issue and replace; a person may still use one they own, as a passkey |

## Sessions

| | Seller's user | Operator console |
| --- | --- | --- |
| **Longest session** | 12 hours, then a full sign-in | 12 hours, then a full sign-in |
| **Account changes** | A full sign-in check (password and code, or a passkey) within the last 5 minutes | The same |
| **Ends at once on** | Sign-out, removal, a role change, a reset, a recovery, an incident | Sign-out, an incident |

- **The session is a server-side row** in the control database: a random id of at least 128 bits, the login, when it began and was last used, and its end time. The browser holds only the id, in a cookie marked `__Host-`, `Secure`, `HttpOnly` and `SameSite=Strict`. No session, role or buyer data is kept in the browser's storage (ADR-009).
- **Every request reads the session,** so revoking it takes effect on the next request. ADR-001's restore step ("revoke its sessions") and ADR-009's incident containment use the same revocation.
- **A role change applies to the next request,** because the role is read in the request's own transaction.
- **No idle lock in the app.** Idle time is covered by the device's own screen lock. Amazon's device rules (a 15-minute screen lock, managed devices) bind Vervoro's own laptops, which follow them; they are not rules for the seller's phones.
- **Account changes need a fresh check:** inviting, removing or changing anyone's role or scope; resetting anyone's sign-in; changing one's own sign-in methods; connecting, disconnecting, going live on or switching off a marketplace account; an export with buyer data; switching on buyer data for an operator grant; closing the company or changing an Owner. Picking, packing, printing and counting never ask.

## Account recovery

Every way back in is a fixed procedure. Nobody at Vervoro can be talked into an exception.

| Lost | How the person comes back |
| --- | --- |
| The password | A reset link to their email address, valid 1 hour, plus their app code or a passkey. All other sessions end |
| The authenticator app or the passkey's phone | The password plus one recovery code, or another passkey; then they set up a new second factor |
| Everything, below Admin | An Owner or Admin resets them after a fresh check of their own. A one-time code appears on the resetter's screen, to hand over in person or by phone, and a link goes to the person's email address. Both are needed, within 24 hours. An Owner resets an Admin the same way, and another Owner resets an Owner |
| Everything, as the company's last Owner | Vervoro's fixed procedure below |

**The last Owner.** Vervoro's operator runs the procedure, with no room for judgement:

1. A link to the Owner's email address, as held in the company's users table.
2. The Owner approves Vervoro again on one of the company's connected marketplace accounts. The marketplace must return the same seller account that the company already holds in the external directory (ADR-001).
3. A 72-hour wait. During it, every member of the company is told by email. If an Owner or Admin objects, Vervoro's owner decides.
4. The Owner sets up new sign-in methods; every old method and session of that login ends.

A company with no connected marketplace is a trial with little in it, and the person signs up again. Any other case is decided by Vervoro's owner on documents, never by the operator alone.

**After every recovery,** the person and the company's Owners and Admins are told by email, every session of that login ends, and the recovery is logged in both audit trails.

**Lockouts.** Ten wrong passwords, codes or recovery codes in a row lock password sign-in for 30 minutes and tell the person by email. A passkey still signs in during the lock. Failed sign-ins from one network address slow down with each failure, whichever logins they try, so one source cannot guess passwords across many accounts. A bot check protects sign-up and password reset.

## Roles

Six roles, fixed at launch. Each person has one role in each company.

| Role | For | In short |
| --- | --- | --- |
| **Owner** | Whoever owns the business | Everything, including the plan and billing, closing the company, and making or removing Owners |
| **Admin** | The office lead | Everything except the plan and billing, closing the company, and Owners and Admins. Manages people below Admin, connects marketplaces |
| **Manager** | The operations lead | All day-to-day work, and the approvals that need a manager (ADR-006, ADR-007): counts, adjustments, office holds, manual orders. Links listings, stops sends. No people, roles, connections or billing |
| **Warehouse** | Pickers, packers, goods-in | Floor work: receive, move, count, pick, pack, label, inspect returns, floor holds, counter sales. Sees a buyer's address only while packing and shipping its order (ADR-009). No costs, margins or exports |
| **Accountant** | A bookkeeper, in the company or outside it | Reads everything a report or an invoice needs, including costs and the audit log. Exports without buyer data. Changes nothing |
| **Staff** | Anyone who only needs to look things up | Reads products, stock and orders without buyer data and without costs. Changes nothing |

**Why fixed roles.** Six roles cover a company of 1 to 30 people. Every role is tested against every action, and support can say what a person can do from their role alone. Custom roles would need an editor, a test for every combination, and a review of every role against buyer data before a marketplace data review. Least privilege comes from the role together with warehouse scope and the order's state.

**Warehouse scope.** A Manager, Warehouse or Staff member can be limited to some warehouses. Outside them, stock, batches, movements, receiving, counts, returns, orders and shipments do not exist for that person. Reports cover only their warehouses. The shared catalogue and the connection settings are not scoped. Owners, Admins and Accountants are never scoped. Scope is enforced by the foundation's read and command ports, which take the person's scope with every call. Row-level security stays company-only (ADR-001).

**Buyer data follows ADR-009,** unchanged:

| Role | Sees name, address and phone | When |
| --- | --- | --- |
| Owner, Admin, Manager | Yes | Any order that still holds buyer data |
| Warehouse | Yes, in their warehouses only | From picking until shipped, plus label reprints for 24 hours, and while clearing an address hold (each view recorded) |
| Accountant | Only as printed on issued invoices | Never on orders |
| Staff | No | Never |

## Who may do what

The permission matrix. A module declares each action in its manifest (ADR-000), and this table grants it. Where an earlier record decided an action's roles, the matrix repeats that decision; the last column names the record.

| Action | Owner | Admin | Manager | Warehouse | Accountant | Staff | Decided in |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Company and people** | | | | | | | |
| Plan, billing, close the company | Yes | No | No | No | No | No | This record |
| Make, remove or transfer an Owner; manage Admins | Yes | No | No | No | No | No | This record |
| Invite, remove, change role or scope | Yes | Below Admin | No | No | No | No | This record |
| Reset a person's sign-in | Yes | Below Admin | No | No | No | No | This record |
| Switch on buyer data for an operator grant; end a grant | Yes | Yes | No | No | No | No | This record |
| Read the company's audit log | Yes | Yes | No | No | Yes | No | This record |
| Handle a buyer's privacy request | Yes | Yes | No | No | No | No | [ADR-009](../buyer-data/) |
| **Marketplaces and listings** | | | | | | | |
| Connect or disconnect an account; switch a connector on or off for the company | Yes | Yes | No | No | No | No | This record; [ADR-004](../channel-connectors/) |
| Go live on an account | Yes | Yes | No | No | No | No | This record |
| Stop sends on a live account (with its stop choice) | Yes | Yes | Yes | No | No | No | This record; [ADR-000](../system-architecture/) |
| Link and unlink listings; answer shared-stock listings | Yes | Yes | Yes | No | No | No | [ADR-005](../catalogue-sync/) |
| Change the low-stock policy settings | Yes | Yes | Yes | No | No | No | [ADR-008](../inventory-sync/) |
| **Products** | | | | | | | |
| Read products and stock | Yes | Yes | Yes | Yes | Yes | Yes | This record |
| Create, edit, import products | Yes | Yes | Yes | No | No | No | [ADR-003](../product-model/) |
| See costs, landed cost and margins | Yes | Yes | Yes | No | Yes | No | This record |
| **Stock** | | | | | | | |
| Receive, move between spots, repack between a pack and its singles, count | Yes | Yes | Yes | Yes | No | No | [ADR-006](../stock-ledger/) |
| Record a receipt without a purchase order (received quarantined, waits for a manager) | Yes | Yes | Yes | Yes | No | No | [ADR-006](../stock-ledger/) |
| Approve a count; confirm reserved units are gone (orders packed outside Vervoro) | Yes | Yes | Yes | No | No | No | [ADR-006](../stock-ledger/) |
| Adjust, write off (reason required) | Yes | Yes | Yes | No | No | No | [ADR-006](../stock-ledger/) |
| Accept or refuse a quarantined receipt (short-dated, or without a purchase order) | Yes | Yes | Yes | No | No | No | [ADR-006](../stock-ledger/) |
| Assemble a product from several others; send an expired best-before batch on a manual order | Yes | Yes | Yes | No | No | No | [ADR-006](../stock-ledger/) |
| Inspect a return: restock or keep as damaged; mark damaged or quarantined; "not found" at a pick | Yes | Yes | Yes | Yes | No | No | [ADR-006](../stock-ledger/) |
| Inspect a return: write off, or restock a use-by unit; restore damaged units | Yes | Yes | Yes | No | No | No | [ADR-006](../stock-ledger/) |
| Block or unblock a lot | Yes | Yes | Yes | No | No | No | [ADR-006](../stock-ledger/) |
| **Orders** | | | | | | | |
| Read orders (buyer data as in the table above) | Yes | Yes | Yes | Yes | Yes | Yes | [ADR-009](../buyer-data/) |
| Pick, pack (and take another eligible batch, recorded), print labels, confirm a shipment | Yes | Yes | Yes | Yes | No | No | [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/) |
| Place or clear a floor hold (address check, stock check, address changed after label, order changed, label to void) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../order-ingestion/) |
| Place or clear an office hold (fraud check, refunded, payment, customer request, a possible duplicate and the others ADR-007 lists); release an Amazon buyer's cancellation request to ship anyway | Yes | Yes | Yes | No | No | No | [ADR-007](../order-ingestion/) |
| Create, confirm, edit or cancel a manual order | Yes | Yes | Yes | No | No | No | [ADR-007](../order-ingestion/) |
| Make a counter sale (paid and collected at once) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../order-ingestion/) |
| Pin a batch for a line, resolve a line again, attach a line | Yes | Yes | Yes | No | No | No | [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/) |
| Reverse a shipment reported outside Vervoro | Yes | Yes | Yes | No | No | No | [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/) |
| **Invoicing** | | | | | | | |
| Issue an invoice; confirm a credit note | Yes | Yes | Yes | No | No | No | [ADR-011](../invoicing-and-vat/) |
| Issue on Vervoro's figure despite a VAT flag (reason required) | Yes | Yes | No | No | No | No | [ADR-011](../invoicing-and-vat/) |
| Read and download issued documents | Yes | Yes | While the order holds buyer data | No | Yes | No | [ADR-011](../invoicing-and-vat/), [ADR-009](../buyer-data/) |
| Change the invoicing settings (registered details, VAT registration, first number, eBay issuer) | Yes | Yes | No | No | No | No | [ADR-011](../invoicing-and-vat/) |
| Make the accounting export | Yes | Yes | Yes | No | Yes | No | [ADR-011](../invoicing-and-vat/) |
| **Reports and exports** | | | | | | | |
| Reports | Yes | Yes | Yes | No | Yes | No | This record |
| Export with buyer data | Yes | Yes | No | No | No | No | [ADR-009](../buyer-data/) |
| Export without buyer data | Yes | Yes | Yes | No | Yes | No | This record |

A later module (purchasing, invoicing, billing) adds its own rows when its record is written, using the same six roles.

**Rules that hold for every action:**

- **The server decides.** The client mounts only what the person may use (ADR-000), but every request is checked again on the server, in the transaction that does the work.
- **A grant needs every condition:** the module is available to the company, the role holds the action, the scope covers the warehouse, and the person is active.
- **The resolver says why.** Every "no" carries its reason ("needs a manager", "outside your warehouses"), so the screen can say it.
- **A test covers every cell of the matrix.** For each action and role, one test proves the server allows or refuses it, and a build check fails when a module declares an action this table does not grant.

**Who manages whom:**

- Owners manage everyone. Admins manage everyone below Admin: only an Owner can make, remove, reset or demote an Owner or an Admin.
- Nobody changes their own role or scope, or resets their own sign-in through someone else's powers.
- The last Owner cannot be removed or demoted, and cannot leave, until another person is Owner.
- Nobody is an Owner or Admin by default except the person who signs a company up.

## Invitations, sign-up and removal

**Sign-up.** A person enters their email address and passes a bot check. A link valid for 24 hours proves the address. They set a password and an authenticator app, or create a passkey, save their recovery codes, name their company, and become its Owner. The company starts as a trial in the newest open shared cell (ADR-001). Sign-up writes the company and the member row in that cell, with an outbox note, then the login and membership in control; a failed second write is repaired from the outbox. An address whose hash is already a login does not make a second login: the person signs in, and the new company becomes another membership.

**Invitations.** An Owner, or an Admin for roles below Admin, invites by the person's own email address, with a role and, where it applies, a warehouse scope.

- The link is single-use, valid for 7 days, and works only for the address it names. Accepting it proves the address.
- A new person sets up their sign-in on their own phone or laptop. A person who already has a login signs in, and the company is added to their memberships.
- An invitation can be withdrawn until it is accepted. Accepting, expiry and withdrawal are logged.

**Trials and paying.** A trial is a state, not a place (ADR-001): paying changes the plan and nothing moves, so nobody signs in again. If a company is ever moved to another cell, its member rows move with its slice, and logins, memberships and sessions stay in control. What each role may still do when a trial ends unpaid is ADR-012's. When the company is erased, its member rows go with it, and a login left with no membership is deleted 30 days later.

**Removing a person.** An Owner, or an Admin for roles below Admin, removes them, with a fresh check.

1. In the company's cell, the member row becomes removed, so their next request in that company is refused. Their email address is cleared. Their name stays, because the stock ledger, the audit log and every record they made name them.
2. Their sessions in that company end.
3. Their membership in control is removed, through the outbox if that write fails.
4. A login left with no membership is deleted after 30 days, with its sign-in methods; the platform security log keeps only its id.

All of this happens within minutes, well inside ADR-009's 24 hours.

## Operator access to a company

Operators run the platform, not the seller's business. ADR-009 already decided the core of this section: no standing access, a time-limited grant with a written reason, buyer fields masked unless needed, and every grant visible to the seller.

**Operator accounts** are in the control database (ADR-001), separate from any seller login. They sign in only to a separate operator console on its own address, with passkeys from Vervoro's own managed laptops, at least two per operator on two devices.

**Repairs need no grant.** The operator's repairs are recorded commands that run as system actors and show no company data to anyone: rebuilding a balance from the ledger after the nightly check (ADR-006), re-importing an order, and the lifecycle operations of ADR-001 (export, move, restore), run by its lifecycle tool. Each writes an entry in the company's `audit_log`, naming the operator and the reason. An erasure is never an operator command; it runs on the seller's privacy request (ADR-009).

**A grant is for looking.** When the operator needs to see a company's screens to help, or to read its old records in a restore branch at the seller's request (ADR-001's look-back), they open a grant:

- **for one company, with a written reason, for at most 8 hours** (ADR-009);
- **read-only:** the operator sees the screens as a viewer and changes nothing;
- **the seller is told at once:** every Owner and Admin gets a notice in the app and by email, with the reason and the end time, and any of them can end the grant at any time;
- **buyer data stays masked** unless an Owner or Admin switches it on for that grant, for example when they asked the operator to check an address.

**Never under any grant:** an operator never signs in as a seller's user, never acts in their name, and never changes a role, a person, a sign-in method, a connection or stock. Every entry says "Vervoro operator", with the grant.

**How a grant fits row-level security.**

1. Opening a grant writes its entry in the company's `audit_log` first, then the grant row in control. Access needs both. A failed second write is repaired from the outbox, as ADR-001 does for every write across databases.
2. Each operator request is checked against a live grant in control (company, scope, end time) and then opens the company's transaction in the usual way. The request guard (ADR-001) accepts the company only because a grant names it. The runtime role keeps `NOBYPASSRLS`, so the operator sees exactly one company, as a seller's user would.
3. The data layer sets the actor (operator, grant) for the transaction, the same way it sets the company. Every entry written in it carries the grant.
4. Buyer fields stay encrypted unless the grant allows them. The decrypting code refuses an operator actor whose grant does not name buyer data.
5. Every operator request writes one `audit_log` entry: the grant, the screen and the time. The data shown is not copied into it.

**The seller sees every grant and repair** in a "Vervoro access" view of their audit log: who, the reason, buyer data or not, the start and end, and every screen opened. Every grant also goes to the platform security log and alerts Vervoro's owner (ADR-009), and every grant is in the quarterly access review.

**The database's own roles** are not a way around grants. The owner role runs only in the migration job, and an emergency use records the reason first and alerts (ADR-001, ADR-009). The lifecycle role runs only in the operations job, has `NOBYPASSRLS`, and shows no data on any screen.

**Operator recovery.** Nobody resets their own operator access. The operator and Vervoro's owner, as the operator's deputy (ADR-009), each hold an operator account and reset each other. Each keeps recovery codes offline, in a separate place, and using one alerts.

## Audit

Two trails, each in one place.

| | Company `audit_log` | Platform security log |
| --- | --- | --- |
| **Where** | The company's cell, a tenant table (ADR-001) | The control database |
| **Records** | What happened in the company: invitations, role, scope and status changes, resets and recoveries, every view of buyer data (ADR-009), exports, connections connected, gone live, stopped or disconnected, operator grants with every request under them, operator repairs, privacy requests | Every sign-in attempt, with its result, across the platform; sign-in methods added and removed; password changes; recovery codes used; recoveries started, reviewed and completed; sessions revoked; lockouts; bot-check failures; operator sign-ins; grants opened and ended; use of the database owner role |
| **Each entry** | The time, the actor (person, operator with grant, or system actor), the action, what it named (ids), the result | The time, the login or operator id, the event, the network address and device kind, the result |
| **Never holds** | Buyer data (a view records which fields were shown, not their values) | Buyer data, email addresses, names, passwords or codes |
| **Who reads it** | Owner, Admin, Accountant | The operator; each person sees their own sign-ins on their security page |
| **Kept** | At least a year in the cell, then 6 years in the archive (ADR-002); erased with the company | 12 months (ADR-009) |
| **Protected** | Append-only: the runtime role cannot update, delete or truncate it (ADR-001) | Append-only in the same way |

**Watched, not only kept.** The alerts in ADR-009 read these trails: every operator grant, every use of the database owner role, a burst of failed sign-ins, a recovery of a last Owner, and a person viewing far more buyers than their packing explains. Alerts are reviewed as they come, and the rest of the security log every two weeks (ADR-009).

## API tokens

**No API tokens for sellers at launch.**

- A token is a standing credential that skips multi-factor sign-in. Every one would need scopes, an expiry, rotation, a response to leaks and support, and Amazon's policy asks that every service credential has a documented owner and access rules.
- A token that reaches buyer data would put addresses into systems that Vervoro cannot see or log, which ADR-009's "every view is logged" forbids.
- A seller's own needs at launch are met inside the app and by exports.

If a later record adds integration access, it starts from these rules: created only by an Owner, with a fresh check; named and scoped to actions; short-lived and revocable; shown once; listed with when it was last used; and never with buyer data.

## How this is proven

| Test or check | Where | Proves |
| --- | --- | --- |
| Permission matrix | CI | Every action is allowed or refused for each role exactly as the matrix says, on the server; a declared action missing from the matrix fails the build |
| Warehouse scope | CI | A scoped person never reads or changes stock, orders or reports outside their warehouses, through any port |
| Removal and revocation | CI | After removal, a role change or a revoked session, the very next request is refused |
| Password rules | CI | Each of Amazon's rules is enforced; a listed common password is refused; the yearly change is forced |
| Second factor | CI | A password alone never signs in; a code is accepted once; a passkey response without user verification, for another site, or with a replayed challenge is refused |
| Lockouts | CI | Ten failures lock password sign-in for 30 minutes; a passkey still signs in |
| Fresh check | CI | Each listed account change is refused without a full check in the last 5 minutes |
| Session length | CI | After 12 hours a full sign-in is needed |
| Who manages whom | CI | Nobody changes their own role; an Admin cannot invite, change, reset or remove an Owner or an Admin; the last Owner cannot leave |
| Operator grants | CI, real Postgres, runtime role | Without a live grant, an operator request reaches no company; with one, it reaches exactly that company, is read-only, writes an audit entry per request, and decrypts buyer fields only when the seller allowed it; ending the grant stops the next request |
| Recovery | CI | Each path in the recovery table needs every step it names, tells the people it names, and ends every old session |
| Audit content | CI | No audit or security entry holds a buyer field value, an email address, a password, a code or a session id |
| Real devices | Before launch, on the phones sellers use | Password and app-code sign-in, passkey sign-in and cross-device sign-in on a laptop work on current iPhones and low-cost Android phones |

## Constraints

Checked against the official sources on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| Amazon: multi-factor | Required for all user accounts | [Data Protection Policy, 1.4.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: passwords | Where passwords are used: 12 characters, no part of the user's name, mixed character types, at least 1 day and at most 365 days old, last 10 not reused | [Data Protection Policy, 1.4.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: accounts | A unique identifier per user; no generic, shared or default accounts; a documented process to request, approve, provision, review and revoke access | [Data Protection Policy, 1.2.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: lockout and reviews | Lockout after no more than 10 consecutive failures; authentication monitored; access reviewed quarterly | [Data Protection Policy, 1.2.2](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: removal | Access removed within 24 hours of termination or role change | [Data Protection Policy, 1.2.3](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: least privilege | Denied by default, granted on a need-to-know basis | [Data Protection Policy, 1.3](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: Vervoro's own devices | The solution provider's devices that access the data lock after at most 15 minutes idle; its personnel's personal or unmanaged devices are restricted unless managed. These are controls on Vervoro's own endpoints, not on the seller's | [Data Protection Policy, 1.1.2](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: logs | Access attempts logged, protected from tampering, kept at least 12 months | [Data Protection Policy, 2.6.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: second factors | Approved second factors include TOTP, hardware tokens and biometric authentication | [Key security control guidance](https://developer-docs.amazon/sp-api/docs/guidance-to-address-key-security-controls-in-sp-api-integration) |
| Amazon: approval names the seller | The redirect after a seller approves carries `selling_partner_id`, the selling partner who approved | [Website authorization workflow](https://developer-docs.amazon/sp-api/docs/website-authorization-workflow) |
| Shopify: approval names the shop | The redirect after a merchant approves carries `shop`, signed with `hmac` | [Authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) |
| Shopify: level 2 | Limit staff access to protected customer data; strong passwords for staff accounts; an access log | [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data) |
| NIST: passwords | A blocklist; at least 15 characters alone or 8 within multi-factor; allow 64 characters, password managers and paste; no composition rules and no forced periodic change | [SP 800-63B rev. 4, 3.1.1.2](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: phishing resistance | At least one phishing-resistant option at AAL2; WebAuthn qualifies; typed codes do not | [SP 800-63B rev. 4, 2.2.2 and 3.2.5](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: synced passkeys | Allowed at AAL2; verifiers inspect the user-verified flag and treat its absence as a single factor | [SP 800-63B rev. 4, appendix B](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: sessions | AAL2: an overall limit of at most 24 hours, and an idle limit of at most 1 hour advised; session cookies `Secure`, ideally `HttpOnly`, `__Host-` and `SameSite`; no session secrets in local storage | [SP 800-63B rev. 4, 2.2.5 and 5](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: email and recovery | Email is not a sign-in factor; AAL2 recovery needs two codes by different routes or a code plus an existing factor; saved recovery codes are allowed; every recovery is notified | [SP 800-63B rev. 4, 3.1.3.2 and 4.2](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| WebAuthn | A W3C Recommendation; credentials are scoped to the site; flags tell whether the user was verified and whether a credential can be synced | [Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/) |
| Passkeys | Discoverable WebAuthn credentials, synced or bound to one device; cross-device sign-in by a nearby phone | [passkeys.dev: terms](https://passkeys.dev/docs/reference/terms/) |

**Where Vervoro departs from a source, and why.** Amazon's password rules (mixed character types, a yearly change) are what NIST now advises against. Amazon's policy binds Vervoro and NIST's guidance does not, so passwords follow Amazon, and Vervoro adds NIST's blocklist, length and password-manager advice, which Amazon's rules allow. Passkeys need no password rule at all, which is why the app offers them. NIST also advises an idle limit of an hour; Vervoro leaves idle time to the device's own screen lock, because no rule that binds it asks for more and a lock inside the app would mean typing a password again after every break.

## Consequences

**What this gives us**

- Multi-factor for every person by construction, not by a setting a seller can forget, so every marketplace review sees one rule, and the password rules Amazon and Shopify ask for.
- A method every device can use (password and app code) and a faster, phishing-resistant one for the devices that can (passkeys).
- Every pick, pack and address view has one person's name on it, because every person is on their own device.
- Removal, role changes and incidents take effect on the next request, because the session and the role are read on every request.
- Every operator look at a seller's data has a reason, an end time and an entry the seller can read and end, and still sees only one company under row-level security.
- One login for a person in several companies, with each company holding its own member row, so moves, exports and erasure keep working by company.

**What it costs**

- Passwords bring resets, a yearly change, lockouts and phishing risk back; the authenticator app and the offer of passkeys reduce them.
- Every worker needs a phone of their own that runs the app and an authenticator app or a passkey.
- Typing a 12-character password on a phone with gloves is slow; it is needed once a shift, and not at all with a passkey.
- Every request reads its session in the control database, a small indexed read added to each request.
- Recovering a company's last Owner takes three days and needs a connected marketplace account.
- Fixed roles will not fit every company; some will want, for example, a packer who can hold an order.
- No API tokens: a seller who wants their own integration waits for a later record.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Passkeys only, no passwords | Phishing-resistant and free of password rules, but leaves out people whose devices cannot hold or reach a passkey, such as an accountant on a client's desktop |
| Password with a code by text message | SIM swaps, cost per message, not on Amazon's list of second factors |
| Password with a code by email | NIST does not allow email as a sign-in factor; whoever reads the inbox would hold both factors |
| Google or Microsoft sign-in | Vervoro cannot confirm the provider's second factor; a second factor of its own would still be needed |
| Shared warehouse phones | Not supported: one person, one phone, one account |
| Hardware security keys for every worker | Hardware to buy, issue and replace |
| A separate login per company | A person in three companies would hold three sets of credentials; accountants would share them |
| Custom roles, or extra permissions per person, at launch | An editor, a test per combination and a buyer-data review per role, for a need six roles meet |
| One active role at a time for a person who holds two ("hats") | A person has one role per company already; switching adds state and screens for a rare case |
| Warehouse scope in row-level security | A second policy on every table, and tables without a warehouse column; the foundation's ports already take the scope |
| Operators impersonating a seller's user | The seller's audit log would name the wrong person, and support would act with the seller's powers |
| Standing operator access | ADR-009 forbids it; the marketplaces ask for need-to-know access |
| The seller approves every grant before it opens | Slower help for the same protection: the seller is told at once, can end the grant, and decides on buyer data |
| An emergency grant that opens after a 30-minute wait | Repairs already run as recorded commands without a grant, so no grant is urgent enough to need a special kind |
| API tokens at launch | A standing credential without multi-factor, and a path for buyer data that Vervoro cannot log |

## What later records decide

- **Billing and plans ([ADR-012](../billing-and-plans/)):** decided there: what each role may do while a company is restricted or closed, and the billing rows of the table of who may do what.
- **Invoicing and VAT ([ADR-011](../invoicing-and-vat/)):** decided there: the roles that issue, correct and read invoices, as rows in this matrix.
- **Purchasing, returns and other modules:** their actions, as rows in this matrix.
- **Integration access:** whether sellers get tokens, outbound notices or connected apps, and on what terms.
- **Single sign-on for larger customers,** and custom roles, if enough sellers ask.
