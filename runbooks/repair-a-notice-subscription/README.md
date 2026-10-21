# Runbook: Repair a notice subscription

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-004](../../channel-connectors/), rules in [SPEC 8](../../channel-connectors/spec/#8-notices-in) and [SPEC 9](../../channel-connectors/spec/#9-the-completeness-check) |
| **Who runs it** | The operator, when an account shows "not notified", or the completeness check finds orders no notice announced |
| **Role or credential** | The operator console; for eBay's destination or Amazon's bridge, the setup credentials in their own runbooks |

While notices look broken the account is read every 10 minutes, so orders still arrive, only later. This procedure brings notices back.

## Steps

1. Find the scope. One account, or every account on the marketplace? Every account points at the shared part: eBay's destination, or Amazon's bridge.
2. **Shared part:** on eBay, check the destination is still active and its challenge passes ([Set up eBay notices](../set-up-ebay-notices/)). On Amazon, check the bridge's dead-letter queue and alarm ([Set up the Amazon notice bridge](../set-up-the-amazon-notice-bridge/)). Fix, then go to step 5.
3. **One account:** read the hook's last error. If the seller's approval was refused, the seller must reconnect; tell them. Otherwise run the account's connect hook again from the console.
4. If the hook fails again with the marketplace's error, record it and raise it with the marketplace's developer support.
5. Ask for an on-demand completeness check, so any order missed meanwhile is imported now.
6. Watch the next orders arrive by notice.

## Verify

- The account no longer shows "not notified", and its reads drop back to the marketplace's normal interval.
- The next orders show a notice time in the measurements.

## If it stops halfway

Running the connect hook again is safe: a subscription already at our destination is kept. The 10-minute reads continue until notices are proved working.
