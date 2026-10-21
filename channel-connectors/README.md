# ADR-004: Channel connectors

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026; unknown-write rule and its exception, 21 October 2026; split into ADR, SPEC and RUNBOOK, with launch gates measured in shadow and Shopify Later (owner rulings), 21 October 2026 |
| **Scope** | The Channels module (the host) and the connector contract: what a connector does and may not do, what the host owns, shared daily pools, notices in and the completeness check behind them, shadow mode and its launch gates, simulators, switching marketplaces on and off, and keeping failures apart |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-003](../product-model/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-004-channel-connectors) |

## Context

- **Every marketplace is different, and none is reliable.** Each has its own API, approval flow, limits and notices. All of them throttle, time out, and sometimes apply a change without saying so.
- **Some limits belong to the whole platform.** eBay's Trading API allows 5,000 calls a day for Vervoro's application, shared by every seller. One busy seller or one bulk job must not spend the share another seller needs to lower a figure.
- **Orders must arrive as they happen.** A sale not seen is stock another channel can sell again. Marketplaces send notices for orders, but none guarantees delivery.
- **The core must not know a marketplace.** Adding one is a new module and removing one is removing it; one marketplace's trouble must not slow another.
- **A small team and coding agents build it.** A connector must be small enough to write and review alone, and unable to do the dangerous things (hold a secret, call the network, send outside the egress gate) even by mistake.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **A connector only translates.** It turns five contract calls (read orders, read listings, write stock, read back, parse a notice) into a marketplace's requests, and the replies into contract types. It has no network access, no credentials, no clock and no database. Anything more a marketplace offers is an optional capability the connector declares.
2. **Channels, the host, owns everything that can hurt:** credentials and the seller's approval, HTTP, retries, rate budgets, shared pools, checking notices, and the sending half of the egress gate ([ADR-000 SPEC 7](../system-architecture/spec/#7-the-egress-gate)). Channels and each connector are switchable modules, so a marketplace is added or removed without touching the core. A token's expiry is taken from the marketplace's reply.
3. **Every write ends in one outcome, and an unknown one is settled first.** A write with no clear answer is `unknown`, and nothing else is sent to that listing until it is settled. Reading back is the default; resending the absolute figure Vervoro wants now, where it only sets a value, is the named exception; resending the same absolute figure is allowed only as an exception a connector's record names. The SPEC owns this rule.
4. **Shared daily pools are counted exactly,** one call at a time, for the whole platform. A tenth of each pool is a safety reserve split equally between the accounts on it. The operator is alerted when an account's share would fall below 50 calls a day, and a new account that needs the pool then waits in shadow.
5. **Orders arrive by notice.** A notice is checked before anything is read, queued as ids only, and answered at once. The order is then fetched and imported. A notice is a hint, never the order.
6. **A scheduled read checks that no order was missed.** It runs hourly where the order limit is shared by every seller (eBay) and every 10 minutes where it is each seller's own (Amazon, Shopify). An account whose notices look broken is read every 10 minutes. Only a complete read moves the order watermark, and no raise leaves before one covers it.
7. **Every account starts in shadow.** Reads happen and writes are only recorded until the seller has explained every difference. Before any account on a marketplace goes live, shadow must pass three launch gates for it: few lost notices, a short delay before an order is seen, and no order left unreserved while its stock was short. A marketplace that fails gets a shorter scheduled read, or keeps live stock sync off. The SPEC owns shadow mode.
8. **Every connector runs against its simulator** through one shared contract suite. Simulators are trimmed to the calls the launch connectors make and kept honest by recorded real replies.
9. **On and off at three levels, and failures kept apart.** A marketplace is switched at the platform, the company and the account; the operator can also hold every send to one marketplace during its incident. A throttle, outage or refused approval holds only the account, job or pool it touches.
10. **eBay and Amazon Seller are the launch connectors.** *Later: Shopify (ADR-004.3, owner ruling 21 October 2026), Amazon Vendor (ADR-004.4) and other marketplaces, each a new module behind the same contract.*

## How a call travels

<!-- DIAGRAM -->

Out: Stock sync decides a figure and the egress gate records it. Channels sends it after commit, through an HTTP binding built for the account. The binding opens the credentials, takes a token from the account's budget and any shared pool, and counts the call. In: a marketplace calls Vervoro's notice endpoint directly, or, for Amazon, through a small AWS bridge. The endpoint checks the notice, queues ids only, and answers. The consumer has the connector parse the notice, fetches the order, and hands it to Orders through its port.

## Consequences

**Gives**

- A connector is small and testable on its own; an agent can write one with only the contract in view.
- No connector can leak a secret, call the network or send outside the gate, because it has no way to.
- A busy seller or a bulk job cannot spend the calls another seller needs to lower a figure.
- Orders arrive as they happen, and the backup read costs a small share of what polling would.
- Trouble stays with the account, pool or marketplace it belongs to, and the core never changes for a new marketplace.

**Costs**

- The host is large: approval flows, token refresh, signing, budgets, pools and notice checks all live there.
- Amazon's notices need an AWS bridge: a second cloud to deploy, watch and keep a secret for.
- Every marketplace needs a simulator and recorded replies, and the contract suite grows with each capability.
- A raise waits for a complete order read: up to a few minutes on Amazon, and a lost eBay notice is found within the hour.
- The shared pools cap how many accounts can go live until a marketplace raises its limit.

## Alternatives rejected

- **Each connector holds its own credentials and HTTP client:** secrets, limits and shadow mode would be scattered, and one mistake could leak a token.
- **One large contract for every feature:** every connector would stub calls it has no use for.
- **A separate service per marketplace:** one operator cannot run a fleet, and every change would cross a network before the gate.
- **Polling as the way orders come in:** slower, and it spends the shared allowances.
- **Trusting the notice body as the order:** notices arrive late, twice or out of order, and some carry only ids.
- **Reading Amazon's queue from Vervoro directly:** a Worker would hold AWS credentials; the bridge keeps one inbound path.
- **Rate limits per account only, or a pool without a reserve:** whoever calls first spends the day, and a decrease can be left without a call.
- **Claiming pool calls in blocks:** saves round trips only far above any daily pool, and lets a pool run over.
- **No scheduled read, one a day, or the same short interval everywhere:** a lost notice would be found too late, or eBay's shared order allowance would not last the day.
- **Raising on notices alone:** a notice proves an order exists, never that none is missing.
- **Testing against marketplace sandboxes:** slow, limited and unable to produce the failures that matter.
- **Retrying a timed-out write by default:** the marketplace may already have applied it.

## Open items

- **Launch gate figures are proposals.** The notice miss rate, the 99th-percentile delay and the exposure limit in [SPEC 11](spec/#11-shadow-mode-and-launch-gates) need the owner's numbers.
- **Marketplace limits** were checked on 17 and 18 October 2026; recheck them before launch.
- **Recorded replies** for every call the launch connectors make are a pre-launch task, with each marketplace's items in its record.
