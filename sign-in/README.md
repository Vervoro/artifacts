# ADR-013: Sign-in

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026, as part of ADR-010; made its own record, split into ADR, SPEC and RUNBOOK, 21 October 2026; Better Auth replaces the in-house engine, owner approval of 21 October 2026; owner rulings on sessions, email and the passkey fallback the same day |
| **Scope** | How a person proves who they are: the sign-in Worker and Better Auth inside it, sign-in methods, Vervoro's password policy, sessions, recovery, lockouts, secrets and the incident commands |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-009: Buyer data and privacy](../buyer-data/), [ADR-010: Users, roles and access](../users-and-access/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-013-sign-in) |

## Context

- **Amazon's Data Protection Policy binds every seller's login:** multi-factor sign-in on every account, its password rules wherever passwords are used, a lockout after at most 10 failures. Losing a marketplace's approval ends the product for every seller on it.
- **Phone first, gloves on.** Every worker signs in on their own phone ([ADR-010](../users-and-access/)). Signing in must be quick, or people share one account.
- **Small sellers and one operator.** Nobody runs a directory or hands out hardware; every lockout that needs Vervoro costs the operator time.
- **The owner's limits:** no recurring identity bill, no outside service as the system of record for Vervoro's users, data in the UK or EU, and operators sign in the same way as sellers.
- **Sign-in protocols are where home-made code fails.** A maintained library already does passkeys, codes, password storage and sessions.
- **A poisoned package can read its Worker's secrets,** so sign-in stays away from the app's packages.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **Vervoro runs sign-in; Better Auth is its engine.** Better Auth, an open-source authentication library, runs inside Vervoro's sign-in Worker and writes to Vervoro's own database; it is not a hosted identity provider. It does passkeys, passwords, codes, backup codes and sessions; Vervoro writes none of these. Only the features named here are on. It is exact-pinned, upgraded deliberately, never forked or patched.
2. **Sign-in runs in a Worker of its own.** Only it runs Better Auth, holds its secret, shows a password field and touches Better Auth's tables, in an `auth` schema in control under the sign-in role. The email address is stored there readable, as Better Auth needs. The app reaches sign-in only over a service binding, through a closed list of calls, and never sees a password, code, secret or those tables. Sign-in mail goes through Cloudflare's Email Service, from a binding of the sign-in Worker (owner ruling, 21 October 2026).
3. **Better Auth says who; ADR-010 says what.** This decision owns the split; what Access decides is [ADR-010 SPEC 5](../users-and-access/spec/#5-rules-for-every-action). The sign-in Worker hands the app one stable login id and the session's facts. Companies, memberships, roles, warehouse scope, permissions and operator grants are [ADR-010's](../users-and-access/), never Better Auth's organisation or access features.
4. **A passkey is the default:** a key the person's phone, laptop or password manager keeps, accepted only when unlocked by a fingerprint, face or PIN. Sign-up and every invitation set one up first. Operators use passkeys only. If Amazon does not accept a passkey as multi-factor, passkey sign-in also asks for the authenticator code (owner ruling, 21 October 2026).
5. **A password never signs in alone.** The fallback is a password plus a 6-digit authenticator code; a password login without a confirmed authenticator can only set one up. Backup codes replace a lost authenticator. Nothing else signs anyone in: no text or email codes, no email links, no Google or Microsoft sign-in, no "trust this device".
6. **Amazon's password rules are a small policy layer around Better Auth** (Data Protection Policy 1.4.1): 12 characters with upper and lower case, a number and a symbol, no part of the name, a day old before a change, changed yearly, the last 10 not reused. The history check uses Better Auth's own hashing; Vervoro adds none. Better Auth's breached-password check runs too.
7. **One sign-in a day, on one session model.** Better Auth's session is the only one: at most 24 hours for everyone, operators included, never extended (owner ruling, 21 October 2026). Account changes need a session started in the last 5 minutes. No idle lock in the app; the device's screen lock covers it.
8. **Recovery goes through the company first.** Better Auth provides the steps (reset, backup code, new methods); Vervoro decides who may start one, which company reopens, the last Owner's proof and 72-hour wait, the notices and the audit trail.
9. **Each guard has one owner.** Better Auth limits request rates, locks code entry after 10 failures and runs the bot check on password routes. Vervoro's policy locks password sign-in after 10 failures in a row; a passkey still works.
10. **One sign-in secret and four incident commands.** Better Auth's versioned secret is the only sign-in key; the in-house sign-in and email-hash keys are gone. Rehearsed before launch: sign everyone out, force a password change, freeze sign-in, rotate the secret. *Later: switching off one way in, and a login-history screen.*

## Architecture

<!-- DIAGRAM -->

**The sign-in Worker is a wall around Better Auth.** Its pages, under the app's address, set the session cookie. The app Worker hands the cookie over the service binding, gets a login id or nothing, then checks access as [ADR-010](../users-and-access/) decides. Dashed parts are *Later* ([SPEC 0](spec/#0-at-launch-and-later)).

## Consequences

**Gives**

- No in-house passkey, code, password-hashing or session code: a maintained implementation with many readers.
- Multi-factor for every person by construction.
- No outside identity service holds Vervoro's users; nothing is billed per user.
- A poisoned app package cannot reach the sign-in secret, a password or a stored credential.
- Authorization stays Vervoro's, untouched by Better Auth upgrades.

**Costs**

- Better Auth is security-critical: each upgrade, and its schema change, is reviewed and tested before it ships.
- The email address is stored readable in control, behind the sign-in role, not as a keyed hash.
- The policy hooks are still Vervoro's code: password rules and history, the second-factor rule, session limits, lockouts, recovery.
- A poisoned app can still act as a signed-in person for up to 24 hours, until everyone is signed out.
- Recovering a last Owner takes three days and needs a connected marketplace account.

## Alternatives rejected

- **Vervoro's own sign-in engine** (this record's previous decision): security-critical protocol code a maintained library already has.
- **A hosted identity provider:** an outside service would hold the users, and bill per user.
- **A self-hosted identity server:** a long-running server for one operator to patch.
- **Better Auth in the app Worker:** any package in the app could read its secret and tables.
- **Better Auth's organisation plugin for companies:** a second tenancy and role model beside ADR-010's.
- **A custom adapter to keep the email as a keyed hash:** fights the library and breaks its reset and verification mail.
- **Replacing Better Auth's password hashing:** a second hashing system to keep, for no external requirement.
- **"Trust this device" for 30 days:** a password would then sign in alone.
- **Passkeys only:** leaves out devices that cannot hold or reach a passkey, such as an accountant on a client's desktop.
- **Codes by text message:** SIM swaps, a cost per message, not on Amazon's list of second factors.
- **Email codes or links, Google or Microsoft sign-in:** email is not a factor, and another provider's second factor cannot be confirmed.
- **Managers resetting Warehouse staff:** widens who can take over a login.
- **A wait alone for the last Owner:** anyone who reaches the mailbox and waits would get in.

## Open items

These stay open until settled with authoritative evidence ([SPEC 14](spec/#14-checked-before-launch)):

- **Does a passkey with its fingerprint, face or PIN check meet Amazon's multi-factor rule for every user?** No Amazon text says yes or no; only Amazon can settle it ([SPEC 3](spec/#3-sign-in-methods)). If it says no, the fallback in decision 4 applies, and nothing else changes.
- **Cloudflare's Email Service is in beta,** with a starting daily quota that grows with reputation; confirm it is generally available, or the quota enough, before launch.
- **Conflicts with Better Auth** ([SPEC 1](spec/#1-better-auth-and-what-is-switched-on)): passkey sign-in does not itself require the fingerprint check; backup codes exist only with an authenticator app. A code accepted twice within its window is closed by a hook (owner, 21 October 2026).
- **Integration checks:** the pinned version on a deployed Worker through Hyperdrive; passkey site name and domains; the cookie across Vervoro's addresses; how sensitive fields are stored; secret rotation; schema migrations.
- **The last-Owner step proves control of the marketplace account, not ownership of the business;** the wait and the notices cover the rest.
- **An outside penetration test,** with a retest of any finding, before launch.
