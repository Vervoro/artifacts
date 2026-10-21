# Runbook: Set up the Amazon notice bridge

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-004.2](../../amazon-seller-connector/), rules in [SPEC 3](../../amazon-seller-connector/spec/#3-notices-and-the-bridge); the bridge in [ADR-000 SPEC 8](../../system-architecture/spec/#8-connectors-and-orders-in) |
| **Who runs it** | The operator, once per environment |
| **Role or credential** | Vervoro's AWS account; Vervoro's Amazon developer account; the platform's secret store |

Amazon delivers notices only into AWS. The bridge is a queue, a pipe, an event rule and an API destination, with no code, in an EU AWS region.

## Steps

1. In an EU AWS region, create the SQS queue for order and Amazon-held stock notices, with a dead-letter queue and an alarm on it that pages the operator.
2. Allow Amazon's notification service to send to the queue, as Amazon's guide sets out.
3. Generate the bridge's shared secret; store it in the platform's secret store and in an API destination connection. Point the API destination at this environment's notice address.
4. Create a pipe from the queue to the API destination.
5. For listing notices, create the EventBridge rule for Amazon's partner event source that targets the same API destination.
6. Register the queue and the event bus as destinations with Amazon's Notifications API, once per Amazon region served.
7. Connect a test seller account and check that it is subscribed to the order, listing and Amazon-held stock notices.

## Verify

- An order on the test account arrives by notice; a listing edit in Seller Central triggers a read back.
- The bridge's dead-letter queue is empty and its alarm is armed.

## If it stops halfway

Nothing reaches Vervoro until step 6 completes, and sellers are read every 10 minutes meanwhile. Parts already made can stay; finish the remaining steps.
