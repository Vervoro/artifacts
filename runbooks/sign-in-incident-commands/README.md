# Runbook: Sign-in incident commands

| | |
| --- | --- |
| **Built** | At launch, each rehearsed once on a staging copy |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 10](../../sign-in/spec/#10-incident-commands) |
| **Who runs it** | The operator, as the incident point of contact; Vervoro's owner as deputy ([ADR-009](../../buyer-data/)) |
| **Role or credential** | The operator console with a fresh check. The commands run in the sign-in Worker over its service binding |

## Steps

1. Write the incident in the incident record ([ADR-009](../../buyer-data/)).
2. Choose the narrowest command that contains it:
   - **Sign everyone out:** of one company, or of the whole platform.
   - **Freeze sign-in:** no new sessions anywhere. Pair it with *sign everyone out* to stop live sessions too.
   - **Force a password change:** every password login sets a new password at its next sign-in.
   - **Rotate the sign-in key:** see [Rotate the sign-in key](../rotate-the-sign-in-key/).
3. Run it from the console.
4. When the cause is removed, unfreeze sign-in.

A login's history is a query on the platform security log, by login id.

## Verify

- The platform security log holds the command, who ran it and when.
- After *sign everyone out*, a request with an old session is refused. After *freeze*, a new sign-in is refused.

## If it stops halfway

Each command is one statement and is safe to run again. Run it again and check the log.
