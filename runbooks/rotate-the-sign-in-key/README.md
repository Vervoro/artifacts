# Runbook: Rotate the sign-in key

| | |
| --- | --- |
| **Built** | At launch, rehearsed once on a staging copy |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 8](../../sign-in/spec/#8-keys) |
| **Who runs it** | The operator: when the sign-in Worker may be compromised, and once a year ([ADR-009](../../buyer-data/)) |
| **Role or credential** | The sign-in Worker's own deploy token, to add the secret. The rotation job runs in the sign-in Worker |

## Steps

1. Add the new key version as a secret of the sign-in Worker. Keep the old version.
2. Start the rotation job from the console. New values are sealed under the new version at once.
3. The job seals every stored value again under the new version, in batches. Sign-in keeps working throughout.
4. When the job reports no value under the old version, remove the old version.

## Verify

- No sealed value carries the old version.
- A password sign-in and an authenticator code work on a test login.
- The platform security log holds the rotation.

## If it stops halfway

The job is resumable: start it again and it continues from the last batch. Never remove the old version until the job reports none left.
