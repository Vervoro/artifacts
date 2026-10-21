# ADR-009: Buyer data and privacy

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026; the seller's users' sign-in data added with [ADR-013](../sign-in/), and split into ADR, SPEC and RUNBOOK with Buyer data as the core module that alone writes buyers' names and addresses, 21 October 2026 |
| **Scope** | The Buyer data module and the personal data of marketplace buyers: who is responsible for it, what is kept, where, who sees it, how long it is kept, how it is erased, buyers' requests, incidents, the security controls marketplaces ask for, and each marketplace's own rules |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-002](../data-retention/), [ADR-004](../channel-connectors/) with [ADR-004.1](../ebay-connector/), [ADR-004.2](../amazon-seller-connector/) and [ADR-004.3](../shopify-connector/), [ADR-010](../users-and-access/), [ADR-013](../sign-in/); used by [ADR-007](../order-ingestion/), [ADR-011](../invoicing-and-vat/) and [ADR-014](../fulfilment/) |
| **SPEC** | [The rules to build from, the evidence and how to check them](spec/) |
| **RUNBOOK** | [The procedures for this record](../runbooks/#adr-009-buyer-data-and-privacy) |

Marketplaces read this record in their data-protection reviews. The SPEC holds the evidence: the [data inventory](spec/#4-what-is-kept), the [sub-processors](spec/#3-sub-processors), the [security schedule](spec/#14-security-controls) and the [constraints with their sources](spec/#19-constraints).

## Context

- **A seller who ships their own orders needs each buyer's name and address** to pack and label the parcel. That makes buyer data the most sensitive data Vervoro holds: a seller with 2,000 orders a day puts about 60,000 addresses through it each month.
- **Marketplace rules are stricter than the law.** Amazon allows buyer data only to ship and for tax, and for no longer than 30 days after delivery. eBay and Shopify review an app before it sees names and addresses. Losing a marketplace's approval ends the product for every seller on it.
- **The seller decides; Vervoro carries out.** The buyer is the seller's customer, and asks the seller or the marketplace, never Vervoro. Vervoro still has to act within the time the law and the marketplace allow.
- **One operator and a small team.** Every rule has to run by itself and be proved by a check or a test.

## Decision

1. **The seller is the controller and Vervoro the processor** of buyer data, under a data processing agreement every company accepts before it connects a marketplace. Vervoro publishes its sub-processors and gives 30 days' notice of a change. Marketplace terms bind Vervoro directly; where one is stricter, Vervoro follows it.
2. **Only what a parcel and its tax need is kept:** the recipient's name, the delivery address and phone, the order note, the gift message, a business buyer's company name and VAT number, the tracking number and the label file. No buyer email, no billing address or payment details, and no profile across orders, marketplaces or sellers. An eBay buyer's user id is kept only as a keyed hash.
3. **Buyer data is a core module, and lives in one place.** Buyer data alone writes buyers' names and addresses, anonymises them and records who viewed them ([ADR-000](../system-architecture/)). They are stored only in the company's cell and its label files, in the EU, encrypted in transit, at rest, and field by field under the company's own key ([ADR-001](../database-architecture/)). They never go to the control database, queues, Durable Objects, logs, URLs, caches, emails, the client's storage or the AI provider.
4. **Who sees it depends on the role and the order's state.** Owners, admins and managers see it while the order holds it. Warehouse users see it in their own warehouses from picking until 24 hours after shipping, for label reprints ([ADR-014](../fulfilment/)). Accountants see it only on issued invoices, staff never. Every view writes an entry to `audit_log`.
5. **No one at Vervoro has standing access.** The operator works under a grant for one company, with a written reason, for at most 8 hours, which the seller sees and can end; buyer fields stay encrypted unless the seller's owner or admin switches them on ([ADR-010](../users-and-access/)). Developers never reach production data.
6. **Buyer data is anonymised 30 days after delivery** ([Amazon's Data Protection Policy 2.1](spec/#19-constraints)), counted from dispatch when no delivery date is known, so the limit is never passed. A cancelled order counts from its cancellation, an ended connection from its end, and a buyer's erasure is carried out at once. Once anonymised, an order never stores personal data again; it keeps its ids, dates, lines, lots, carrier and the destination's country and tax territory.
7. **An issued VAT invoice is kept unchanged for the statutory period,** because tax law requires the copy ([ADR-011](../invoicing-and-vat/)). A consumer gets an invoice only on request or where the law or marketplace requires one, simplified without buyer details wherever the law allows.
8. **Erasure reaches everything.** A buyer's request arrives through the seller or a marketplace and is carried out at once; access requests are prepared for the seller within 7 days. Backups expire within 30 days and are beyond use until then: every restore replays the erasures made since, before anyone reads it. An export holds buyer data only for orders that still have it, and only an owner or admin can make one.
9. **An incident that touches buyer data is critical.** Affected sellers and every marketplace whose data is involved are told within 24 hours of Vervoro becoming aware (Amazon: [DPP 1.6.3](spec/#19-constraints)). Where Vervoro is itself the controller, it tells the regulator within 72 hours. Security controls follow Amazon's schedule, the strictest, for every marketplace.
10. **No real buyer data outside production.** Simulators, tests, fixtures, recordings and demos use synthetic buyers from reserved ranges, and a build check refuses anything else. Each marketplace's own rules are met by its connector and the host: Amazon's restricted role, eBay's account deletion notices matched by hash. *Later: Shopify's level 2 protected customer data and privacy webhooks, with [ADR-004.3](../shopify-connector/).*

**The seller's users' sign-in data** is not buyer data; Vervoro is its controller, under its privacy notice. Each login's email address and name are stored readable in the control database's `auth` schema, reachable only by the sign-in Worker ([ADR-013](../sign-in/)). No third-party identity provider owns or acts as the system of record for Vervoro user identities or email addresses. Authentication data remains in Vervoro-controlled infrastructure. An email-delivery provider receives an address only to deliver that email ([SPEC 17](spec/#17-the-sellers-users-sign-in-data)).

## At a glance

| Question | Answer | Rules |
| --- | --- | --- |
| What is kept? | Recipient name, delivery address and phone, note, gift message, business VAT details, tracking, label files | [SPEC 4](spec/#4-what-is-kept) |
| Where? | The company's cell and its label files, in the EU, encrypted per field under the company key | [SPEC 5](spec/#5-where-it-lives), [6](spec/#6-encryption-and-keys) |
| Who can see it? | By role and order state; every view logged; operators only under a grant | [SPEC 7](spec/#7-who-can-see-it) |
| How long? | 30 days after delivery, dispatch as the fallback; at once on erasure | [SPEC 8](spec/#8-retention-and-anonymisation) |
| How is it erased? | Fields cleared and label files deleted in one transaction; backups expire in 30 days; restores replay erasures | [SPEC 10](spec/#10-buyers-requests), [11](spec/#11-erasure-backups-and-restores) |

## Consequences

**Gives**

- One rule for every marketplace, set by the strictest, so no seller needs a setting to stay compliant.
- One record, with its evidence, to show in each marketplace's data-protection review.
- A database dump, a backup or a console query shows no readable buyer data.
- Every view of buyer data has a person and a reason behind it.
- A buyer's erasure reaches the live cell at once and backups within 30 days, and survives a restore.

**Costs**

- Every view writes an audit entry, and screens read buyer fields through the API, never from live updates.
- Sellers cannot search old orders by a buyer's name or address, and a recall reaches buyers only through the marketplace.
- Without buyer email, carriers get only a phone for delivery notices.
- Delivery dates must be tracked to use the full 30 days; without them, orders lose buyer data earlier.
- The security schedule is standing work for one operator: monthly scans, quarterly reviews, a yearly test.

## Alternatives rejected

- **Vervoro as controller of buyer data:** the seller decides to sell and ship; Vervoro would owe duties to buyers it never deals with.
- **A retention period per marketplace:** more rules to get wrong; Amazon's is the strictest, so one rule meets all.
- **30 days after dispatch for every order:** compliant, but cuts the time for a late delivery or a return.
- **Keep the postcode district and town:** Amazon counts postal codes as personal data, and with dates and items a district can single out a person.
- **Keep the buyer's email:** carriers accept a phone, marketplaces relay or mask emails, and it is one field less to protect.
- **Database encryption alone:** a dump, a backup or a console query would show buyer data in clear.
- **A key per order, destroyed at anonymisation:** needs a key store outside the database whose loss destroys data; backups already expire in 30 days.
- **Rewrite backups to erase:** snapshots are immutable; putting them beyond use and replaying erasures is what the regulator describes.
- **Store eBay user ids:** eBay's terms forbid it; a keyed hash matches without keeping them.
- **Copy production data to staging:** real buyers would leave production; simulators do the same job.

## Open items

- **The email provider for mail other than sign-in** (alerts and digests to the seller's users) is not chosen, nor its data-processing terms and region. Sign-in mail goes through Cloudflare's Email Service.
- **The data processing agreement, the sub-processor page and the privacy notice** need writing and legal review before the first seller connects.
- **The incident response plan** needs writing, approval and a first test before launch; Amazon asks for it reviewed every six months.
- **The first penetration test, vulnerability scanning and the risk assessment** are pre-launch work with no date yet.
- **Marketplace and legal constraints** were checked on 18 October 2026 (Amazon's Data Protection Policy rechecked 21 October 2026); recheck them before launch.
