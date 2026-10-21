# Runbook: Rotate the Better Auth secret

| | |
| --- | --- |
| **Built** | At launch, rehearsed once on a staging copy |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 9](../../sign-in/spec/#9-secrets) |
| **Who runs it** | The operator: once a year ([ADR-009](../../buyer-data/)), and at once when the sign-in Worker or its secret may be compromised |
| **Role or credential** | The sign-in Worker's own deploy token, to change its secret. Better Auth's versioned secrets (`BETTER_AUTH_SECRETS`) do the rest |

Better Auth signs session cookies with the current version and encrypts authenticator secrets and backup codes with a version it records on each value. Older versions stay listed only to decrypt.

## Steps

1. Generate a new secret of at least 32 random characters (`auth secret` from Better Auth's command line).
2. Put it first in the sign-in Worker's `BETTER_AUTH_SECRETS`, under the next version number, and keep every older version after it. Deploy the sign-in Worker.
3. Every session ends, because cookies signed with the old version no longer verify. People sign in again with a passkey, or a password and code; nothing they hold changes.
4. **On a suspected compromise only:** also force every person with an authenticator app to set it up again, since a leaked secret with a copy of the database reveals their secrets. Use *force a password change* if passwords may have leaked too ([incident commands](../sign-in-incident-commands/)).
5. Remove an old version only when the sign-in Worker's read-only check reports no stored value under it. Values move to the new version when Better Auth next writes them, and an authenticator secret moves only when it is set up again, so a yearly rotation usually keeps the previous version listed.

## Verify

- A passkey sign-in, and a password sign-in with an authenticator code, work on a test login.
- A request with a cookie from before the rotation is refused.
- The platform security log holds the rotation, who ran it and when.

## If it stops halfway

If the deploy in step 2 fails, the previous version stays live with the old list: run step 2 again. Never remove a version while any stored value still carries it: those authenticators and backup codes would stop working.
