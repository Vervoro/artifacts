# Runbook: Recover a company's last Owner

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 4](../../sign-in/spec/#4-recovery) |
| **Who runs it** | The operator, with no room for judgement; Vervoro's owner decides an objection or any other case |
| **Role or credential** | The operator console with a fresh check. The steps run in the sign-in Worker and the app |

Use it only for a company's last Owner who has lost every sign-in method and every recovery code. Anyone else is recovered by their company.

## Steps

1. Send the recovery link to the Owner's email address as held in the company's users table.
2. The Owner approves Vervoro again on one of the company's connected marketplace accounts. It must return the seller account the company already holds in the external directory. The approval's tokens are discarded at once; the live connection is not touched.
3. The 72-hour wait starts. Every member of the company is told by email.
4. If an Owner or Admin objects, stop and pass it to Vervoro's owner.
5. After 72 hours, the Owner sets up new sign-in methods; every old method and session of that login ends.

A company with no connected marketplace is a trial: the person signs up again. Any other case goes to Vervoro's owner, decided on documents.

## Verify

- The person and the company's Owners and Admins were told.
- Both audit trails hold the recovery.

## If it stops halfway

Any sign-in by that login during the wait cancels the recovery: start again from step 1 only if the Owner asks again. A marketplace step that returns another seller account ends it.
