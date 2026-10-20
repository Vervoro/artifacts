# Runbook: Contain a poisoned package

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 6](../../sign-in/spec/#6-the-sign-in-worker) and [SPEC 10](../../sign-in/spec/#10-incident-commands) |
| **Who runs it** | The operator, when a dependency of the app or the sign-in Worker is found compromised |
| **Role or credential** | The operator console for the incident commands; each Worker's deploy token; the CI migration job for database credentials ([ADR-001 SPEC 3](../../database-architecture/spec/#3-roles)) |

## Steps

**In the app Worker:**

1. Deploy the app without the package ([Deploy and roll back](../deploy-and-roll-back/)).
2. Sign everyone out ([incident commands](../sign-in-incident-commands/)).
3. Rotate the app's own secrets and the cells' credentials.
4. Follow ADR-009's incident steps, including who is told and when ([ADR-009](../../buyer-data/)).

**In the sign-in Worker,** all of the above, and also:

5. Rotate the sign-in key ([runbook](../rotate-the-sign-in-key/)).
6. Rotate the email-hash key ([runbook](../rotate-the-email-hash-key/)).
7. Force a password change.
8. Ask every person who uses an authenticator app to set it up again. Passkeys stay: Vervoro holds only their public keys.

## Verify

- The package is gone from the deployed lockfile.
- Old sessions are refused; the security log holds every command.
- No sealed value carries the old sign-in key's version.

## If it stops halfway

Each step can be run again. Carry on from the first step not done.
