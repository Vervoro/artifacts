# Runbook: Control database unreachable

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-001](../../database-architecture/), rules in [SPEC 7](../../database-architecture/spec/#7-control-database-and-routing) |
| **Who runs it** | The operator, when control has been unreachable for 5 minutes and the page fires |
| **Role or credential** | The database provider's console and the Cloudflare dashboard. The operator console needs sign-in, which needs control, so it is not available until control answers |

While control is down, nobody can sign in, and no send goes to a marketplace, decreases included. Jobs wait and retry, and inbound notices wait in the queue. This procedure confirms the cause, leaves the waiting alone, and checks recovery. It covers control being unreachable, not control's data being lost.

## Steps

1. **Confirm it is control.** Sign-in fails for every company while the cells answer their own health checks. If one cell is down instead, this is not the procedure.
2. **Check for a deploy.** If a deploy or a migration on control has just run, follow [Deploy and roll back](../deploy-and-roll-back/): roll the Workers back, and never roll back a migration.
3. **Check the database provider's status page** and control's compute in its console. If the provider has an incident, wait for it to clear, and note the start time and the cause.
4. **Do not work around control.** Do not send figures by hand, take any session (beyond the session pass), pool count or epoch from a cache, or point the Workers at another database ([SPEC 7](../../database-architecture/spec/#7-control-database-and-routing), "When control is unreachable", rule 3).
5. **When control answers,** jobs resume on their own. Check that sign-in works first.
6. **Notices:** any that reached the dead-letter queue are replayed through [Replay dead letters](../replay-dead-letters/).
7. **Orders:** ask for an on-demand completeness check on every account, as in [Handle a marketplace outage](../handle-a-marketplace-outage/), step 6. An account still behind after its normal interval goes to [Order ingestion stalled](../order-ingestion-stalled/).
8. **Sends:** `unknown` writes are settled before any new send, as on release from a marketplace outage ([Handle a marketplace outage](../handle-a-marketplace-outage/), step 7). Do nothing by hand.

## Verify

- Sign-in works, and the control page has cleared.
- Every account's order watermark is within its normal interval of now.
- The dead-letter queue is empty.
- No `unknown` write is left unsettled, and the send log shows decreases first.

## If it stops halfway

Every step is safe to repeat. If control drops again during recovery, start again from step 1; the jobs that already finished are not redone. If control's data is lost or corrupt rather than unreachable, stop: this procedure does not cover a restore of control.
