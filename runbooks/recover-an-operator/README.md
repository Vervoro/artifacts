# Runbook: Recover an operator's access

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-013](../../sign-in/), rules in [SPEC 10](../../sign-in/spec/#10-operators) |
| **Who runs it** | The other operator account: the operator resets Vervoro's owner, and Vervoro's owner resets the operator. Nobody resets their own |
| **Role or credential** | The resetter's own operator console session, with a fresh check; or the locked-out person's offline hardware key |

Operators have passkeys only: two on two managed laptops and a third on a hardware security key kept offline. They have no password, so no authenticator or backup codes.

## Steps

1. If one laptop's passkey is lost, sign in with the other laptop and remove the lost one.
2. If both laptops' passkeys are lost, sign in with the offline hardware key. Using it alerts.
3. If none is left, the other operator account resets this one, after a fresh check: the sign-in Worker removes every method and session of the account through Better Auth and gives a one-time link.
4. Set up two new passkeys on two managed laptops and a new offline hardware key, kept in a separate place.

## Verify

- The security log holds the reset or the offline key's use, and the alert fired.
- The account has two laptop passkeys and one hardware key, and no other method.

## If it stops halfway

The account stays locked; nothing else changes. Start again from the step reached.
