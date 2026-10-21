# Runbook: Contain a poisoned package

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 8](../../sign-in/spec/#8-the-sign-in-worker), [SPEC 11](../../sign-in/spec/#11-incident-commands) and [SPEC 13](../../sign-in/spec/#13-upgrades-and-migrations) |
| **Who runs it** | The operator, when a dependency of the app or the sign-in Worker, Better Auth and its plugins included, is found compromised |
| **Role or credential** | The operator console for the incident commands; each Worker's deploy token; the CI migration job for database credentials ([ADR-001 SPEC 3](../../database-architecture/spec/#3-roles)) |

## Steps

**In the app Worker:**

1. Deploy the app without the package, or with its last good version ([Deploy and roll back](../deploy-and-roll-back/)).
2. Sign everyone out ([incident commands](../sign-in-incident-commands/)).
3. Rotate the app's own secrets and the cells' credentials.
4. Follow ADR-009's incident steps, including who is told and when ([ADR-009](../../buyer-data/)).

**In the sign-in Worker** (Better Auth, its plugins or their dependencies), all of the above, and also:

5. Freeze sign-in until the clean version is live.
6. Deploy the sign-in Worker with the last good, exact-pinned version. If the bad version shipped a schema change, leave the schema: schema changes expand before they contract, so the previous version runs on it ([ADR-000 SPEC 11](../../system-architecture/spec/#11-deploying)).
7. Rotate the Better Auth secret ([runbook](../rotate-the-better-auth-secret/)), with its compromise step: every person with an authenticator app sets it up again.
8. Rotate the sign-in role's database credential and the Turnstile secret. Sign-in mail uses a binding, with no credential to rotate.
9. Force a password change.
10. Unfreeze sign-in. Passkeys stay: Vervoro holds only their public keys.

## Verify

- The package's bad version is gone from both deployed lockfiles.
- Old sessions are refused; the security log holds every command.
- The sign-in tests pass against the deployed sign-in Worker.

## If it stops halfway

Each step can be run again. Carry on from the first step not done; keep sign-in frozen until step 9 is done.
