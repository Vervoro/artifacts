# Runbook: Recover a company's last Owner

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 6](../../sign-in/spec/#6-recovery) |
| **Who runs it** | The operator, with no room for judgement; Vervoro's owner decides an objection or any other case |
| **Role or credential** | The operator console with a fresh check. The marketplace step runs in the app; the wait and the new methods run in the sign-in Worker, through Better Auth's API |

Use it only for a company's last Owner who has lost every sign-in method and every backup code. Anyone else is recovered by their company.

## Steps

1. Send the recovery link to the Owner's email address as held in the company's users table.
2. The Owner approves Vervoro again on one of the company's connected marketplace accounts. It must return the seller account the company already holds in the external directory. The approval's tokens are discarded at once; the live connection is not touched.
3. The 72-hour wait starts in the sign-in Worker. Every member of the company is told by email.
4. If an Owner or Admin objects, stop and pass it to Vervoro's owner.
5. After 72 hours, the sign-in Worker removes every old method and session of that login through Better Auth, and the Owner sets up new methods from a one-time link, a passkey first.

A company with no connected marketplace is a trial: the person signs up again. Any other case goes to Vervoro's owner, decided on documents.

## Verify

- The person and the company's Owners and Admins were told.
- The login has only its new methods, and no session from before.
- Both audit trails hold the recovery.

## If it stops halfway

Any sign-in by that login during the wait cancels the recovery: start again from step 1 only if the Owner asks again. A marketplace step that returns another seller account ends it. If step 5 stops, run it again: removing a method already gone changes nothing.
