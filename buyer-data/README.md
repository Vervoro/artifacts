# ADR-009: Buyer data and privacy

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026 |
| **Scope** | The personal data of marketplace and website buyers: who is responsible for it, what is kept and why, where it lives, who sees it, when it goes, how buyers' requests and incidents are handled, the security controls marketplaces ask for, and each marketplace's own rules |
| **Builds on** | [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-002: Data retention and archiving](../data-retention/), [ADR-004: Channel connectors](../channel-connectors/) and its records for [eBay](../ebay-connector/), [Amazon](../amazon-seller-connector/) and [Shopify](../shopify-connector/), [ADR-003: Product model](../product-model/) |

## Context

A seller who ships their own orders needs the buyer's name and address to pack and label each parcel. That makes buyer data the most sensitive data Vervoro holds. A seller with 2,000 orders a day puts about 60,000 buyers' addresses through Vervoro each month.

Earlier records already decide parts of this:

- **ADR-001:** buyer contact fields are encrypted under each company's own data key, and erasing a company destroys that key.
- **ADR-002:** buyer data is anonymised 30 days after delivery (after dispatch when no delivery date is known), and only anonymised order history is archived.
- **ADR-004:** a notice is never queued with the buyer's details, and the host handles privacy requests itself.
- **ADR-004.1, ADR-004.2 and ADR-004.3:** eBay's account deletion notices, Amazon's restricted role and 30 days after delivery, and Shopify's protected customer data and three privacy webhooks.
- **ADR-003:** a recall finds the buyer's country and date for each lot.

This record ties those pieces into one design. Marketplaces read it in their data protection reviews. It is numbered 009 because earlier records already point to ADR-007 and ADR-008. It is written before ADR-007 (order ingestion), because that is where buyer data comes in, and ADR-007 follows its rules.

The design has to meet these requirements:

- **Marketplace rules are stricter than the law.** Amazon allows buyer data for no longer than 30 days after delivery, for shipping and tax only. Shopify and eBay review an app before it may see names and addresses. Losing a marketplace's approval ends the product for every seller on it.
- **The seller decides; Vervoro carries out.** The seller chooses to sell and ship, and the buyer is the seller's customer. Vervoro handles buyer data only to do that work for the seller.
- **One operator and a small team.** Every rule has to run by itself, and be proved by a check or a test.
- **Buyers ask through others.** A buyer asks the seller or the marketplace, never Vervoro. Vervoro still has to act within the time the law and the marketplace allow.

**Out of scope.** Suppliers are business contacts, covered by a future purchasing record. The seller's own users (their staff accounts) are Vervoro's account data. They are covered by Vervoro's privacy notice, and they get the same security controls.

## Decision

1. **The seller is the controller and Vervoro is the processor** of buyer data, under a data processing agreement that every company accepts before it connects a marketplace. Vervoro publishes its list of sub-processors and gives 30 days' notice of a change.
2. **Only what is needed to ship is kept:** the recipient's name, the delivery address with its phone number, the order note and the gift message. Buyer email is not kept. An eBay buyer's user id is kept only as a keyed hash. Buyer data is never gathered across orders into a profile.
3. **Buyer data lives in one place:** the company's cell, plus its shipping label files. It never goes to the control database, queue messages, logs, telemetry, URLs, caches, emails, the client's storage or the AI provider.
4. **It is encrypted three times:** TLS 1.2 or higher in transit, storage encryption at rest, and every buyer field encrypted on its own under the company's data key (ADR-001).
5. **Who sees it depends on the role and the order's state.** Packers see an address only while its order is being packed and shipped. Every view of buyer data is logged.
6. **No one at Vervoro has standing access.** The operator gets a time-limited grant with a recorded reason, and the seller sees it. Developers have no access to production data.
7. **Buyer data is anonymised 30 days after delivery.** When no delivery date is known, the 30 days count from dispatch. An order cancelled before dispatch counts from its cancellation. When a connection ends, the data of all its orders goes within 30 days. A buyer's erasure request is carried out at once.
8. **After anonymisation, the order keeps** its marketplace order id, dates, lines, lots, carrier and the destination's country and tax territory. Name, street, town, postcode, phone, tracking number, note, gift message and label files are gone. Nothing personal is stored for that order again. An order delivered outside the UK also keeps its carrier, tracking number, dispatch date and the carrier's delivery event (date and country), as export evidence, for the statutory period ([ADR-011](../invoicing-and-vat/)).
9. **An issued VAT invoice is kept unchanged for the statutory period (ADR-002 keeps accounting records 7 years from the end of their month),** because tax law requires the copy. Consumer invoices carry buyer details only where the invoice type requires them.
10. **Buyers' requests arrive through the seller or a marketplace.** Each becomes a privacy request with a due date. Erasure runs at once; access and correction are prepared for the seller within 7 days.
11. **Erasure reaches backups when they expire, within 30 days.** Until then they are beyond use: a restore re-applies every erasure made since the backup before anyone can read it. The archive holds buyer details only on retained invoices.
12. **An incident that touches buyer data is critical.** Vervoro tells the affected sellers and every marketplace whose data is involved within 24 hours of becoming aware. Where Vervoro is itself the controller, it tells the regulator within 72 hours.
13. **Security controls follow the strictest marketplace's schedule:** multi-factor sign-in for every user, central security logs kept 12 months, monthly vulnerability scans, a yearly penetration test, quarterly access reviews, and a written incident response plan reviewed every six months.
14. **No real buyer data outside production.** Simulators, tests, fixtures and demos use synthetic buyers from reserved ranges, and a build check refuses anything else.
15. **Each marketplace's own rules are met by its connector and the host:** Amazon's restricted role and its token for restricted calls, Shopify's level 2 protected customer data, and eBay's account deletion notices matched by hash.
16. **A company export holds buyer data only for orders that still have it.** Only an owner or admin can make one, and the file is encrypted with a link that expires.

## Roles and agreements

**The seller is the controller.** The seller sells to the buyer, chooses the carrier and decides to ship. Vervoro processes buyer data only on the seller's instructions, which are the product's settings and actions. Vervoro is the controller only of its own account data (the seller's users, billing and sign-in) and of its platform security logs.

**The data processing agreement** is part of the customer terms, and a company accepts it before connecting its first marketplace. It covers what UK and EU law require of a processor contract:

- Vervoro acts only on the seller's documented instructions.
- Everyone who can reach buyer data is bound to confidentiality.
- The security measures in this record are part of the agreement.
- Sub-processors are used only under the seller's general authorisation. A change is announced 30 days ahead, and a seller who objects may leave before it takes effect.
- Vervoro helps the seller answer buyers' requests and meet its own breach duties.
- At the end, the seller's data is deleted, after an export if the seller wants one, except what the law requires Vervoro to keep.
- The seller may audit, through Vervoro's evidence first and an inspection when that is not enough.

**Marketplace terms also bind Vervoro directly.** Amazon's Data Protection Policy and Acceptable Use Policy apply to Vervoro as the solution provider. eBay's API License Agreement treats every developer as an independent controller of the data eBay sends. Shopify's API terms apply to Vervoro as the app developer. Where a marketplace is stricter than the processing agreement, Vervoro follows the marketplace, and the agreement tells the seller so.

**Sub-processors.** The published list names each provider, what it does and where. At launch:

| Sub-processor | What it does | Buyer data it handles |
| --- | --- | --- |
| Cloudflare | Runs the application, the inbound queue, the per-company live updates and object storage; the application is placed in the EU, and requests pass through Cloudflare's global network | All of it, while serving requests; label files at rest |
| Neon | Runs the Postgres databases in the EU | All of it, at rest and encrypted field by field |
| Amazon Web Services | The small relay that receives Amazon's notices and posts them to Vervoro | Amazon's order notices, which carry a destination postcode and no name or address; nothing is stored beyond the queue's own retries |
| Email delivery provider | Sends emails to the seller's users | None: emails name an order, never a buyer |
| AI provider | Answers the seller's users' questions and proposals | None: buyer fields are masked before any call (ADR-001's field tags) |

**Carriers are the seller's, not Vervoro's.** The seller connects their own carrier accounts. Sending an address to the seller's carrier to buy a label is the seller's instruction, and the carrier works for the seller.

## What is kept, and why

Each field is kept only for a stated purpose, and only from the marketplaces that send it.

| Field | Why it is kept | Until |
| --- | --- | --- |
| Recipient name | The label and the packing slip | Anonymisation |
| Delivery address lines, town, postcode | The label | Anonymisation |
| Country, and tax territory where it differs (Northern Ireland, the Canary Islands and the like) | VAT on the sale, reports | Kept with the order |
| Delivery phone | Carriers need a phone for delivery notices and failed deliveries | Anonymisation |
| Order note, gift message | The packer reads them; a gift message is printed | Anonymisation |
| Business buyer's company name and VAT number, when the marketplace gives them | A business invoice | Anonymisation, except on an issued invoice |
| eBay buyer's user id, as a keyed hash | Matching eBay's account deletion notices | Anonymisation |
| Tracking number | Confirming the shipment and following delivery | Anonymisation; for an order delivered outside the UK, kept with the carrier's delivery event as export evidence for 6 years ([ADR-011](../invoicing-and-vat/)) |
| Label file | Printing and reprinting the label | Anonymisation |

What is never kept:

- **Buyer email.** Carriers accept a phone, and marketplaces relay or mask buyer emails anyway. A seller who writes to a buyer does it through the marketplace.
- **Billing addresses and payment details.** Payment stays with the marketplace. The one exception is the customer's address printed on an issued full invoice, kept only on the invoice ([ADR-011](../invoicing-and-vat/)).
- **A buyer's identity across orders.** Each order's buyer data belongs to that order only. Vervoro never builds a buyer profile, never matches buyers across marketplaces or sellers, and never uses buyer data for marketing, reviews or anything but shipping, tax and the seller's own service to that order.
- **The eBay user id itself.** eBay's terms forbid storing it, so only a hash is kept.

**Masked and missing values stay missing.** What a marketplace withholds or masks is left out, never stored as blank. A later read without a field never erases what an earlier read kept, and never makes a value up (ADR-004).

**Every buyer field is declared as personal.** The `pii` field tag of ADR-001 marks it. The tag drives encryption, masking, logging rules, anonymisation, export and the AI mask from one declaration. A build check refuses a column that holds buyer data without the tag.

## Where it lives and how it is protected

**One place.** Buyer data is stored only in the company's rows in its cell (ADR-001), and in the company's label files in object storage. Both are in the EU.

**Never anywhere else:**

- **Queue messages** carry the topic, the notice id, the account and the order ids (ADR-004). The webhook body is not kept.
- **The outbox, events, outbound sends and live updates** carry ids and statuses. A screen that needs a name reads it through the API, so the view is logged.
- **Logs, telemetry, error reports and analytics** never carry a buyer field. The logger drops any value from a `pii` field, and a test proves it.
- **URLs** never carry buyer data. A search by phone goes in the request body.
- **Caches.** Hyperdrive's query caching is off (ADR-001). No other cache holds buyer data.
- **Emails and push notices** to the seller's users name the order number, never the buyer.
- **The phone client** keeps buyer data in memory for the screen being shown, never in the device's storage. Labels are printed, not saved on the device.
- **The control database** holds no buyer data.

**Encryption.**

- **In transit:** TLS 1.2 or higher on every connection, inside and outside the platform, including to the databases and object storage.
- **At rest:** the database and object storage encrypt everything they store, backups included.
- **Field by field:** each buyer field is encrypted with AES-256-GCM under the company's data key, with the company id as associated data (ADR-001). A row read under the wrong company fails to decrypt. A database dump, a backup or a console query shows only ciphertext.
- **Keys:** each company's data key is wrapped by a key-encryption key held as a platform secret, never in the database. The key-encryption key is rotated every year and at once on any suspicion, by re-wrapping the company keys.
- **Label files** are encrypted with the company's data key before they are stored. They go to a bucket without versioning, so deleting one deletes it.
- **Search:** the only search on buyer data is ADR-001's exact-match blind index on the phone number. Buyer email is not kept, so it has no index. The index entry is removed with the field.

## Who can see it

**Seller's users** see buyer data by role and by the order's state. Everyone else sees the order masked: its number, country and lines.

| Role | Sees name, address and phone | When |
| --- | --- | --- |
| Owner, admin, manager | Yes | Any order that still holds buyer data, to serve the buyer |
| Warehouse | Yes, in their warehouses only | From picking until the order is shipped, plus label reprints for 24 hours after |
| Accountant | Only as printed on issued invoices | Never on orders |
| Staff | No | Never |

**Every view is logged.** Opening an order with buyer data, the packing screen, printing or reprinting a label, a buyer search and an export each write one entry to `audit_log`: the user, the order, the fields shown, the screen and the time. Lists show no buyer data, so they write nothing. The seller sees the entries in their audit log. `audit_log` is kept at least a year (ADR-001).

**The operator** has no standing access to any company. To help a seller, the operator opens an access grant, which the seller is told about at once and can end ([ADR-010](../users-and-access/)):

- for one company, with a written reason, for at most 8 hours;
- with buyer fields still masked, unless the reason names a buyer-data need (for example, the seller asked to fix an address);
- recorded in the company's audit log, so the seller sees it, and in a platform security log kept 12 months that holds no buyer data.

**Developers** have no access to production data. The database owner role is used only by the CI migration job; the slice operation and the archiver run as the lifecycle role, which cannot bypass row-level security (ADR-001). A person using the owner role in an emergency does so through that job, records the reason first, and it alerts the owner. Even then, buyer fields are ciphertext.

**Leavers and changes.** A person's access to the platform ends within 24 hours of leaving or changing role, and access is reviewed every quarter.

## Retention and anonymisation

**The rule:** buyer data is anonymised 30 days after delivery, as Amazon's Data Protection Policy requires, and the same rule applies to every marketplace and website.

| The order | The 30 days count from |
| --- | --- |
| Delivered, with a delivery date from the carrier or the marketplace | Delivery |
| Dispatched, with no delivery date known | Dispatch, which always comes before delivery, so the limit is never passed |
| Shipped outside Vervoro | The shipping time the marketplace gives |
| Cancelled before dispatch | The cancellation |
| On a connection that ended or whose access was revoked | The end of the connection, whatever the order's state |
| Named in a buyer's erasure request | No wait: at once |

An order still to be shipped keeps its address, because it is still needed. This reconciles ADR-002's "30 days after dispatch" with ADR-004.2's "30 days after delivery": delivery is the rule, and dispatch is the fallback that can never be late.

**How it runs.** Each order with buyer data has a due time in the cell's `due` table (ADR-001). When it comes, the sweeper, in one transaction per company:

1. clears every `pii` field on the order and its lines;
2. removes the phone's blind index entry and the eBay hash;
3. marks the order anonymised, with the time and the reason;
4. deletes the order's label files.

**Once anonymised, never again.** The order keeps a marker. A later read or notice that brings the buyer's details back stores nothing personal for that order.

**Proof.** A nightly check counts orders past their due time that still hold buyer data, per company. Anything but zero alerts the operator.

**What survives, and why.**

| Kept | Why |
| --- | --- |
| Marketplace order id, order and dispatch dates, lines, prices, totals and fees | Accounting records required for 6 years; a return, refund or claim found by order id |
| Batch and lot shipped | A recall: the lot gives every order, country and date (ADR-003). To reach the buyers, the seller uses the marketplace's own messaging with the order id |
| Country, and tax territory where VAT treats part of a country differently | VAT on the sale |
| Carrier and service | Reports |

The postcode district and the town are not kept. Amazon's policy counts postal codes as personal data. With a date and the items bought, a district can single out a person. The tax territory gives what VAT needs without them.

**Invoices.** UK law does not require a VAT invoice for a sale to a consumer. A full VAT invoice must carry the customer's name and address. A simplified invoice, allowed in the UK up to £250 and in the EU up to at least 100 euros, needs no customer details. So:

- **To a consumer,** Vervoro issues an invoice for the seller only when the buyer asks, or when the law or the marketplace requires one. It is a simplified invoice without buyer details wherever the law allows.
- **To a business, or a consumer who asked for a full invoice,** the invoice carries the name and address the law requires.
- **Every issued invoice is kept unchanged for the statutory period (ADR-002 keeps accounting records 7 years from the end of their month),** because HMRC and EU law require the copy. This is the legal requirement Amazon's policy allows.
- **After the order is anonymised,** the invoice is shown only to owners, admins and accountants, each view logged. It is not searchable by buyer, and it moves to the archive with its month (ADR-002), encrypted with the company's key.

## Buyers' requests

A buyer asks the seller or a marketplace, never Vervoro directly. Each request becomes a privacy request in the company: who sent it, what it names, the due date, and when it was done. It holds order ids, never the buyer's details.

| Request | Arrives from | Vervoro does | Due |
| --- | --- | --- | --- |
| Erasure | The seller, on a buyer's request; Shopify's `customers/redact`; an eBay account deletion that matches a buyer | Anonymises the named orders at once, as above | At once |
| Access | The seller; Shopify's `customers/data_request` | Prepares the buyer's data on the named orders as a file for the seller | 7 days, so the seller meets the law's one month |
| Correction | The seller | The corrected field is saved, marked as set by a person, and a later marketplace read does not overwrite it | At once |
| Forget a shop | Shopify's `shop/redact`, 48 hours after the app is uninstalled | The shop's buyer data is deleted; the connection has already ended | At once, within Shopify's 30 days |
| Delete on Amazon's notice | Amazon, under its policy | The named data is deleted | Within Amazon's 30 days |

**Finding the buyer's orders.** A request names orders by their marketplace order ids, or the seller finds them by an exact phone number. An eBay account deletion names a user, not an order, so it is matched by hash (below).

**What an erasure keeps.** An issued invoice stays, because the law requires it. The request records that the invoice was kept, and why, so the seller can tell the buyer.

### One buyer's erasure, end to end

1. **The live cell.** The named orders are anonymised in one transaction, label files deleted, and the privacy request marked done.
2. **The erasure register.** The company's completed erasures (order ids and times only) are also written to the erasure register in the control database and to an append-only file in object storage, both outside the cell and its backups (ADR-001).
3. **Backups.** The cell's point-in-time history (7 days) and nightly snapshots (30 days) still hold the old values, encrypted field by field. They are beyond use: nobody reads a backup except to restore, and they expire on schedule. Erasure is complete in backups 30 days after it was made.
4. **A restore re-applies erasures.** Restoring one company, or a whole cell, re-applies every erasure in the erasure register made after the restore time, and runs the anonymisation sweep, before the company or the cell is opened to anyone.
5. **The archive.** Orders reach the archive after 24 months (ADR-002), long after anonymisation, so archived orders hold no buyer data. Only retained invoices do, and they stay for their statutory period.
6. **Closing the company.** Erasing the company destroys its data key (ADR-001), which makes every remaining copy unreadable.

## Incidents

**Detection.** These raise an alert to the operator:

- **Canary buyers.** Each cell holds a synthetic buyer on a synthetic company. Any view, export or decrypt of it outside its own test alerts.
- **Unusual reading.** A user viewing far more buyers than their packing explains, a burst of buyer searches, or an export with buyer data.
- **Access.** Every operator grant and every use of the database owner role.
- **Failures that hint at a fault.** A decrypt that fails because the company does not match, an overdue anonymisation, or a log line that looks like an address or a phone.
- **Signals from outside:** a marketplace, a seller, a researcher or a sub-processor reporting a problem.

**Response.** The written incident response plan covers preparation, finding the incident, containing it, removing the cause, recovery and lessons learned. The operator is the incident point of contact, and the owner is the deputy. Containment can revoke sessions, rotate keys, and hold every send to a marketplace (ADR-004).

**Who is told, and when.** Times count from the moment Vervoro becomes aware.

| Who | When | Why |
| --- | --- | --- |
| Each affected seller | Without undue delay, and within 24 hours | The seller is the controller and must decide on telling the regulator within 72 hours, so the 24 hours leave them time |
| Amazon | Within 24 hours, to its security address, when Amazon data is involved | Amazon's Data Protection Policy |
| Shopify | Within 24 hours, through partner support, when shop data is involved | Shopify's API terms |
| eBay | Within 24 hours when eBay data is involved | Vervoro's rule; eBay's terms ask for immediate notice of key compromise |
| The ICO (or the lead EU regulator) | Within 72 hours, where Vervoro is itself the controller and a risk to people is likely | UK and EU GDPR |
| Affected buyers | By the controller, without undue delay, when the risk is high | UK and EU GDPR; Vervoro helps the seller |

Vervoro speaks for itself only: it never speaks for a marketplace to a regulator or a buyer. **Every incident is recorded,** including those that need no notice, with what happened, its effects and what was done.

## Security controls

Amazon's schedule is the strictest of the three marketplaces, so it is the schedule for all of them.

| Control | What Vervoro does | How often |
| --- | --- | --- |
| Multi-factor sign-in | Required for every user of every company, every operator and every developer account | Always |
| Passwords | Where a password is used: at least 12 characters with mixed character types, none of the user's name, the last 10 not reused, changed at least once a year; locked after 10 failed attempts. Passkeys are offered | Always |
| One person, one account | No shared or generic accounts | Always |
| Security logs | Sign-ins, access grants, buyer-data views, exports, key use and admin actions, collected centrally, protected from change, with no buyer data in them | Kept at least 12 months; alerts reviewed continuously, the rest every two weeks |
| Vulnerability scans | Every system that touches seller or buyer data | At least every 30 days, and the code before each release |
| Fixing what scans find | Critical within 7 days, high within 30 days | As found |
| Penetration test | By an outside tester | Every year |
| Access reviews | Every operator, developer and service account | Every quarter |
| Access removal | When someone leaves or changes role | Within 24 hours |
| Incident response plan | Written, approved by the owner, tested | Reviewed every six months and after a major change |
| Backup restore test | A restore, including the erasure replay | Every quarter |
| Key rotation | Key-encryption key and marketplace credentials | Every year, and at once on suspicion |
| Risk assessment | Threats, likelihood and what is done about them | Every year |
| Sub-processor review | Each provider's security against this record | Every year |
| Training | Everyone with access | Every year |

**No real buyer data outside production.**

- **Simulators and tests** use synthetic buyers only: names from a generator, `example.com` and `.test` emails, UK drama phone numbers (07700 900000 to 900999), and the non-geographic postcode `ZZ99 9ZZ`. For example, "Testa Buyer, 1 Example Street, Testville, ZZ99 9ZZ".
- **A build check** scans fixtures, recordings and seed data, and refuses an email, phone number or postcode outside those ranges.
- **Recordings of real marketplace replies,** used to correct the simulators (ADR-000), are made against sandboxes and the team's own test seller accounts. Buyer fields are replaced with synthetic ones before a recording is saved.
- **A production branch** made for a restore holds real data. It is reached only through the lifecycle tool, never by the runtime role, and it is deleted within 24 hours (ADR-001).
- **Staging** runs on simulators and synthetic companies only.

## Per marketplace

### Amazon

- **The restricted role.** Vervoro asks only for Amazon's direct-to-consumer shipping role, which releases the recipient's name, address and phone for orders the seller ships, while they are unshipped or shipped. It does not ask for the tax roles.
- **Reading orders.** The orders API version that Amazon introduced in 2026 releases buyer data through the role alone, with no Restricted Data Token. Vervoro asks it only for the recipient and the gift message, never for the buyer's email. It asks for them only on orders the seller ships that are not yet shipped. Amazon hides the phone itself once the latest delivery date has passed.
- **Restricted Data Tokens.** A call that still needs one (an older operation, or a shipping label bought through Amazon) gets a token for that one order's path and only the data elements it needs. The token is held in memory for its lifetime, never stored and never logged.
- **Use.** Amazon buyer data is used only for shipping the seller's order and for tax, as Amazon's Acceptable Use Policy allows. It is never combined across sellers, never used for marketing or reviews, and never shared beyond the sub-processors listed.
- **Retention and deletion.** Thirty days after delivery. Everything about a seller is deleted within 30 days of the seller removing Vervoro's access, Amazon's notice, or the end of Vervoro's participation, except what the law requires to be kept.
- **Notices.** Amazon's order notices carry a destination postcode. The relay does not store notices, and the queue message carries only ids (ADR-004).

### Shopify

- **Level 2 protected customer data.** Vervoro asks for the name, address and phone fields, because a label needs them. It does not ask for email. Level 2 needs the controls of this record: encrypted backups, test data separate from production, limited staff access, strong passwords, an access log and an incident response policy.
- **Without approval,** Shopify sends the order with those fields empty, and the order arrives without them (ADR-004.3).
- **The three privacy webhooks** are received and checked by their signature; a bad signature gets 401. `customers/redact` anonymises the named orders at once. `customers/data_request` becomes an access request due in 7 days. `shop/redact` deletes the shop's buyer data.
- **Uninstalling** ends the connection, so the shop's buyer data goes within 30 days, as Shopify's API terms require, even before `shop/redact` arrives.

### eBay

- **eBay's terms** ask Vervoro to delete personal data promptly once it is no longer needed, when eBay or the user asks, and within 10 days of leaving eBay's developer programme. They forbid storing eBay user ids. eBay's data processing terms treat each developer as an independent controller of the data eBay sends.
- **Account deletion notices** arrive for every eBay user who closes their account (ADR-004.1). Each is checked by its signature and answered at once.
  - **For a connected seller,** it is a privacy request, as ADR-004.1 decides.
  - **For a buyer,** Vervoro matches it. When an eBay order is imported, a keyed hash of the buyer's user id is stored with the order and in a small lookup table in the cell, `buyer_ref(hash, company_id, order_id)`. It holds only hashes and ids, like the `due` table (ADR-001). A notice is hashed and looked up in each cell with one indexed query. A match anonymises that buyer's orders in their company at once. The notice itself is never kept.
  - **The lookup row** is removed when the order is anonymised, so it lives at most as long as the buyer data.

## Exports and archives

**A company export** (ADR-001) contains the company's data as it is now:

- buyer data only for orders that still hold it, decrypted for the company;
- anonymised orders as they are, with no buyer data;
- issued invoices, as issued;
- the archive files for older months (ADR-002).

**Who and how.** Only an owner or admin can make an export with buyer data; for anyone else, it leaves the buyer fields out. The file is encrypted at rest, offered through a link that expires after 24 hours, and deleted after 7 days. Each export is logged with who made it and what it held.

**A one-buyer file** for an access request holds only the named orders' buyer data, made the same way.

**The archive** holds anonymised orders and retained invoices only, encrypted per company, deleted at the end of the statutory period or when the company is erased (ADR-002).

## How this is proven

| Test or check | Where | Proves |
| --- | --- | --- |
| Field tag lint | CI | Every column with buyer data carries `pii`, is encrypted, and is cleared by anonymisation |
| Log and telemetry redaction | CI | A `pii` value given to the logger, an error report or telemetry never appears in the output |
| Anonymisation due times | CI | Each row of the retention table gives the right due time; an order already anonymised stores nothing personal from a later read |
| Nightly overdue count | Production | No order past its due time still holds buyer data |
| Role and state masking | CI | Each role sees buyer data only in the states the table allows; every view writes one audit entry |
| Erasure replay | CI and the quarterly restore test | A restore to before an erasure opens with that erasure applied |
| eBay deletion match | CI | A buyer's deletion notice anonymises their orders in every cell and leaves nothing stored |
| Synthetic data check | CI | No fixture, recording or seed holds an email, phone or postcode outside the reserved ranges |
| Canary buyers | Production | Reading a canary alerts within minutes |
| Export contents | CI | An export holds buyer data only for orders that still have it, and none for a role that may not see it |

## Constraints

Checked against the official sources on 18 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| Amazon: retention | Buyer data no longer than 30 days after order delivery, unless the law requires longer; kept only to ship, for tax, tax invoices and legal duties | [Data Protection Policy, 2.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: deletion on a trigger | Within 30 days of Amazon's notice, the seller revoking access, or the end of participation | [Data Protection Policy, 1.7](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: incidents | Notice to Amazon's security address within 24 hours; plan reviewed every six months; a named point of contact | [Data Protection Policy, 1.6](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: sign-in | Multi-factor for every user account; password rules (12 characters, 10 not reused, at most 365 days) | [Data Protection Policy, 1.4.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: encryption | At rest at least AES-128 or RSA-2048; in transit TLS 1.2 or higher | [Data Protection Policy, 2.4 and 1.5](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: logs | No personal data in logs; kept at least 12 months; reviewed at least every two weeks | [Data Protection Policy, 2.6](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: schedule | Scans every 30 days, penetration test yearly, critical fixes in 7 days and high in 30, access reviews quarterly, access removed within 24 hours, backup tests quarterly, key rotation yearly | [Key security control guidance](https://developer-docs.amazon/sp-api/docs/guidance-to-address-key-security-controls-in-sp-api-integration) |
| Amazon: use | Buyer data only for merchant-fulfilled shipping and legal duties; no combining across sellers; need-to-know access | [Acceptable Use Policy, 3.9, 4.1 and 4.4](https://sellercentral.amazon.com/mws/static/policy?documentType=AUP&locale=en_US) |
| Amazon: orders API 2026 | Buyer data by role, with no Restricted Data Token; phone hidden after the latest delivery date | [Access orders PII](https://developer-docs.amazon/sp-api/docs/access-orders-pii) |
| Amazon: Restricted Data Token | Needed for restricted operations; names a path (one order or all) and data elements | [Tokens API use case guide](https://developer-docs.amazon/sp-api/docs/tokens-api-use-case-guide) |
| Amazon: order notices | Carry a destination postcode, no name or street address | [Notification type values](https://developer-docs.amazon/sp-api/docs/notification-type-values) |
| Shopify: protected customer data | Name, address, phone and email are level 2, each asked for separately; level 2 adds encrypted backups, separate test data, limited staff access, strong passwords, an access log, an incident policy | [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data) |
| Shopify: privacy webhooks | `customers/redact` held for 6 months if the buyer ordered recently; `shop/redact` 48 hours after uninstall; 30 days to act; 401 on a bad signature | [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance) |
| Shopify: deletion and incidents | Merchant data deleted within 30 days of uninstall unless the law says otherwise; a breach reported within 24 hours | [API terms, 6.2.3 and 6.2.10](https://www.shopify.com/legal/api-terms) |
| eBay: personal data | Delete promptly when no longer needed or when asked; never store user ids or passwords; destroy within 10 days of termination; each party an independent controller | [API License Agreement](https://developer.ebay.com/join/api-license-agreement) |
| eBay: account deletion | Notices for every user; delete that user's data so no privilege can reverse it; acknowledge with 200, 201, 202 or 204; an unanswering endpoint is marked down after 24 hours | [Marketplace account deletion](https://developer.ebay.com/marketplace-account-deletion) |
| UK GDPR: processor contract | Instructions, confidentiality, security, sub-processors with authorisation and notice, help with requests and breaches, deletion at the end, audits | [ICO: what the contract must include](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/what-needs-to-be-included-in-the-contract/) |
| UK GDPR: breaches | Regulator within 72 hours when a risk is likely; a processor tells its controller without undue delay; every breach recorded | [ICO: personal data breaches](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/) |
| UK GDPR: erasure | Within one month, extendable by two; backups may stay until overwritten if put beyond use | [ICO: right to erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/) |
| UK VAT: invoices | None needed for consumers; a full invoice names the customer and address; a simplified one up to £250 does not | [VAT Notice 700, 16.2.1, 16.3.1 and 16.6.1](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK VAT: records | Kept at least 6 years, including copies of issued invoices | [VAT Notice 700/21, 2.4](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021) |
| EU VAT: invoices | A full invoice carries the customer's full name and address; a simplified one does not; an invoice is required for distance sales unless the seller uses the One Stop Shop | [VAT Directive, articles 220, 220a, 226 and 226b](https://eur-lex.europa.eu/eli/dir/2006/112/oj) |

## Consequences

**What this gives us**

- One rule for every marketplace, set by the strictest, so no seller needs a setting to stay compliant.
- One document to show in each marketplace's data protection review.
- A database dump, a backup or a console query shows no readable buyer data.
- Every view of buyer data has a name and a reason behind it.
- A buyer's erasure reaches the live cell at once and backups within 30 days, and survives a restore.

**What it costs**

- Every view of buyer data writes an audit entry, and screens must read buyer fields through the API rather than from live updates.
- Sellers cannot search old orders by a buyer's name, address or postcode, and a recall reaches buyers only through the marketplace.
- Without the buyer's email, carriers get only a phone number for delivery notices.
- Delivery dates must be tracked to use the full 30 days; without them, orders lose buyer data earlier.
- eBay deletion notices for every eBay user cost one indexed query per cell each.
- A second non-tenant table per cell, `buyer_ref`, beside `due`.
- The security schedule is a standing workload for one operator: monthly scans, quarterly reviews, a yearly test.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Vervoro as the controller of buyer data | The seller decides to sell, ship and keep records; Vervoro would take on duties toward buyers it never deals with |
| A retention period per marketplace | More rules to get wrong; Amazon's is the strictest, so one rule meets all three |
| 30 days after dispatch for every order | Always compliant, but cuts the time to handle a late delivery or a return; delivery is the rule and dispatch only the fallback |
| Keep the postcode district and town after anonymisation | Amazon counts postal codes as personal data, and with dates and items a district can single out a person |
| Keep the buyer's email | Carriers accept a phone; marketplaces relay or mask emails; one field less to protect |
| Database encryption alone | A dump, a backup or a console query would show buyer data in clear |
| A key per order, destroyed at anonymisation | Erasure would reach backups at once, but the keys would need a store outside the database whose loss destroys data; backups already expire in 30 days (ADR-001) |
| Delete buyer data from backups by rewriting them | Backups are immutable snapshots; putting them beyond use and replaying erasures on restore is what the ICO describes |
| Store eBay buyer user ids to match deletion notices | eBay's terms forbid storing user ids; a keyed hash matches without keeping them |
| Send every eBay deletion notice to every company | Thousands of transactions per notice; one indexed query per cell finds the few that matter |
| Match buyers across orders into customer records | A buyer profile is what Amazon's use policy forbids, and it outlives the order |
| Copy production data to staging for realistic tests | Real buyers would leave production; simulators and synthetic buyers do the same job |
