# Runbook: Open an operator grant

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-010](../../users-and-access/), rules in [SPEC 7](../../users-and-access/spec/#7-operator-access-to-a-company) |
| **Who runs it** | The operator, to look at a company's screens when helping a seller, or to read old records in a restore branch at the seller's request |
| **Role or credential** | The operator console, signed in with a passkey on a managed laptop ([ADR-013 SPEC 10](../../sign-in/spec/#10-operators)). The runtime role, under row-level security |

A repair (rebuilding a balance, re-importing an order, an export, move or restore) needs no grant: run it as its recorded command, which writes its own audit entry.

## Steps

1. Open the grant for one company, with a written reason and an end time no more than 8 hours away.
2. Leave buyer data off. Only the seller's Owner or Admin can switch it on for this grant, for example when they asked you to check an address.
3. Look. The grant is read-only: change nothing, and never act in a seller's user's name.
4. End the grant when done, before its end time if you can.

## Verify

- The company's "Vervoro access" view shows the grant with its reason and end time, and every screen opened.
- Every Owner and Admin got the notice in the app and by email.
- The platform security log holds the grant, and Vervoro's owner was alerted.

## If it stops halfway

Access needs both the audit entry and the grant row in control. If only the audit entry was written, the outbox writes the grant row; nothing is reachable until it does. If the console shows an error, do not open a second grant: end the first, then open again.
