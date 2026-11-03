# ADR-004 SPEC: Channel connectors

| | |
| --- | --- |
| **Decision** | [ADR-004: Channel connectors](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-004-channel-connectors) |
| **Date** | 21 October 2026; amended by owner rulings of 25 October 2026: a shared pool claimed in blocks, Amazon's backup read hourly (9.2), per-order timings kept 30 days after the gates (10, 15); amended by owner delegation, 2 November 2026: marketplace keys as data in core contracts (12.1), the directory's account and active state (8.3), a platform topic's hashed id (8.4), the not-visible retries (8.6), usage rollups (4.3), two modes for Orders and Listings (12), the tables other records give Channels and the account's label (15); the Channels host as built: what a connector declares (2), credentials opened for the binding (3.1), one write out per target (5.2), a wait and a bucket for every job (5.5, 6.1), a crashed job's block, the pool's day and the share floor (7.1, 7.4), what the queue message carries (8.4), a throttled notice fetch (8.6), the seller's own privacy topic (8.9), where a read starts, a long or cut-short window and a watermark behind (9.1, 9.4), an order Orders names (9.5), the measurements per account under a grant (10), resuming and pausing (12), "many accounts" (13.5), the `channels_` prefix, the credential row and two new tables (15, How to check), reading the clock (17), owner delegation, 2 November 2026; the eBay and Amazon connectors as built: two optional capabilities and the lint's reach (1.3, 1.4), what else a connector declares and its marketplace key (2), a write's 401 or 403 (3.6), an accepted write's deadline, the resend and a read-back that cannot see the listing (5.2), the application's throttle (6.3), a write's own pool (7.1), a deletion's subjects (8.3), the contract suite's parts (14.2), owner delegation, 2 November 2026; a key id not held, looked up in control before the signature is checked (2, 8.2, 17, How to check), and a disconnected account's held readings (15), ruled by delegation, 2 November 2026, for the owner's confirmation; phase 5.6's close: a batch found invalid and an account's refusal (1.3), another record's marketplace rule (2), the accepted write's deadline whatever the read-back shows (5.2), the accounts listed on Today (13.5), owner delegation, 2 November 2026; phase 5.7's developer's review: a decrease past an `accepted` write (5.2), near zero for a product (10.3), owner delegation, 2 November 2026; Stock sync's engine as built (phase 5.7, PR 1): a listing-quantity notice's SKU, quantity and time in the queue message (8.4), owner delegation, 2 November 2026; going live as built (phase 5.7, PR 2): a screen names a pool by its name, never its key (2), order timings' daily counts per marketplace and company (10), the window the gates count over (11.5, 11.6), owner delegation, 3 November 2026; the stop question shown with "send 0" chosen (11.3), the passed mark outside production (11.5), ruled by delegation, 3 November 2026, for the owner's confirmation |
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

2. **Contract types only.** An order carries its marketplace id, lines (SKU, quantity, line id), status, last change time, who ships it, whether it is not yet due, and the marketplace's address of the order's page for the seller. Buyer details ride on the order to Orders and Buyer data and are not kept by Channels. Until Vervoro prints shipping labels ([ADR-000 SPEC 4.7](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)), an order carries none of the recipient's name, address lines, postcode or phone, whatever the marketplace sends: only the destination country and tax territory, worked out by the connector, the order note, the gift message and customisation, a business buyer's company name and VAT number, and the marketplace's buyer id for hashing ([ADR-009 SPEC 4](../../buyer-data/spec/#4-what-is-kept), owner ruling, 22 October 2026). A value the marketplace withheld or masked is left out, never made up.
3. **Optional capabilities are declared, never discovered:** compare-and-set, batch write, dispatch notice, approval connect, account setup choices. The host calls only what is declared. A later record adds a capability as a typed addition, so connectors that do not declare it need no change. Optional capabilities include `dispatch-notice` (the dispatch call; its caller is Fulfilment's) and `batch-write` (writes in batches of the declared size; a batch the marketplace finds invalid is resent one at a time; an account's refusal is never resent one by one, [3.6](#3-credentials-and-approval)) (owner delegation, 2 November 2026).
4. **What a connector cannot do,** enforced by the build: call the network (a lint bans every network global in connector code, with a test that it fires); see a credential (the binding adds it after the request is built); send a write outside the gate (each request names its operation, and the binding refuses a write operation that did not come from the gate); read the clock or a database. The lint's clock and database rules apply to a connector's code, not to its own tests (owner delegation, 2 November 2026).

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
| How a notice is checked, and which field names the account | Checks before any company database read; finds the company |
| Its notice topics, and which the host handles (approval revoked, privacy requests) | Disconnects, or records the privacy request with its due date |
| Connect and disconnect hooks (notice subscriptions) | Runs them as set-up calls, in shadow too; retries and alerts on failure |
| The setting that holds the marketplace's account id | Claims it in control's external directory, for one company at a time |
| When the approval expires, and which app secrets rotate how often | Warns the seller before the approval ends, and the operator before a secret is due |
| The completeness check's interval and the soonest an early one may follow | Schedules the check ([9](#9-the-completeness-check)) |

A connector also declares: the address a request goes to where it has several (an identity or document host), with the account's own the default; a document address the host fetches with GET and no credential (pre-signed); the auth header's name where it is not `Authorization`; the redirect named by an app secret where the marketplace uses one (eBay's RuName); how who approved is read with the new token (`identify`); how its notice keys are fetched with the application token; each rotating app secret's period and reminder lead; how long a page token lives; `skuOf(key)`, the SKU a listing key names; its display name, its pools' names, whether Listings serves it, and what each platform topic means (owner delegation, 2 November 2026). A screen names a pool only by that name, never by its key; a pool the connector does not name is "the marketplace's shared" allowance (owner delegation, 3 November 2026).

A connector's marketplace key matches the module-id pattern (`^[a-z][a-z0-9]{0,19}$`); the composition refuses any other. A stored marketplace is any connector key; no module but the connector names a marketplace in its storage (owner delegation, 2 November 2026), except where another record gives a marketplace a rule of its own, as [ADR-009 SPEC 16.2.3](../../buyer-data/spec/#162-ebay)'s eBay deletion source in Buyer data: a privacy request's source (`seller`, or the marketplace whose platform deletion made it) is a source, not a stored marketplace key (owner delegation, 2 November 2026).

## 3. Credentials and approval

1. **Sealed at rest** under the company's credential key, a data key per purpose kept in the kernel's `secrets` ([ADR-001 SPEC 10](../../database-architecture/spec/#10-company-lifecycle), Encryption). Credentials are opened only by the host for the binding, in memory, never stored, logged or queued (owner delegation, 2 November 2026). No handler, screen or connector sees an opened credential.
2. **Approval by the marketplace's own flow** where it offers one. The host builds the approval address, signs a single-use state, checks the redirect, exchanges the code and seals the reply. The address is checked against the marketplace's declared consent pages.
3. **One company per marketplace account.** The marketplace's account id is claimed in the external directory; a second company connecting the same account is refused.
4. **Refresh under a lock** on the account's credentials, so two workers never spend one refresh token. A rotated refresh token is sealed in the same step, before it is used.
5. **Expiry comes from the marketplace's reply** for both access and refresh tokens. Where the marketplace gives none, the connector's record says how it is worked out. The seller is warned 30 days before an approval ends.
6. **A refused approval stops the account, not the platform.** Its work stops, the seller is asked to reconnect, and no retry burns calls meanwhile. A write's 401 or 403, or a token-expired code the connector names, refreshes the access token once and retries; only a refused refresh is a refused approval that stops the account and forgets its credentials. A connector's `refused` is the account's access refused, never one write's `rejected`; a listing's own problem is `rejected` (owner delegation, 2 November 2026).

## 4. HTTP

1. **One binding per account and job.** It adds the base address, authentication and settings, nothing else. Production refuses a simulator address ([ADR-000 SPEC 9](../../system-architecture/spec/#9-simulators)).
2. **Every call has a timeout and a size cap,** and none runs inside a database transaction ([ADR-000 SPEC 10](../../system-architecture/spec/#10-runtime)).
3. **Every call is a telemetry line** with the account, operation and job (order fetch, completeness check, listing read, stock write, read back), rolled up by hour into control's usage rollups. The operator sees what each job spends; the seller sees their own account's calls. Each job adds its calls to control's hourly usage rollup once, at its end, in one statement; the telemetry lines stay logs ([ADR-000 SPEC 10](../../system-architecture/spec/#10-runtime)) (owner delegation, 2 November 2026).

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
2. **An unknown write is settled before anything else is sent to that listing.** Reading back is the default: the host asks what the marketplace shows now and decides from that. A connector may instead send an absolute figure again, the one Vervoro wants now and never an older one (owner ruling, 22 October 2026), only when the write sets a value and never adds to one, repeating it cannot compound, and its record names the exception. At launch the one exception is eBay's Trading API ([ADR-004.1 SPEC 4](../../ebay-connector/spec/#4-listings-and-stock)). When the figure is sent is [ADR-008 SPEC 6](../../inventory-sync/spec/#6-confirming-every-write). One write to a target is out at a time, except that a decrease may be sent past an `accepted` write where the connector declares it (Amazon, [ADR-008 SPEC 8.5](../../inventory-sync/spec/#8-limits-and-who-goes-next)); the overtaken write is closed once the decrease is confirmed. An `unknown` write is always settled first (owner delegation, 2 November 2026). A read-back that finds a write not applied settles it, and the host decides again with a new record. A send whose lease ended mid-flight is `unknown` (owner delegation, 2 November 2026). A write still pending after `accepted` closes as not applied at the read-back deadline ([ADR-008 SPEC 6](../../inventory-sync/spec/#6-confirming-every-write)'s 10 minutes), so Stock sync decides again. The deadline applies whatever the read-back shows, a read-back with no figure included (owner delegation, 2 November 2026). A declared unknown-write resend settles the old write not applied; the newest figure goes next. A read-back that cannot see the listing looks the SKU up afresh (by the write's SKU, else `skuOf(key)`, never the listing key), hands what it finds to Listings, then settles the write not applied; without a SKU it is read back again (owner delegation, 2 November 2026).
3. **Repeats are safe** because every write carries the gate's idempotency key ([ADR-000 SPEC 7](../../system-architecture/spec/#7-the-egress-gate)).
4. **Reads are retried** by the host with growing delays, within the job's deadline.
5. **The marketplace's wait is honoured.** A 429, or any reply naming a wait, holds that operation for the account until then, whichever job asks next. The wait is capped at one hour; a longer one alerts the operator. A later wait is never shortened by an earlier job's write (owner delegation, 2 November 2026).

## 6. Rate limits per account

1. **A bucket per account and operation,** sized from the declared limit. A call our own bucket refuses is `throttled` and never leaves. Like the marketplace's wait, the bucket is kept per account and operation and holds every job (owner delegation, 2 November 2026).
2. **Live figures win:** where the marketplace reports the account's real limit in a reply, it replaces the declared one.
3. **Per-application per-second ceilings are not counted centrally.** Each seller's bucket keeps Vervoro far below them; if the marketplace throttles the application as a whole, the call waits like any throttle and the operator is alerted. An application-wide throttle is a 429 on an operation with a per-application ceiling while the seller's own live limit is not lower (Amazon: at least 5 a second, [ADR-004.2 SPEC 10](../../amazon-seller-connector/spec/#10-limits)); with no limit header none is inferred (owner delegation, 2 November 2026).

## 7. Shared daily pools

1. **One counter per pool, for the whole platform,** in control ([ADR-001 SPEC 7](../../database-architecture/spec/#7-control-database-and-routing)). A job claims its calls in a block of up to 10 in a single statement that refuses once the day is spent, so the pool never overruns; the calls it did not use go back when it ends. A block held by a job that crashed is freed by the next claim once its lease ends, with all its calls returned (owner delegation, 2 November 2026). A pool's day is the marketplace's reset day in the zone the connector declares, and the notice fetch claims its block like any job (owner delegation, 2 November 2026). Within the reserve (rule 3) a block is one call, so blocks never take the safety lane's share. A pool of 50,000 calls a day or more (eBay's order calls) is counted from the hourly usage rollups until its day passes half its size, then claimed in blocks like any other; until then its calls take no token and control's count is the rollups (such a pool carries reads only, never a send) (owner ruling, 25 October 2026). A write claims the pool its own operation declares, and a block's use is counted by that operation (owner delegation, 2 November 2026).
2. **Two lanes.** The safety lane carries the calls that protect a seller: a decrease, or any figure near zero. The bulk lane carries the rest.
3. **The reserve** is a tenth of the pool, split equally among the accounts using it, with no fixed floor. Once the day's count reaches the pool less the reserve, the bulk lane pauses for everyone until the reset. The safety lane goes on until the account's share is spent, never past the pool.
4. **The pool caps how many accounts it serves.** When an account's share would fall below the pool's share floor, the operator is alerted and a new account that needs the pool waits in shadow until the pool is raised. The floor is a platform setting, 50 calls a day unless the operator sets another (owner delegation, 2 November 2026).
5. **Within an account,** queued work is claimed safety writes first, then order fetches, then the rest, oldest first. Who goes next across listings is [ADR-008 SPEC 8](../../inventory-sync/spec/#8-limits-and-who-goes-next).
6. **A paused pool holds only its own calls;** other APIs of the marketplace go on.
7. **The operator is alerted at 90 %** of a pool's day, never the seller. The pool's size is a platform setting, changed without code when the marketplace raises it.

## 8. Notices in

Orders arrive by notice; the scheduled read is only the backup ([9](#9-the-completeness-check)).

1. **Two ways in.** Direct: the marketplace calls Vervoro's address and signs the request (eBay, Shopify). Through the bridge: Amazon delivers only into AWS, and a small bridge in an EU region posts each notice to the same endpoint with a shared secret ([ADR-000 SPEC 8](../../system-architecture/spec/#8-connectors-and-orders-in)).
2. **Check before any company database read:** the marketplace's signature, or the bridge's secret (current or previous, compared in constant time). A request that fails is refused. A key id the endpoint does not hold is looked up in control's platform settings; a fetch is made due only while fewer than 5 ids of that marketplace are due and fewer than 20 new ids were made in the hour; one fetch per id at a time (a lease); the marketplace's "no such key" (eBay's 400) refuses the id for 24 hours; any other failure is tried again hourly after a cool-off and alerts the operator; every row not fetched is deleted 30 days after its last try (ruled by delegation, 2 November 2026; for the owner's confirmation).
3. **Find the account** by the marketplace's id in the external directory. A notice for no held account, an account that is off, or a connector off for that company is answered and kept nowhere. The external directory row names the company, the Vervoro account and whether it is active; Channels writes it through the outbox on connect, switch and disconnect, so the endpoint reads only control before queueing (owner delegation, 2 November 2026). A deletion hashes every subject it names; a connected seller's own deletion also queues an account notice when control's directory holds the subject (owner delegation, 2 November 2026).
4. **Queue ids only:** the queue message carries the company, the account (Vervoro's and the marketplace's ids), the topic, the notice id and the order ids, and for a listing-quantity notice its SKU, quantity and time, never the body (owner delegation, 2 November 2026). Queues are in the EU jurisdiction. A platform topic with no account (eBay's account deletion) queues the keyed hash of the user id, never the id (owner delegation, 2 November 2026).
5. **Answer only after the message is on the queue.** A failed enqueue answers with an error, so the marketplace sends again.
6. **The consumer fetches, then imports.** It has the connector parse the message and fetches each order seen, one call, and hands it to Orders. An order not visible yet is fetched again after 30 seconds, doubling, for about half an hour, then left to the completeness check: these retries are the consumer's own and end with an early completeness check due, never in the dead-letter queue (owner delegation, 2 November 2026). A failed delivery goes to the dead-letter queue, which pages the operator ([ADR-000 SPEC 8](../../system-architecture/spec/#8-connectors-and-orders-in)). A throttled notice fetch hands its orders to the completeness check when the wait ends (owner delegation, 2 November 2026).
7. **A notice is a hint.** Vervoro imports what it fetches, never the notice body, and a notice never moves the watermark.
8. **Subscriptions are made on connect** by the connector's hook and removed on disconnect. A failing hook is retried and alerts. An account with no working subscription shows as "not notified".
9. **The host handles some topics itself.** Approval revoked disconnects the account. A privacy request is recorded with its due date, and Buyer data opens the company's privacy request ([ADR-009 SPEC 10](../../buyer-data/spec/#10-buyers-requests)). Only a privacy topic the connector declares as the seller's own ends the connection's buyer data; any other is recorded with its due date and alerts the operator (owner delegation, 2 November 2026).

## 9. The completeness check

1. **It reads the orders changed since the watermark,** from the watermark less 5 minutes, and is the only thing that moves the watermark, and only after a complete window ([ADR-007 SPEC 2.3](../../order-ingestion/spec/#2-how-an-order-comes-in)). A window longer than one run continues from its saved cursor to the same end; a window cut short is read again in 10 minutes (owner delegation, 2 November 2026).
2. **The interval is per marketplace:** hourly on eBay and Amazon, and every 10 minutes on Shopify (*Later*), whose order limit is each shop's own. Notices are how orders arrive; this read only catches one that was lost (owner ruling, 25 October 2026: Amazon from 10 minutes to hourly). Rule 4 and a failed launch gate (11.6) shorten it. The operator can change it per connector without code.
3. **Any complete read resets the timer,** including one a raise asks for.
4. **Broken notices are read every 10 minutes:** an account whose subscription is failing, or whose read finds an order no notice announced, until its notices work again. The operator is alerted. A watermark behind by its interval plus 15 minutes pages the operator (owner delegation, 2 November 2026).
5. **On demand:** after an outage, and before a raise is sent unless a complete read already covers the moment it became due. Decreases never wait. How long a raise may wait is [ADR-008 SPEC 5](../../inventory-sync/spec/#5-the-order-read-before-a-raise). An order Orders names is fetched by id once per request, as well as by an early check; several orders go to Orders oldest first by the marketplace's last change (owner delegation, 2 November 2026).
6. **The operator can switch the schedule off** per connector. On-demand reads still run, and the operator's screen says a lost notice on a quiet account is then found only by such a read.

## 10. What is measured

Every account, in shadow and live, records for each order: when the marketplace says it was placed, when its notice arrived (or none), and when it was imported and reserved. From these, per marketplace:

1. **Notice miss rate:** orders the completeness check found with no notice before it, over all orders.
2. **Detection delay:** from the order's placed time to its import, as a 99th percentile.
3. **Unreserved-order exposure:** orders that waited unreserved while their product's sellable stock was within the near-zero zone ([ADR-008 SPEC 3](../../inventory-sync/spec/#3-when-a-figure-is-sent)), and for how long. Near zero is any linked listing of the product within its zone (owner delegation, 2 November 2026).

The operator sees the three measurements per marketplace; per account only under a grant ([ADR-010 SPEC 7](../../users-and-access/spec/#7-operator-access-to-a-company), owner delegation, 2 November 2026). Once a marketplace passes its launch gates, each order's timings are kept 30 days, then only daily counts per marketplace and company (owner ruling, 25 October 2026; owner delegation, 3 November 2026).

## 11. Shadow mode and launch gates

This section owns shadow mode; other records link here.

1. **Every account starts in shadow.** Orders come in, listings are read, stock is reserved inside Vervoro, and the gate records each figure it would have sent without sending it.
2. **The shadow check** compares, listing by listing, what Vervoro would send with what the marketplace shows. The seller goes live once every difference is explained and acknowledged ([ADR-008 SPEC 14](../../inventory-sync/spec/#14-shadow-and-going-live)).
3. **The stop choice.** Stopping a live account always asks: leave the figures, or send zero and wait until every zero is confirmed. It is first asked at going live, and kept. At going live the stop question is shown with "send 0" chosen, as Listings' Unlink sheet ([ADR-005 SPEC 11.6](../../catalogue-sync/spec/#116-unlinking)); the seller may choose to leave the figures (ruled by delegation, 3 November 2026; for the owner's confirmation). A company closed for non-payment carries it out on its closing date; its accounts are then decrease-only until erasure, when they are disconnected ([ADR-012 SPEC 9](../../billing-and-plans/spec/#9-closing-a-company)).
4. **Reconnecting** after a disconnect, or a restore, starts a new shadow period.
5. **Launch gates.** No account on a marketplace goes live until shadow on that marketplace has run at least 14 days and 500 orders across its accounts, and passes every gate. The figures are proposals waiting for the owner. Outside production, the operator may mark a sandbox marketplace's gates passed before its figures pass. Production refuses the mark until shadow has run 14 days and 500 orders and every gate passes (ruled by delegation, 3 November 2026; for the owner's confirmation).

| Gate | Passes when (proposal) |
| --- | --- |
| Notice miss rate | At most 0.5 % |
| Detection delay, 99th percentile | At most 5 minutes |
| Unreserved-order exposure | No order waited unreserved more than 15 minutes while its product was near zero |

6. **A failed gate** first shortens that marketplace's scheduled read (within its order allowance; [ADR-004.1 SPEC 3](../../ebay-connector/spec/#3-orders) gives eBay's room) and is measured again for 7 days. If it still fails, live stock sync stays off for that marketplace: its accounts stay in shadow, orders are still imported and reserved, and no figure is sent. Until the marketplace is marked passed, the 14 days and 500 orders count every day since its shadow began. Once a shortened read is recorded, the three rate gates count from its day (that day included) and read "not yet measured" until 7 days with orders are measured from it; production refuses the passed mark until then. After the mark, the figures shown are the last 30 days (owner delegation, 3 November 2026). Procedure: [Check a marketplace's launch gates](../../runbooks/check-a-marketplaces-launch-gates/).
7. **After launch** the measurements go on; a marketplace whose miss rate or delay passes its gate figure for a day alerts the operator.

## 12. Switching on and off

1. **No marketplace is named in the core.** No core module imports a connector or speaks a marketplace's API; a marketplace key may appear in a core contract as data where that module's own record gives the marketplace a rule (owner delegation, 2 November 2026). Notice addresses carry the marketplace's key; a key no module contributes is refused from the module registry. Removing a connector module removes the marketplace, after its accounts are stopped.

| Level | Who | What off means |
| --- | --- | --- |
| Platform | The operator | Not offered to new companies. The operator's hold on a marketplace keeps every send waiting as Stock sync's rows; the latest figure goes when released ([runbook](../../runbooks/handle-a-marketplace-outage/)) |
| Company | The plan, and its Owner or an Admin ([ADR-010](../../users-and-access/)) | No reads, no writes, notices dropped. Refused while a live account has no stop choice |
| Account | The seller | The mode: shadow, live, paused, decrease-only or disconnected. Disconnected forgets the credentials |

Orders and Listings see two modes: a paused or decrease-only account is `live` to them, a disconnected one is disconnected (owner delegation, 2 November 2026). Resuming a paused account returns it to live if it had gone live, else to shadow; resuming to live is going live (Owner, Admin, the fresh check). Pausing a shadow account asks nothing (owner delegation, 2 November 2026).

2. **A connector that is off costs nothing:** its accounts have no work due, so the sweeper never visits them ([ADR-001 SPEC 9](../../database-architecture/spec/#9-background-work-and-the-outbox)).

## 13. Keeping failures apart

1. **Work is keyed per company, account and job;** one job per key runs at a time. A shared pool has a key of its own.
2. **Claims are leases.** A stuck job costs one lease period, and its result is written only if the claim is still its own.
3. **A connector's mistake fails one call.** An unexpected error in connector code becomes a typed failure for that call at the binding, logged with the account and operation.
4. **Connector output is checked** against the contract types before Orders or Listings see it. One that fails is held as an import problem in Orders ([ADR-007 SPEC 9](../../order-ingestion/spec/#9-import-problems)) with its reason for a person, never dropped or guessed.
5. **Sustained failure is visible.** An account that keeps failing shows as unhealthy to its seller, with the reason. When many accounts on one marketplace fail at once, the operator gets one marketplace incident alert, not one per seller. "Many accounts" is at least 3, and a third of that marketplace's accounts, failing at once (owner delegation, 2 November 2026). Accounts whose approval is refused, that are failing or not notified, or whose approval ends within 30 days are listed on Today for the Owner, Admins and Managers; when every account is fine, nothing is shown (owner delegation, 2 November 2026).

## 14. Simulators and recorded replies

1. **Every marketplace has a simulator** ([ADR-000 SPEC 9](../../system-architecture/spec/#9-simulators)), trimmed to the calls the launch connectors (eBay, Amazon Seller) make, and Shopify's when it is built: nothing a connector does not call is simulated.
2. **One contract suite** runs every connector against its simulator: orders across pages with a cursor that survives a throttle; one order, including "not visible yet"; every listing and one listing; every write reply mapped to one outcome, including a timeout that applied the change; read back of an accepted change, and a compare-mismatch where declared; every notice topic, including duplicates, late and out-of-order ones; a marketplace's wait honoured; a write that did not come through the gate refused. A new connector starts from the suite. A read's pages are compared as a set (a backwards read is not forward); the suite's parts may run on their own; a write part takes `applied` or `accepted` as the connector declares (owner delegation, 2 November 2026).
3. **Recorded real replies.** Before launch every call the launch connectors make is made once against the sandbox or a real account, the reply is recorded, and the simulator is fixed where it differs. Tests replay the recordings against the simulator. Each simulator lists where it is simpler than the real service. Tests never call a sandbox.

## 15. Storage

Channels' tables carry the module's prefix `channels_` (owner delegation, 2 November 2026). They are declared through `tenantTable()` and queried through the typed query builder ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)); modules write no SQL.

| Where | Holds |
| --- | --- |
| `channels_account` | Marketplace key, the marketplace's account id, the seller's label for it, mode, stop choice, setup choices, default warehouse ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)), approval expiry, notified state, health |
| `channels_listing_read` | Per account and scope: the running listing read, its lease and whether it is held ([ADR-005 SPEC 8.4](../../catalogue-sync/spec/)) |
| `channels_stock_reading` | Stock a marketplace holds: a dated reading per product or listing and account ([ADR-004.2 SPEC 7](../../amazon-seller-connector/spec/#7-stock-amazon-holds)) |
| `channels_order_read` | Per account: the watermark, the last complete read, the next one due, whether notices look broken |
| `channels_wait` | Per account and operation: the marketplace's wait and the bucket |
| `channels_privacy_request` | Privacy requests from marketplaces, with their due dates |
| `channels_order_timing` | Per order: placed, notice and import times, for [10](#10-what-is-measured); after the launch gates pass, kept 30 days, then daily counts |
| `channels_credential` | Per account, the credentials sealed under the company's credential key (kernel `secrets`, a purpose per account), opened only for the binding (owner delegation, 2 November 2026) |
| `channels_connect` | A pending connect: its state and the person, for 10 minutes (owner delegation, 2 November 2026) |
| `channels_order_fetch` | An order Orders named, until it is fetched (owner delegation, 2 November 2026) |
| Control | External directory (with the Vervoro account and whether it is active), shared pool counters, usage rollups, per-connector platform settings, the operator's hold per marketplace |

An account is shown by the label the seller gives it, by default the marketplace, site and a number; the marketplace's own store or user name is not stored (owner delegation, 2 November 2026).

A disconnected account's held-stock readings are kept and deleted with its other rows (ruled by delegation, 2 November 2026; for the owner's confirmation).

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
| Pool | Under parallel calls, with blocks claimed and unused calls returned, the counter never passes the pool; within the reserve a block is one call; at pool less reserve, bulk pauses and safety goes on to each account's share; a large pool switches from the rollups to blocks at half its day |
| Pool cap | An account whose share would fall below 50 cannot go live |
| Notice check | A bad signature or secret is refused before any company database read; a notice for an unheld account is answered and kept nowhere |
| Ids only | No queue message carries a notice body or buyer field |
| Recipient filter | No contract order carries a recipient name, address line, postcode or phone; a recorded order that has them yields an order without them |
| Enqueue | A failed enqueue answers with an error |
| Watermark | Only a complete read moves it; a notice never does |
| Broken notices | An order found with no notice switches the account to 10-minute reads and alerts |
| Shadow | A new account subscribes to notices and sends no figure |
| Gates | A marketplace that fails a gate cannot take an account live |
| Isolation | A throttled or failing account delays no other account's jobs |
| Refresh | Two workers refreshing at once spend one refresh token; the new one is sealed before use |
| Contract suite | Every connector passes it on its simulator |

"Read the clock" ([1](#1-the-connector-contract), rule 4) means `Date.now()`, a bare `new Date()` or `Date()`, or `performance.now()`; parsing a timestamp is allowed (owner delegation, 2 November 2026).

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Translators only:** connector modules import no network, database or clock; the lint test is green.
- [ ] **Credentials:** opened only inside the binding; no log line, queue message or screen holds one.
- [ ] **Gate:** write operations reach the binding only from the gate; the mode is read from the database on each send.
- [ ] **Unknown:** one settle step runs before any other write to that target; the resend path exists only where a connector's record names it.
- [ ] **Expiry:** token lifetimes come from the reply; no fixed lifetime in host code.
- [ ] **Pools:** a block of up to 10 is claimed in one statement in control and its unused calls returned at the job's end; one call a block within the reserve; a pool of 50,000 a day or more is counted from the rollups until half spent; the reserve and the 50-call alert are platform settings.
- [ ] **Notices:** checked before any company database read; the queue message holds ids only; answer after enqueue.
- [ ] **Completeness check:** only it moves the watermark; intervals are per connector settings; broken notices drop to 10 minutes.
- [ ] **Gates:** the three measurements are recorded per order, and going live checks the marketplace's gates.
- [ ] **No SQL:** every query uses the typed query builder; tables carry `channels_`.
- [ ] **Core:** no import of a connector and no marketplace API in the kernel, the core modules, the gate or the screens; a marketplace key in a core contract only where that module's record gives the marketplace a rule.
- [ ] **Simulators:** only calls a connector makes are simulated; recordings replay in tests; production refuses a simulator address.
- [ ] **Later parts:** no Shopify or Vendor connector, no Amazon feed path, no central per-second counter at launch.
