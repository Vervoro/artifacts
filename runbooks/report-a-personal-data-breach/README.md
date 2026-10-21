# Runbook: Report a personal-data breach

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-009](../../buyer-data/), rules in [SPEC 13](../../buyer-data/spec/#13-incidents) |
| **Who runs it** | The operator, as the incident point of contact; Vervoro's owner as deputy. Started by any alert, report or suspicion that personal data was read, changed, lost or sent where it should not be |
| **Role or credential** | The operator console and the incident record. Containment uses the [sign-in incident commands](../sign-in-incident-commands/), key rotation and holding sends to marketplaces |

The clock starts when Vervoro becomes aware, not when the facts are known. Notices go out within 24 hours with what is known, and are followed up.

## Steps

1. **Open the incident record now:** the time Vervoro became aware, the signal, and who is handling it. Every later step is written there.
2. **Contain.** As the case needs: revoke sessions, rotate the key-encryption key or a marketplace secret ([Rotate a marketplace app secret](../rotate-a-marketplace-app-secret/)), hold every send to a marketplace, switch off the affected path. For a compromised dependency follow [Contain a poisoned package](../contain-a-poisoned-package/).
3. **Scope it:** which companies, which marketplaces' data, which fields, how many buyers, and whether the data was encrypted field by field under a key that stayed safe.
4. **Within 24 hours, tell:**
   - each affected seller, as their processor, so they can decide on the regulator's 72 hours;
   - Amazon at security@amazon.com, when Amazon data is involved (Data Protection Policy 1.6.3);
   - eBay, when eBay data is involved;
   - *Later:* Shopify through partner support, when shop data is involved.
5. **Where Vervoro is the controller** (sign-in data, billing, its own logs) and a risk to people is likely, tell the ICO within 72 hours, or the lead EU regulator.
6. Help each seller tell their buyers where the risk is high. Vervoro never speaks for a seller or a marketplace.
7. Remove the cause, recover, and write what happened, its effects, what was done and the lessons.

## Verify

- The record shows the time each notice went, all inside 24 hours (72 for the regulator).
- The alert that started it is cleared, or explained.

## If it stops halfway

Send the notices of step 4 with what is known, even if containment or scoping is unfinished; send updates as facts arrive. A suspicion that turns out to be nothing is still recorded, with why.
