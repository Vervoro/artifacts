# Runbook: Rotate the email-hash key

| | |
| --- | --- |
| **Built** | *Later* as a job: when an incident needs it ([SPEC 0](../../sign-in/spec/#0-at-launch-and-later)). Until then, this page is the procedure |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 8](../../sign-in/spec/#8-keys) |
| **Who runs it** | The operator, when the email-hash key may have leaked |
| **Role or credential** | The sign-in Worker's own deploy token, to add the secret. The job runs in the sign-in Worker and asks the app for each address |

## Steps

1. Add the new key version as a secret of the sign-in Worker. Keep the old version.
2. For each login, the app reads the person's address from a company where they are a member, and the sign-in Worker stores the new hash.
3. A login whose address is cleared from every company is waiting for deletion (within 30 days). Keep the old version readable until the last such login is gone.
4. Remove the old version.

## Verify

- Every login with a membership carries a hash under the new version.
- Signing in by email address works on a test login.

## If it stops halfway

Start again: a login already under the new version is skipped. Keep the old version until step 3 is done.
