# Runbook: Handle a marketplace outage

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-004](../../channel-connectors/), rules in [SPEC 12](../../channel-connectors/spec/#12-switching-on-and-off) and [SPEC 13](../../channel-connectors/spec/#13-keeping-failures-apart); recovery in [ADR-008 SPEC 15](../../inventory-sync/spec/#15-recovery) |
| **Who runs it** | The operator, when a marketplace incident alert pages, or the marketplace announces trouble |
| **Role or credential** | The operator console |

Calls already back off on their own. This procedure is for an outage long enough, or strange enough, that figures should stop going out.

## Steps

1. Confirm it is the marketplace: many accounts on one marketplace failing together, and its own status page if it has one. If it is one account, treat it as that account's problem instead.
2. Decide whether to hold sends. Hold when the marketplace is accepting writes but answering wrongly, or when it says to stop. Otherwise let back-off run.
3. To hold, set the platform hold on that marketplace with a reason. Figures wait as Stock sync's rows; nothing is queued to replay.
4. Tell sellers in the app that the marketplace has an incident and figures are waiting. Do not send the per-listing email; it is suppressed during an incident.
5. Watch the dead-letter queue. Notices that failed while the marketplace or Vervoro was down go to [Replay dead letters](../replay-dead-letters/) once the cause is fixed.
6. When the marketplace recovers, ask for an on-demand completeness check on its accounts, and wait until each one completes.
7. Release the hold. `unknown` writes are settled first, then the latest figures go in order of urgency.

## Verify

- Each account's watermark is within its normal interval of now.
- No `unknown` write is left unsettled; the send log shows decreases first after release.

## If it stops halfway

A hold that is set stays set until released, so nothing goes out by surprise. If the hold was never set, nothing changed.
