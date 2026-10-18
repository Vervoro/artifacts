# ADR-010: Users, roles and sign-in

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026, revised 18 October 2026 |
| **Scope** | Who signs in to Vervoro and how: the people, one sign-in across several companies, sign-in methods and multi-factor, sessions on phones and laptops, account recovery, the seller's roles and what each may do, warehouse scope, invitations, sign-up and removal, operator access to a company's data, the audit trail, and API tokens |
| **Revision** | 18 October 2026, after a debate on how sign-in is built: Vervoro builds it itself, on the runtime's own primitives and one pinned library, with no identity provider and no auth framework; sign-in runs in a Worker of its own that alone holds the sign-in keys; a reset re-activates a person only in the company that reset them; recovery codes for every Owner, Admin and Accountant; a bot check before any password is hashed. See [How sign-in is built](#how-sign-in-is-built). Simplified the same day for launch scale: passkeys are the default at sign-up and a seller's session lasts 24 hours; three incident commands and the sign-in key's rotation are built, each rehearsed once; the email-hash key's rotation, per-method switches, canary logins and a timing measurement are deferred; the launch checks are a scrypt benchmark and a smoke test of the sign-in cryptography |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-002: Data retention and archiving](../data-retention/), [ADR-004: Channel connectors](../channel-connectors/), [ADR-006: Stock ledger and reservations](../stock-ledger/), [ADR-007: Order ingestion](../order-ingestion/), [ADR-008: Inventory sync](../inventory-sync/), [ADR-009: Buyer data and privacy](../buyer-data/) |

## Context

Every screen, every command and every view of a buyer's address starts with two questions: who is this, and what may they do here? Earlier records already answer parts of it:

- **ADR-000:** each module declares named permissions that a role can be granted; the foundation holds users and roles; the client is a convenience and the server checks every request again.
- **ADR-001:** the control database holds the login directory, with each email stored only as a keyed hash, and the operator accounts and grants. A person's email address lives only in the company's own users table. Every transaction is fixed to one company, and the runtime role cannot bypass row-level security, operator code included.
- **ADR-002:** `audit_log` stays in the cell for at least a year and in the archive for 6 years.
- **ADR-006 and ADR-007:** who may do what with stock, and the order actions that need a manager: office holds, business orders on account terms, reversals; and which holds, manual orders and line attachments anyone in the warehouse may handle.
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
3. **Two ways to sign in, both multi-factor:** a password with a code from an authenticator app, or a passkey. A passkey verifies the person on their device (a fingerprint, a face or the device's PIN), so it counts as both factors on its own. Every person must have one of the two; anyone may have both. **A passkey is the default:** sign-up and every invitation set one up first, and a password with an authenticator app is the fallback for a device that cannot hold or reach a passkey. Amazon's password rules, the yearly change included, apply only to logins that use a password.
4. **Passwords follow Amazon's rules,** as ADR-009 decided: at least 12 characters with mixed character types, none of the person's name, at least a day old before a change, changed at least once a year, and the last 10 not reused. They are also checked against a list of common and breached passwords.
5. **Nothing else signs anyone in:** no codes by text message or email, no email sign-in links, no Google or Microsoft sign-in at launch.
6. **One person, one phone, one account.** Every person signs in on their own device. There are no shared accounts and no shared warehouse phones.
7. **One sign-in a day.** A seller's session lasts at most 24 hours, then the person signs in again; with a passkey that is one fingerprint. An operator's session lasts at most 12 hours. The app has no idle lock of its own; the phone's or laptop's own screen lock covers idle time. Account changes, exports with buyer data and connecting a marketplace need a full sign-in check within the last 5 minutes.
8. **Six fixed roles:** Owner, Admin, Manager, Warehouse, Accountant and Staff. One role per person per company, plus an optional warehouse scope. There are no custom roles at launch.
9. **Permissions are named actions.** Each module declares its actions, and one table grants them to roles. The server checks every request against the person's role, scope and status in that company, read in the same transaction as the work.
10. **Nobody changes their own access.** Owners manage everyone; Admins manage everyone below Admin. The last Owner cannot leave until there is another.
11. **People join only by invitation,** sent to their own email address. Sign-up creates a new trial company in a normal cell (ADR-001), with its creator as Owner.
12. **Removal takes effect on the person's next request.** It ends their sessions in that company and clears their email address there. Their name stays on the history they made.
13. **Recovery goes through the company first.** A person comes back with their other factor, their recovery codes, or a reset by someone above them. A reset re-activates them only in the company that reset them. Only a company's last Owner, with nothing left, goes to Vervoro. That case follows a fixed procedure: proof of the company's marketplace account, then a 72-hour wait with notice to everyone.
14. **Operators have no standing access.** An operator looks inside a company only through a grant with a written reason and an end time. The seller is told at once and can end it. Buyer data stays masked unless an Owner or Admin switches it on for that grant. Repairs run as recorded commands, without reading the company's screens. An operator never signs in as a seller's user, and every request still runs as one company under row-level security.
15. **Two audit trails.** The company's `audit_log` records what happened in that company, for the seller to see. The platform security log records every sign-in and security event across the platform, with no buyer data and no email address.
16. **No API tokens for sellers at launch.** A later record may add integration access that is scoped, revocable and without buyer data.
17. **Vervoro builds sign-in itself.** Logins, memberships, sessions, lockouts and recovery are Vervoro's own design. The primitives come from the runtime (scrypt, HMAC, AES-GCM, secure random numbers) and from one exact-pinned library for passkeys. There is no identity provider, no auth framework and no identity server: no third party holds a person's email address, and nothing is billed per user.
18. **Sign-in runs in a Worker of its own.** It serves the sign-in pages, alone holds the sign-in keys and alone writes the login tables. The app reaches it only over a service binding and never sees a typed password, a password hash or an authenticator secret.

## Architecture

<!-- DIAGRAM -->

A person signs in on the sign-in Worker's own pages, which set the session cookie. Every other request carries that cookie and names the company it is for. The app Worker asks the sign-in Worker, over a service binding, whether the session is live, and gets back the login and the session's end. It then confirms that the login has a membership in that company and routes to the company's cell. There it opens the usual transaction, fixed to the company (ADR-001). The first read in that transaction is the person's row in the company's users table: role, warehouse scope and status. The action is allowed only if the role holds it, the scope covers it and the person is active. Revoking a session in control, or removing the person in the cell, therefore stops their very next request.

An operator's request takes the same path from a separate console. The control database holds the operator's grant instead of a membership. The transaction is fixed to the one company in the same way, under the same runtime role, and every request writes an entry in the company's `audit_log`.

## The people

| Who | Signs in to | Holds |
| --- | --- | --- |
| **Seller's users** | The app, on their own phone or laptop, as a member of one or more companies | One role per company: Owner, Admin, Manager, Warehouse, Accountant or Staff |
| **Operators** | The operator console, never the app | Platform work: databases, connectors, alerts, quotas, repairs, and grants to look inside a company. No standing access to any company |
| **Developers** | Source control and the build pipeline only | No access to production data (ADR-009). Deploys run from the pipeline under its own service identity; the sign-in Worker has a deploy identity of its own |
| **Buyers, suppliers** | Nothing | Their data arrives through marketplaces and the seller |
| **System actors** | Nothing: they are not people | The sweeper, the queue consumer and the egress gate act for a company with a named system actor, recorded on every entry they write |

**One account per person.** Every login belongs to one person, identified by their own email address. Generic logins ("packing desk", "warehouse") do not exist, and nobody signs in on someone else's phone or account. The customer terms say so, and the audit log makes a shared account visible: one name packing at two benches at once.

## One login, several companies

- **The login** lives in the control database: a random id, the keyed hash of the normalised email (ADR-001), the password's hash and the authenticator app's secret (each sealed under the sign-in key), its passkeys' public keys, the hashes of its recovery codes, its sessions, and its memberships (login, company). It holds no name and no clear email address. Only the sign-in Worker reads or writes the login, its methods and its recovery codes.
- **The member row** lives in each company's own users table, in that company's cell: the email address, the name, the role, the warehouse scope, the status (invited, active, removed), and when each changed. It is the authority for what the person may do in that company. Being in the company's cell, it moves, exports and is erased with the company.
- **Switching company** is a menu in the app. The session belongs to the login, not to one company. Every request names the company it is for, so two browser tabs can work in two companies. Switching asks for no new sign-in; account changes in the new company still ask for a fresh check.
- **Sending email to a person.** Control has only the hash. A notice to a person reads their address from any company where they are active. Recovery and invitation emails go to the address the person types, once its hash matches.
- **Changing email** changes the hash in control and the address in every company where the person is a member. It follows ADR-001's cross-database pattern: company side first, then control, repaired from the outbox. Both the old and the new address are told.

## Signing in

### Password and authenticator app

- **First the password, then the code.** The person enters their email address and password, then a 6-digit code from an authenticator app on their phone. The code changes every 30 seconds, and each code is accepted once.
- **The password rules** are Amazon's (above, and ADR-009). Vervoro also refuses a password found on a list of common or breached passwords, allows passwords up to 64 characters, and lets password managers fill and paste them. The password is stored only as a salted scrypt hash, sealed under a key held outside the database ([How sign-in is built](#how-sign-in-is-built)).
- **The yearly change:** a password past 365 days must be changed at the next sign-in.
- **Setting up the app** happens at the first sign-in: the app scans a code shown on screen, and the person types one code back to prove it works. A worker who signs in on their own phone keeps the authenticator app on that same phone; the password is still something only they know.
- **Recovery codes** are shown once, when the second factor is set up: 10 single-use codes, to print or save. Setup does not finish until the person confirms they have saved them. Each is stored only as a keyed hash. Everyone with an authenticator app gets them, and so does every Owner, Admin and Accountant, and anyone who is a member of more than one company, even if they use only passkeys. A person with one membership as a Manager, Warehouse or Staff who uses only passkeys gets none: a synced passkey survives a lost phone, and otherwise their company resets them.

### Passkeys

A passkey is a WebAuthn credential that the person's phone, laptop or password manager keeps. It works only on Vervoro's own site, which makes it resistant to phishing. Vervoro stores only its public key.

- **User verification is required:** the device checks a fingerprint, a face or its own PIN. With it, one gesture is two factors: the device that holds the key, and the person who unlocks it. A response without the user-verified flag is refused.
- **Synced passkeys are accepted.** A person who loses a phone keeps their passkey on the new one.
- **A laptop without a passkey** can use the person's phone through the browser's cross-device sign-in (a QR code and Bluetooth), or the password and app code.
- **The default, not forced.** Sign-up and every invitation start with creating a passkey; "use a password instead" is a smaller link below it, for a device that cannot hold or reach one. After a password sign-in on a phone that can hold a passkey, the app offers one. On a phone with a passkey, signing in needs no email address: the phone offers the person's passkey for Vervoro. Warehouse staff gain the most: a fingerprint unlocks the app with gloves off, instead of typing a 12-character password.

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
| **Longest session** | 24 hours, then a full sign-in | 12 hours, then a full sign-in |
| **Account changes** | A full sign-in check (password and code, or a passkey) within the last 5 minutes | The same |
| **Ends at once on** | Sign-out, removal, a role change, a reset, a recovery, an incident | Sign-out, an incident |

- **The session is a server-side row** in the control database: the hash of a random token of at least 128 bits, the login, when it began, its end time, and when its last full sign-in check happened. The token itself is never stored. The browser holds only the token, in a cookie marked `__Host-`, `Secure`, `HttpOnly` and `SameSite=Strict`. Nothing is written on each request. No session, role or buyer data is kept in the browser's storage (ADR-009).
- **Every request reads the session,** so revoking it takes effect on the next request. ADR-001's restore step ("revoke its sessions") and ADR-009's incident containment use the same revocation.
- **A role change applies to the next request,** because the role is read in the request's own transaction.
- **No idle lock in the app.** Idle time is covered by the device's own screen lock. Amazon's device rules (a 15-minute screen lock, managed devices) bind Vervoro's own laptops, which follow them; they are not rules for the seller's phones.
- **The end of a session.** Before a session runs out, the app asks for a full sign-in, which starts a new session; the old one is never extended. A seller's 24 hours are NIST's limit for this level of sign-in, so a person signs in once a day. With a passkey this happens in place. A password sign-in takes the person to the sign-in page and back to the same screen, and scans already on the open screen survive the round trip.
- **Account changes need a fresh check:** inviting, removing or changing anyone's role or scope; resetting anyone's sign-in; changing one's own sign-in methods; connecting, disconnecting, going live on or switching off a marketplace account; an export with buyer data; switching on buyer data for an operator grant; closing the company or changing an Owner. Picking, packing, printing and counting never ask. Only the sign-in Worker records a full sign-in check, and it checks the time again itself before it carries out any account change, so the app cannot claim one.

## Account recovery

Every way back in is a fixed procedure. Nobody at Vervoro can be talked into an exception.

| Lost | How the person comes back |
| --- | --- |
| The password | A reset link to their email address, valid 1 hour, plus their app code or a passkey. All other sessions end |
| The authenticator app or the passkey's phone | The password plus one recovery code, or another passkey; then they set up a new second factor |
| Everything, below Admin | An Owner or Admin resets them after a fresh check of their own. A one-time code appears on the resetter's screen, on a sign-in page, to hand over in person or by phone, and a link goes to the person's email address. Both are needed, within 24 hours. An Owner resets an Admin the same way, and another Owner resets an Owner. The reset re-activates the person only in the resetter's company (below) |
| Everything, as the company's last Owner | Vervoro's fixed procedure below |

**The last Owner.** Vervoro's operator runs the procedure, with no room for judgement:

1. A link to the Owner's email address, as held in the company's users table.
2. The Owner approves Vervoro again on one of the company's connected marketplace accounts. The marketplace must return the same seller account that the company already holds in the external directory (ADR-001). This proves control of the seller's marketplace account, not legal ownership of the business; the wait and the notices cover the rest. The approval is used only to read the seller id: its tokens are discarded at once and the live connection is not touched.
3. A 72-hour wait. During it, every member of the company is told by email. Any sign-in by that login cancels the recovery. If an Owner or Admin objects, Vervoro's owner decides.
4. The Owner sets up new sign-in methods; every old method and session of that login ends.

A company with no connected marketplace is a trial with little in it, and the person signs up again. Any other case is decided by Vervoro's owner on documents, never by the operator alone.

**A reset reaches one company.** A reset re-activates the person only in the company whose Owner or Admin reset them. Their other memberships are paused until they prove themselves there: with a recovery code they still hold, or when that company's own Owner or Admin confirms them, with a fresh check. Each paused company's Owners and Admins are told at once, and the person sees each paused company marked "waiting for an Owner or Admin". After a reset, unused recovery codes work only to un-pause a membership, and a new set is issued when the person next sets up a factor. This stops a free trial company from inviting someone, resetting them, and opening every company they belong to.

**After every recovery,** the person and the company's Owners and Admins are told by email, every session of that login ends, and the recovery is logged in both audit trails.

**Lockouts.** Ten wrong passwords, codes or recovery codes in a row lock password sign-in for 30 minutes and tell the person by email, with "ask your Owner or Admin" if it happens again. A passkey still signs in during the lock. A bot check runs before any password is hashed, on every password sign-in, sign-up and password reset; passkey sign-in has none. Requests from one network address are rate-limited at a limit generous enough for a warehouse of 30 phones on one connection, so one source cannot spray guesses across many accounts.

## How sign-in is built

Every method and procedure above could come from an identity provider, from an auth framework, or from Vervoro's own code. This section records which, and why. The owner set three limits for the choice: no recurring identity bill, no third party holding a person's email address (ADR-001's keyed-hash rule stays), and data in the UK or EU. Operators sign in the same way as sellers.

### Who builds what

| Piece | How | Why |
| --- | --- | --- |
| **Logins, memberships, sessions, lockouts, resets and recovery** | Vervoro's own code, in the sign-in Worker | They carry rules no provider or framework holds: the email only as a keyed hash, one login across many cells, a reset that reaches one company, Amazon's password rules and the last-Owner procedure. Every option would still need this code |
| **Password hashing** | The runtime's own scrypt, at N = 2^14, r = 8, p = 5 (16 MiB per hash), one of OWASP's equivalent minimum settings. Only a few hashes run at once in one Worker instance; the number is set from measurement | PBKDF2 is capped at 100,000 iterations on Workers, below OWASP's 600,000. Argon2 is not offered natively. scrypt's N = 2^17 setting needs 128 MiB, a Worker's whole memory |
| **Sealing** | The password hash, the authenticator secret and the recovery codes' key are sealed with AES-GCM under a versioned sign-in key, a secret of the sign-in Worker only | A copied database or backup holds nothing to crack. The key rotates by sealing again, with no forced password change; a pepper mixed into the hash could not change without resetting everyone |
| **Authenticator codes** | Vervoro's own, about 30 lines on the runtime's HMAC (RFC 6238: 30 seconds, one step either side), tested against the RFC's own vectors. A code is used up in one database statement, so it works once | Fully specified, small, and checked by official test vectors |
| **Passkeys** | SimpleWebAuthn, exact-pinned, behind Vervoro's own verify function: user verification required, no attestation | Parsing the authenticator's binary formats is where hand-written verifiers go wrong. It runs on Workers and is listed by passkeys.dev. It brings about 25 packages, mostly attestation code that stays switched off, so the whole tree is pinned and every change to it is reviewed |
| **Breached passwords** | Have I Been Pwned's range lookup, with padding, when a password is set or changed. Only the first 5 characters of the password's SHA-1 leave Vervoro. If the service is down, the password is accepted, the login is flagged, and the check runs at its next sign-in | Free, no key, and the password itself never leaves |
| **Bot check** | Turnstile, before any password is hashed | A spray of invented addresses would otherwise fill the hashing slots when the morning shift signs in |
| **Rate limit per network address** | The runtime's rate-limiting binding | Approximate by design; the lockout counts stay in the database |

**One form, one answer.** The password and the code are judged together, with one error for any failure, so someone trying leaked passwords never learns that one was right. An address with no login takes the same path against a stand-in record, with a full hash, so the answer and its timing do not reveal who has an account.

**No return address.** No sign-in page takes a web address to go back to. Return targets are names of the app's own screens, so a reset or sign-in link cannot send anyone elsewhere.

### The sign-in Worker

**Why it is separate.** Code from a poisoned package anywhere in a Worker runs inside it, and any module can read the Worker's secrets. If sign-in lived in the app, such code could read the sign-in keys and the login tables. Much of what would leak cannot be rotated away. Authenticator secrets keep making valid codes until each person sets up a new app, which at 1,000 sellers means tens of thousands of resets in person. Password hashes can be cracked and tried on the sellers' own marketplace accounts. Cell credentials and buyer-data keys, by contrast, rotate in minutes. Splitting sign-in out costs about two days before launch, and far more once sellers depend on it.

**What it is, and must stay:**

- **It serves only the sign-in pages:** signing in, signing up, setting and resetting a password, adding and removing sign-in methods, showing a reset code, and recovery. They are plain pages with the product's design tokens and none of the app's components. The app registers no service worker over them, so the app never renders a password field.
- **It answers the app over a service binding, through a fixed list of calls:** is this session live, revoke, reset, un-pause, and the incident commands below. Adding a page or a call needs a decision in this record.
- **It alone holds the email-hash key and the sign-in key, and alone writes the login tables** (logins, sign-in methods, recovery codes and sessions). It has its own role in the control database and its own connection to it. The app's role has no right on those tables; it reads and writes memberships, operator grants and everything else in control as before.
- **It carries out, but never decides.** The app decides who may reset whom, by the rules above. The sign-in Worker checks the actor's session and their fresh check itself before any account change, limits how fast resets can happen, and alerts on a burst. The one-time reset code appears only on its page, in the resetter's browser.
- **It never reaches a cell and never sends email.** It hands the app the event and, for a reset or a recovery, the link; the app sends the mail to the address in the company's users table. The names the "no part of your name" rule needs come with the call.
- **It is built and shipped on its own terms.** It has its own package list and frozen lockfile with the passkey library as its only dependency, installs with package scripts switched off, builds in its own CI job before anything of the app is installed, and deploys with a token that can deploy only it. Each Worker deploys on its own, only when its own code changes, so everyday app releases never touch the sign-in Worker. Its calls only ever add, never change, so an older app always works with a newer sign-in Worker: when both change, the sign-in Worker goes first, and a test of the calls runs whenever either side changes them.

**A risk accepted.** A poisoned app still receives the session cookie, so it could act as any person who is signed in, with that person's rights, until their session ends: 24 hours at most. It cannot add a sign-in method or reset anyone, because those need a fresh check that only the sign-in Worker records, and the reset code never reaches the app. Signing everyone out ends it.

### Keys

- **The email-hash key** (ADR-001) and **the sign-in key** are versioned secrets of the sign-in Worker only.
- **Rotating the sign-in key** seals every value again under the new version, in a resumable job, with no sign-in interrupted.
- **Rotating the email-hash key** reads each person's address from a company where they are a member and stores the new hash. A login whose address has been cleared from every company is waiting for deletion (within 30 days), so the old key version stays readable until the last such login is gone.
- **Only the sign-in key's rotation is built before launch,** and it is rehearsed once, because it is what a compromised sign-in Worker needs at once. The email-hash key's rotation is written down as the procedure above and built later: a leaked email-hash key lets someone test whether a known address has an account, and reveals no password, code or buyer data.

### In an incident

The operator has these commands at launch, each written to the platform security log. Each is built before launch and rehearsed once on a staging copy:

| Command | What it does |
| --- | --- |
| Sign everyone out | Ends every session of one company, or of the whole platform, in one statement |
| Force a password change | Every password login must set a new password at its next sign-in |
| Freeze sign-in | No new sessions anywhere; live sessions continue unless also ended |
| Rotate the sign-in key | Seals every value again under a new version, as above |

A login's history is read from the platform security log by a query, until a screen for it is worth building.

**A poisoned package** in the app: sign everyone out, rotate the app's own secrets and the cells' credentials, and follow ADR-009's incident steps. In the sign-in Worker: also rotate the sign-in key, rotate the email-hash key by its written procedure, force a password change, and ask every person who uses an authenticator app to set it up again. Passkeys stay, because Vervoro holds only their public keys.

**Leaving.** Everything stored is in standard forms: scrypt hashes, RFC 6238 secrets and WebAuthn public keys, unsealed with the sign-in key for export. Moving to another system later needs no password reset.

### Checked before launch

- **Benchmark the chosen scrypt setting on a deployed Worker:** p50 and p95 time and memory, for one hash and for two or three at once. The p95 must stay well under one second, as OWASP advises ([password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)), and within the Worker's memory. The results go into this record, and the number of hashes run at once is set from them.
- **Smoke-test the sign-in cryptography on the deployed runtime:** scrypt, HMAC with SHA-1 for authenticator codes, AES-GCM sealing and the passkey library each run once. Their correctness is proved in CI by the RFC's vectors and the test responses. If HMAC with SHA-1 fails, one audited hashing library is the fallback.
- An outside penetration test of sign-in, recovery, resets and return paths, with a retest of any finding agreed before launch.

## Roles

Six roles, fixed at launch. Each person has one role in each company.

| Role | For | In short |
| --- | --- | --- |
| **Owner** | Whoever owns the business | Everything, including the plan and billing, closing the company, and making or removing Owners |
| **Admin** | The office lead | Everything except the plan and billing, closing the company, and Owners and Admins. Manages people below Admin, connects marketplaces |
| **Manager** | The operations lead | All day-to-day work, and the approvals that need a manager (ADR-006, ADR-007): counts, adjustments, office holds, business orders on account terms. Links listings, stops sends. No people, roles, connections or billing |
| **Warehouse** | Pickers, packers, goods-in | Floor work: receive, move, count, pick, pack, label, inspect returns, floor holds, attach a line to a product, phone, email and counter orders. Sees a buyer's address only while packing and shipping its order (ADR-009). No costs, margins or exports |
| **Accountant** | A bookkeeper, in the company or outside it | Reads everything a report or an invoice needs, including costs and the audit log. Exports without buyer data. Changes nothing |
| **Staff** | Anyone who only needs to look things up | Reads products, stock and orders without buyer data and without costs. Changes nothing |

**Why fixed roles.** Six roles cover a company of 1 to 30 people. Every role is tested against every action, and support can say what a person can do from their role alone. Custom roles would need an editor, a test for every combination, and a review of every role against buyer data before a marketplace data review. Least privilege comes from the role together with warehouse scope and the order's state.

**Warehouse scope.** A Manager, Warehouse or Staff member can be limited to some warehouses. Outside them, stock, batches, movements, receiving, counts, returns, orders and shipments do not exist for that person. Reports cover only their warehouses. The shared catalogue and the connection settings are not scoped. Owners, Admins and Accountants are never scoped. Scope is enforced by the foundation's read and command ports, which take the person's scope with every call. Row-level security stays company-only (ADR-001).

**Buyer data follows ADR-009,** unchanged:

| Role | Sees name, address and phone | When |
| --- | --- | --- |
| Owner, Admin, Manager | Yes | Any order that still holds buyer data |
| Warehouse | Yes, in their warehouses only | From picking until shipped, plus label reprints for 24 hours |
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
| Place or clear a floor hold (stock check, address changed after label, order changed, label to void; an address check on an order being picked or packed) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../order-ingestion/) |
| Place or clear an office hold (an address check before picking, fraud check, refunded, payment, customer request, a possible duplicate and the others ADR-007 lists); release an Amazon buyer's cancellation request to ship anyway | Yes | Yes | Yes | No | No | No | [ADR-007](../order-ingestion/) |
| Create, confirm, edit or cancel a phone or email order (a warehouse user confirms with a payment reference, or it is held for a manager; their copies of earlier orders carry no buyer details) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../order-ingestion/) |
| Confirm a manual order without payment (account terms), or release its payment hold | Yes | Yes | Yes | No | No | No | [ADR-007](../order-ingestion/) |
| Make a counter sale (paid and collected at once) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../order-ingestion/) |
| Attach an order line to a product (its listing stays unlinked) | Yes | Yes | Yes | Yes | No | No | [ADR-007](../order-ingestion/) |
| Pin a batch for a line, resolve a line again | Yes | Yes | Yes | No | No | No | [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/) |
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

**Sign-up.** A person enters their email address and passes a bot check. A link valid for 24 hours proves the address. They create a passkey, or set a password and an authenticator app if their device cannot hold one, save their recovery codes, name their company, and become its Owner. The company starts as a trial in the newest open shared cell (ADR-001). Sign-up writes the company and the member row in that cell, with an outbox note, then the login and membership in control; a failed second write is repaired from the outbox. An address whose hash is already a login does not make a second login: the person signs in, and the new company becomes another membership.

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
| **Records** | What happened in the company: invitations, role, scope and status changes, resets and recoveries, every view of buyer data (ADR-009), exports, connections connected, gone live, stopped or disconnected, operator grants with every request under them, operator repairs, privacy requests | Every sign-in attempt, with its result, across the platform; sign-in methods added and removed; password changes; recovery codes used; recoveries started, reviewed and completed; resets, paused and un-paused memberships, and bursts of resets; sessions revoked; ways in switched off or frozen; lockouts; bot-check failures; operator sign-ins; grants opened and ended; use of the database owner role |
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
| Session length | CI | After 24 hours a seller needs a full sign-in, and an operator after 12 |
| Who manages whom | CI | Nobody changes their own role; an Admin cannot invite, change, reset or remove an Owner or an Admin; the last Owner cannot leave |
| Operator grants | CI, real Postgres, runtime role | Without a live grant, an operator request reaches no company; with one, it reaches exactly that company, is read-only, writes an audit entry per request, and decrypts buyer fields only when the seller allowed it; ending the grant stops the next request |
| Recovery | CI | Each path in the recovery table needs every step it names, tells the people it names, and ends every old session |
| Audit content | CI | No audit or security entry holds a buyer field value, an email address, a password, a code or a session id |
| Primitives | CI | Authenticator codes match RFC 6238's vectors; a used code is refused; a set of bad passkey responses (no user verification, another site, a replayed challenge, a wrong signature) is refused through Vervoro's verify function, and again after every change to the pinned library |
| Reset scope | CI | A reset re-activates the person only in the resetter's company; every other membership is paused until a recovery code or that company's Owner or Admin clears it |
| One answer | CI | A wrong password and a wrong code give the same error; an unknown address runs a full hash against a stand-in record |
| Return paths | CI | A table of hostile return targets always lands on the app's home screen |
| The sign-in Worker's walls | CI and nightly | The app's database role has no right on the login tables; the app's code and bundle hold neither sign-in key; the sign-in Worker's dependency tree matches its frozen list |
| Fresh check | CI | An account change from the app with a fresh check the sign-in Worker did not record is refused |
| End of a session | Before launch, on a slow low-cost Android phone | A half-packed order survives the sign-in when a session ends, with its scans on screen |
| Incident commands | Before launch, once | Each command in the incident table works on a staging copy |
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
| Passkey libraries | passkeys.dev points relying parties to maintained libraries and lists SimpleWebAuthn | [passkeys.dev: libraries](https://passkeys.dev/docs/tools-libraries/libraries/) |
| SimpleWebAuthn | MIT licence; names Cloudflare Workers among supported runtimes; user verification can be required | [SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn), [server docs](https://simplewebauthn.dev/docs/packages/server) |
| OWASP: password storage | scrypt minimums of equal strength include N = 2^17, r = 8, p = 1 (128 MiB) and N = 2^14, r = 8, p = 5 (16 MiB); PBKDF2-HMAC-SHA256 at 600,000 iterations; a pepper that leaks forces every password to be reset | [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| Workers: limits | 128 MB of memory per instance; on the paid plan 30 seconds of CPU per request by default, up to 5 minutes | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Workers: password primitives | Web Crypto PBKDF2 is capped at 100,000 iterations by default in the runtime's source; scrypt is offered through the Node crypto module, Argon2 is not; scrypt's default memory ceiling is 32 MiB | [Node crypto on Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/), [runtime limits source](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/limit-enforcer.h), [runtime scrypt source](https://github.com/cloudflare/workerd/blob/main/src/node/internal/crypto_scrypt.ts) |
| Workers: secrets | A module can import the Worker's environment, secrets included, from `cloudflare:workers` | [Bindings: importing env as a global](https://developers.cloudflare.com/workers/runtime-apis/bindings/) |
| Workers: service bindings | No added latency, both Workers on the same thread by default, no added cost; each call counts toward the subrequest limit | [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) |
| Workers: rate limiting | Counters are local to a Cloudflare location and eventually consistent, not an accurate count | [Rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) |
| Turnstile | A free plan exists | [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/) |
| Breached passwords | The range lookup takes the first 5 characters of a SHA-1, needs no key, and can pad its answers; the full list can be downloaded | [Pwned Passwords API](https://haveibeenpwned.com/API/v3), [Pwned Passwords](https://haveibeenpwned.com/Passwords) |
| Authenticator codes | 30-second steps, a small allowance for clock drift, a used code not accepted again; test vectors in the appendix | [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238), [RFC 4226](https://www.rfc-editor.org/rfc/rfc4226) |
| Package supply chain | A self-spreading compromise took over hundreds of npm packages through their maintainers' accounts | [CISA alert, 23 September 2025](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) |
| Hosted providers | Every hosted provider keeps the person's email address. Clerk offers no regional data residency. Auth0 exports password hashes only through a support request. Cognito's passkeys default to user verification "preferred" | [Clerk security](https://clerk.com/security.md), [Auth0 hash export](https://support.auth0.com/center/s/article/How-to-Use-the-Password-Hashes-Export-from-Auth0), [Cognito sign-in methods](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html) |
| Better Auth | Its user table requires a unique email address; its passkey plugin defaults to user verification "preferred"; its two-factor plugin trusts a device for 30 days | [Database](https://better-auth.com/docs/concepts/database), [Passkey](https://better-auth.com/docs/plugins/passkey), [Two-factor](https://better-auth.com/docs/plugins/2fa) |

**Where Vervoro departs from a source, and why.** Amazon's password rules (mixed character types, a yearly change) are what NIST now advises against. Amazon's policy binds Vervoro and NIST's guidance does not, so passwords follow Amazon, and Vervoro adds NIST's blocklist, length and password-manager advice, which Amazon's rules allow. Passkeys need no password rule at all, which is why they are the default. NIST also advises an idle limit of an hour; Vervoro leaves idle time to the device's own screen lock, because no rule that binds it asks for more and a lock inside the app would mean typing a password again after every break.

## Consequences

**What this gives us**

- Multi-factor for every person by construction, not by a setting a seller can forget, so every marketplace review sees one rule, and the password rules Amazon and Shopify ask for.
- A method every device can use (password and app code) and a faster, phishing-resistant one for the devices that can (passkeys).
- Every pick, pack and address view has one person's name on it, because every person is on their own device.
- Removal, role changes and incidents take effect on the next request, because the session and the role are read on every request.
- Every operator look at a seller's data has a reason, an end time and an entry the seller can read and end, and still sees only one company under row-level security.
- One login for a person in several companies, with each company holding its own member row, so moves, exports and erasure keep working by company.
- No third party holds a person's email address and nothing is billed per user; a poisoned package in the app cannot reach the sign-in keys, a typed password or a stored hash.

**What it costs**

- Passwords bring resets, a yearly change, lockouts and phishing risk back; the authenticator app and the offer of passkeys reduce them.
- Every worker needs a phone of their own that runs the app and an authenticator app or a passkey.
- Typing a 12-character password on a phone with gloves is slow; it is needed once a day, and not at all with a passkey, which is the default.
- Every request reads its session in the control database, a small indexed read added to each request.
- Recovering a company's last Owner takes three days and needs a connected marketplace account.
- Fixed roles will not fit every company; some will want, for example, a packer who can hold an order.
- No API tokens: a seller who wants their own integration waits for a later record.
- Vervoro owns its sign-in code and must keep it correct, with no outside team reading it; the outside penetration test and the tests above are its only second readers.
- A second Worker, a second database role and a second CI job, each held to a closed list.
- Every password sign-in costs a scrypt hash on the paid plan, and a bot check before it.

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

**How sign-in is built: options not taken**

| Option | Why not |
| --- | --- |
| A hosted identity provider (Auth0, Clerk, WorkOS, Stytch, Descope, Cognito, Supabase Auth) | Each keeps the person's email address, which the owner ruled out; most bill per active user; Clerk has no EU residency. Vervoro would still build one login across cells, the reset scope, Amazon's password rules and last-Owner recovery around it |
| A provider fed only the keyed hash, with relay addresses that Vervoro forwards | Removes the email objection, but leaves the bill, the residency questions and hash export by support request, and the same code around it |
| A self-hosted identity server (Keycloak, Ory, Zitadel) | A long-running server outside Workers, for one operator to run and patch |
| An auth framework running in Vervoro's Worker (Better Auth) | Requires a clear email in its user table; its organisations assume members in one database, while Vervoro's live in many cells; its defaults (user verification "preferred", trusted devices for 30 days) would need overriding; Vervoro would still own the same rules, plus the framework's upgrades within its fix deadlines |
| Every primitive in-house, passkeys included | The passkey verifier is the part most often got wrong. A small in-house verifier stays possible behind the same verify function, with the library as its test oracle |
| Sign-in as a module inside the app Worker | Any package in the app could read the sign-in keys and the login tables; leaked authenticator secrets and hashes cannot be rotated away |
| PBKDF2 | Capped at 100,000 iterations on Workers, below OWASP's 600,000 |
| Argon2 | Not offered natively on Workers; in JavaScript or WebAssembly it is slower or unproven there |
| A pepper mixed into the password hash | Cannot change without resetting every password; sealing under a versioned key gives the same protection and rotates |
| Hashing the password on the phone | The server must still check Amazon's password rules when it is set, and a stolen hash becomes the password |
| A copy of the breached-password list in Vervoro's storage | A large list to refresh, for a check that runs only when a password is set |
| A re-check against breached passwords at every sign-in | One more outside call per sign-in; the password was checked when set and is checked again at the yearly change |
| Re-enrolment approved remotely by number matching | An attacker can read the number to the approver over the phone; the reset needs a code in person or by phone plus an email link |
| Managers resetting Warehouse staff | Widens who can take over a login; Owners and Admins are enough at launch |
| Lockout counted per device | Keeps a stranger from locking a worker out, but adds a counter per device and stretches Amazon's "10 consecutive failures"; passkey sign-in already bypasses the lock |
| A delay alone for the last Owner, with no marketplace step | Anyone who reaches the Owner's mailbox and waits three days would get in |

## What later records decide

- **Billing and plans ([ADR-012](../billing-and-plans/)):** decided there: what each role may do while a company is restricted or closed, and the billing rows of the table of who may do what.
- **Invoicing and VAT ([ADR-011](../invoicing-and-vat/)):** decided there: the roles that issue, correct and read invoices, as rows in this matrix.
- **Purchasing, returns and other modules:** their actions, as rows in this matrix.
- **Integration access:** whether sellers get tokens, outbound notices or connected apps, and on what terms.
- **Single sign-on for larger customers,** and custom roles, if enough sellers ask.
- **Lockout counted per device,** if the security log shows the same login locked again and again (an accountant who signs in with a password is the likely case).
- **An end date on a membership** for agency and seasonal staff, removed by the sweeper; until then, removal by an Owner or Admin meets ADR-009's 24 hours.
- **A small in-house passkey verifier** in place of the library, if the pinned tree becomes a risk.
- **Deferred from launch, built when sellers or an incident show the need:** the email-hash key's rotation job (its procedure is written above); switching off one way in at a time; a screen for a login's history; a synthetic login in each cell's canary company that alerts on any attempt; a measured timing check that known and unknown addresses cannot be told apart (the stand-in hash is built at launch).
