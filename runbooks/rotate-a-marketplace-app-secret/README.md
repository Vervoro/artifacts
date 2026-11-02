# Runbook: Rotate a marketplace app secret

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-004](../../channel-connectors/), rules in [SPEC 2](../../channel-connectors/spec/#2-what-a-connector-declares) and [SPEC 8](../../channel-connectors/spec/#8-notices-in); Amazon in [ADR-004.2 SPEC 1](../../amazon-seller-connector/spec/#1-connecting-and-renewing) and [SPEC 3](../../amazon-seller-connector/spec/#3-notices-and-the-bridge); Shopify in [ADR-004.3 SPEC 1](../../shopify-connector/spec/#1-connecting) |
| **Who runs it** | The operator, when the console says a secret is due, or at once if one may have leaked |
| **Role or credential** | The marketplace's developer account; the platform's secret store |

Sellers' own tokens are refreshed by the host and need no person. These are Vervoro's application secrets.

| Secret | When |
| --- | --- |
| Amazon client secret | Every 180 days; reminded from day 150 |
| Amazon bridge's shared secret | Yearly |
| Shopify app secret | When Shopify asks, or on a leak |
| eBay keyset | On a leak |

## Steps

1. **On a leak** of an Amazon app secret, the bridge's secret or an Amazon seller's token, report the incident to Amazon at security@amazon.com within 24 hours of detecting it, as Amazon's Data Protection Policy 1.6.3 requires (checked 2 November 2026), before or beside the rotation (owner delegation, 2 November 2026).
2. Create the new secret in the marketplace's developer account, or a new random value for the bridge. Do not revoke the old one yet.
3. Add the new value to the platform's secret store as current, keeping the old one as previous. The host accepts both.
4. Deploy, so every Worker reads the new pair.
5. For the bridge, update the API destination's connection to send the new secret.
6. Wait until the marketplace has switched: a token refresh, or a notice checked with the new value, succeeds.
7. Revoke the old secret at the marketplace, then remove the previous value from the store.

## Verify

- Token refreshes and notice checks succeed with only the new value present.
- The console shows the secret's next due date.

## If it stops halfway

Before step 7 both values work, so nothing breaks. If the new value fails, remove it and keep the old one as current.
