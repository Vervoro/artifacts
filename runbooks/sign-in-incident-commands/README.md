# Runbook: Sign-in incident commands

| | |
| --- | --- |
| **Built** | At launch, each rehearsed once on a staging copy |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 11](../../sign-in/spec/#11-incident-commands) |
| **Who runs it** | The operator, as the incident point of contact; Vervoro's owner as deputy ([ADR-009](../../buyer-data/spec/#13-incidents)) |
| **Role or credential** | The operator console with a fresh check. The commands run in the sign-in Worker over its service binding, through Better Auth's API and the sign-in policy tables; never SQL against Better Auth's tables |

## Steps

1. Write the incident in the incident record ([Report a personal-data breach](../report-a-personal-data-breach/)).
2. Choose the narrowest command that contains it:

| Command | What it does | Effect |
| --- | --- | --- |
| **Sign everyone out** | Better Auth revokes every session of the logins named: one person, a company's members (the app names them), or every login | Sessions end. Passkeys, passwords and authenticators are unchanged |
| **Freeze sign-in** | Sets the freeze flag; the sign-in Worker refuses every sign-in, sign-up and reset | No new sessions. Live sessions continue: pair it with *sign everyone out* to stop them too |
| **Force a password change** | Sets a cut-off time; any password set before it leaves only a setup-only session until changed | Applies at each person's next sign-in. Passkeys and authenticators are unchanged |
| **Rotate the Better Auth secret** | See [Rotate the Better Auth secret](../rotate-the-better-auth-secret/) | Every session ends |

3. Run it from the console.
4. When the cause is removed, clear the freeze flag (unfreeze sign-in). Clearing the password cut-off is never needed: it applies only to passwords set before it.

A login's history is a query on the platform security log, by login id.

## Verify

- The platform security log holds the command, who ran it and when.
- After *sign everyone out*, a request with an old session is refused. After *freeze*, a new sign-in is refused. After *force a password change*, a test login with an old password reaches only the change-password page.

## If it stops halfway

Each command is safe to run again: revoking an ended session or setting a flag twice changes nothing. Run it again and check the log.
