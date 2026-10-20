# ADR-013: Sign-in

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026, as part of ADR-010; made its own record, split into ADR, SPEC and RUNBOOK, 21 October 2026 |
| **Scope** | How a person proves who they are: sign-in methods, sessions, recovery, lockouts, the sign-in Worker, its keys and its incident commands |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-009: Buyer data and privacy](../buyer-data/), [ADR-010: Users, roles and access](../users-and-access/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-013-sign-in) |

## Context

- **Amazon's Data Protection Policy binds every seller's login:** multi-factor sign-in on every account, its password rules wherever passwords are used, a lockout after at most 10 failures. Losing a marketplace's approval ends the product for every seller on it.
- **Phone first, gloves on.** Every worker signs in on their own phone ([ADR-010](../users-and-access/)). Signing in must be quick, or people share one account.
- **Small sellers and one operator.** Nobody runs a directory or hands out hardware, and every lockout that needs a person at Vervoro costs the operator time.
- **The owner's limits:** no recurring identity bill, no third party holding a person's email address (only a keyed hash is kept, [ADR-001](../database-architecture/)), data in the UK or EU, and operators sign in the same way as sellers.
- **A poisoned package can read its Worker's secrets.** Leaked authenticator secrets and password hashes cannot be rotated away: each person would have to set up again. Database credentials rotate in minutes.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **Vervoro builds sign-in itself.** Logins, sessions, lockouts and recovery are its own code, on the runtime's own cryptography and one exact-pinned passkey library. No identity provider (a hosted service that keeps the users and signs them in) and no auth framework: no third party holds an email address, and nothing is billed per user.
2. **Sign-in runs in a Worker of its own.** It serves the sign-in pages, alone holds the sign-in keys, and alone writes the login tables, through its own database role and its own Hyperdrive connection to control in the EU, caching off. The app reaches it only over a service binding (a direct call between Workers), through a closed list of calls, and never sees a typed password, a password hash or an authenticator secret.
3. **A passkey is the default.** A passkey is a key the person's phone, laptop or password manager keeps, unlocked by a fingerprint, a face or the device's PIN; with that check it counts as both factors. Sign-up and every invitation set one up first. A password with a 6-digit code from an authenticator app is the fallback for a device that cannot hold or reach a passkey. Operators use passkeys only.
4. **Passwords follow Amazon's rules, and only password logins carry them** (Data Protection Policy 1.4.1): at least 12 characters of mixed types, no part of the person's name, at least a day old before a change, changed at least once a year, the last 10 not reused. Vervoro adds a check against breached passwords.
5. **Nothing else signs anyone in:** no codes by text message or email, no email sign-in links, no Google or Microsoft sign-in. Email carries invitations, resets and notices only.
6. **One sign-in a day.** A seller's session lasts at most 24 hours and an operator's 12, then a full sign-in starts a new one; a session is never extended. The app has no idle lock; the device's screen lock covers idle time. Account changes need a full sign-in check within the last 5 minutes, which only the sign-in Worker records.
7. **Recovery goes through the company first:** the person's other factor, a recovery code, or a reset by an Owner or Admin. A reset re-activates the person only in the resetter's company; their other companies wait for their own confirmation. Only a company's last Owner, with nothing left, goes to Vervoro: proof of the company's marketplace account, then a 72-hour wait with notice to everyone.
8. **Ten failures in a row lock password sign-in for 30 minutes;** a passkey still signs in. A bot check runs before any password is hashed. Any failure gets the same answer, so nobody learns which part was wrong or whether an account exists.
9. **Two keys, held only by the sign-in Worker:** the email-hash key and the sign-in key, which seals stored password hashes, authenticator secrets and recovery codes. The sign-in key's rotation is built and rehearsed before launch. *Later: the email-hash key's rotation job, when an incident needs it; its procedure is written.*
10. **Four incident commands at launch,** each rehearsed once: sign everyone out, force a password change, freeze sign-in, rotate the sign-in key. *Later: switching off one way in at a time, and a screen for a login's history, when sellers or an incident show the need.*

## Architecture

<!-- DIAGRAM -->

**The sign-in Worker is a wall around the login tables.** A person signs in on its pages, which set the session cookie. Every other request goes to the app Worker, which asks the sign-in Worker over the service binding whether the session is live, then checks access as [ADR-010](../users-and-access/) decides. Dashed parts are *Later* ([SPEC 0](spec/#0-at-launch-and-later)).

## Consequences

**Gives**

- Multi-factor for every person by construction, not by a setting a seller can forget: one rule for every marketplace review.
- One fingerprint a day on the floor with a passkey; a password and app code on any device without one.
- No third party holds an email address, and nothing is billed per user.
- A poisoned package in the app cannot reach the sign-in keys, a typed password or a stored hash.
- Everything is stored in standard forms, so moving to another system later needs no password reset.

**Costs**

- Vervoro owns its sign-in code; an outside penetration test and the tests are its only second readers.
- Passwords bring back resets, the yearly change, lockouts and phishing; making passkeys the default reduces them.
- A second Worker, database role and CI job, each held to a closed list; every request reads its session in control.
- A poisoned app still receives session cookies and can act as a signed-in person for up to 24 hours, until everyone is signed out.
- Recovering a last Owner takes three days and needs a connected marketplace account.

## Alternatives rejected

- **Passkeys only:** leaves out devices that cannot hold or reach a passkey, such as an accountant on a client's desktop.
- **Codes by text message:** SIM swaps, a cost per message, and not on Amazon's list of second factors.
- **Codes or links by email:** email is not a sign-in factor (NIST); whoever reads the inbox would hold both.
- **Google or Microsoft sign-in:** Vervoro cannot confirm the provider's second factor.
- **Hardware keys handed out:** hardware to buy, issue and replace; a person may still use their own as a passkey.
- **A hosted identity provider:** keeps the email address and bills per user; Vervoro would still build the same rules around it.
- **A provider fed only the keyed hash:** still the bill, the residency question and hash export by support request.
- **A self-hosted identity server:** a long-running server for one operator to patch.
- **An auth framework in the app:** needs a clear email, assumes members in one database, and has weaker defaults.
- **Sign-in inside the app Worker:** any package in the app could read the sign-in keys.
- **An in-house passkey verifier:** the part most often got wrong. *Later, if the pinned library becomes a risk.*
- **PBKDF2 or Argon2:** capped below the advised strength on Workers, or not offered there.
- **A pepper in the hash:** cannot change without resetting every password; sealing rotates.
- **Hashing on the phone:** the server must still check Amazon's rules, and a stolen hash becomes the password.
- **Re-enrolment approved by number matching:** an attacker can read the number to the approver over the phone.
- **Managers resetting Warehouse staff:** widens who can take over a login.
- **Lockout counted per device:** more state, and it stretches Amazon's "10 consecutive failures". *Later, if one login is locked again and again.*
- **A wait alone for the last Owner:** anyone who reaches the mailbox and waits would get in.

## Open items

- **Launch-blocking:** benchmark the scrypt setting on a deployed Worker; the number of hashes run at once is set from it ([SPEC 11](spec/#11-checked-before-launch)).
- **Unconfirmed:** HMAC with SHA-1 on a deployed Worker (the docs do not list it); the PBKDF2 cap comes from the runtime's source, not its docs.
- **Re-read from Seller Central:** Amazon's wording for "where passwords are used" and for the lockout's length.
- **The last-Owner step proves control of the marketplace account, not ownership of the business;** Shopify staff with app rights can approve too. The wait and the notices cover the rest.
- **An outside penetration test,** with a retest of any finding, is agreed before launch.
