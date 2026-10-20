# ADR-010: Users, roles and access

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026, revised 18 October 2026; sign-in moved to [ADR-013](../sign-in/), split into ADR, SPEC and RUNBOOK, 21 October 2026 |
| **Scope** | Who uses Vervoro and what each may do: the people, one login across companies, the seller's roles and warehouse scope, the permission matrix, invitations, sign-up and removal, operator access to a company, the audit trails, and API tokens |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-002](../data-retention/), [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/), [ADR-009](../buyer-data/); sign-in is [ADR-013](../sign-in/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-010-users-roles-and-access) |

## Context

- **Buyer data sets the bar.** Warehouse staff see buyers' addresses while they pack. Amazon asks for one account per person, need-to-know access and access removed within 24 hours ([ADR-009](../buyer-data/)).
- **Small sellers, not IT departments.** A company has 1 to about 30 people, with seasonal and agency staff who start on a Monday and leave on a Friday, and accountants who work for several sellers.
- **One person, several companies.** An owner may run more than one company; an accountant serves many.
- **One operator,** whose every look at a seller's data must be visible to the seller.
- **Every module names its actions** ([ADR-000](../system-architecture/)); this record decides who holds them. It is part of the skeleton.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **Three kinds of people:** the seller's users, Vervoro's operators and its developers. Buyers and suppliers never sign in. Background work acts as a named system actor, never as a person. Developers have no access to production data.
2. **One login per person, on their own device, in any number of companies.** The login lives in the control database ([ADR-013](../sign-in/)). Each company's own users table holds the person's email address, name, role, warehouse scope and status there, and decides what they may do there. No shared accounts and no shared warehouse phones.
3. **Six fixed roles:** Owner, Admin, Manager, Warehouse, Accountant and Staff. One role per person per company, plus an optional warehouse scope that limits a Manager, Warehouse or Staff member to some warehouses. No custom roles at launch.
4. **Permissions are named actions** that each module declares and one matrix grants to roles. The server checks every request against the person's role, scope and status, read in the same transaction as the work. Every "no" says why.
5. **Nobody changes their own access.** Owners manage everyone; Admins manage everyone below Admin. The last Owner cannot leave until there is another.
6. **People join only by invitation** to their own email address. Sign-up creates a new trial company, with its creator as Owner.
7. **Removal takes effect on the person's next request.** It ends their sessions in that company and clears their email address there; their name stays on the history they made. *Later: an end date on a membership, when agency and seasonal staff need it.*
8. **Operators have no standing access.** An operator looks inside a company only through a read-only grant with a written reason and an end time, at most 8 hours. The seller is told at once and can end it. Buyer data stays masked unless an Owner or Admin switches it on for that grant. Repairs run as recorded commands without a grant. An operator never signs in as a seller's user, and every request still runs as one company under row-level security (Postgres refusing another company's rows).
9. **Two audit trails.** The company's `audit_log` records what happened in that company, for the seller to read. The platform security log records every sign-in and security event, with no buyer data and no email address.
10. **No API tokens for sellers at launch.** *Later: integration access, in its own record, scoped, revocable and without buyer data.*

## Architecture

<!-- DIAGRAM -->

**Every request answers three questions:** who is it, which company, and may they do this here. The sign-in Worker says whether the session is live ([ADR-013](../sign-in/)). The app Worker checks the membership, or an operator's live grant, in control, then opens the company's transaction in its cell. The first read there is the person's member row; the action runs only if the role holds it, the scope covers it and the person is active. Revoking a session or removing a person therefore stops their very next request.

## Consequences

**Gives**

- Every pick, pack and address view has one person's name on it.
- Removal, role changes and incidents take effect on the next request.
- Every operator look has a reason, an end time and an entry the seller can read and end, and sees only one company.
- One login for a person in several companies, while each company holds its own member rows, so export, restore and erasure work by company.
- Six roles that support can explain and a test can cover action by action.

**Costs**

- Every worker needs a phone of their own.
- Fixed roles will not fit every company; some will want, for example, a packer who can hold an order.
- Every request reads its member row first, and its membership in control.
- No API tokens: a seller who wants their own integration waits for a later record.
- The matrix grows with every module, and each row needs a test per role.

## Alternatives rejected

- **A separate login per company:** a person in three companies would hold three sets of credentials; accountants would share them.
- **Custom roles, or extra permissions per person:** an editor, a test per combination and a buyer-data review per role, for a need six roles meet.
- **One active role at a time ("hats"):** a person already has one role per company.
- **Warehouse scope in row-level security:** a second policy on every table, for scope the ports already take.
- **Shared warehouse phones:** one name per action is lost.
- **Operators impersonating a seller's user:** the audit log would name the wrong person.
- **Standing operator access:** ADR-009 forbids it; marketplaces ask for need-to-know.
- **The seller approving every grant first:** slower help for the same protection.
- **An emergency grant after a wait:** repairs need no grant, so none is that urgent.
- **API tokens at launch:** a standing credential without multi-factor, and a path for buyer data Vervoro cannot log.

## Open items

- **Single sign-on and custom roles** wait for enough sellers to ask; neither has a trigger number yet.
- **The quarterly access review** is ADR-009's; it has no written procedure yet.
- **Later modules** (purchasing, returns) add their rows to the matrix when their records are written.
