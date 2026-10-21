# Runbook: Replay dead letters

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-004](../../channel-connectors/), rules in [SPEC 8](../../channel-connectors/spec/#8-notices-in); the queue in [ADR-000 SPEC 8](../../system-architecture/spec/#8-connectors-and-orders-in) |
| **Who runs it** | The operator, when the dead-letter queue is not empty |
| **Role or credential** | The operator console |

A message lands in the dead-letter queue after its retries run out. It carries ids only, so replaying it fetches the order afresh; imports are idempotent.

## Steps

1. Group the messages by marketplace, topic and error.
2. Find and fix the cause first: a marketplace outage, a broken deploy, a connector error. Replaying into the same fault only refills the queue.
3. For an account that is now off or disconnected, discard its messages; there is nothing to fetch.
4. Replay the rest from the console, oldest first, onto the inbound queue.
5. Ask for an on-demand completeness check on the affected accounts, in case a notice was lost before it was queued.

## Verify

- The dead-letter queue is empty and its alert has cleared.
- The orders the messages named are imported, or recorded as import problems with a reason.

## If it stops halfway

Replay is safe to repeat: a message replayed twice fetches the same order, and the import changes nothing the second time.
