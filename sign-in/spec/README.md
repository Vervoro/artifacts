# ADR-013 SPEC: Sign-in

| | |
| --- | --- |
| **Decision** | [ADR-013: Sign-in](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-013-sign-in) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-013 from. The record decides; this page says exactly how. Where this page and the ADR disagree, the ADR wins and this page is fixed. Who may do what once signed in is [ADR-010](../../users-and-access/spec/). The words used are defined in the [map and glossary](../../guide/).

## 0. At launch and later

Everything below is built at launch except these parts, which keep their rules here and are built only when their trigger arrives.

| Later part | Trigger | Rules |
| --- | --- | --- |
| The email-hash key's rotation job | An incident that needs it; until then the [runbook](../../runbooks/rotate-the-email-hash-key/) is the procedure | [8](#8-keys) |
| Switching off one way in at a time (passwords, or new passkeys) | Sellers or an incident show the need | [10](#10-incident-commands) |
| A screen for a login's history (a query on the security log until then) | The same | [10](#10-incident-commands) |
| A synthetic login in each cell's canary company that alerts on any attempt | The same | [12](#12-tests-that-prove-each-rule) |
| A measured timing check that known and unknown addresses look the same (the stand-in hash is built at launch) | The same | [5](#5-lockouts-and-the-one-answer) |
| Lockout counted per device | The security log shows one login locked again and again | [5](#5-lockouts-and-the-one-answer) |
| An in-house passkey verifier, with the library as its test oracle | The pinned library becomes a risk | [7](#7-primitives) |

## 1. The login

1. **The login** is in control: a random id, the keyed hash of the normalised email ([ADR-001 SPEC 7](../../database-architecture/spec/#7-control-database-and-routing)), the sealed password hash and authenticator secret, its passkeys' public keys, the hashes of its recovery codes, and its sessions. No name and no clear email address.
2. Only the sign-in Worker reads or writes the login, its methods, its recovery codes and its sessions. Memberships are [ADR-010's](../../users-and-access/spec/#2-logins-and-member-rows).
3. A login with no membership is deleted after 30 days.

## 2. Sign-in methods

Every person has a passkey, or a password with an authenticator app, or both.

**Passkeys:**

1. User verification is required. A response without the user-verified flag, for another site, or with a replayed challenge is refused. No attestation.
2. Synced passkeys are accepted. Only the public key is stored.
3. Sign-up and every invitation start with creating a passkey; "use a password instead" is a smaller link below it. After a password sign-in on a device that can hold a passkey, the app offers one.
4. On a phone with a passkey, signing in needs no email address. A laptop without one uses the phone through the browser's cross-device sign-in, or the password and code.

**Password and authenticator app:**

1. The person enters email and password, then a 6-digit code. Codes follow RFC 6238: 30-second steps, one step either side, each code accepted once.
2. Setting up the app happens at the first password sign-in: scan the code on screen, type one code back.
3. **Password rules** (Amazon 1.4.1): at least 12 characters of mixed character types; no part of the person's name (the names come with the call from the app); at least 1 day old before a change; a change forced at the next sign-in after 365 days; the last 10 not reused.
4. **Added from NIST**, which Amazon's rules allow: refused if on a list of breached passwords; up to 64 characters; password managers may fill and paste.
5. A password is stored only as a salted scrypt hash, sealed ([section 7](#7-primitives)).

**Recovery codes:**

1. 10 single-use codes, shown once when a second factor is set up; setup does not finish until the person confirms they saved them. Each is stored as a keyed hash.
2. Issued to everyone with an authenticator app, and to every Owner, Admin and Accountant and anyone in more than one company, even with passkeys only. A single-company Manager, Warehouse or Staff member with passkeys only gets none: a synced passkey survives a lost phone, and otherwise their company resets them.

**The security page.** Each person sees their methods and recent sign-ins and can remove a lost passkey. Adding or removing a method, changing the password and using a recovery code are told to the person by email.

## 3. Sessions

| | Seller's user | Operator |
| --- | --- | --- |
| **Longest session** | 24 hours | 12 hours |
| **Fresh check for account changes** | A full sign-in within the last 5 minutes | The same |
| **Ends at once on** | Sign-out, removal, a role change, a reset, a recovery, an incident | Sign-out, an incident |

1. A session is a row in control: the hash of a random token of at least 128 bits, the login, start, end, and the time of the last full sign-in. The token is never stored.
2. The browser holds the token only, in a cookie marked `__Host-`, `Secure`, `HttpOnly` and `SameSite=Strict`. No session, role or buyer data in the browser's storage ([ADR-009](../../buyer-data/)).
3. Every request reads the session; nothing is written per request. Revoking takes effect on the next request; [ADR-001's restore](../../runbooks/restore-a-company-full-rewind/) and ADR-009's containment use the same revocation.
4. Before a session ends, the app asks for a full sign-in, which starts a new session; the old one is never extended. With a passkey it happens in place; a password sign-in returns to the same screen, and scans already on the open screen survive.
5. No idle lock in the app. Amazon's 15-minute lock and managed-device rules (1.1.2) bind Vervoro's own laptops, not the seller's phones.
6. Only the sign-in Worker records a full sign-in check, and it checks the time again itself before carrying out any account change, so the app cannot claim one. Which changes need it is [ADR-010 SPEC 5](../../users-and-access/spec/#5-rules-for-every-action).

## 4. Recovery

| Lost | How the person comes back |
| --- | --- |
| The password | A reset link to their email address, valid 1 hour, plus their app code or a passkey. All other sessions end |
| The authenticator app, or the passkey's phone | The password plus one recovery code, or another passkey; then a new second factor |
| Everything, below Admin | An Owner or Admin, after a fresh check, resets them. A one-time code appears on the resetter's screen, on a sign-in Worker page, to hand over in person or by phone, and a link goes to the person's email. Both are needed, within 24 hours. An Owner resets an Admin; another Owner resets an Owner |
| Everything, as the last Owner | The [last-Owner runbook](../../runbooks/recover-a-last-owner/) |

**A reset reaches one company:**

1. It re-activates the person only in the resetter's company. Their other memberships are paused until they prove themselves there: with a recovery code they still hold, or when that company's Owner or Admin confirms them with a fresh check.
2. Each paused company's Owners and Admins are told at once, and the person sees it marked "waiting for an Owner or Admin".
3. After a reset, unused recovery codes only un-pause memberships; a new set comes with the next factor set up.

This stops a trial company from inviting someone, resetting them, and opening every company they belong to.

**The last Owner** (no room for judgement):

1. The link goes to the Owner's address in the company's users table.
2. The Owner approves Vervoro again on one of the company's connected marketplace accounts, which must return the seller account already in the external directory ([ADR-001](../../database-architecture/)). The approval is used only to read the seller id; its tokens are discarded at once and the live connection is untouched.
3. A 72-hour wait, with every member told by email. Any sign-in by that login cancels it. If an Owner or Admin objects, Vervoro's owner decides.
4. New methods are set up; every old method and session ends.

A company with no connected marketplace is a trial with little in it: the person signs up again. Any other case is decided by Vervoro's owner on documents, never by the operator alone.

**After every recovery,** the person and the company's Owners and Admins are told, every session of the login ends, and both audit trails record it.

## 5. Lockouts and the one answer

1. Ten wrong passwords, codes or recovery codes in a row lock password sign-in for 30 minutes and tell the person by email, adding "ask your Owner or Admin" if it happens again. A passkey still signs in. The counts are in the database.
2. A bot check (Turnstile) runs before any password is hashed: on every password sign-in, sign-up and password reset. Passkey sign-in has none.
3. Requests from one network address are rate-limited, generously enough for 30 phones on one connection.
4. The password and the code are judged together, with one error for any failure. An address with no login runs a full hash against a stand-in record.
5. No sign-in page takes a web address to return to; return targets are names of the app's own screens.

## 6. The sign-in Worker

**What it is, and must stay.** Adding a page or a call needs a change to this record.

1. **Pages:** signing in, signing up, setting and resetting a password, adding and removing methods, showing a reset code, recovery. Plain pages with the design tokens and none of the app's components. The app registers no service worker over them and never renders a password field.
2. **Calls** over the service binding: is this session live (answering the login and the session's end), revoke, reset, un-pause, change email hash, and the incident commands. Calls only ever add, never change, so an older app works with a newer sign-in Worker.
3. **Data:** its own role on control ([ADR-001 SPEC 3](../../database-architecture/spec/#3-roles)) through its own Hyperdrive configuration, in the EU, caching off. It queries through the same typed query builder and run-time check as modules, and writes no SQL text ([ADR-001 SPEC 6](../../database-architecture/spec/#6-guard-rails)). The app's role has no right on the login tables.
4. **It carries out, never decides.** The app decides who may reset whom ([ADR-010](../../users-and-access/spec/#5-rules-for-every-action)). The sign-in Worker checks the actor's session and fresh check itself, limits how fast resets run, and alerts on a burst. The reset code appears only on its own page.
5. **It never reaches a cell and never sends email.** It hands the app the event and, for a reset or recovery, the link; the app mails the address in the company's users table.
6. **Built on its own terms:** its own package list and frozen lockfile, the passkey library its only dependency; installs with package scripts off; built in its own CI job before anything of the app is installed; deployed with a token that can deploy only it. Each Worker deploys only when its own code changes; when both change, the sign-in Worker goes first ([runbook](../../runbooks/deploy-and-roll-back/)). A test of the calls runs whenever either side changes them.

**A risk accepted.** A poisoned app receives the session cookie and can act as a signed-in person, with their rights, for up to 24 hours. It cannot add a method or reset anyone, because those need a fresh check only the sign-in Worker records. Signing everyone out ends it.

## 7. Primitives

| Piece | How | Why |
| --- | --- | --- |
| Password hashing | The runtime's scrypt, N = 2^14, r = 8, p = 5 (16 MiB), an OWASP minimum. Only a few hashes at once per instance, the number set from the benchmark | PBKDF2 is capped at 100,000 iterations on Workers, below OWASP's 600,000; Argon2 is not native; N = 2^17 needs 128 MiB |
| Sealing | The password hash, the authenticator secret and the recovery codes' key, with AES-GCM under the versioned sign-in key | A copied database holds nothing to crack; the key rotates without a password change, which a pepper cannot |
| Authenticator codes | Vervoro's own, on the runtime's HMAC-SHA-1, tested against RFC 6238's vectors. A code is used up in one statement | Small and fully specified. Fallback if HMAC-SHA-1 fails on the runtime: one audited hashing library |
| Passkeys | SimpleWebAuthn, exact-pinned, behind Vervoro's own verify function | Parsing authenticator formats is where hand-written verifiers fail. Its ~25 packages are pinned and every change reviewed |
| Breached passwords | The range lookup with padding, when a password is set or changed; only 5 characters of its SHA-1 leave. If the service is down, the password is accepted, the login flagged, and the check runs at its next sign-in | Free, no key, the password never leaves |
| Rate limit | The runtime's rate-limiting binding | Approximate by design; lockout counts stay in the database |

**Leaving.** Everything stored is standard: scrypt hashes, RFC 6238 secrets and WebAuthn public keys, unsealed with the sign-in key for export.

## 8. Keys

1. The email-hash key and the sign-in key are versioned secrets of the sign-in Worker only.
2. **The sign-in key** rotates by sealing every value again under a new version, in a resumable job, with no sign-in interrupted ([runbook](../../runbooks/rotate-the-sign-in-key/)). Built and rehearsed before launch.
3. **The email-hash key** rotates by reading each person's address from a company where they are a member and storing the new hash. *Later* as a job ([runbook](../../runbooks/rotate-the-email-hash-key/)). A leaked email-hash key lets someone test whether a known address has an account; it reveals no password, code or buyer data.

## 9. Operators

1. Operators sign in only to the operator console, on its own address, with passkeys from Vervoro's managed laptops: at least two per operator, on two devices. No password.
2. Operator sessions last 12 hours ([section 3](#3-sessions)); their grants are [ADR-010's](../../users-and-access/spec/#7-operator-access-to-a-company).
3. Nobody resets their own operator access. The operator and Vervoro's owner, as deputy ([ADR-009](../../buyer-data/)), reset each other; each keeps recovery codes offline, and using one alerts ([runbook](../../runbooks/recover-an-operator/)).

## 10. Incident commands

Each is built and rehearsed once on a staging copy before launch, and each use is written to the platform security log ([runbook](../../runbooks/sign-in-incident-commands/)).

| Command | What it does |
| --- | --- |
| Sign everyone out | Ends every session of one company, or of the platform, in one statement |
| Force a password change | Every password login sets a new password at its next sign-in |
| Freeze sign-in | No new sessions anywhere; live sessions continue unless also ended |
| Rotate the sign-in key | [Section 8](#8-keys) |

A poisoned package follows its own [runbook](../../runbooks/contain-a-poisoned-package/).

## 11. Checked before launch

1. **scrypt benchmark** on a deployed Worker: p50 and p95 time and memory, for one hash and for two or three at once. p95 well under a second and within memory; the results go into this page, and the hashes-at-once number is set from them.
2. **Cryptography smoke test** on the deployed runtime: scrypt, HMAC-SHA-1, AES-GCM and the passkey library each run once.
3. **An outside penetration test** of sign-in, recovery, resets and return paths, with a retest of any finding.
4. **Session end on a slow low-cost Android phone:** a half-packed order survives the sign-in, scans on screen.
5. **Real devices:** password and code, passkey, and cross-device sign-in on a laptop work on current iPhones and low-cost Android phones.

## 12. Tests that prove each rule

Database tests run on real Postgres ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)).

| Test | Proves |
| --- | --- |
| Password rules | Each of Amazon's rules is enforced; a breached password is refused; the yearly change is forced; a passkey-only login has none |
| Second factor | A password alone never signs in; a code works once |
| Primitives | Codes match RFC 6238's vectors; bad passkey responses (no user verification, another site, a replayed challenge, a wrong signature) are refused through the verify function, again after every library change |
| Lockouts | Ten failures lock password sign-in for 30 minutes; a passkey still signs in |
| Session length | After 24 hours a seller needs a full sign-in, an operator after 12 |
| Fresh check | An account change with a fresh check the sign-in Worker did not record is refused |
| Recovery | Each path in section 4 needs every step it names, tells the people it names, and ends every old session |
| Reset scope | A reset re-activates only the resetter's company; every other membership stays paused until cleared |
| One answer | A wrong password and a wrong code give the same error; an unknown address runs a full hash |
| Return paths | A table of hostile return targets always lands on the app's home screen |
| Walls (CI and nightly) | The app's role has no right on the login tables; the app's code and bundle hold neither key; the dependency tree matches its frozen list |
| Calls | An older app's calls pass against the newer sign-in Worker |
| Incident commands (before launch, once) | Each works on a staging copy |

## 13. Platform constraints

Checked against the official sources on 18 October 2026. Re-check before launch.

| Constraint | Figure | Source |
| --- | --- | --- |
| Amazon: multi-factor and passwords | Multi-factor for all user accounts; where passwords are used: 12 characters, no part of the name, mixed types, 1 to 365 days old, last 10 not reused | [Data Protection Policy, 1.4.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: lockout | After no more than 10 consecutive failures; authentication monitored | [Data Protection Policy, 1.2.2](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: own devices | The provider's devices lock after 15 minutes idle; unmanaged personal devices restricted | [Data Protection Policy, 1.1.2](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: second factors | TOTP, hardware tokens and biometrics are approved | [Key security control guidance](https://developer-docs.amazon/sp-api/docs/guidance-to-address-key-security-controls-in-sp-api-integration) |
| Amazon, Shopify: approval names the seller | `selling_partner_id`; `shop`, signed with `hmac` | [Amazon](https://developer-docs.amazon/sp-api/docs/website-authorization-workflow), [Shopify](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) |
| NIST: passwords | A blocklist; allow 64 characters, managers and paste; no composition rules or forced change | [SP 800-63B rev. 4, 3.1.1.2](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: passkeys | WebAuthn is phishing-resistant; synced passkeys allowed at AAL2; no user-verified flag means one factor | [SP 800-63B rev. 4, 3.2.5, appendix B](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: sessions | AAL2: at most 24 hours overall, an idle limit of 1 hour advised; `__Host-`, `Secure`, `HttpOnly`, `SameSite` cookies; no secrets in local storage | [SP 800-63B rev. 4, 2.2.5 and 5](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| NIST: email and recovery | Email is not a factor; recovery by two routes or a code plus a factor; saved codes allowed; every recovery notified | [SP 800-63B rev. 4, 3.1.3.2 and 4.2](https://pages.nist.gov/800-63-4/sp800-63b.html) |
| OWASP: password storage | scrypt N = 2^14, r = 8, p = 5 equals N = 2^17, p = 1; PBKDF2 at 600,000; a leaked pepper resets everyone; p95 well under a second | [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| Workers: limits | 128 MB memory per instance; 30 seconds of CPU per request by default | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Workers: password primitives | PBKDF2 capped at 100,000 in the runtime's source; scrypt via Node crypto, default memory ceiling 32 MiB; no Argon2 | [Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/), [limits source](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/limit-enforcer.h), [scrypt source](https://github.com/cloudflare/workerd/blob/main/src/node/internal/crypto_scrypt.ts) |
| Workers: secrets | Any module can import the Worker's environment, secrets included | [Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/) |
| Workers: service bindings and rate limiting | No added latency or cost; rate-limit counters are per location and approximate | [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), [Rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) |
| Breached passwords | The range lookup takes 5 characters of a SHA-1, needs no key, can pad | [Pwned Passwords API](https://haveibeenpwned.com/API/v3) |
| Authenticator codes | 30-second steps, drift allowance, a used code refused; test vectors | [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) |
| SimpleWebAuthn | Runs on Workers; user verification can be required; listed by passkeys.dev | [Server docs](https://simplewebauthn.dev/docs/packages/server), [passkeys.dev](https://passkeys.dev/docs/tools-libraries/libraries/) |
| Package supply chain | A self-spreading compromise took over hundreds of npm packages | [CISA alert, 23 September 2025](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) |

**Where Vervoro departs from a source.** Amazon's mixed character types and yearly change are what NIST advises against; Amazon's policy binds Vervoro and NIST's does not, so passwords follow Amazon and add what NIST advises and Amazon allows. Passkeys carry no password rule, which is why they are the default. NIST advises an idle limit of an hour; no binding rule asks for one, and an in-app lock would mean typing a password after every break.

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look and which test proves it.

- [ ] **Walls:** the app Worker's bindings hold neither key and no binding to the login tables; the app's database role has no grant on them (catalogue); the walls test is green.
- [ ] **No password in the app:** no password or code input in the app's components; sign-in pages import only the design tokens.
- [ ] **Closed list:** the service binding's call list matches section 6; a call was only added, never changed; the calls test runs against the previous app.
- [ ] **Hyperdrive:** the sign-in Worker has its own configuration, to control only, caching off, placed in the EU.
- [ ] **No SQL text:** the sign-in Worker's queries use the typed builder with the run-time check.
- [ ] **Build:** its own lockfile with one direct dependency, exact-pinned; scripts off at install; its CI job runs before the app's install; its deploy token is scoped to it.
- [ ] **Passkeys:** the verify function requires user verification, checks the site and the challenge; the bad-response set is green.
- [ ] **Codes:** RFC 6238 vectors pass; a used code is spent in the same statement that accepts it.
- [ ] **Passwords:** scrypt parameters as section 7; the hash is sealed before it is written; the rules apply only when a password exists.
- [ ] **Sessions:** only the token's hash is stored; the cookie flags as section 3; no per-request write; 24 and 12 hours enforced by the server.
- [ ] **Fresh check:** recorded and re-checked only in the sign-in Worker; the app never sends a time.
- [ ] **One answer:** one error path for password and code; the stand-in record is hashed in full.
- [ ] **Bot check:** runs before the hash on every password path; not on passkey sign-in.
- [ ] **Lockout:** counted in the database; passkey sign-in ignores it.
- [ ] **Return targets:** only names of screens; the hostile-targets test is green.
- [ ] **Reset scope:** a reset changes only the resetter's membership; others are paused; the reset-scope test is green.
- [ ] **Last Owner:** the marketplace step discards its tokens and never touches the live connection; any sign-in cancels the wait.
- [ ] **Email:** the sign-in Worker sends none and reaches no cell.
- [ ] **Keys:** the sign-in key's rotation job is resumable and was rehearsed; both keys carry a version on every sealed value.
- [ ] **Incidents:** the four commands exist and write to the security log; the staging rehearsal is recorded.
- [ ] **Launch checks:** the benchmark results are in section 11 and set the hashes-at-once number.
