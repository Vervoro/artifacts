# Runbook: Recover an operator's access

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 9](../../sign-in/spec/#9-operators) |
| **Who runs it** | The other operator account: the operator resets Vervoro's owner, and Vervoro's owner resets the operator. Nobody resets their own |
| **Role or credential** | The resetter's own operator console session, with a fresh check; or the locked-out person's offline recovery code |

## Steps

1. If one passkey is lost, sign in with the second, on the other managed laptop, and remove the lost one.
2. If both are lost, use an offline recovery code. Using it alerts.
3. If neither is left, the other operator account resets this one, after a fresh check.
4. Set up two new passkeys on two managed laptops, and store new recovery codes offline, in a separate place.

## Verify

- The security log holds the reset or the recovery code's use, and the alert fired.
- The account has two passkeys on two devices.

## If it stops halfway

The account stays locked; nothing else changes. Start again from the step reached.
