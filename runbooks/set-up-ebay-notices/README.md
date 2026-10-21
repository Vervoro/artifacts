# Runbook: Set up eBay notices

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-004.1](../../ebay-connector/), rules in [SPEC 2](../../ebay-connector/spec/#2-notices), [SPEC 8](../../ebay-connector/spec/#8-account-deletion-notices) and [SPEC 9](../../ebay-connector/spec/#9-simulator-and-pre-launch-recordings) |
| **Who runs it** | The operator, once per environment, and again if the destination is lost |
| **Role or credential** | Vervoro's eBay developer account and production keyset; the platform's secret store |

eBay posts every seller's order notices to one destination for Vervoro's application. Making it needs the endpoint's verification token, which no connector hook sees.

## Steps

1. Generate a verification token and put it in the platform's secret store. Deploy.
2. Set the application's alert email address in eBay's Notification API, if not already set.
3. Create the destination with Vervoro's notice address for this environment and the verification token. eBay calls the endpoint's challenge; it must answer.
4. Set the same address and token for marketplace account deletion notices.
5. Read `getTopics` with the production keyset. Check that the three order topics are available to Vervoro with the scopes it asks sellers for. Request any restricted topic from eBay before a seller connects.
6. Connect a test seller account and check that it is subscribed to the three topics.

## Verify

- An order placed on the test account arrives by notice, with a notice time in the measurements.
- eBay's destination shows as enabled.

## If it stops halfway

A destination without a passing challenge is not kept by eBay; start again from step 3. Sellers connected before the destination exists show "not notified" and are read every 10 minutes until it does.
