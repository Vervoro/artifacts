# Runbook: Answer a seller's data request

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-009](../../buyer-data/), rules in [SPEC 17](../../buyer-data/spec/#17-the-sellers-users-sign-in-data) |
| **Who runs it** | The operator, when a seller's user, or a former user, asks Vervoro to see or erase the personal data it holds about them as controller |
| **Role or credential** | The operator console. Sign-in data is read only through the sign-in Worker's `export` call ([ADR-013 SPEC 8](../../sign-in/spec/#8-the-sign-in-worker)); nobody queries the `auth` schema |

A seller asking for their **company's** data is not this procedure: use [Export a company](../export-a-company/) or [Erase a company](../erase-a-company/). Buyer data is the seller's to answer: [Answer a buyer's data request](../answer-a-buyers-data-request/).

## Steps

1. Record the request in the platform security log: who asked, by which channel, and the due date, one month from receipt.
2. Confirm it is the person: the request comes from the login's own address, and they sign in once to confirm it.
3. **Access:** run the sign-in Worker's export for that login: email address, name, sign-in methods (no secrets), sessions with network address and browser, and their security events. Add their memberships and billing contact details where they hold them. Send the file to the login's address. For a former user whose login is already deleted, `export` answers nothing: tell them the platform security log still keeps their security events under their old id for 12 months ([ADR-013 SPEC 2](../../sign-in/spec/#2-the-login-and-its-data), [ADR-010 SPEC 8](../../users-and-access/spec/#8-audit)), and why (owner ruling, 22 October 2026).
4. **Erasure:** ask each company's Owner to remove the person, or, where the person is a company's last Owner, explain that the company must name another Owner or close. A login with no membership is deleted after 30 days, its address and name with it ([ADR-010 SPEC 6](../../users-and-access/spec/#6-invitations-sign-up-and-removal)).
5. **Correction:** a wrong name is corrected by the person on their profile. A wrong or changed email address is corrected by the company's Owner or Admin inviting the person at the right address and removing the old membership; a login's address is never changed in place ([ADR-010 SPEC 2](../../users-and-access/spec/#2-logins-and-member-rows), owner ruling, 23 October 2026).
6. Tell the person what stays and why: `audit_log` entries keep their user id for the company's audit period, and control's backups hold the login until they expire, within 30 days.

## Verify

- The request in the security log shows done within the month.
- After an erasure, the login is gone 30 days after its last membership ended.

## If it stops halfway

Nothing is changed until step 4. A removed membership stays removed; the 30-day deletion runs by itself.
