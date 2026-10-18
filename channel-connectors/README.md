# ADR-004: Channel connectors

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026 |
| **Scope** | How each marketplace plugs into Vervoro: the connector contract, what the platform host owns instead of the connector, how notices come in, how connectors are tested, switched on and off, and kept from harming each other |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-003: Product model](../product-model/) |

## Context

Vervoro is the stock master for a seller who runs their own warehouse. Every marketplace the seller sells on shows the figure Vervoro sends, and every order those marketplaces take comes back to Vervoro. ADR-000 decided that each marketplace is a plugin behind a fixed contract, and that one egress gate is the only door out. This record says what that contract is, and what the platform does around it.

The design has to meet these requirements:

- **Every marketplace is different, and none of them is reliable.** Each has its own API, its own approval flow, its own limits and its own way of telling us something happened. All of them throttle, time out, and sometimes apply a change without saying so.
- **Some limits belong to the whole platform, not one seller.** eBay's Trading API allows 5,000 calls a day by default for the whole application, shared by every seller who uses Vervoro and by every feature that calls it. One busy seller or one greedy feature must not spend the others' share.
- **Orders arrive by notice first.** A marketplace's own notice is the way an order comes in. A scheduled read of orders is only the backup that proves none was missed.
- **A new marketplace must not touch the core.** The foundation, the egress gate and the server name no marketplace. Adding one is a new module; removing one is removing it.
- **One marketplace's trouble stays its own.** An eBay outage must not slow Amazon. One seller's revoked approval must not stop another seller's stock.
- **One operator, a small team and AI coding agents** build and run it. A connector must be small enough to write and review on its own, and unable to do the dangerous things (hold a secret, call the network directly, send a change outside the gate) even by mistake.
- **Launch with eBay and Amazon.** These are the seller's first two channels. Shopify and others follow, and must fit without changing the contract.

## Decision

1. **A connector is a translator, nothing more.** It turns contract calls into a marketplace's requests and its replies into contract types. It has no network access, no credentials, no clock of its own and no database.
2. **The contract is four calls and one parser:** read orders, read listings, write stock, read back, and parse a notice. Everything else a marketplace offers is an optional capability the connector declares.
3. **The host owns everything that can hurt:** credentials and their refresh, the seller's approval, HTTP, retries, rate limits per account, and shared allowances across the platform.
4. **Shared daily allowances are counted exactly, one call at a time, for the whole platform,** in the control database. Each pool is split into a safety lane and a bulk lane, and every account on the pool keeps a reserve for its safety lane.
5. **Orders arrive by notice.** A notice is verified before anything is read, queued, and answered at once. The order is then fetched and imported. The scheduled read of orders is only a backup for lost notices, never the way orders come in: hourly where the order limit is shared by every seller, every 10 minutes where it is per seller.
6. **A notice is a hint, never the truth.** Vervoro imports what it fetches from the marketplace, not what a notice says. A notice never moves the order watermark.
7. **Every connector runs against its simulator** in development and tests, through one shared contract test suite. Sandboxes are used only to record real replies before launch.
8. **Every account starts in shadow** at the egress gate. Reads happen, writes are only recorded. An account goes live once the seller has explained every difference.
9. **A marketplace is switched on or off at three levels:** the platform, the company, and the account. Off means no reads, no writes, and notices dropped. The operator can also hold every send to one marketplace during an incident on its side.
10. **Failures are isolated per account, per job and per shared pool.** A throttle, an outage or a refused approval holds only the work it touches.
11. **eBay and Amazon Seller are the launch connectors.** Shopify and the others are new modules behind the same contract.

## Architecture

<!-- DIAGRAM -->

The connector sits in the middle, with no way out of its own. Everything it sends goes through the HTTP binding the host gives it. The binding is built per account: it holds the account's base address, opens the sealed credentials, refreshes the access token, takes a token from the account's rate bucket and from any shared pool, and counts the call. Writes reach the binding only from the egress gate.

Notices come in the other way. A marketplace calls Vervoro's address, or a small relay forwards what the marketplace put in its own cloud. The endpoint verifies the notice, finds the account, puts a minimal message on the inbound queue, and answers. The consumer asks the connector to parse it, fetches the order through the binding, and hands the order to the foundation.

## The connector contract

A connector is built per account by a factory. The factory gets the account's HTTP binding, a clock and the account's non-secret settings. It gives back an object with these calls. Every call returns a typed result.

| Call | What it does | What it returns |
| --- | --- | --- |
| **Read orders** | Reads the orders changed in a time window, one page at a time. Also fetches one order by its marketplace id | A page of orders, a cursor for the next page, and the time up to which the window is complete. For one order: the order, or "not visible yet" |
| **Read listings** | Reads every listing on the account, one page at a time, or one listing by its SKU | Listings with their SKU, the marketplace's own id, the figure it shows now, and who ships them |
| **Write stock** | Sets the figure one listing should show | One outcome (below), and a submission id where the marketplace processes the change later |
| **Read back** | Asks what the marketplace now shows for a listing, or what became of a submission | The figure the marketplace shows, or the submission's final outcome |
| **Parse a notice** | Reads a verified notice body. Makes no call | Orders seen, order changed, listing changed, or ignored |

**Every write ends in one outcome.** These are the egress gate's outcomes from ADR-000. The connector maps every reply of its marketplace onto one of them, and a test covers each mapping.

| Outcome | Meaning | What the host does next |
| --- | --- | --- |
| `applied` | The marketplace shows the new figure | Records it as confirmed |
| `accepted` | The marketplace took the change and will process it later | Reads back after the marketplace's own delay |
| `throttled` | The marketplace, or our own bucket, refused it for now | Waits as long as the marketplace says, then tries again |
| `compare-mismatch` | The marketplace's figure was not the one we expected | Reads back, then decides again |
| `rejected` | The marketplace refused this change for a reason that will not go away by waiting | Stops, and tells the seller why |
| `unknown` | No clear answer, including a timeout | Reads back before anything is sent again |

**Orders and listings come back in contract types,** never in the marketplace's own shape. An order carries its marketplace id, its lines (SKU, quantity, the marketplace's line id), its status, its last change time, and who ships it. Buyer details ride on the order to the foundation and are not kept by the host. A connector leaves out what the marketplace withheld or masked; it never makes a value up.

**Optional capabilities** are declared, not discovered. A connector says which of these it has, and the host only calls what is declared:

- **Compare-and-set:** the write carries the figure we expect the marketplace to show now, and the marketplace refuses the change if it differs.
- **Batch write:** many listings in one call or one feed, with its own read back.
- **Dispatch notice:** tells the marketplace that an order shipped, with tracking.
- **Approval connect:** the seller connects by approving Vervoro on the marketplace, instead of pasting keys.
- **Account setup choices:** what a person picks after connecting, such as which locations or marketplaces of the account Vervoro serves.

Later records add capabilities of their own (catalogue details, purchase orders) in the same way. A capability is a typed addition to the contract, so a connector that does not declare it needs no change.

**What a connector cannot do,** enforced by the build:

- Call the network. A lint rule bans every network global in connector code, and a test proves the rule fires.
- See a credential. The host adds the secret to the request inside the binding, after the connector has built it.
- Send a write outside the gate. Each request names its operation, the connector declares which operations change the marketplace, and the binding refuses a write operation that did not come from the gate.
- Read the clock or a database. It gets a clock, and everything it needs arrives in the call.

## What a connector declares

Each connector module contributes one definition to the connector extension point, under its marketplace's key. The host reads it and does the work.

| The connector declares | The host does |
| --- | --- |
| The factory | Builds one connector per account, over that account's binding |
| Credential and settings schemas | Validates them on connect, seals the credentials |
| Its authentication kind: refresh token, signed request, basic, client credentials | Runs it with the opened credentials, refreshes tokens, signs requests |
| The marketplace's own API and token addresses | Sends only there. A token is refreshed only at the declared token address |
| A rate budget per operation, from the marketplace's published limits | Keeps a token bucket per account and operation |
| Which operations change the marketplace | Lets only the egress gate send them |
| Which shared pool each operation draws from, with its daily size | Counts the pool across the platform |
| How a notice is verified, and which field names the account | Verifies before any database read, finds the company |
| Its notice topics, and which of them the host handles itself (approval revoked, privacy requests) | Disconnects, or records the privacy request with its due date |
| Lifecycle hooks: set up and undo what the marketplace needs per account, such as notice subscriptions | Runs them on connect and disconnect, retries and alerts on failure |
| The setting that holds the marketplace's own id for the account | Claims it in the control database's external directory, for one company at a time |
| When the seller's approval expires, and which app secrets must be rotated how often | Warns the seller before the approval ends, and the operator before a secret is due |
| The backup read's default interval and the soonest an early one may follow | Schedules the completeness check |

## What the host owns

### Credentials and approval

- **Sealed at rest.** Credentials are encrypted with a key-encryption key held outside the database, stored in the company's own cell, and opened only inside the HTTP binding. Several keys can be active, current first, so keys rotate without downtime.
- **Approval by the marketplace's own flow.** Where the marketplace offers it, the seller approves Vervoro on the marketplace's own page. The host builds the approval address, signs a single-use state, checks the redirect back, exchanges the code and seals the reply. The approval address is checked against the marketplace's own consent pages, so a seller is never sent anywhere else.
- **One company per marketplace account.** When an account connects, the host claims the marketplace's id for it in the external directory. Another company that tries to connect the same marketplace account is refused.
- **Refresh under a lock.** Access tokens are refreshed by the host, under a lock on that account's credentials, so two workers never spend one refresh token twice. A rotated refresh token is sealed in the same step.
- **Expiry is watched.** The host warns the seller 30 days before their approval ends, and the operator before an app secret is due for rotation.
- **A refused approval stops the account, not the platform.** When the marketplace refuses the account's token, its work stops, the seller is asked to reconnect, and no retry burns calls in the meantime.

### HTTP

- **One binding per account and job.** It adds the base address, the authentication and the account's settings, and nothing else. In development and tests the base address points at the simulator; production refuses a simulator address.
- **Every call has a timeout and a size cap.** A slow marketplace costs one job its lease period, never a database transaction: no marketplace call runs inside one.
- **Every call is counted** by hour, account, operation and job (order fetch, completeness check, listing read, stock write, read back). The operator sees what each feature spends, and the seller sees their own account's calls.

### Retries and outcomes

- **Reads are retried by the host** with growing delays, within the job's deadline.
- **Writes are never retried blindly.** A write that timed out is `unknown`, and the listing is read back before anything is sent again. Repeats are safe because every write carries the gate's idempotency key (ADR-000).
- **The marketplace's own wait is honoured.** A 429, or any reply naming a wait, holds that operation for the account until then, whichever job asks next. The wait is capped at one hour; a longer one alerts.

### Rate limits per account

- **A token bucket per account and operation,** sized from the marketplace's published limit. A call our own bucket refuses is `throttled` and never leaves.
- **Live figures win.** Where the marketplace reports the account's real limit in its replies, the host uses it in place of the declared one.
- **Most limits are per account.** Amazon, for example, keeps a bucket per seller and application pair for most operations, so one seller's calls do not slow another's.

### Shared daily allowances

Some limits belong to Vervoro's application as a whole. eBay's Trading API allows 5,000 calls a day by default for the whole application, and its order resource 100,000. Every seller on Vervoro, and every feature that uses that API, draws from the same pool.

- **One counter per pool, for the whole platform,** in the control database (ADR-001 puts shared marketplace call quotas there). Every call on the pool takes one from it before it leaves, in one statement that refuses the call once the day is spent, so the count is exact and the pool is never overrun. At these volumes (5,000 a day is one call every 17 seconds on average) one round trip per call costs little, and handing out blocks of calls would add leases and allow overruns for no gain.
- **Per-second ceilings per application are not counted centrally.** Some marketplaces cap the whole application per second as well as each seller (Amazon's listing updates: 5 a second per seller, 500 for the application). Each seller's own bucket keeps Vervoro far below such a ceiling. If the marketplace ever throttles the application as a whole, the call waits like any other throttle and the operator is alerted.
- **Two lanes.** The **safety lane** carries the calls that protect a seller: a stock decrease, or any figure while a shelf is low. The **bulk lane** carries everything else: raises, refreshes, catalogue reads.
- **A reserve for every account.** A tenth of each pool is its safety reserve, split equally among the accounts using it, with no fixed floor. Once the day's count reaches the pool less the reserve, the bulk lane pauses for everyone until the pool resets. The safety lane goes on until the account's own share is spent, and never past the pool.
- **The pool caps how many accounts it serves.** The pool's size is a platform setting. When an account's share of the reserve would fall below a set minimum (50 calls a day to start), the operator is alerted, and a new account that needs the pool waits in shadow until the pool is raised. A seller is never taken live on a pool too small to protect them.
- **Most urgent first.** Within an account, queued work is claimed in priority order: safety writes, then order fetches, then the rest, oldest first.
- **A paused pool holds only its own calls.** Work on other APIs of the same marketplace goes on.
- **The operator sees it before it bites.** A pool at 90 % of its day alerts the operator, never the seller. A raised limit (after the marketplace's growth review, for example) is a platform setting, not a code change.

How inventory sync spends these lanes, and which listing gets the next call, is ADR-008. This record only decides that the pools, lanes and reserves exist and that the host enforces them.

## Notices in

Orders arrive by notice. This is a hard rule: the scheduled read is only the backup.

**Two ways a notice reaches us.**

- **Direct.** The marketplace calls Vervoro's address over HTTPS and signs the request. eBay's Notification API and Shopify's webhooks work this way.
- **Through a relay.** Amazon delivers notices only into its own cloud: order changes only to a queue (SQS), listing changes only to an event bus (EventBridge). A small relay in AWS takes them from there and posts each one to Vervoro's address, signed with a relay secret. The relay keeps nothing and decides nothing.

**The endpoint verifies, queues and answers.**

1. **Verify before any database read.** The marketplace's signature, or the relay's secret (current or previous, so it rotates), is checked first. A request that fails is refused.
2. **Find the account** by the marketplace's id in the external directory. A notice for an account nobody holds, an account that is off, or a connector that is off for that company is answered and kept nowhere.
3. **Queue a minimal message:** the topic, the notice id, the account and the order ids. Never the buyer's details from the body.
4. **Answer at once,** and only after the message is safely on the queue. A failed enqueue answers with an error, so the marketplace sends again.

**The consumer fetches, then imports.** It asks the connector to parse the message. For each order seen, it fetches the order through the binding, one call, and hands it to the foundation. An order not visible yet is fetched again after 30 seconds, doubling, for about half an hour; then it is left to the completeness check. A failed queue delivery is retried with growing delays and then goes to the dead-letter queue, which alerts the operator (ADR-000).

**Subscriptions are made on connect.** A connector's lifecycle hook subscribes the new account to its order topics, and the disconnect hook removes them. A hook that fails is retried and alerts. An account with no working subscription is shown as "not notified".

**The backup read is a safety net, not the way orders come in.** The completeness check reads the orders changed since the order watermark, with a small overlap. It is the only thing that moves the watermark, and only after a complete window. It protects one case: a notice that never arrives. Until the next read, that order reserves nothing, so another channel can sell its units, and nobody picks or ships it before the seller's dispatch deadline.

- **The interval is set per marketplace,** by whether its order limit is shared. Where every seller draws on one allowance for Vervoro's application (eBay), the read runs hourly, so it scales to many sellers. Where the limit is per seller (Amazon), it runs every 10 minutes, which costs no other seller anything. Each connector's sub-record says which, and the operator can change the figure per connector without a code change.
- **Any complete read resets the timer,** including the read a raise asks for, so a busy account rarely needs a scheduled one.
- **Broken notices are checked more often.** An account whose subscription is failing, or whose read finds an order that no notice announced, is read every 10 minutes and alerts the operator until its notices work again.
- **The operator can switch the schedule off** per connector. On-demand reads still run before a raise and after an outage. With the schedule off, a lost notice on a quiet account is found only by such a read, so the operator's screen says so while it is off.

A check also runs on demand when something must know that every order is in: after an outage, and before a stock raise is sent, unless a complete read already covers the time the raise was decided. A notice can say that an order exists, never that none is missing, so a raise sent before the read could let the marketplace sell stock that is already gone. Decreases never wait. How long a raise may wait is ADR-008; how orders are imported is ADR-007.

**The host handles some topics itself.** A notice that the seller revoked Vervoro's approval disconnects the account. A privacy request (eBay's account deletion, Shopify's data requests) is recorded with its due date, and buyer data it names is anonymised.

## Testing, sandboxes and shadow mode

**Simulators first.** Every marketplace has a simulator: a real HTTP server that speaks that marketplace's real API shapes, with a control interface to change its world and its behaviour (ADR-000). The connector cannot tell it apart from the marketplace, because only the base address differs.

**One contract test suite for every connector.** Each connector runs the same suite against its simulator:

- read orders across pages, with a cursor that survives a throttle
- fetch one order, including "not visible yet"
- read every listing and one listing
- write stock and map every reply onto one outcome, including a timeout that applied the change
- read back an accepted change, and a compare-mismatch where the marketplace offers compare-and-set
- parse every notice topic, including duplicates, late notices and notices in the wrong order
- honour a marketplace's wait, and refuse a write that did not come through the gate

A connector that passes the suite works with the host. A new connector starts from the suite.

**Sandboxes check the simulators, not the code.** eBay and Amazon both offer a sandbox. They are slow, limited and not deterministic, so tests never call them. Before launch, every call the launch connectors make is made once against the sandbox or the real marketplace, the reply is recorded, and the simulator is fixed wherever it differs. Each simulator's documentation lists where it is simpler than the real service.

**Shadow and live at the egress gate.** Every account starts in **shadow**: orders come in, listings are read, stock is reserved inside Vervoro, and the gate records each figure it would have sent without sending it. The shadow check compares what Vervoro would send with what the marketplace shows, listing by listing. The seller goes **live** once every difference is explained and acknowledged. Stopping a live account always asks first: leave the figures as they are, or send zero and wait until every zero is confirmed. The answer is first asked when the account goes live, and kept. A company that closes for non-payment carries it out on its closing date, and its accounts are then decrease-only until the company is erased, when they are disconnected ([ADR-012](../billing-and-plans/)). Reconnecting after a disconnect starts a new shadow period.

## Switching a marketplace on and off

**Adding or removing a marketplace never touches the core.** A marketplace is one module that contributes one connector definition. The host, the gate, the server and the screens name no marketplace. Notice addresses are generic (the marketplace's key is part of the address), and a key that no module contributes is refused from the module registry alone. Removing the module removes the marketplace; its accounts must be stopped first.

**Three levels of on and off.**

| Level | Who sets it | What off means |
| --- | --- | --- |
| **Platform** | The operator | The connector is not offered to new companies. For an incident on the marketplace's side, the operator can also hold every send to that marketplace: queued figures wait as desired state and the latest one is sent when released, so nothing is lost |
| **Company** | The company's plan, and its Owner or an Admin ([ADR-010](../users-and-access/)) | The connector module is off for that company: no reads, no writes, notices dropped. Switching off is refused while one of its live accounts has no stop choice |
| **Account** | The seller | The account's mode: shadow, live, paused, decrease-only (a closed company, [ADR-012](../billing-and-plans/)) or disconnected. Disconnected also forgets the credentials |

A connector that is off costs nothing. Its accounts have no work due, so the sweeper never visits them (ADR-001).

## Keeping failures apart

- **Work is keyed per company, account and job.** The dispatcher runs one job per key at a time. A throttled, slow or failing account holds only its own key; other accounts, other companies and other marketplaces go on.
- **A shared pool has a key of its own.** When a pool pauses, only the calls on that pool wait.
- **Claims are leases.** A crashed or stuck job costs one lease period, and its result is written only if the claim is still its own.
- **A connector's mistake fails one call.** An unexpected error inside connector code is turned into a typed failure for that call at the binding, logged with the account and the operation, and counted. It never reaches another account.
- **Connector output is checked before the foundation sees it.** Orders and listings are validated against the contract types. One that fails is held with its reason for a person, never dropped and never guessed.
- **Sustained failure is visible.** An account that keeps failing or throttling is shown as unhealthy to its seller, with the reason. When many accounts on one marketplace fail at once, the operator is alerted to a marketplace incident instead of one alert per seller.
- **A slow marketplace never blocks a screen.** Every marketplace call runs in the background, outside any database transaction.

## The first connectors

eBay and Amazon Seller are the launch connectors. What each marketplace forced us to decide, beyond this record, has a record of its own:

- **eBay ([ADR-004.1](../ebay-connector/)):** orders by eBay's Notification API to one signed destination for the whole application; stock through the Inventory API or, for listings made in eBay's own seller tools, through the Trading API and its application-wide pool of 5,000 calls a day ([eBay's call limits](https://developer.ebay.com/develop/api/sell/api_call_limits), checked 17 October 2026); no compare-and-set.
- **Amazon Seller ([ADR-004.2](../amazon-seller-connector/)):** order notices only into Amazon's queue and listing notices only onto its event bus, so both come through the relay ([notification types](https://developer-docs.amazon/sp-api/docs/notification-type-values), checked 17 October 2026); single listing writes (listings feeds for many raises are possible later, not used at launch: ADR-008); limits per seller and application; no figure ever sent to a listing Amazon ships (ADR-003).
- **Shopify ([ADR-004.3](../shopify-connector/)):** HMAC-signed webhooks to one address for the app, compare-and-set on inventory quantities at the seller's warehouse location, and a budget in cost points per shop. Each is something the contract and the host already express.
- **Other marketplaces** follow the same path: a new module, a definition, a simulator and the contract test suite. A marketplace that sends no order notices is added only once its notices are planned, or with an exception recorded as a decision of its own. Selling to Amazon as a vendor has a different shape and is ADR-004.4 (planned).

## What later records decide

- **[ADR-004.1: eBay connector](../ebay-connector/)** and **[ADR-004.2: Amazon Seller connector](../amazon-seller-connector/)**: the decisions specific to each launch marketplace, with its constraints checked against its documentation.
- **[ADR-004.3: Shopify connector](../shopify-connector/)**: the same for Shopify.
- **ADR-004.4: Amazon Vendor connector** (planned): the same for selling to Amazon as a vendor (purchase orders, carton shipments).
- **[ADR-005: Catalogue sync and linking](../catalogue-sync/)**: when listings are read in full, how new and ended listings are found, and how a listing is matched and linked to a product.
- **[ADR-006: Stock ledger and reservations](../stock-ledger/)**: the ledger and the stock figures, reserving on order, deducting on dispatch, cancellations and returns.
- **[ADR-007: Order ingestion](../order-ingestion/)**: how a fetched order is imported once per marketplace order, its statuses, cancellation requests, marketplace-shipped orders and unlinked listings.
- **[ADR-008: Inventory sync](../inventory-sync/)**: the figure each listing should show, when it is sent, how raises wait for the order watermark, confirming and reading back, and how sync spends the per-listing limits and shared pools.

## Consequences

**What this gives us**

- A connector is small: a translator with a definition, testable on its own against its simulator. An agent can write one with only the contract in view.
- No connector can leak a secret, call the network, or send a change outside the gate, because it has no way to.
- Shared allowances are spent fairly. A busy seller or a bulk job cannot use up the calls another seller needs to lower a figure.
- Orders arrive as they happen, and the backup read costs a small fraction of the calls polling would.
- A marketplace outage, a throttle or a refused approval stays with the account, pool or marketplace it belongs to.
- Shopify and the next marketplaces need no change to the host, the gate or the core.

**What it costs**

- The host is large. Approval flows, token refresh, signing, buckets, pools and notice verification all live there, and each new authentication kind or notice shape is host work once.
- Amazon's notices need a relay in AWS: one more piece to deploy, watch and keep a secret for.
- Every marketplace needs a simulator, and the contract test suite must grow with every new capability.
- Calls on a daily pool cost one more round trip, to the control database.
- A raise waits until a complete order read covers the time it was decided: on Amazon that can be up to about three minutes.
- On a marketplace read hourly, a lost notice is found within the hour, not within minutes.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Each connector holds its own credentials and HTTP client | Secrets, rate limits and shadow mode would be scattered across connectors, and one mistake in one connector could leak a seller's token |
| A large contract covering every marketplace feature | Every connector would have to implement or stub calls it has no use for; optional capabilities keep the contract small |
| One separate service per marketplace | One operator cannot run a fleet, and every stock change would cross a network boundary before the gate |
| Polling as the way orders come in | Slower, and it spends the shared allowances; notices bring each order as it happens |
| Trusting the notice body as the order | Notices arrive late, twice or out of order, and some carry only ids; fetching the order gives one current truth |
| Reading Amazon's queue from Vervoro directly | A Worker would hold AWS credentials and poll a queue; a relay that posts to the same endpoint keeps one inbound path |
| Rate limits per account only | A shared daily pool would be spent by whoever calls first, and a seller could be left unable to lower a figure |
| A shared pool with no lanes | A catalogue read or a run of raises could spend the day before a decrease is due |
| Claiming pool calls in blocks | Saves round trips only at rates far above any daily pool; adds leases and lets a pool run over |
| No scheduled backup read by default, or one a day | A lost notice on a quiet account would leave an order unshipped, or found after its dispatch deadline; switching it off is left to the operator |
| The same short interval on every marketplace | Where the order limit is shared (eBay), a read every 10 minutes for 1,000 sellers would need more calls than the whole allowance |
| Raising on notices alone | A notice proves an order exists, never that none is missing; a lost notice would let the marketplace sell stock that is gone |
| Testing against marketplace sandboxes | Slow, limited, not deterministic, and unable to produce the failures that matter; recorded replies keep the simulators honest instead |
| Retrying a timed-out write | The marketplace may already have applied it; reading back first is the only safe next step |
