# ADR-004 SPEC: Channel connectors

| | |
| --- | --- |
| **Decision** | [ADR-004: Channel connectors](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-004-channel-connectors) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-004 from: the Channels module, switchable per company and needing Listings and Orders, and the connector modules, each switchable and needing Channels ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). What each marketplace adds is in its own record: [ADR-004.1 eBay](../../ebay-connector/spec/), [ADR-004.2 Amazon Seller](../../amazon-seller-connector/spec/), [ADR-004.3 Shopify](../../shopify-connector/spec/). Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| Shopify connector ([ADR-004.3](../../shopify-connector/)) | A seller needs Shopify (owner ruling, 21 October 2026) | Its own SPEC |
| Amazon Vendor connector (purchase orders, carton shipments) | ADR-004.4 is written | None here |
| Other marketplaces | A record of their own; one that sends no order notices also needs a decision of its own | [12](#12-switching-on-and-off) |
| Batch write capability on Amazon (listings feeds for raises) | Single patches fall short ([ADR-004.2](../../amazon-seller-connector/spec/)) | [1](#1-the-connector-contract) |
| Counting per-application per-second ceilings centrally | A marketplace throttles Vervoro's application as a whole | [6](#6-rate-limits-per-account) |

## 1. The connector contract

1. **A connector is built per account by a factory** that gets the account's HTTP binding, a clock and the account's non-secret settings. Every call returns a typed `Result`.

| Call | Does | Returns |
| --- | --- | --- |
| Read orders | Orders changed in a window, a page at a time; or one order by id | A page, a cursor, and the time up to which the window is complete; for one order, the order or "not visible yet" |
| Read listings | Every listing, a page at a time; or one by SKU | SKU, the marketplace's id, the figure shown now, who ships it |
| Write stock | Sets one listing's figure | One outcome ([5](#5-retries-and-outcomes)), and a submission id where processing is later |
| Read back | What a listing shows now, or what became of a submission | The figure, or the submission's final outcome |
| Parse a notice | Reads a checked notice body; makes no call | Orders seen, order changed, listing changed, or ignored |

2. **Contract types only.** An order carries its marketplace id, lines (SKU, quantity, line id), status, last change time and who ships it. Buyer details ride on the order to Orders and Buyer data and are not kept by Channels. A value the marketplace withheld or masked is left out, never made up.
3. **Optional capabilities are declared, never discovered:** compare-and-set, batch write, dispatch notice, approval connect, account setup choices. The host calls only what is declared. A later record adds a capability as a typed addition, so connectors that do not declare it need no change.
4. **What a connector cannot do,** enforced by the build: call the network (a lint bans every network global in connector code, with a test that it fires); see a credential (the binding adds it after the request is built); send a write outside the gate (each request names its operation, and the binding refuses a write operation that did not come from the gate); read the clock or a database.

## 2. What a connector declares

Each connector module contributes one definition to Channels' connector extension point, under its marketplace's key.

| The connector declares | The host does |
| --- | --- |
| The factory | Builds one connector per account over that account's binding |
| Credential and settings schemas | Validates them on connect and seals the credentials |
| Its authentication kind (refresh token, signed request, basic, client credentials) | Runs it, refreshes tokens, signs requests |
| The API and token addresses | Sends only there; refreshes only at the token address |
| A rate budget per operation, from published limits | Keeps a bucket per account and operation |
| Which operations change the marketplace | Lets only the egress gate send them |
| Which shared pool each operation draws from, and its daily size | Counts the pool across the platform |
| How a notice is checked, and which field names the account | Checks before any database read; finds the company |
| Its notice topics, and which the host handles (approval revoked, privacy requests) | Disconnects, or records the privacy request with its due date |
| Connect and disconnect hooks (notice subscriptions) | Runs them as set-up calls, in shadow too; retries and alerts on failure |
| The setting that holds the marketplace's account id | Claims it in control's external directory, for one company at a time |
| When the approval expires, and which app secrets rotate how often | Warns the seller before the approval ends, and the operator before a secret is due |
| The completeness check's interval and the soonest an early one may follow | Schedules the check ([9](#9-the-completeness-check)) |

## 3. Credentials and approval

1. **Sealed at rest** under the company's data key ([ADR-001 SPEC 10](../../database-architecture/spec/#10-company-lifecycle), Encryption), opened only inside the HTTP binding. No handler, screen or connector sees an opened credential.
2. **Approval by the marketplace's own flow** where it offers one. The host builds the approval address, signs a single-use state, checks the redirect, exchanges the code and seals the reply. The address is checked against the marketplace's declared consent pages.
3. **One company per marketplace account.** The marketplace's account id is claimed in the external directory; a second company connecting the same account is refused.
4. **Refresh under a lock** on the account's credentials, so two workers never spend one refresh token. A rotated refresh token is sealed in the same step, before it is used.
5. **Expiry comes from the marketplace's reply** for both access and refresh tokens. Where the marketplace gives none, the connector's record says how it is worked out. The seller is warned 30 days before an approval ends.
6. **A refused approval stops the account, not the platform.** Its work stops, the seller is asked to reconnect, and no retry burns calls meanwhile.

## 4. HTTP

1. **One binding per account and job.** It adds the base address, authentication and settings, nothing else. Production refuses a simulator address ([ADR-000 SPEC 9](../../system-architecture/spec/#9-simulators)).
2. **Every call has a timeout and a size cap,** and none runs inside a database transaction ([ADR-000 SPEC 10](../../system-architecture/spec/#10-runtime)).
3. **Every call is a telemetry line** with the account, operation and job (order fetch, completeness check, listing read, stock write, read back), rolled up by hour into control's usage rollups. The operator sees what each job spends; the seller sees their own account's calls.

## 5. Retries and outcomes

This section owns the unknown-write rule; other records link here.

| Outcome | Meaning | The host next |
| --- | --- | --- |
| `applied` | The marketplace shows the new figure | Records it as confirmed |
| `accepted` | Taken, processed later | Reads back after the marketplace's delay; not applied until then |
| `throttled` | Refused for now, by the marketplace or our own bucket | Waits as told, then tries again |
| `compare_mismatch` | The marketplace's figure was not the one expected | Reads back, then decides again |
| `rejected` | Refused for a reason waiting will not fix | Stops, and tells the seller why |
| `unknown` | No clear answer, a timeout included | Settled by rule 2 before anything else is sent |

1. **The connector maps every reply** of its marketplace onto one outcome, with a test per mapping.
2. **An unknown write is settled before anything else is sent to that listing.** Reading back is the default: the host asks what the marketplace shows now and decides from that. A connector may instead resend the same absolute figure only when the write sets a value and never adds to one, repeating it cannot compound, and its record names the exception. At launch the one exception is eBay's Trading API ([ADR-004.1 SPEC 4](../../ebay-connector/spec/#4-listings-and-stock)). When the figure is sent is [ADR-008 SPEC 6](../../inventory-sync/spec/#6-confirming-every-write).
3. **Repeats are safe** because every write carries the gate's idempotency key ([ADR-000 SPEC 7](../../system-architecture/spec/#7-the-egress-gate)).
4. **Reads are retried** by the host with growing delays, within the job's deadline.
5. **The marketplace's wait is honoured.** A 429, or any reply naming a wait, holds that operation for the account until then, whichever job asks next. The wait is capped at one hour; a longer one alerts the operator.

## 6. Rate limits per account

1. **A bucket per account and operation,** sized from the declared limit. A call our own bucket refuses is `throttled` and never leaves.
2. **Live figures win:** where the marketplace reports the account's real limit in a reply, it replaces the declared one.
3. **Per-application per-second ceilings are not counted centrally.** Each seller's bucket keeps Vervoro far below them; if the marketplace throttles the application as a whole, the call waits like any throttle and the operator is alerted.

## 7. Shared daily pools

1. **One counter per pool, for the whole platform,** in control ([ADR-001 SPEC 7](../../database-architecture/spec/#7-control-database-and-routing)). Each call takes one in a single statement that refuses once the day is spent, so the count is exact and the pool never overruns.
2. **Two lanes.** The safety lane carries the calls that protect a seller: a decrease, or any figure near zero. The bulk lane carries the rest.
3. **The reserve** is a tenth of the pool, split equally among the accounts using it, with no fixed floor. Once the day's count reaches the pool less the reserve, the bulk lane pauses for everyone until the reset. The safety lane goes on until the account's share is spent, never past the pool.
4. **The pool caps how many accounts it serves.** When an account's share would fall below 50 calls a day, the operator is alerted and a new account that needs the pool waits in shadow until the pool is raised.
5. **Within an account,** queued work is claimed safety writes first, then order fetches, then the rest, oldest first. Who goes next across listings is [ADR-008 SPEC 8](../../inventory-sync/spec/#8-limits-and-who-goes-next).
6. **A paused pool holds only its own calls;** other APIs of the marketplace go on.
7. **The operator is alerted at 90 %** of a pool's day, never the seller. The pool's size is a platform setting, changed without code when the marketplace raises it.

## 8. Notices in

Orders arrive by notice; the scheduled read is only the backup ([9](#9-the-completeness-check)).

1. **Two ways in.** Direct: the marketplace calls Vervoro's address and signs the request (eBay, Shopify). Through the bridge: Amazon delivers only into AWS, and a small bridge in an EU region posts each notice to the same endpoint with a shared secret ([ADR-000 SPEC 8](../../system-architecture/spec/#8-connectors-and-orders-in)).
2. **Check before any database read:** the marketplace's signature, or the bridge's secret (current or previous, compared in constant time). A request that fails is refused.
3. **Find the account** by the marketplace's id in the external directory. A notice for no held account, an account that is off, or a connector off for that company is answered and kept nowhere.
4. **Queue ids only:** the topic, the notice id, the account and the order ids, never the body. Queues are in the EU jurisdiction.
5. **Answer only after the message is on the queue.** A failed enqueue answers with an error, so the marketplace sends again.
6. **The consumer fetches, then imports.** It has the connector parse the message and fetches each order seen, one call, and hands it to Orders. An order not visible yet is fetched again after 30 seconds, doubling, for about half an hour, then left to the completeness check. A failed delivery goes to the dead-letter queue, which pages the operator ([ADR-000 SPEC 8](../../system-architecture/spec/#8-connectors-and-orders-in)).
7. **A notice is a hint.** Vervoro imports what it fetches, never the notice body, and a notice never moves the watermark.
8. **Subscriptions are made on connect** by the connector's hook and removed on disconnect. A failing hook is retried and alerts. An account with no working subscription shows as "not notified".
9. **The host handles some topics itself.** Approval revoked disconnects the account. A privacy request is recorded with its due date, and Buyer data opens the company's privacy request ([ADR-009 SPEC 10](../../buyer-data/spec/#10-buyers-requests)).

## 9. The completeness check

1. **It reads the orders changed since the watermark,** with a small overlap, and is the only thing that moves the watermark, and only after a complete window ([ADR-007 SPEC 2.3](../../order-ingestion/spec/#2-how-an-order-comes-in)).
2. **The interval is per marketplace,** by whether the order limit is shared: hourly where it is (eBay), every 10 minutes where it is per seller (Amazon, Shopify). The operator can change it per connector without code.
3. **Any complete read resets the timer,** including one a raise asks for.
4. **Broken notices are read every 10 minutes:** an account whose subscription is failing, or whose read finds an order no notice announced, until its notices work again. The operator is alerted.
5. **On demand:** after an outage, and before a raise is sent unless a complete read already covers the moment it became due. Decreases never wait. How long a raise may wait is [ADR-008 SPEC 5](../../inventory-sync/spec/#5-the-order-read-before-a-raise).
6. **The operator can switch the schedule off** per connector. On-demand reads still run, and the operator's screen says a lost notice on a quiet account is then found only by such a read.

## 10. What is measured

Every account, in shadow and live, records for each order: when the marketplace says it was placed, when its notice arrived (or none), and when it was imported and reserved. From these, per marketplace:

1. **Notice miss rate:** orders the completeness check found with no notice before it, over all orders.
2. **Detection delay:** from the order's placed time to its import, as a 99th percentile.
3. **Unreserved-order exposure:** orders that waited unreserved while their product's sellable stock was within the near-zero zone ([ADR-008 SPEC 3](../../inventory-sync/spec/#3-when-a-figure-is-sent)), and for how long.

The operator sees all three per marketplace and per account.

## 11. Shadow mode and launch gates

This section owns shadow mode; other records link here.

1. **Every account starts in shadow.** Orders come in, listings are read, stock is reserved inside Vervoro, and the gate records each figure it would have sent without sending it.
2. **The shadow check** compares, listing by listing, what Vervoro would send with what the marketplace shows. The seller goes live once every difference is explained and acknowledged ([ADR-008 SPEC 14](../../inventory-sync/spec/#14-shadow-and-going-live)).
3. **The stop choice.** Stopping a live account always asks: leave the figures, or send zero and wait until every zero is confirmed. It is first asked at going live, and kept. A company closed for non-payment carries it out on its closing date; its accounts are then decrease-only until erasure, when they are disconnected ([ADR-012](../../billing-and-plans/)).
4. **Reconnecting** after a disconnect, or a restore, starts a new shadow period.
5. **Launch gates.** No account on a marketplace goes live until shadow on that marketplace has run at least 14 days and 500 orders across its accounts, and passes every gate. The figures are proposals waiting for the owner.

| Gate | Passes when (proposal) |
| --- | --- |
| Notice miss rate | At most 0.5 % |
| Detection delay, 99th percentile | At most 5 minutes |
| Unreserved-order exposure | No order waited unreserved more than 15 minutes while its product was near zero |

6. **A failed gate** first shortens that marketplace's scheduled read (within its order allowance; [ADR-004.1 SPEC 3](../../ebay-connector/spec/#3-orders) gives eBay's room) and is measured again for 7 days. If it still fails, live stock sync stays off for that marketplace: its accounts stay in shadow, orders are still imported and reserved, and no figure is sent. Procedure: [Check a marketplace's launch gates](../../runbooks/check-a-marketplaces-launch-gates/).
7. **After launch** the measurements go on; a marketplace whose miss rate or delay passes its gate figure for a day alerts the operator.

## 12. Switching on and off

1. **No marketplace is named in the core.** Notice addresses carry the marketplace's key; a key no module contributes is refused from the module registry. Removing a connector module removes the marketplace, after its accounts are stopped.

| Level | Who | What off means |
| --- | --- | --- |
| Platform | The operator | Not offered to new companies. The operator's hold on a marketplace keeps every send waiting as Stock sync's rows; the latest figure goes when released ([runbook](../../runbooks/handle-a-marketplace-outage/)) |
| Company | The plan, and its Owner or an Admin ([ADR-010](../../users-and-access/)) | No reads, no writes, notices dropped. Refused while a live account has no stop choice |
| Account | The seller | The mode: shadow, live, paused, decrease-only or disconnected. Disconnected forgets the credentials |

2. **A connector that is off costs nothing:** its accounts have no work due, so the sweeper never visits them ([ADR-001 SPEC 9](../../database-architecture/spec/#9-background-work-and-the-outbox)).

## 13. Keeping failures apart

1. **Work is keyed per company, account and job;** one job per key runs at a time. A shared pool has a key of its own.
2. **Claims are leases.** A stuck job costs one lease period, and its result is written only if the claim is still its own.
3. **A connector's mistake fails one call.** An unexpected error in connector code becomes a typed failure for that call at the binding, logged with the account and operation.
4. **Connector output is checked** against the contract types before Orders or Listings see it. One that fails is held with its reason for a person, never dropped or guessed.
5. **Sustained failure is visible.** An account that keeps failing shows as unhealthy to its seller, with the reason. When many accounts on one marketplace fail at once, the operator gets one marketplace incident alert, not one per seller.

## 14. Simulators and recorded replies

1. **Every marketplace has a simulator** ([ADR-000 SPEC 9](../../system-architecture/spec/#9-simulators)), trimmed to the calls the launch connectors (eBay, Amazon Seller) make, and Shopify's when it is built: nothing a connector does not call is simulated.
2. **One contract suite** runs every connector against its simulator: orders across pages with a cursor that survives a throttle; one order, including "not visible yet"; every listing and one listing; every write reply mapped to one outcome, including a timeout that applied the change; read back of an accepted change, and a compare-mismatch where declared; every notice topic, including duplicates, late and out-of-order ones; a marketplace's wait honoured; a write that did not come through the gate refused. A new connector starts from the suite.
3. **Recorded real replies.** Before launch every call the launch connectors make is made once against the sandbox or a real account, the reply is recorded, and the simulator is fixed where it differs. Tests replay the recordings against the simulator. Each simulator lists where it is simpler than the real service. Tests never call a sandbox.

## 15. Storage

Channels' tables carry the `chan_` prefix, are declared through `tenantTable()` and queried through the typed query builder ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)); modules write no SQL.

| Where | Holds |
| --- | --- |
| `chan_account` | Marketplace key, the marketplace's account id, mode, stop choice, setup choices, approval expiry, notified state, health |
| `chan_order_read` | Per account: the watermark, the last complete read, the next one due, whether notices look broken |
| `chan_wait` | Per account and operation: the marketplace's wait and the bucket |
| `chan_privacy_request` | Privacy requests from marketplaces, with their due dates |
| `chan_order_timing` | Per order: placed, notice and import times, for [10](#10-what-is-measured) |
| Kernel `secrets` | Sealed credentials, purpose per account |
| Control | External directory, shared pool counters, usage rollups, per-connector platform settings |

## 16. Constraints

| Constraint | Figure | Source |
| --- | --- | --- |
| eBay Trading API, per application | 5,000 calls a day by default; raised by the Growth Check | [API call limits](https://developer.ebay.com/develop/api/sell/api_call_limits), checked 17 October 2026 |
| Amazon notices | Order changes to an SQS queue only; listing changes to EventBridge only | [Notification type values](https://developer-docs.amazon/sp-api/docs/notification-type-values), checked 17 October 2026 |
| Amazon per-application ceiling | 500 listing updates a second, above 5 per seller | [Listings Items API rate limits](https://developer-docs.amazon/sp-api/docs/listings-items-api-rate-limits), checked 17 October 2026 |
| Shopify webhooks | Five seconds to answer; up to eight retries over four hours | [Troubleshooting webhooks](https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks), checked 17 October 2026 |

Each marketplace's other limits are in its connector's SPEC.

## 17. Tests that prove each rule

Pure mappings run as unit tests; pools, leases and the queue path on real Postgres; marketplace behaviour on the simulators ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)).

| Test | Proves |
| --- | --- |
| No network | The lint fires on a network global in connector code |
| No credential | A connector's request never contains an opened secret; the binding adds it |
| Gate only | The binding refuses a write operation not sent by the gate |
| Outcomes | Every recorded reply maps to one outcome; a timeout that applied is `unknown` and settled by read-back (or the named resend) before the next write |
| Wait | A 429 with a wait holds every job on that operation for the account; over an hour alerts |
| Pool | Under parallel calls the counter never passes the pool; at pool less reserve, bulk pauses and safety goes on to each account's share |
| Pool cap | An account whose share would fall below 50 cannot go live |
| Notice check | A bad signature or secret is refused before any database read; a notice for an unheld account is answered and kept nowhere |
| Ids only | No queue message carries a notice body or buyer field |
| Enqueue | A failed enqueue answers with an error |
| Watermark | Only a complete read moves it; a notice never does |
| Broken notices | An order found with no notice switches the account to 10-minute reads and alerts |
| Shadow | A new account subscribes to notices and sends no figure |
| Gates | A marketplace that fails a gate cannot take an account live |
| Isolation | A throttled or failing account delays no other account's jobs |
| Refresh | Two workers refreshing at once spend one refresh token; the new one is sealed before use |
| Contract suite | Every connector passes it on its simulator |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Translators only:** connector modules import no network, database or clock; the lint test is green.
- [ ] **Credentials:** opened only inside the binding; no log line, queue message or screen holds one.
- [ ] **Gate:** write operations reach the binding only from the gate; the mode is read from the database on each send.
- [ ] **Unknown:** one settle step runs before any other write to that target; the resend path exists only where a connector's record names it.
- [ ] **Expiry:** token lifetimes come from the reply; no fixed lifetime in host code.
- [ ] **Pools:** the counter is one statement in control; no block claims; the reserve and the 50-call alert are platform settings.
- [ ] **Notices:** checked before any database read; the queue message holds ids only; answer after enqueue.
- [ ] **Completeness check:** only it moves the watermark; intervals are per connector settings; broken notices drop to 10 minutes.
- [ ] **Gates:** the three measurements are recorded per order, and going live checks the marketplace's gates.
- [ ] **No SQL:** every query uses the typed query builder; tables carry `chan_`.
- [ ] **Core:** no marketplace name in the kernel, the core modules, the gate or the screens.
- [ ] **Simulators:** only calls a connector makes are simulated; recordings replay in tests; production refuses a simulator address.
- [ ] **Later parts:** no Shopify or Vendor connector, no Amazon feed path, no central per-second counter at launch.
