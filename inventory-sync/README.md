# ADR-008: Inventory sync

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026; unknown writes settled by ADR-004's rule, 21 October 2026; split into ADR, SPEC and RUNBOOK, with each listing's figure worked out by Stock sync after the stock commit ([ADR-000 SPEC 4.6](../system-architecture/spec/#4-the-foundation-and-the-launch-modules), owner ruling), 21 October 2026 |
| **Scope** | The Stock sync module: the figure per listing, when a figure is sent and when it may wait, what Vervoro believes each marketplace shows, the order read before a raise, confirming every write, limits and who goes next, the low-stock policy, listing modes and stopping, held raises, shadow and going live, recovery, and what the seller and the operator are told |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-003](../product-model/), [ADR-004](../channel-connectors/) with [ADR-004.1](../ebay-connector/), [ADR-004.2](../amazon-seller-connector/) and [ADR-004.3](../shopify-connector/), [ADR-005](../catalogue-sync/), [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/), [ADR-012](../billing-and-plans/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-008-inventory-sync) |

## Context

- **A figure that is too high oversells.** Marketplaces count an oversell against the seller's account. A figure that is too low loses a sale the seller can see. When unsure, Vervoro errs low.
- **No marketplace hears about a sale at the same moment.** There is always a delay before the other channels get a new figure. The design keeps the exposure small where stock is short, and never claims it is zero.
- **Every write costs something.** eBay allows a listing 250 revisions a day and shares 5,000 Trading calls a day across every seller. Amazon allows 5 listing updates a second per seller, and Shopify meters cost points per shop. Marketplaces also overwrite whatever they show, so a careless write can undo a sale they just counted.
- **Things fail.** Calls time out, workers crash, marketplaces go down, and a company is restored from a backup. Nothing may be sent twice by mistake, and nothing may be lost.
- **One operator runs the platform.** Every rule must earn its place by a failure it prevents at launch, for 5 to 10 sellers and then 100.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **Stock sync is the only writer of each listing's figure, and works it out after the stock commit.** Inventory writes each stock change with its ledger sequence and an outbox note, in one transaction. Stock sync hears the note after commit and reads the links through Listings' port. It keeps one row per linked listing, holding the figure and the ledger sequence it came from, and an older sequence never replaces a newer one. The figure is one warehouse's sellable stock, less the units kept for another account, the account's buffer and the units of open import problems, divided by units per sale. For a bundle it is the scarcest component. This record owns that rule (owner ruling, [ADR-000 SPEC 4.6](../system-architecture/spec/#4-the-foundation-and-the-launch-modules)).
2. **One belief per listing:** the figure Vervoro believes the marketplace shows. Vervoro lowers it only on evidence: a confirmed write, a read, or a sale the marketplace is known to take from that figure, so Vervoro's own errors are upward. A figure set outside Vervoro (by the seller or another tool) is drift and can leave the belief low until it is found: by notice on Amazon and Shopify, within 6 hours on eBay inventory items, and within a day on eBay Seller Hub listings ([SPEC 6](spec/#6-confirming-every-write)).
3. **Near zero, every change is sent. Above that, a figure is sent once it is 20 away from what the channel shows.** The zone near zero is at least 20 listing units wide, and wider for a listing that sells in large order lines. The tolerance of 20 applies only where a channel's own sales are known to come out of Vervoro's figure. Everywhere else, every change is sent.
4. **No raise leaves before a complete order read covers the moment it became due,** plus two minutes for clocks. A held raise never holds a decrease.
5. **Every write is single, keyed and confirmed.** There is one writer per listing and one open write at a time (an Amazon decrease may overtake one). Each write has a deadline and is read back. Amazon's `accepted` does not count as applied. An unknown write is settled before anything else is sent, by [ADR-004's rule](../channel-connectors/spec/#5-retries-and-outcomes), including its eBay Trading exception.
6. **Lanes and limits follow ADR-004.** Decreases and every change near zero use the safety lane. eBay's 250 revisions are counted per listing over a rolling 24 hours, and the last ones are kept for a zero. Amazon stock goes by single patches.
7. **One low-stock policy:** the last 2 units are kept for one account. Either the number kept or the account can be changed per product, until an end date, so a campaign on Amazon is a dated keep.
8. **Every stop asks one question, at every scale:** leave the figure, or send 0. A listing is managed or not managed. A company closed for non-payment carries out each account's answer, and its accounts then only lower figures until it is erased ([ADR-012](../billing-and-plans/)).
9. **Shadow before live, and again after a restore or a reconnect.** A company's first go-live compares the old system's stock twice and moves every account the old system served at once. A listing showing more than Vervoro's figure is never accepted as explained. A restore raises the company's sync epoch, so no write from before it can be mistaken for one after it.
10. **The seller sees what every marketplace shows, and how fresh it is.** One kind of problem is also emailed: a marketplace showing more than the seller has, which Vervoro cannot fix. The operator is paged for a stalled sync, never per listing. *Later: Amazon Vendor accounts, which get no figure from this record, with ADR-004.4.*

## How a figure travels

<!-- DIAGRAM -->

A stock change commits in Inventory with its ledger sequence and an outbox note. Right after commit, Stock sync hears the note, reads the product's sellable and the listing links, and updates each listing's row unless it already holds a newer sequence. Stock sync's work list is a query: every listing whose figure differs from what the marketplace is believed to show, and whose rules say it is due. It takes the listing's write lease and a call from the account's budget on the right lane, and hands the write to the egress gate. In shadow, the gate records the write; in live mode, it sends it. Outcomes, read-backs, notices and the channel's own sales update the belief, and the same rules run again.

## Consequences

**Gives**

- Near zero, every channel hears every change at once, and the last 2 units can be sold by only one channel.
- A busy listing costs one write per 20 sales, so eBay's revision cap and the shared Trading pool hold at every stage.
- No raise lets a marketplace sell stock whose order Vervoro has not seen.
- Every write is confirmed, and a crash, an outage or a restore loses nothing and sends nothing twice.
- Inventory knows nothing of listings, and the company's lock never covers a link read.

**Costs**

- Above the zone, a channel can show up to 19 more than its figure. That matters only if the channels together sell more than the figure in the minute or two before the next write.
- Raises wait for an order read: under a minute on Shopify, a few minutes on eBay, 5 to 8 minutes on Amazon.
- An Amazon account on several marketplaces gets no savings: every sale is a write.
- Each account is served by one warehouse, and a company's first go-live moves every account the old system served at once.
- More than 10 eBay Seller Hub accounts need eBay's Application Growth Check.

## Alternatives rejected

- **Inventory writes each listing's figure in the stock transaction:** Inventory would have to know listings, links and pack sizes, and the company's lock would cover link reads ([ADR-000](../system-architecture/)).
- **Sending every change at once:** it spends eBay's 250 revisions by mid-afternoon on a busy listing, for no protection while stock is plentiful.
- **A fixed floor of 10 under a tolerance of 20:** a channel can show 19 too many between 11 and 29.
- **A floor that grows with two hours of sales:** it sizes for hours a risk that lasts minutes.
- **Amazon listings feeds for raises:** feeds take hours and run out of order, so a raise can overwrite Amazon's own sales.
- **Dividing an Amazon figure by its marketplaces while low:** this hides the last units entirely.
- **A queue of messages per listing:** old figures would replay; one row per listing sends only the latest.
- **Hourly reads of every listing:** at scale this breaks eBay's page cap and Amazon's application read ceiling.
- **Reading back every eBay and Shopify write:** both answer at once, and a Trading read costs a shared call.
- **A heartbeat listing written every 15 minutes:** paging on the oldest unsent figure finds a stalled sync without writing anywhere.
- **Paused and set-once listing modes:** not managed, with an optional end date, covers both.
- **A daily stock import from the old system during shadow:** two imports find the same missing order types.
- **Display caps and full campaign mode:** no launch failure needs them once the tolerance cuts writes.

## Open items

- **eBay's monthly revision limit.** A 2,000-a-month limit per item appears only in a 2011 change history. The operator asks eBay's developer support; if the limit no longer applies, its rule goes.
- **eBay's revision day.** eBay does not say which time zone the day is in, nor how variations count. The rolling count assumes the worst; recheck before launch.
- **Application Growth Check.** The default Trading pool serves 10 Seller Hub accounts. Request the Growth Check in time for each stage.
- **Amazon accounts on several marketplaces.** Whether Amazon keeps the marketplaces in step can be proved from notices during shadow; until then these accounts get no tolerance.
- **Marketplace limits** were checked against each marketplace's documentation on 18 October 2026; recheck them before launch.
- **Amazon Vendor** waits for ADR-004.4.
