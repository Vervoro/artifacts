# ADR-013 SPEC: Sign-in

| | |
| --- | --- |
| **Decision** | [ADR-013: Sign-in](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-013-sign-in) |
| **Date** | 21 October 2026; Better Auth replaces the in-house engine, owner approval of 21 October 2026; owner rulings on sessions, email and the passkey fallback the same day; amended by owner rulings: the sign-in mail provider chosen by configuration, sign-up with a password first, a forced change exempt from the 1-day minimum, an email-first sign-in page, its passkey offers worded to what a browser can tell, signing out other devices, the privacy notice link, the export and name calls, the freeze and the 365-day rule clarified, and an unknown passkey signalled to the device, 22 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-013 from. The record decides; this page says exactly how. Where this page and the ADR disagree, the ADR wins and this page is fixed. Who may do what once signed in is [ADR-010](../../users-and-access/spec/). The words used are defined in the [map and glossary](../../guide/).

**Use Better Auth the way its documentation says.** Configure it, call its API, and put Vervoro's policy in its hooks. Never fork or patch it, never replace its password hashing, sessions or passkey checks, and never write SQL against its tables. If a rule below cannot be met that way, stop and raise it with the owner; do not build around it. No coding agent changes the Better Auth setup, its plugins or its schema without this record.

## 0. At launch and later

Everything below is built at launch except these parts, which keep their rules here and are built only when their trigger arrives.

| Later part | Trigger | Rules |
| --- | --- | --- |
| Switching off one way in at a time (passwords, or new passkeys) | Sellers or an incident show the need | [11](#11-incident-commands) |
| A screen for a login's history (a query on the security log until then) | The same | [11](#11-incident-commands) |
| A synthetic login in each cell's canary company that alerts on any attempt | The same | [15](#15-tests-that-prove-each-rule) |
| Lockout counted per device | The security log shows one login locked again and again | [7](#7-lockouts-rate-limits-and-bots) |

## 1. Better Auth and what is switched on

Better Auth is exact-pinned with its plugins (the candidate is 1.7.12, the latest release on 21 October 2026; [section 13](#13-upgrades-and-migrations)).

| Feature | Setting | Why |
| --- | --- | --- |
| Email and password | On, with `requireEmailVerification`, `minPasswordLength` 12, `maxPasswordLength` 128, `revokeSessionsOnPasswordReset`, `autoSignIn` only after a proved address | The fallback; the policy layer adds Amazon's rules ([section 4](#4-password-policy)) |
| Passkey plugin | On: `rpID` and `origin` set explicitly to the app's address, `authenticatorSelection.userVerification: "required"`, registration only from a signed-in session (`registration.requireSession` left on), so no `resolveUser` | The default way to sign in, added after sign-up (owner ruling, 22 October 2026) |
| Two-factor plugin | On: TOTP (6 digits, 30-second steps), backup codes stored encrypted (its default), `accountLockout` 10 failures for 30 minutes, `skipVerificationOnEnable` off | The password's second factor |
| Captcha plugin | On, Turnstile, on `/sign-up/email`, `/sign-in/email` and `/request-password-reset` | The bot check before any password is hashed |
| Breached-password plugin | On, on sign-up, change and reset | Refuses known breached passwords |
| Rate limit | On, stored in the database (memory is unsuitable on Workers), keyed by `cf-connecting-ip` | [Section 7](#7-lockouts-rate-limits-and-bots) |
| Sessions | `expiresIn` 24 hours for everyone, `disableSessionRefresh`, `freshAge` 5 minutes, cookie cache off | [Section 5](#5-sessions) |
| Telemetry | Off | Nothing leaves |
| Off, and never switched on without changing this record | Social and single sign-on providers, magic links, email codes, phone numbers, anonymous users, organisation, admin, multi-session, one-time tokens, bearer tokens, JWT, trusted devices | ADR-013 decisions 3 and 5 |

**Conflicts found in Better Auth 1.7.12, for the owner** (from its documentation and its published source):

1. **Passkey sign-in does not require the fingerprint, face or PIN check.** `userVerification` applies at registration; sign-in asks only for "preferred" and verifies without requiring the user-verified flag. Vervoro's fix uses a hook, not a patch: `authentication.afterVerification` and `registration.afterVerification` refuse a response whose user-verified flag is unset. The registration hook is documented; the sign-in hook is in the source but not the documentation. If it is removed, the fix needs an upstream change.
2. **A password user without a confirmed authenticator gets a full session.** The two-factor plugin challenges only users who have it switched on. Vervoro's session check ([section 5](#5-sessions)) treats such a session as setup-only.
3. **An authenticator code is accepted again within its time window.** Better Auth keeps no record of used codes, and RFC 6238 forbids a second acceptance. Decided (owner, 21 October 2026): a `before` hook on code verification claims the code, hashed, per login in `auth_policy` for 90 seconds, by a unique insert before the code is checked; a code already claimed is refused. Two requests racing with one code get one acceptance.
4. **Backup codes belong to the two-factor plugin.** They exist only for people with an authenticator app and are entered only after the password. A passkey-only person cannot hold them, so the old recovery codes for passkey-only Owners, Admins, Accountants and operators have no Better Auth home; Vervoro keeps no second code store. Passkey-only people recover with a second passkey or through their company ([section 6](#6-recovery)); operators keep a third passkey offline ([section 10](#10-operators)).
5. **The password and the code are no longer judged together.** Better Auth answers a correct password with the code challenge, so a correct password is visible before the code. Accepted: the lockout, the rate limit and the bot check cover guessing.

## 2. The login and its data

1. **A login is a Better Auth user.** Its id, a uuidv7 (Better Auth's `generateId`), is the stable login id every other record uses ([ADR-010 SPEC 2](../../users-and-access/spec/#2-logins-and-member-rows)).
2. **Better Auth's tables** live in the `auth` schema of the control database (`database.schemaName`). **Vervoro's sign-in policy tables** live beside them in `auth_policy`. Only the sign-in role has rights on either; the app's runtime role has no usage on them ([ADR-001 SPEC 3](../../database-architecture/spec/#3-roles)).
3. **What each personal field is for:**

| Field | Where | Why it is kept | Until |
| --- | --- | --- | --- |
| Email address, normalised | `auth.user` | Better Auth requires it; signing in by password, reset links, sign-in notices | The login is deleted |
| Name | `auth.user` | Better Auth requires it; Amazon's "no part of the name" rule on every password set; the passkey's label | The same |
| Password hash | `auth.account` | Better Auth's own scrypt | The password is removed, or the login deleted |
| Authenticator secret, backup codes | Two-factor table | Encrypted by Better Auth under its secret | The authenticator is removed |
| Passkey public key, counter, device type | Passkey table | Better Auth's passkey check | The passkey is removed |
| Session token, network address, browser | `auth.session` | The session; "recent sign-ins" on the security page; spotting odd sign-ins (Amazon 1.2.2) | 30 days after the session ends |
| Password history (hashes only) | `auth_policy` | Amazon's last-10 rule | Replaced by newer ones; the login is deleted |

4. **A login with no membership is deleted after 30 days,** with its methods and sessions, through Better Auth's delete; the security log keeps only its id.
5. **Nothing from the auth schema is copied into a cell.** The company's users table keeps its own copy of the address and name ([ADR-010](../../users-and-access/spec/#2-logins-and-member-rows)).

## 3. Sign-in methods

Every person signs up with a password and an authenticator app, and may add passkeys. Operators have passkeys only ([section 10](#10-operators)).

**Passkeys:**

1. The fingerprint, face or PIN check is required at registration and at every sign-in ([section 1](#1-better-auth-and-what-is-switched-on), conflict 1). A response for another site or origin, or with a used challenge, is refused by Better Auth. No attestation.
2. Synced passkeys are accepted. Only the public key is stored. When a passkey sign-in is refused because Vervoro does not know the passkey, the page tells the device it is unknown (WebAuthn's signal), where the browser supports it, so the device stops offering it (owner ruling, 22 October 2026).
3. Sign-up and every invitation start with a password and an authenticator app. Right after, on a device that can hold a passkey, the page offers to create one ("Add a passkey"; it can be skipped). The sign-in page asks first for the email address, with the device's passkeys offered in the address field's autofill (WebAuthn conditional mediation); after it, the device's passkey prompt opens; where the browser can tell, only when the device holds a passkey for Vervoro; "Try another way" leads to the password and code. The page answers the same for every address: it never says whether an address has a login or a passkey ([section 7](#7-lockouts-rate-limits-and-bots)). After a password sign-in on a device that can hold a passkey, the page offers one, unless the browser reports the device already holds one for this login (owner ruling, 22 October 2026).
4. On a phone with a passkey, signing in needs no email address. A laptop without one uses the phone through the browser's cross-device sign-in, or the password and code.
5. Passkey sign-in is not challenged for a code: with the check it counts as both factors, the device held and the fingerprint, face or PIN (NIST SP 800-63B). Amazon's text neither accepts nor refuses passkeys: its policy says only "Multi-Factor Authentication", and its guidance approves TOTP, hardware tokens and biometrics. The operator asks Amazon through a developer support case and files the answer here. **If Amazon says no** (owner ruling, 21 October 2026): every login must also confirm an authenticator, and an `after` hook on passkey sign-in turns the session into a code challenge, as Better Auth's documentation advises for methods it does not challenge itself. Nothing else changes.

**Password and authenticator app:**

1. The person enters email and password, then a 6-digit code: Better Auth's two-factor challenge.
2. A login with a password must have a confirmed authenticator. Until it does, its only session is setup-only ([section 5](#5-sessions)): it can scan the code on screen and type one back, nothing else.
3. Better Auth's "trust this device" is refused: a `before` hook rejects any request that asks for it.

**Backup codes:**

1. Better Auth issues 10 single-use codes when an authenticator is confirmed, shown once; setup does not finish until the person confirms they saved them.
2. A backup code is entered in place of the code after the password. It signs in once, the person and their Owners and Admins are told, and the session is setup-only until a new authenticator is confirmed.

**The security page.** Each person sees their methods and recent sign-ins, can remove a lost passkey, and can sign out every other device, which ends every session of the login but the current one (Better Auth's `revokeOtherSessions`; owner ruling, 22 October 2026). Adding or removing a method needs a session started in the last 5 minutes (Better Auth's `freshAge`). Adding or removing a method, changing the password and using a backup code are told to the person by email. Changing the password ends every other session of the login (`revokeOtherSessions` on change; owner ruling, 22 October 2026).

## 4. Password policy

A small Vervoro layer in Better Auth's `before` hooks on `/sign-up/email`, `/change-password` and `/reset-password`, and one database trigger. It decides; Better Auth hashes and stores.

| Rule | Source | How |
| --- | --- | --- |
| At least 12 characters | Amazon 1.4.1 | Better Auth's `minPasswordLength` |
| At least one upper-case letter, lower-case letter, number and symbol | Amazon 1.4.1 ("minimum requirements for each") | Policy hook |
| No part of the person's name (words of 3 or more letters) or of the address before the @ | Amazon 1.4.1 | Policy hook, against `auth.user` |
| At least 1 day since the last change | Amazon 1.4.1 | Policy hook on `/change-password`. A forgotten-password reset, a recovery and a change forced by an incident command ([section 11](#11-incident-commands)) are exempt (Vervoro's reading; confirm with Amazon; owner ruling, 22 October 2026) |
| Changed at least every 365 days | Amazon 1.4.1 | At a password sign-in, a password older than 365 days makes the session setup-only until it is changed; a passkey sign-in is not held by it (Amazon's rule is on passwords used; confirm with Amazon with the passkey question in [section 3](#3-sign-in-methods); owner ruling, 22 October 2026) |
| None of the last 10 reused | Amazon 1.4.1 | Policy hook: the candidate is checked with Better Auth's own `password.verify` against the history a database trigger keeps (below) |
| Not a known breached password | Vervoro (NIST advice Amazon allows) | Better Auth's breached-password plugin. It fails closed: if the lookup is down, the password cannot be set and a passkey still works |
| Up to 128 characters, password managers and paste allowed | Vervoro (NIST advice) | Better Auth's `maxPasswordLength`; the page blocks nothing |
| Salted scrypt hash | Better Auth | Its default, unchanged |

**Password history: how it is kept.** No second hashing system and no change to Better Auth; three small parts, each on a documented surface or in Vervoro's own migration:

1. **Record, in the same transaction.** A Postgres trigger on Better Auth's credential rows (`auth.account`, `providerId` = `credential`), after an insert or an update of `password`, copies the new hash Better Auth made into `auth_policy.password_history` (login, hash, set at) and keeps the newest 10. Better Auth writes a change and a reset inside one transaction, and the trigger runs inside the same statement, so the password and its history can never disagree: either both are written or neither is. The trigger reads Better Auth's row and never changes it; it lives in Vervoro's reviewed control migrations.
2. **Check, before Better Auth writes.** The `before` hooks on `/change-password` and `/reset-password` compare the candidate with each stored hash using Better Auth's own `password.verify`, and refuse a match with one error. For a change the login comes from the session; for a reset, from Vervoro's own note of which login a reset link was sent to, written by the `sendResetPassword` callback, which Better Auth calls with the user and the token.
3. **Ages from the same table.** The newest row's time gives the 1-day minimum and the 365-day maximum.

A check that passes and a write that then fails changes nothing. A Better Auth upgrade that renames those columns fails the migration review and the password tests, so the trigger cannot silently stop. Checking 10 hashes costs 10 password checks of CPU, only when a password is set; measured in [section 14](#14-checked-before-launch).

## 5. Sessions

| | Seller's user | Operator |
| --- | --- | --- |
| **Longest session** | 24 hours | 24 hours (owner ruling, 21 October 2026) |
| **Fresh check for account changes** | A session started within the last 5 minutes | The same |
| **Ends at once on** | Sign-out, removal from the last company, a reset, a recovery, an incident; every other session also on a password change or "sign out other devices" (owner ruling, 22 October 2026) | Sign-out, an incident |

1. **One session model:** Better Auth's session row. Vervoro keeps no session table of its own.
2. **Effective end** = the session's start + 24 hours, for everyone. Better Auth's own settings do it: `expiresIn` 24 hours and `disableSessionRefresh`, so no hook and no second limit exist. The validation call checks start + 24 hours again and refuses past it, as a backstop.
3. **The cookie** holds Better Auth's signed token only: `Secure`, `HttpOnly`, `SameSite=Strict`, host-only (no `Domain`), on the app's own address; a `__Host-` name if Better Auth's cookie settings allow it. No session, role or buyer data in the browser's storage ([ADR-009 SPEC 5](../../buyer-data/spec/#5-where-it-lives)).
4. **Validation over the binding.** The app passes the request's cookie to the sign-in Worker's `session` call ([section 8](#8-the-sign-in-worker)), which asks Better Auth for the session and applies Vervoro's checks: the effective end and the setup-only states (a password without a confirmed authenticator, a backup code just used, a password past 365 days or forced to change). A freeze stops new sessions only ([section 11](#11-incident-commands)); it does not end live ones (owner ruling, 22 October 2026). It answers the login id, the session id, whether it is an operator, when it started and when it ends, and full or setup-only (with the reason, for the sign-in pages), or nothing. The app treats setup-only as no session for everything but sending the person to the sign-in pages.
5. **Every request reads the session; nothing is written per request.** Revoking takes effect on the next request. [ADR-001's restore](../../runbooks/restore-a-company-full-rewind/) and ADR-009's containment use the same revocation.
6. **The fresh check** is a session started within the last 5 minutes, which only a full sign-in makes. The app reads the start time from the `session` answer; the sign-in Worker checks it again itself before carrying out any reset or method change, so the app cannot claim one. Which changes need it is [ADR-010 SPEC 5](../../users-and-access/spec/#5-rules-for-every-action).
7. **Before a session ends,** the app asks for a full sign-in, which starts a new session; the old one is never extended. With a passkey it happens in place; a password sign-in returns to the same screen, and scans already on the open screen survive.
8. **No idle lock in the app.** Amazon's 15-minute lock and managed-device rules (1.1.2) bind Vervoro's own laptops, not the seller's phones.

## 6. Recovery

| Lost | How the person comes back | Better Auth | Vervoro |
| --- | --- | --- | --- |
| The password | A reset link to their address, valid 1 hour. Signing in afterwards still needs the code or a passkey. All other sessions end | Password reset, `revokeSessionsOnPasswordReset` | Notices, the security log |
| The authenticator app | The password plus one backup code, then a new authenticator | Backup code | Setup-only session, notices |
| The passkey's phone | Another passkey (a synced one survives a lost phone), or the password and code | Passkey | — |
| Everything, below Admin | An Owner or Admin, after a fresh check, resets them. A one-time code appears on the resetter's screen, on a sign-in Worker page, to hand over in person or by phone, and a link goes to the person's email. Both are needed, within 24 hours | Removing the old methods and sessions through its server API; new methods | Who may reset whom, the code, the link, the scope below |
| Everything, as the last Owner | The [last-Owner runbook](../../runbooks/recover-a-last-owner/) | The same | The marketplace proof, the wait, the notices |

**A reset reaches one company:**

1. It re-activates the person only in the resetter's company. Their other memberships are paused until that company's Owner or Admin confirms them with a fresh check. Pausing is the app's, on the membership in control ([ADR-010 SPEC 2](../../users-and-access/spec/#2-logins-and-member-rows), [SPEC 5](../../users-and-access/spec/#5-rules-for-every-action)).
2. Each paused company's Owners and Admins are told at once, and the person sees it marked "waiting for an Owner or Admin".

This stops a trial company from inviting someone, resetting them, and opening every company they belong to.

**The last Owner** (no room for judgement):

1. The link goes to the Owner's address in the company's users table.
2. The Owner approves Vervoro again on one of the company's connected marketplace accounts, which must return the seller account already in the external directory ([ADR-001](../../database-architecture/)). The approval is used only to read the seller id; its tokens are discarded at once and the live connection is untouched.
3. A 72-hour wait, recorded in `auth_policy`, with every member told by email. Any sign-in by that login cancels it (a hook on session creation). If an Owner or Admin objects, Vervoro's owner decides.
4. New methods are set up; every old method and session ends.

A company with no connected marketplace is a trial with little in it: the person signs up again. Any other case is decided by Vervoro's owner on documents, never by the operator alone.

**After every recovery,** the person and the company's Owners and Admins are told, every session of the login ends, and both audit trails record it.

**Removing another person's methods** (a reset, a last-Owner recovery) has no ready-made Better Auth endpoint for one user acting on another. The sign-in Worker does it through Better Auth's server API and adapter, never SQL; the penetration test covers it.

## 7. Lockouts, rate limits and bots

| Guard | Owner | Rule |
| --- | --- | --- |
| Password lockout | Vervoro's policy layer | Ten wrong passwords in a row lock password sign-in for that login for 30 minutes and tell the person by email, adding "ask your Owner or Admin" if it happens again. A passkey still signs in. Counted in `auth_policy`, from `before` and `after` hooks on `/sign-in/email` |
| Code lockout | Better Auth | Its two-factor `accountLockout`: ten wrong codes or backup codes in a row lock code entry for 30 minutes |
| Request rate per network address | Better Auth | Its rate limiter, stored in the database. `/sign-in/email` and `/two-factor/*` allow 30 attempts a minute per address, enough for 30 phones on one connection |
| Bot check | Better Auth's captcha plugin with Turnstile | Before any password is hashed: password sign-in, sign-up and reset requests. Passkey sign-in has none |
| Enumeration | Better Auth | One error for a wrong address or password; an unknown address still runs a full hash. Sign-up and reset answer the same whether the address exists |
| Odd sign-ins | Vervoro | The security log alerts on a burst of failures or resets ([ADR-010 SPEC 8](../../users-and-access/spec/#8-audit)) |
| Network attacks in bulk | Cloudflare | Its standard protection in front of every Worker; no extra rule |

No sign-in page takes a web address to return to; return targets are names of the app's own screens.

## 8. The sign-in Worker

**What it is, and must stay.** Adding a page or a call needs a change to this record.

1. **Pages,** served on a path of the app's own address, so the cookie stays host-only: signing in, signing up, setting and resetting a password, adding and removing methods, showing a reset code, recovery. Plain pages with the design tokens and none of the app's components. The sign-up page links Vervoro's privacy notice before the address is submitted ([ADR-009 SPEC 2](../../buyer-data/spec/#2-roles-and-agreements); owner ruling, 22 October 2026). The app registers no service worker over them and never renders a password field.
2. **Calls** over the service binding (the whole contract; calls only ever add, never change, so an older app works with a newer sign-in Worker):

| Call | Does |
| --- | --- |
| `session(cookie)` | [Section 5](#5-sessions), rule 4 |
| `enrol(address, name, purpose)` | After the app accepts an invitation or a proved sign-up address: a one-time link to set up the first method, valid 24 hours |
| `reset(actor's cookie, login, company)` | A reset or a last-Owner completion; re-checks the actor's fresh check |
| `revoke(login ids, or everyone)` | Ends sessions |
| `matchesAddress(cookie, address)` | Whether the signed-in login's email address is this address, compared case-insensitively: a yes or no only, so the app never learns the login's address; used when a person with a login accepts an invitation ([ADR-010 SPEC 6](../../users-and-access/spec/#6-invitations-sign-up-and-removal)) (owner ruling, 22 October 2026) |
| `setEmail(login, address)` | After the app has proved a new address ([ADR-010 SPEC 2](../../users-and-access/spec/#2-logins-and-member-rows)) |
| `setName(login, name)` | When the person corrects their own name ([ADR-010 SPEC 2](../../users-and-access/spec/#2-logins-and-member-rows)) (owner ruling, 22 October 2026) |
| `export(login)` | From the operator console, for a person's own data request: the login's email address, name, sign-in methods without secrets, sessions with network address and browser, and security events ([runbook](../../runbooks/answer-a-sellers-data-request/)) (owner ruling, 22 October 2026) |
| `incident(command)` | [Section 11](#11-incident-commands) |

3. **Data:** Better Auth reaches `auth` through its PostgreSQL (Kysely) adapter; Vervoro's policy code reaches `auth_policy` through the typed query builder ([ADR-001 SPEC 6](../../database-architecture/spec/#6-guard-rails)) and writes sign-in events to the platform security log. Both use the sign-in role, through the sign-in Worker's own Hyperdrive configuration, in the EU, caching off, a client per request. No Vervoro code queries Better Auth's tables except through Better Auth.
4. **It carries out, never decides.** The app decides who may reset whom ([ADR-010](../../users-and-access/spec/#5-rules-for-every-action)). The sign-in Worker checks the actor's session and fresh check itself, limits how fast resets run, and alerts on a burst. The reset code appears only on its own page.
5. **It sends its own sign-in mail** (address proofs, reset links, method and lockout notices) through one mail provider, chosen by configuration behind one sending interface. Production sends through Cloudflare's Email Service, from a `send_email` binding restricted to Vervoro's sign-in sender address: no API key, and no new sub-processor ([ADR-009 SPEC 3](../../buyer-data/spec/#3-sub-processors)). Staging may send through Resend, with its API key held only as the sign-in Worker's secret. There is no automatic failover between providers; a switch is a configuration change and a deploy (owner ruling, 22 October 2026). Better Auth's `sendResetPassword` and `sendVerificationEmail` callbacks call it. A send that fails is retried by the person ("send again"); it never blocks a sign-in. Invitations and company notices stay with the app. It never reaches a cell.
6. **Built on its own terms:** its own package list and frozen lockfile, with Better Auth, its plugins and their dependencies exact-pinned; installs with package scripts off; built in its own CI job before anything of the app is installed; deployed with a token that can deploy only it; `nodejs_compat` on. Each Worker deploys only when its own code changes; when both change, the sign-in Worker goes first ([runbook](../../runbooks/deploy-and-roll-back/)). A test of the calls runs whenever either side changes them.

**A risk accepted.** A poisoned app receives the session cookie and can act as a signed-in person, with their rights, for up to 24 hours. It cannot add a method or reset anyone, because those need a fresh check only the sign-in Worker can see. Signing everyone out ends it.

## 9. Secrets

| Secret | Held by | Rotation |
| --- | --- | --- |
| Better Auth's secret, versioned (`BETTER_AUTH_SECRETS`) | The sign-in Worker only | [Runbook](../../runbooks/rotate-the-better-auth-secret/): once a year and at once on suspicion |
| The sign-in role's database credential | The sign-in Worker's Hyperdrive configuration only | By the CI migration job, in minutes ([ADR-001 SPEC 3](../../database-architecture/spec/#3-roles)) |
| The Turnstile secret | The sign-in Worker only | On suspicion |
| The sign-in Worker's deploy token | CI only | On suspicion |

1. **Better Auth's secret** signs the session cookies and encrypts the authenticator secrets and backup codes. A new version goes first in the list; older versions stay to decrypt. Signed cookies are checked only against the current version, so a rotation signs everyone out. Encrypted values are re-encrypted only when next written, and an authenticator secret is not rewritten when used, so an old version can be removed only once nothing is stored under it.
2. **No other sign-in key exists.** The in-house sign-in key and the email-hash key are gone with the code they served. The app's own secrets ([ADR-009 SPEC 6](../../buyer-data/spec/#6-encryption-and-keys)) never reach the sign-in Worker, and its secrets never reach the app.

## 10. Operators

1. Operators sign in only to the operator console, on its own address with its own passkey site name and cookie, with passkeys from Vervoro's managed laptops: at least two per operator, on two devices, and a third on a hardware security key kept offline. No password, so no authenticator or backup codes.
2. Operator sessions last at most 24 hours, like everyone's ([section 5](#5-sessions)); their grants are [ADR-010's](../../users-and-access/spec/#7-operator-access-to-a-company).
3. Nobody resets their own operator access. The operator and Vervoro's owner, as deputy ([ADR-009 SPEC 13](../../buyer-data/spec/#13-incidents)), reset each other; using the offline key alerts ([runbook](../../runbooks/recover-an-operator/)).

## 11. Incident commands

Each is built and rehearsed once on a staging copy before launch, and each use is written to the platform security log ([runbook](../../runbooks/sign-in-incident-commands/)).

| Command | Better Auth | Vervoro | Sessions, passkeys, passwords, codes |
| --- | --- | --- | --- |
| Sign everyone out | Revoking every session of each login named, or of every login | The app names a company's member logins | Sessions end; methods unchanged |
| Force a password change | Its change-password page | A cut-off time in `auth_policy`: any password set before it makes the session setup-only | Sessions continue until the next sign-in; passkeys and codes unchanged |
| Freeze sign-in | — | A flag in `auth_policy`; a `before` hook refuses every sign-in, sign-up and reset route | No new sessions; live sessions continue unless also ended |
| Rotate the Better Auth secret | Its versioned secrets | The [runbook](../../runbooks/rotate-the-better-auth-secret/) | Every session ends; methods unchanged |

A poisoned package follows its own [runbook](../../runbooks/contain-a-poisoned-package/).

## 12. Security events

Written to the platform security log ([ADR-010 SPEC 8](../../users-and-access/spec/#8-audit)) from Better Auth's hooks and Vervoro's policy layer: every sign-in and its result, failed attempts, lockouts, bot-check failures, passkeys and authenticators added or removed, backup codes used, password changes and resets, sessions revoked, recoveries (last Owner and operator included), resets and paused memberships, every incident command. Never logged: a password, a code, an authenticator secret, a backup code, a session token or any passkey private material.

## 13. Upgrades and migrations

1. **No schema change at start-up.** Better Auth's `migrate` command is never run against a shared database.
2. **An upgrade** (a Better Auth version or plugin change) goes: read its release notes and security advisories; run `generate` for the `auth` schema; review the SQL; commit it as a control migration; CI with every sign-in test; deploy and migrate through the normal release ([runbook](../../runbooks/deploy-and-roll-back/)).
3. **Expand, then contract** ([ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying)). Better Auth's generated changes may not be purely additive. One that drops, renames or tightens is split: the adding part ships with the upgrade, and the removing part ships in a later release, after the rollback window. If the previous sign-in Worker cannot run on the expanded schema, the upgrade waits.
4. **Deliberate upgrades only:** no version ranges, no automatic updates, never a minor or major version without this procedure; security fixes follow the same steps faster. Dependency scanning runs on every build and monthly ([ADR-009 SPEC 14](../../buyer-data/spec/#14-security-controls)).
5. **Rehearsed:** an upgrade and a rollback of the sign-in Worker over the new schema, on a staging copy, before launch.

## 14. Checked before launch

1. **Better Auth on a deployed Worker,** through Hyperdrive, with the pinned version: every flow in section 15 once, and the CPU time of a password sign-in.
2. **The passkey site name and domains:** the app's and the operator console's addresses, cross-device sign-in on a laptop.
3. **The cookie** across Vervoro's addresses: host-only, `SameSite=Strict`, ends with the session.
4. **Amazon's answer on passkeys** is filed in section 3, and the fallback built if it is no. **Cloudflare's Email Service** is generally available, or its daily quota covers launch; SPF, DKIM and DMARC pass for the sign-in sender.
5. **How Better Auth stores sensitive fields:** the session token, the authenticator secret, the backup codes, the password hash. The secret rotation procedure is rehearsed.
6. **An outside penetration test** of Better Auth's configuration, the sign-in Worker's own code, cookies and sessions, the service binding, recovery, the hand-off to ADR-010, database rights and the Cloudflare set-up, with a retest of any finding.
7. **Session end on a slow low-cost Android phone:** a half-packed order survives the sign-in, scans on screen.
8. **Real devices:** password and code, passkey, and cross-device sign-in work on current iPhones and low-cost Android phones.

## 15. Tests that prove each rule

Database tests run on real Postgres ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)). These must pass before ADR-013 can be Accepted.

| Area | Tests |
| --- | --- |
| Passkeys | Enrolment; sign-in; a response without the user-verified flag is refused; a replayed response is refused; another site name or origin is refused |
| Password and code | Password alone gives no full session; with a correct code, accepted; with a wrong code, refused; a code used twice is refused, also when two requests race (conflict 3); a backup code works once and leaves a setup-only session; "trust this device" is refused; a password login without a confirmed authenticator is setup-only |
| Enrolment | An invited person sets up a password and authenticator only through their own link, then is offered a passkey; a passkey cannot be registered without a signed-in session |
| Password rules | Each rule of section 4; the last 10 passwords refused on change and on reset; a failed change leaves password and history unchanged; a passkey-only login has none |
| Sessions | Expired and revoked sessions are refused; every session ends at 24 hours; a session is never extended; the fresh check is refused after 5 minutes and cannot come from the app |
| Hand-off to ADR-010 | A valid sign-in with no membership reaches no company; removal from a company stops the next request there; one company's actions never change another company's access |
| Walls (CI and nightly) | The app's role has no right on `auth` or `auth_policy`; the app's code, bundle and bindings hold no sign-in secret; the dependency tree matches its frozen list |
| Lockouts and limits | Ten wrong passwords lock password sign-in for 30 minutes while a passkey still signs in; ten wrong codes lock code entry; the bot check runs before hashing |
| Recovery | Each path of section 6, last Owner and operator included, needs every step it names, tells the people it names, and ends every old session; a reset re-activates only the resetter's company |
| Incident commands | Each works on a staging copy; after signing everyone out an old session is refused; after a freeze a new sign-in is refused |
| Upgrades | A Better Auth upgrade with its migration, and a rollback of the sign-in Worker, rehearsed |
| Calls | An older app's calls pass against the newer sign-in Worker |
| Security log | No entry holds a password, code, secret or token |

## 16. Platform constraints

Checked against the official sources on 21 October 2026. Re-check before launch.

| Constraint | Figure | Source |
| --- | --- | --- |
| Amazon: multi-factor and passwords | Multi-factor for all user accounts; where passwords are used: at least 12 characters; no part of the user's name; upper case, lower case, numbers and special characters, with a minimum for each; at least 1 day old; at most 365 days; last 10 not reused | [Data Protection Policy, 1.4.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: lockout and monitoring | Locked after no more than 10 consecutive failures; anomalous sign-ins detected. The update effective 25 August 2026 names a 30-minute lockout after ten failures | [Data Protection Policy, 1.2.2](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US), [Policy update](https://developer.amazonservices.com/policy-update-for-sp-api) |
| Amazon: own devices | The provider's devices lock after 15 minutes idle; unmanaged personal devices restricted | [Data Protection Policy, 1.1.2](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: second factors | TOTP, hardware tokens and biometrics are approved; passkeys are not named | [Key security control guidance](https://developer-docs.amazon/sp-api/docs/guidance-to-address-key-security-controls-in-sp-api-integration) |
| Amazon, Shopify: approval names the seller | `selling_partner_id`; `shop`, signed with `hmac` | [Amazon](https://developer-docs.amazon/sp-api/docs/website-authorization-workflow), [Shopify](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) |
| Better Auth: Workers | Needs `nodejs_compat` (or `nodejs_als`) for AsyncLocalStorage; the handler takes a web-standard request. No Cloudflare page in its docs; Hyperdrive not mentioned | [Hono integration](https://www.better-auth.com/docs/integrations/hono) |
| Better Auth: PostgreSQL | Kysely adapter; `database.schemaName` selects a schema, which `generate` creates; `migrate` only for the built-in adapter | [PostgreSQL adapter](https://www.better-auth.com/docs/adapters/postgresql), [Database](https://www.better-auth.com/docs/concepts/database), [CLI](https://www.better-auth.com/docs/concepts/cli) |
| Better Auth: tables | User (name and email required, email unique), session (token, expiry, address, browser), account (password), verification; `generateId`; database hooks can replace or refuse a write | [Database](https://www.better-auth.com/docs/concepts/database) |
| Better Auth: passkeys | Built on SimpleWebAuthn; `userVerification` required, preferred or discouraged (default preferred); `requireSession: false` with `resolveUser` for passkey-first; `registration.afterVerification` | [Passkey plugin](https://www.better-auth.com/docs/plugins/passkey) |
| Better Auth: two factors | Password sign-in returns a challenge, no session until verified; passkey and other methods not challenged; TOTP 30 seconds, one step either side; backup codes single use; trusted devices 30 days; shared lockout counter | [Two-factor plugin](https://www.better-auth.com/docs/plugins/2fa) |
| Better Auth: sessions | 7 days by default; `updateAge`; `disableSessionRefresh`; `freshAge` by start time; revoke one, others or all | [Session management](https://www.better-auth.com/docs/concepts/session-management) |
| Better Auth: secrets | Versioned secrets rotate without downtime; new data carries a version; old data re-encrypted when next written | [Security](https://www.better-auth.com/docs/reference/security), [Options](https://www.better-auth.com/docs/reference/options) |
| Better Auth: hooks | `before` and `after` hooks per route, refusing with an error; `password.hash` and `verify` available to hooks | [Hooks](https://www.better-auth.com/docs/concepts/hooks) |
| Better Auth: passwords and cookies | scrypt by default; 8 to 128 characters by default; reset token 1 hour; cookies `HttpOnly`, `Secure`, `SameSite=Lax` by default and configurable | [Email and password](https://www.better-auth.com/docs/authentication/email-password), [Cookies](https://www.better-auth.com/docs/concepts/cookies) |
| Better Auth: rate limits and bots | 100 requests per 10 seconds, 3 per 10 seconds on password sign-in; memory store unsuitable for serverless, database store available; Turnstile through the captcha plugin; breached passwords by 5 characters of a SHA-1 | [Rate limit](https://www.better-auth.com/docs/concepts/rate-limit), [Captcha](https://www.better-auth.com/docs/plugins/captcha), [Have I Been Pwned](https://www.better-auth.com/docs/plugins/have-i-been-pwned) |
| NIST: passwords | A blocklist; allow 64 characters or more, managers and paste; no composition rules or forced change | [SP 800-63B rev. 4, 3.1.1.2](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: passkeys | WebAuthn is phishing-resistant; synced passkeys allowed at AAL2; no user-verified flag means one factor | [SP 800-63B rev. 4, 3.2.5, appendix B](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: sessions | AAL2: at most 24 hours overall; `Secure`, `HttpOnly`, `SameSite` cookies; no secrets in local storage | [SP 800-63B rev. 4, 2.2.5 and 5](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: email and recovery | Email is not a factor; recovery codes allowed; every recovery notified | [SP 800-63B rev. 4, 3.1.3.2 and 4.2](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| Cloudflare Email Service | Sending is in beta, on Workers Paid; a Worker sends through a `send_email` binding with no API key, restricted to allowed addresses if set; new accounts start on a conservative daily quota that grows with reputation; 50 recipients and 5 MiB per message | [Overview](https://developers.cloudflare.com/email-service/), [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [Limits](https://developers.cloudflare.com/email-service/platform/limits/) |
| Authenticator codes | A used code must not be accepted again | [RFC 6238, 5.2](https://www.rfc-editor.org/rfc/rfc6238) |
| Workers: secrets, bindings | Any module can import the Worker's environment, secrets included; service bindings add no latency or cost | [Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/), [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) |
| Package supply chain | A self-spreading compromise took over hundreds of npm packages | [CISA alert, 23 September 2025](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) |

**Where Vervoro departs from a source.** Amazon's composition rules and yearly change are what NIST advises against; Amazon's policy binds Vervoro and NIST's does not, so passwords follow Amazon and add what NIST advises and Amazon allows. Passkeys carry no password rule, which is why they are the default. NIST advises an idle limit of an hour; no binding rule asks for one, and an in-app lock would mean typing a password after every break.

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look and which test proves it.

- [ ] **Better Auth as documented:** one pinned version; no patch, fork, custom adapter, custom hashing or WebAuthn code; only section 1's plugins; telemetry off.
- [ ] **Walls:** the app has no sign-in secret and no right on `auth` or `auth_policy` (catalogue); the walls test is green.
- [ ] **Closed list:** the binding's calls match section 8; a call was only added; the calls test runs against the previous app.
- [ ] **Hand-off:** the app takes only the login id and session facts; every access decision is ADR-010's resolver; no organisation plugin.
- [ ] **Passkeys:** `rpID` and `origin` set; both `afterVerification` hooks refuse a missing user-verified flag; the passkey tests are green.
- [ ] **Second factor:** a password login without a confirmed authenticator is setup-only; trusted devices refused; the password-and-code tests are green.
- [ ] **Password policy:** in hooks only, with source per rule; history kept by the trigger in Better Auth's transaction and verified with its `password.verify`; no second hash function.
- [ ] **Sessions:** refresh off; 24 hours from Better Auth's `expiresIn` and again by `session`; cookie flags as section 5; no Vervoro session table.
- [ ] **Fresh check:** start time from Better Auth, re-checked by the sign-in Worker before any reset or method change.
- [ ] **Lockouts and limits:** owners as section 7; rate limit stored in the database; the bot check on every password route.
- [ ] **Recovery:** section 6's split; a reset touches only the resetter's company; the last-Owner wait cancels on any sign-in.
- [ ] **Migrations:** the `auth` schema from reviewed, committed `generate` output; no `migrate` at start-up; a removing step ships only in a release after the one that first needs the new schema.
- [ ] **Secrets:** `BETTER_AUTH_SECRETS` only in the sign-in Worker; the rotation was rehearsed.
- [ ] **Logs:** the events of section 12 are written; none holds a secret, code or token.
- [ ] **Incidents:** the four commands exist and write to the security log; the staging rehearsal is recorded.
- [ ] **Launch checks:** section 14's results are written into this page.
