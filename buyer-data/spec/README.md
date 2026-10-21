# ADR-009 SPEC: Buyer data and privacy

| | |
| --- | --- |
| **Decision** | [ADR-009: Buyer data and privacy](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-009-buyer-data-and-privacy) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, the person reviewing their work, and marketplaces' data-protection reviewers |

The rules to build ADR-009 from: the Buyer data module, core and always on, needing nothing ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)), and the privacy rules every other module keeps. Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| Shopify: level 2 protected customer data, the three privacy webhooks, deletion after uninstall | The Shopify connector is built ([ADR-004.3](../../shopify-connector/), owner ruling, 21 October 2026) | [10](#10-buyers-requests), [16.3](#163-shopify) |
| Label files: a label bought through Vervoro, kept encrypted and anonymised with the order | Shipping labels in Vervoro ([ADR-000 SPEC 4.7](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules), owner ruling, 22 October 2026); at launch the seller buys labels on the marketplace | [1](#1-who-does-what), [4](#4-what-is-kept), [6](#6-encryption-and-keys) |
| Amazon's tax invoicing role | A later record on uploading invoices to Amazon ([ADR-011](../../invoicing-and-vat/)) | [16.1](#161-amazon) |

## 1. Who does what

1. **Buyer data writes** every buyer field, the eBay buyer hash, label files, privacy requests, the anonymisation of an order and the audit entry for each view. No other module writes them.
2. **Orders hands over** the buyer fields of a fetched order through Buyer data's port, in the import's transaction, only for orders the seller ships ([ADR-007](../../order-ingestion/)). Buyer data never takes them from a notice body.
3. **Other modules read** through Buyer data's port, which checks the role and the order's state (section 7) and writes the view entry: Fulfilment for picking, packing and labels ([ADR-014](../../fulfilment/)); Invoicing for the starting point of a customer block ([ADR-011](../../invoicing-and-vat/)). A recall reads the country only.
4. **Whoever buys a label** hands the file to Buyer data's port, which encrypts and stores it.
5. **Channels records a marketplace's privacy notice** with its due date ([ADR-004 SPEC 8](../../channel-connectors/spec/#8-notices-in)) and passes it to Buyer data's port, which opens the company's privacy request.
6. **Access decides the role** ([ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what)); Buyer data decides what that role sees of an order in its current state.

## 2. Roles and agreements

1. **The seller is the controller.** They sell to the buyer, choose the carrier and decide to ship. Vervoro processes buyer data only on the seller's instructions: the product's settings and actions.
2. **Vervoro is the controller** only of its own account data (the seller's users, billing, sign-in) and its platform security logs.
3. **The data processing agreement** is part of the customer terms, accepted before the first marketplace connection. It covers what UK and EU law ask of a processor contract ([ICO](#19-constraints)): documented instructions; confidentiality; the security measures of this page; sub-processors under general authorisation with 30 days' notice and the right to leave before a change; help with buyers' requests and breaches; deletion at the end, after an export if wanted; audits, through evidence first.
4. **Marketplace terms bind Vervoro directly:** Amazon's Data Protection Policy and Acceptable Use Policy as solution provider, eBay's API License Agreement as an independent controller, Shopify's API terms as app developer. Where one is stricter than the agreement, Vervoro follows it, and the agreement says so.
5. **Carriers are the seller's.** The seller connects their own carrier accounts; sending an address to buy a label is the seller's instruction.

## 3. Sub-processors

The published list names each provider, what it does and where. A change is announced 30 days ahead.

| Sub-processor | What it does | Buyer data it handles |
| --- | --- | --- |
| Cloudflare | Runs the application in the EU; queues and Durable Objects in the EU jurisdiction carrying ids only; object storage; Email Service for sign-in mail ([ADR-000 SPEC 10](../../system-architecture/spec/#10-runtime)). Requests pass through its global network | All of it while serving requests; label files at rest |
| Neon | Runs the Postgres databases in the EU | All of it, at rest, encrypted field by field |
| Amazon Web Services | The notice bridge, in an EU region ([ADR-004.2](../../amazon-seller-connector/)) | Amazon's order notices, which carry a destination postcode and no name or address; nothing stored beyond the queue's own retries |
| Email delivery provider, not yet chosen | Mail to the seller's users other than sign-in | None: mail names an order, never a buyer. It receives the user's own address |
| AI provider | Answers the seller's users' questions | None: buyer fields are masked before any call |

## 4. What is kept

Each field only for its purpose, and only from the marketplaces that send it.

| Field | Why | Until |
| --- | --- | --- |
| Recipient name | Label and packing slip | Anonymisation |
| Delivery address lines, town, postcode | Label | Anonymisation |
| Country, and tax territory where it differs (Northern Ireland, the Canary Islands) | VAT, reports | Kept with the order |
| Delivery phone | Carriers' delivery notices and failed deliveries | Anonymisation |
| Order note, gift message | Read by the packer; the gift message is printed | Anonymisation |
| Business buyer's company name and VAT number | A business invoice | Anonymisation, except on an issued invoice |
| eBay buyer's user id, as a keyed hash | Matching eBay's account deletion notices | Anonymisation |
| Tracking number | Confirming and following the shipment | Anonymisation; for an order delivered outside the UK, kept as export evidence (section 9) |
| Label file | Printing and reprinting | Anonymisation |

1. **Never kept:** buyer email; billing addresses and payment details (except the customer block printed on an issued full invoice); the eBay user id itself, which eBay forbids storing; anything that ties one buyer across orders, marketplaces or sellers.
2. **Used only to ship, for tax and for the seller's service to that order** ([Amazon AUP](#19-constraints)): never for marketing, reviews or profiling.
3. **Masked and missing values stay missing.** A withheld field is left out, never stored blank or made up, and a later read without it never erases what an earlier read kept ([ADR-004 SPEC 1](../../channel-connectors/spec/#1-the-connector-contract)).
4. **Every buyer field carries ADR-001's `pii` tag** ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)). The tag drives encryption, masking, the logger's drop, anonymisation, export and the AI mask. A build check refuses a column holding buyer data without it.

## 5. Where it lives

1. **Only in the company's rows in its cell, and its label files in object storage,** both in the EU.
2. **Ids only everywhere else:** queue messages, Durable Object state, the outbox, events, outbound sends and live updates carry ids and statuses ([ADR-000 SPEC 10](../../system-architecture/spec/#10-runtime)). A screen that needs a name reads it through the API, so the view is logged.
3. **Logs, telemetry and error reports** never carry a buyer field: the logger drops any `pii` value.
4. **URLs** never carry buyer data; a search by phone goes in the request body.
5. **Caches:** none holds buyer data; Hyperdrive caches nothing.
6. **Emails and push notices** name the order number, never the buyer.
7. **The phone client** holds buyer data in memory for the screen shown, never in the device's storage. Labels are printed, not saved.
8. **The control database** holds no buyer data; the erasure register holds ids and times only.

## 6. Encryption and keys

1. **In transit:** TLS 1.2 or higher on every connection, inside and outside the platform, databases and object storage included ([DPP 1.5](#19-constraints)).
2. **At rest:** the database and object storage encrypt everything, backups included.
3. **Field by field:** each buyer field is encrypted with AES-256-GCM under the company's data key, with the company id as associated data ([ADR-001 SPEC 10](../../database-architecture/spec/#encryption)). A row read under the wrong company fails to decrypt; a dump or a console query shows ciphertext.
4. **Keys:** the company keys are wrapped by a key-encryption key held as a platform secret, rotated yearly and at once on suspicion by re-wrapping.
5. **Label files** are encrypted with the company's key before storing, in a bucket of their own with no versioning or soft delete, so deleting one deletes it. This is the one exception to ADR-001's file rule ([ADR-001 SPEC 10](../../database-architecture/spec/#backups)).
6. **Search:** only an exact-match blind index on the phone. Its entry goes with the field.

## 7. Who can see it

| Role | Name, address and phone | When |
| --- | --- | --- |
| Owner, admin, manager | Yes | Any order that still holds buyer data |
| Warehouse | Yes, in their warehouses only | From picking until shipped, and label reprints for 24 hours after ([ADR-014](../../fulfilment/)) |
| Accountant | Only as printed on issued invoices | Never on orders |
| Staff | No | Never |

1. **Everyone else sees the order masked:** number, country and lines.
2. **Every view writes one `audit_log` entry:** opening an order with buyer data, the packing screen, printing or reprinting a label, a buyer search, an export. It names the user, the order, the fields shown (never their values), the screen and the time. Lists show no buyer data and write nothing. The seller sees the entries; `audit_log` is kept at least a year ([ADR-010 SPEC 8](../../users-and-access/spec/#8-audit)).
3. **The operator** reaches a company only under a grant: one company, a written reason, at most 8 hours, seen by the seller and ended by them at will. Buyer fields stay encrypted unless the seller's owner or admin switches them on for that grant ([ADR-010 SPEC 7](../../users-and-access/spec/#7-operator-access-to-a-company)).
4. **Developers** have no access to production data. The database owner role is used only through the CI migration job, with the reason recorded first and an alert ([ADR-001 SPEC 3](../../database-architecture/spec/#3-roles)); even then buyer fields are ciphertext.
5. **Leavers:** a person's platform access ends within 24 hours of leaving or changing role, and access is reviewed every quarter.

## 8. Retention and anonymisation

| The order | 30 days count from |
| --- | --- |
| Delivered, with a delivery date from the carrier or marketplace | Delivery ([DPP 2.1](#19-constraints)) |
| Dispatched, no delivery date known | Dispatch, which always comes first, so the limit is never passed |
| Shipped outside Vervoro | The marketplace's shipping time |
| Cancelled before dispatch | The cancellation |
| On a connection that ended or lost its access | The end of the connection, whatever the order's state ([DPP 1.7](#19-constraints)) |
| Named in a buyer's erasure | No wait: at once |

1. **An order still to be shipped keeps its address.** Delivery is the rule and dispatch the fallback; this is the rule ADR-002 cites ([ADR-002](../../data-retention/)).
2. **The due time** sits in the cell's `due` table ([ADR-001 SPEC 9](../../database-architecture/spec/#the-due-table)). The sweeper, in one transaction per company: clears every `pii` field on the order and its lines; removes the phone index entry and the eBay hash; marks the order anonymised with the time and reason; deletes its label files.
3. **Once anonymised, never again.** A later read or notice that brings the details back stores nothing personal for that order.
4. **Proof:** a nightly check counts, per company, orders past their due time still holding buyer data. Anything but zero alerts the operator ([runbook](../../runbooks/check-the-anonymisation-job/)).
5. **What survives:** the marketplace order id, dates, lines, prices, totals and fees (accounting records); the batch and lot shipped (a recall reaches buyers through the marketplace by order id, [ADR-014](../../fulfilment/)); the country and tax territory (VAT); the carrier and service. Not the postcode district or the town: Amazon counts postal codes as personal data.

## 9. Invoices and export evidence

1. **Invoices** follow [ADR-011](../../invoicing-and-vat/): to a consumer only on request or where the law or marketplace requires, simplified without buyer details wherever allowed ([HMRC](#19-constraints)); a full invoice carries the name and address the law requires.
2. **An issued invoice is kept unchanged for the statutory period** (7 years from the end of its month, [ADR-002 SPEC 2](../../data-retention/spec/#2-the-retention-schedule)). After the order is anonymised it is shown only to owners, admins and accountants, each view logged, not searchable by buyer, and archived with its month encrypted under the company's key.
3. **An order delivered outside the UK** keeps its carrier, tracking number, dispatch date and the carrier's delivery event (date and country) as export evidence for the statutory period ([ADR-011](../../invoicing-and-vat/)).

## 10. Buyers' requests

A buyer asks the seller or a marketplace, never Vervoro. Each request becomes a privacy request in the company: who sent it, the orders it names, its due date and when it was done. It holds order ids, never the buyer's details.

| Request | Arrives from | Vervoro does | Due |
| --- | --- | --- | --- |
| Erasure | The seller; an eBay account deletion matching a buyer; *Later:* Shopify's `customers/redact` | Anonymises the named orders (section 8) | At once |
| Access | The seller; *Later:* Shopify's `customers/data_request` | A file of the named orders' buyer data, for the seller (section 12) | 7 days, inside the law's one month |
| Correction | The seller | The field is saved as set by a person; a later marketplace read does not overwrite it | At once |
| Delete on Amazon's notice | Amazon ([DPP 1.7](#19-constraints)) | The named data is deleted | Within Amazon's 30 days |
| *Later:* forget a shop | Shopify's `shop/redact`, 48 hours after uninstall | Recorded for a person; the uninstall already ended the connection, so the shop's buyer data is due within 30 days (section 8) | Inside Shopify's 30 days ([ADR-004.3 SPEC 8](../../shopify-connector/spec/#8-buyer-data-and-privacy)) |

1. **Finding the orders:** by marketplace order id, or by an exact phone number. An eBay deletion names a user, matched by hash (section 16.2).
2. **An erasure keeps issued invoices.** The request records that an invoice was kept, and why, so the seller can tell the buyer.
3. **Only owners and admins** handle privacy requests ([ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what)). Procedure: [Answer a buyer's data request](../../runbooks/answer-a-buyers-data-request/).

## 11. Erasure, backups and restores

1. **The live cell:** the named orders are anonymised in one transaction, label files deleted, the request marked done.
2. **The erasure register:** each completed erasure (order ids and time) is written to control's register and to an append-only log in object storage, both outside the cell and its backups ([ADR-001 SPEC 7](../../database-architecture/spec/#7-control-database-and-routing)).
3. **Backups** (7 days of history, 30 days of snapshots) still hold the old values, encrypted per field. They are beyond use: nobody reads a backup except to restore. Erasure is complete in backups by day 30 ([ADR-001 SPEC 10](../../database-architecture/spec/#backups), [ICO](#19-constraints)).
4. **Every restore replays the register and runs the anonymisation sweep** before the company or cell opens to anyone ([ADR-001 SPEC 10](../../database-architecture/spec/#restore)).
5. **The archive** receives orders after 24 months, long after anonymisation ([ADR-002](../../data-retention/)); only retained invoices hold buyer details there.
6. **Erasing the company** destroys its data key, which makes every remaining copy unreadable ([runbook](../../runbooks/erase-a-company/)).

## 12. Exports

1. **A company export** ([ADR-001 SPEC 10](../../database-architecture/spec/#export)) holds buyer data only for orders that still have it, anonymised orders as they are, issued invoices as issued, and the archive files.
2. **Only an owner or admin** makes an export with buyer data; for anyone else the fields are left out. The file is encrypted, offered through a link that expires after 24 hours, deleted after 7 days, and logged with who made it and what it held.
3. **A one-buyer file** for an access request holds only the named orders' buyer data, made the same way.

## 13. Incidents

1. **Alerts to the operator:** a canary buyer (one synthetic buyer per cell) viewed, exported or decrypted outside its own test; a user viewing far more buyers than their packing explains, a burst of buyer searches, or an export with buyer data; every operator grant and every use of the owner role; a decrypt failing on a company mismatch, an overdue anonymisation, or a log line that looks like an address or phone; a report from a marketplace, seller, researcher or sub-processor.
2. **The written plan** covers preparation, detection, containment, removal, recovery and lessons, is approved by Vervoro's owner, and is reviewed every six months and after a major change ([DPP 1.6.2](#19-constraints)). The operator is the point of contact and Vervoro's owner the deputy. Containment can revoke sessions ([runbook](../../runbooks/sign-in-incident-commands/)), rotate keys and hold every send to a marketplace.
3. **Who is told,** counted from when Vervoro becomes aware:

| Who | When | Source |
| --- | --- | --- |
| Each affected seller | Without undue delay, within 24 hours, so they can decide on the regulator's 72 hours | UK GDPR, processor to controller |
| Amazon, at its security address | Within 24 hours, when Amazon data is involved | [DPP 1.6.3](#19-constraints) |
| eBay | Within 24 hours, when eBay data is involved | Vervoro's rule; eBay asks for immediate notice of a key compromise |
| *Later:* Shopify, through partner support | Within 24 hours, when shop data is involved | Shopify API terms 6.2.10 |
| The ICO, or the lead EU regulator | Within 72 hours, where Vervoro is the controller and a risk is likely | UK and EU GDPR |
| Affected buyers | By the controller, when the risk is high; Vervoro helps | UK and EU GDPR |

4. **Vervoro speaks only for itself,** never for a marketplace or a seller. **Every incident is recorded,** including those that need no notice. Procedure: [Report a personal-data breach](../../runbooks/report-a-personal-data-breach/).

## 14. Security controls

Amazon's schedule is the strictest, so it is the schedule for every marketplace ([key security controls](#19-constraints)).

| Control | What Vervoro does | How often |
| --- | --- | --- |
| Multi-factor sign-in | Every user, operator and developer account ([ADR-013](../../sign-in/)) | Always |
| Passwords | Only with an authenticator code, under Amazon's password rules ([ADR-013 SPEC 4](../../sign-in/spec/#4-password-policy)) | Always |
| One person, one account | No shared or generic accounts | Always |
| Security logs | Sign-ins, grants, buyer-data views, exports, key use, admin actions; central, protected from change, no buyer data | Kept 12 months; alerts at once, the rest every two weeks |
| Vulnerability scans | Every system touching seller or buyer data; the code before each release | At least every 30 days |
| Fixing findings | Critical in 7 days, high in 30 | As found |
| Penetration test | By an outside tester | Yearly |
| Access reviews | Every operator, developer and service account ([runbook](../../runbooks/run-the-quarterly-access-review/)) | Quarterly |
| Access removal | On leaving or a role change | Within 24 hours |
| Incident plan | Written, approved, tested | Every six months and after a major change |
| Restore test | A restore, with the erasure replay | Quarterly ([drills](../../runbooks/drills/)) |
| Key rotation | Key-encryption key, marketplace credentials, the Better Auth secret ([runbook](../../runbooks/rotate-the-better-auth-secret/)) | Yearly, and at once on suspicion |
| Risk assessment, sub-processor review, training | Threats and measures; each provider against this page; everyone with access | Yearly |

## 15. No real buyer data outside production

1. **Synthetic buyers only** in simulators, tests, fixtures and demos: generated names, `example.com` and `.test` emails, phone numbers 07700 900000 to 900999, and the postcode `ZZ99 9ZZ`.
2. **A build check** scans fixtures, recordings and seed data and refuses an email, phone or postcode outside those ranges.
3. **Recordings of real marketplace replies** ([ADR-000 SPEC 9](../../system-architecture/spec/#9-simulators)) come from sandboxes and the team's own test accounts, with buyer fields replaced before saving.
4. **A production branch made for a restore** holds real data, is reached only by the lifecycle tool, and is deleted within 24 hours ([ADR-001](../../database-architecture/)).
5. **Staging** runs on simulators and synthetic companies only.

## 16. Per marketplace

### 16.1 Amazon

1. **The restricted role for direct-to-consumer shipping** only, which releases the recipient's name, address and phone on orders the seller ships. Not the tax roles (section 0).
2. **The 2026 orders API** releases them by role alone, with no Restricted Data Token. Vervoro asks only for the recipient and gift message, never the buyer's email, and only on seller-shipped orders not yet shipped ([ADR-004.2 SPEC 8](../../amazon-seller-connector/spec/#8-buyer-data)).
3. **A call that still needs a Restricted Data Token** gets one for that order's path and only the elements it needs, held in memory for its life, never stored or logged.
4. **On the end of access, Amazon's notice or the end of participation,** everything about that seller from Amazon is deleted within 30 days, except what the law requires to be kept ([DPP 1.7](#19-constraints)). Procedure: [Anonymise after a connection ends](../../runbooks/anonymise-after-a-connection-ends/).
5. **Notices** carry a destination postcode; the bridge stores nothing, and the queue message carries ids only.

### 16.2 eBay

1. **eBay's terms:** delete personal data when no longer needed or when asked, never store user ids, destroy within 10 days of leaving the developer programme.
2. **Account deletion notices** arrive for every eBay user who closes their account and are answered at once ([ADR-004.1 SPEC](../../ebay-connector/spec/)). A connected seller's is a privacy request; anyone else's is matched.
3. **The match:** on import, a keyed hash of the buyer's user id is stored with the order and in `buyer_ref(hash, company_id, order_id)`. A notice is hashed and looked up in each cell with one indexed query through ADR-001's allow-listed function ([ADR-001 SPEC 4](../../database-architecture/spec/#4-functions)). A match anonymises that buyer's orders at once. The notice is never kept; the lookup row goes when the order is anonymised.

### 16.3 Shopify

*Later, with [ADR-004.3](../../shopify-connector/).* Level 2 protected customer data for name, address and phone, not email; without approval the fields arrive empty. The three privacy webhooks are checked by signature (401 on a bad one) and handled as section 10 says ([ADR-004.3 SPEC 8](../../shopify-connector/spec/#8-buyer-data-and-privacy)). Uninstalling ends the connection, so the shop's buyer data goes within 30 days even before `shop/redact`.

## 17. The seller's users' sign-in data

Not buyer data: Vervoro is its controller, under its privacy notice. Listed here so one record shows every place personal data lives.

1. **What:** each login's email address and name, password hash, authenticator secret, backup codes, passkey public keys, sessions with network address and browser, and password history ([ADR-013 SPEC 2](../../sign-in/spec/#2-the-login-and-its-data)). The email address is stored readable, because Better Auth signs people in and mails them by it.
2. **Where:** the control database's `auth` and `auth_policy` schemas, in the EU. No third-party identity provider owns or acts as the system of record for Vervoro user identities or email addresses. Authentication data remains in Vervoro-controlled infrastructure. Sign-in mail goes through Cloudflare's Email Service, which receives an address only to deliver that email; any other email provider would too (open item in the ADR).
3. **Who:** only the sign-in Worker, through the sign-in role. The owner role only in an emergency ([runbook](../../runbooks/use-the-owner-role/)). Passwords, codes, secrets and tokens are never logged.
4. **Protection:** TLS, storage encryption, authenticator secrets and backup codes also encrypted under the sign-in Worker's secret, every sign-in event in the security log.
5. **Retention:** sessions deleted 30 days after they end; a login with no membership deleted after 30 days with its address and name ([ADR-010 SPEC 6](../../users-and-access/spec/#6-invitations-sign-up-and-removal)); control's backups hold it until they expire, within 30 days. A user's own request: [Answer a seller's data request](../../runbooks/answer-a-sellers-data-request/).

## 18. Storage

| Table | Holds | Notes |
| --- | --- | --- |
| `buyer_recipient` | One row per order: the buyer fields of section 4, the eBay hash, the phone index, anonymised time and reason | Every buyer field tagged `pii`; one row per order, never shared across orders |
| `buyer_ref` | `(hash, company_id, order_id)` for eBay buyers | ADR-001's named exception, read across companies only through its allow-listed function |
| `buyer_privacy_request` | Source, order ids, kind, due date, done time, invoices kept and why | No buyer field |
| Label files | One per label, encrypted under the company key | Object storage, its own bucket, no versioning; keys carry no personal data |

## 19. Constraints

Checked against the official sources on 18 October 2026; Amazon's Data Protection Policy rechecked 21 October 2026.

| Constraint | Figure | Source |
| --- | --- | --- |
| Amazon: retention | No longer than 30 days after order delivery unless the law requires longer; only to ship, for tax and legal duties | [Data Protection Policy 2.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: deletion on a trigger | Within 30 days of Amazon's notice, loss of access, Vervoro deciding it is no longer authorised, or the end of participation; written certification on request | [DPP 1.7](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: incidents | Notice to security@amazon.com within 24 hours (1.6.3); plan reviewed every six months and after major changes (1.6.2) | [DPP 1.6](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: sign-in | Multi-factor on every user account; password rules; lockout after at most 10 failures | [DPP 1.4.1, 1.2.2](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: encryption | At rest at least AES-128 or RSA-2048 (2.4); in transit TLS 1.2 or higher (1.5) | [DPP](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: logs | No personal data in logs; kept at least 12 months; reviewed in real time or every two weeks | [DPP 2.6.1](https://sellercentral.amazon.com/mws/static/policy?documentType=DPP&locale=en_US) |
| Amazon: schedule | Scans every 30 days, yearly penetration test, critical fixes in 7 days and high in 30, quarterly access reviews, access removed in 24 hours, quarterly backup tests, yearly key rotation | [Key security control guidance](https://developer-docs.amazon/sp-api/docs/guidance-to-address-key-security-controls-in-sp-api-integration) |
| Amazon: use | Only for merchant-fulfilled shipping and legal duties; no combining across sellers; need-to-know access | [Acceptable Use Policy 3.9, 4.1, 4.4](https://sellercentral.amazon.com/mws/static/policy?documentType=AUP&locale=en_US) |
| Amazon: orders API 2026 | Buyer data by role, no Restricted Data Token; phone hidden after the latest delivery date | [Access orders PII](https://developer-docs.amazon/sp-api/docs/access-orders-pii) |
| Amazon: Restricted Data Token | For restricted operations; names a path and data elements | [Tokens API use case guide](https://developer-docs.amazon/sp-api/docs/tokens-api-use-case-guide) |
| Amazon: order notices | A destination postcode, no name or street | [Notification type values](https://developer-docs.amazon/sp-api/docs/notification-type-values) |
| eBay: personal data | Delete when no longer needed or asked; never store user ids or passwords; destroy within 10 days of termination; each party an independent controller | [API License Agreement](https://developer.ebay.com/join/api-license-agreement) |
| eBay: account deletion | Notices for every user; delete so no privilege can reverse it; acknowledge with 200, 201, 202 or 204; an unanswering endpoint marked down after 24 hours | [Marketplace account deletion](https://developer.ebay.com/marketplace-account-deletion) |
| Shopify (*Later*): protected data | Name, address, phone and email are level 2, each asked for separately; encrypted backups, separate test data, limited staff access, strong passwords, an access log, an incident policy | [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data) |
| Shopify (*Later*): privacy webhooks | `customers/redact` may wait 6 months after a recent order; `shop/redact` 48 hours after uninstall; 30 days to act; 401 on a bad signature | [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance) |
| Shopify (*Later*): deletion and incidents | Merchant data deleted within 30 days of uninstall; a breach reported within 24 hours | [API terms 6.2.3, 6.2.10](https://www.shopify.com/legal/api-terms) |
| UK GDPR: processor contract | Instructions, confidentiality, security, sub-processors with authorisation and notice, help with requests and breaches, deletion at the end, audits | [ICO: contracts](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/what-needs-to-be-included-in-the-contract/) |
| UK GDPR: breaches | Regulator within 72 hours when a risk is likely; a processor tells its controller without undue delay; every breach recorded | [ICO: personal data breaches](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/) |
| UK GDPR: erasure | Within one month, extendable by two; backups may stay until overwritten if beyond use | [ICO: right to erasure](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/) |
| UK VAT: invoices | None needed for consumers; a full invoice names the customer and address; a simplified one up to £250 does not | [VAT Notice 700, 16.2.1, 16.3.1, 16.6.1](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK VAT: records | At least 6 years, copies of issued invoices included | [VAT Notice 700/21, 2.4](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021) |
| EU VAT: invoices | A full invoice carries the customer's name and address, a simplified one does not; distance sales need an invoice unless the seller uses the One Stop Shop | [VAT Directive, articles 220, 220a, 226, 226b](https://eur-lex.europa.eu/eli/dir/2006/112/oj) |

## 20. Tests that prove each rule

| Test or check | Where | Proves |
| --- | --- | --- |
| Field tag lint | CI | Every column with buyer data carries `pii`, is encrypted, and is cleared by anonymisation |
| One writer | CI | Only Buyer data writes `buyer_` tables and label files; other modules use its port |
| Redaction | CI | A `pii` value given to the logger, an error report, telemetry, a queue message or an event never appears |
| Due times | CI | Each row of the section 8 table gives the right due time; an anonymised order stores nothing from a later read |
| Overdue count | Production, nightly | No order past its due time holds buyer data |
| Role and state | CI | Each role sees buyer data only as section 7 allows; every view writes one audit entry with no values |
| Operator grant | CI | An operator's read decrypts buyer fields only when the grant has them switched on |
| Erasure replay | CI and the quarterly restore test | A restore to before an erasure opens with it applied |
| eBay match | CI | A buyer's deletion notice anonymises their orders in every cell and stores nothing |
| Synthetic data | CI | No fixture, recording or seed holds an email, phone or postcode outside the reserved ranges |
| Canary buyers | Production | Reading a canary alerts within minutes |
| Export | CI | Buyer data only for orders that still hold it, none for a role that may not see it |
| Label files | CI | Anonymisation deletes the file, and the bucket keeps no version |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **One writer:** only Buyer data's code writes `buyer_` tables and the label bucket; Orders, Fulfilment and Invoicing import only its port.
- [ ] **No calls out of the core:** Buyer data imports no other module.
- [ ] **Tags:** every buyer column is declared with `pii`; the lint runs in CI and fails on an untagged one.
- [ ] **Reads:** every read of a buyer field goes through one port function that checks role, order state and grant, and writes the audit entry.
- [ ] **Ids only:** queue, Durable Object, outbox, event and live-update payload types have no buyer field.
- [ ] **Logger:** the drop of `pii` values is in the logger, not at call sites.
- [ ] **Client:** no buyer field is written to local storage, IndexedDB or a cache; no buyer data in a URL.
- [ ] **Sweep:** one transaction clears fields, the phone index and `buyer_ref`, marks the order and deletes the label files.
- [ ] **Once anonymised:** the import path checks the anonymised mark before writing.
- [ ] **Restore:** every restore path replays the erasure register before the company opens.
- [ ] **Bucket:** the label bucket has no versioning or soft delete in its configuration.
- [ ] **AI:** the AI call path masks every `pii` field.
- [ ] **Fixtures:** the synthetic-data check runs on every build.
- [ ] **Later parts:** no Shopify privacy webhook or Amazon tax role at launch.
