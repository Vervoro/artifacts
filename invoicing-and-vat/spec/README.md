# ADR-011 SPEC: Invoicing and VAT

| | |
| --- | --- |
| **Decision** | [ADR-011: Invoicing and VAT](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-011-invoicing-and-vat) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-011 from: the Invoicing module, switchable, needing Orders ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/). Amounts in pounds below are legal thresholds, not prices.

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| Shopify orders: Vervoro issues on request; Shopify's tax lines compared; a tax line the channel is liable for recorded as marketplace-collected | The Shopify connector is built ([ADR-004.3](../../shopify-connector/)) | [2](#2-who-issues), [8](#8-differences-from-the-marketplace) |
| VAT classes per country | A seller sells where a product's class differs ([ADR-003 SPEC 11](../../product-model/spec/#11-vat)) | [7](#7-working-out-the-vat) |
| Selling into the EU: the One Stop Shop and import schemes for the seller's own shop, stock held in the EU, Amazon's European fulfilment, goods between Northern Ireland and the EU | A launch seller needs it; its own record | [11](#11-sales-outside-the-uk-and-export-evidence) |
| Uploading invoices to Amazon for a seller who will not use VCS | A seller asks; needs Amazon's tax invoicing role and an edit to [ADR-009](../../buyer-data/) | [2](#2-who-issues) |
| Capturing the carrier's delivery event for exported parcels | Shipping labels get their record (parked, [ADR-000 SPEC 4.7](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)) | [11](#11-sales-outside-the-uk-and-export-evidence) |
| Saved business customers (invoice address, VAT number, terms); receivables for credit terms | Sellers ask; its own record ([ADR-007 SPEC 18](../../order-ingestion/spec/#18-manual-orders)) | [4](#4-what-a-document-holds) |
| Direct posting to accounting software; settlement reconciliation against payouts | Sellers ask | [12](#12-the-accounting-export) |
| Sending invoices to buyers (email or a self-service link) | Sellers find requests too many; changes what ADR-009 keeps | [10](#10-files-delivery-and-keeping) |

## 1. The module

1. **Switchable, needing Orders.** It writes only its own `invoicing_` tables, through the typed query builder ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)). It calls the core's ports: Orders for order lines, Products for VAT classes and standard costs, Buyer data for the starting point of a customer block ([ADR-009 SPEC 1](../../buyer-data/spec/#1-who-does-what)).
2. **It acts on events, after commit,** never inside another module's transaction: Orders' order imported, changed, shipped and refunded ([ADR-007 SPEC 1](../../order-ingestion/spec/#1-the-module)); Fulfilment's shipment, for carrier and tracking ([ADR-014](../../fulfilment/spec/#4-shipments)). Every handler is idempotent.
3. **The rate table** is ADR-003's, platform data in control. Invoicing only reads it.
4. **Switched on after orders exist,** it writes VAT records for every order whose tax point is on or after a start date the seller picks, by default the first day of their current VAT period. It never writes a record dated before that start date.

## 2. Who issues

1. **Each account has an issuer:** the marketplace or Vervoro, asked when the account is connected. A change applies to orders imported afterwards.

| Sale | Issuer | Vervoro |
| --- | --- | --- |
| Amazon order, seller VAT-registered | Amazon, through VCS | Records the VAT; issues nothing |
| Amazon order, seller not VAT-registered | Nobody issues a VAT invoice | Records treatment `none` |
| eBay order, seller opted in to eBay's VAT invoices | eBay | Records the VAT; issues nothing |
| eBay order, not opted in | Vervoro, on request | An invoice, with the "eBay holds none" confirmation |
| Manual order to a business | Vervoro, at dispatch | A full invoice |
| Manual order to a consumer | Vervoro, on request | An invoice |
| A line whose VAT the marketplace collects | The marketplace, as deemed supplier | Records it as `marketplace`; issues nothing for it |

2. **Amazon is fixed to "the marketplace".** The connections screen says, before connecting, that a VAT-registered seller needs VCS switched on, and that without it Amazon Business orders cannot be invoiced through Vervoro.
3. **eBay's issuer is the seller's answer,** because no eBay API reports the opt-in ([constraints](#15-constraints)). The warning about doubled VAT sits beside the setting. eBay's own invoices cannot be cancelled.
4. **Every invoice for an eBay order** needs the issuer to confirm "eBay holds no invoice for this order"; the confirmation is kept with the document.
5. **The issue and credit commands refuse** an order whose account says the marketplace invoices.

## 3. When a document is made

1. **No consumer order is invoiced automatically.** A manual order to a business is invoiced when it is dispatched; any other order when a person asks.
2. **The tax point** of a marketplace order is the payment time the marketplace reports. A manual order's is its dispatch, or an earlier payment ([VAT Notice 700, 14.2](#15-constraints)).
3. **A full invoice is due within 30 days of the tax point.** A flagged manual business order that cannot be invoiced at dispatch is in the account's alerts until it is.
4. **There are no drafts.** Issuing is one confirmed command that numbers, freezes and stores the document.

## 4. What a document holds

1. **One layout.** The customer block is filled for a business buyer, for a buyer who asks, or above £250; otherwise it is empty and the document is a simplified invoice.

| Item | Block filled | Block empty | Credit note |
| --- | --- | --- | --- |
| Number and date of issue | Yes | Yes | Yes |
| Tax point | Yes | Yes | The original invoice's |
| Seller's registered name, address and VAT number | Yes | Yes | Yes |
| Customer's name and address; VAT number when given | Yes | No | Yes |
| Per line: description, quantity, unit price, rate, amount without VAT | Yes | Description only | Yes, for what is credited |
| Per rate: without VAT, VAT, with VAT | Yes | With VAT, and the rate | Yes |
| Zero-rated and exempt lines totalled separately, marked "no VAT" | Yes | Yes | Yes |
| Total VAT in sterling | Yes | Yes | Yes |
| Original invoice's number and date | | | Yes |
| The marketplace order id; no payment instructions on a marketplace order | Yes | Yes | Yes |

2. **The customer block** is typed or confirmed by the issuer, starting from the delivery recipient and address, and a business buyer's company name, VAT number and purchase-order reference when the order has them. It is stored on the document only, never on the order, encrypted under the company's key ([ADR-009 SPEC 9](../../buyer-data/spec/#9-invoices-and-export-evidence)).
3. **The seller's details** come from the company's invoicing settings: registered name and address, VAT number and registration date. No logo, footer or trading name at launch. They are copied into each document at issue.
4. **Charge lines** appear beside the goods, each as its own line ([ADR-003 SPEC 1.1](../../product-model/spec/#11-charge-lines-and-listings-that-are-not-stock)). An invoice never adds a charge its order does not hold. Their VAT is [section 7.6](#7-working-out-the-vat).
5. **Not VAT-registered:** no VAT, no rates, no VAT number; every line takes treatment `none`. Orders with a tax point on or after a registration date use the rates.

## 5. Numbering

1. **One series per company** for invoices and credit notes: the counter `invoice` ([ADR-001 SPEC 2](../../database-architecture/spec/#2-keys-and-identifiers)), taken in the issuing transaction, whose row lock makes two issues wait for each other. A failed issue rolls the number back, so there are no gaps.
2. **Format:** `INV-` or `CN-`, then the number padded to six digits. Before the first document the seller may set the first number; it is fixed after.
3. **Never reused, deleted or edited.** A mistaken invoice is cancelled by a credit note for all of it; a corrected one takes a new number ([runbook](../../runbooks/correct-or-credit-an-issued-invoice/)).
4. **A company restore** re-registers every document in object storage newer than the restore point and sets the counter past the highest number found ([ADR-001 SPEC 10](../../database-architecture/spec/#10-company-lifecycle)).

## 6. The VAT record

1. **One record per sale line part,** charge line, delivery part, refund, reversal or correction: order and line ids, treatment, country, class, rate, net, VAT, gross, currency, tax point, the split and its inputs, the marketplace's figure, the flag, the record it replaces, and when it was written.
2. **Written when the order is imported** for a marketplace order, and at the tax point for a manual order.
3. **Append-only.** A cancellation writes a reversing record dated the cancellation; a change of quantity, class or split writes a correction naming the record it replaces; a refund writes a negative record ([section 9](#9-refunds-and-credit-notes)). A cancelled order's records sum to zero.
4. **The treatment** is decided first:

| Treatment | When | Rate |
| --- | --- | --- |
| `domestic` | Delivered in the UK, Northern Ireland included, by a VAT-registered seller | The UK rate for the class at the tax point |
| `export` | Delivered outside the UK by a VAT-registered seller | 0%, class kept for reports |
| `marketplace` | The marketplace collects and pays the VAT | The marketplace's figure, recorded; not the seller's VAT |
| `none` | Not VAT-registered at the tax point | No VAT |

## 7. Working out the VAT

1. **What the buyer paid wins.** Gross line prices, the delivery charge and discounts come from the order as Orders imported them ([ADR-007 SPEC 5](../../order-ingestion/spec/#5-the-order-and-its-lines)). Vervoro never changes what was charged.
2. **The rate is the one valid at the tax point**, from the rate table; a credit note always uses its invoice's rate. A rate change is the operator's ([runbook](../../runbooks/change-a-vat-rate/)).
3. **Per line, to the nearest penny, half up, never down.** Prices with VAT: VAT = gross × rate ÷ (100 + rate), net = gross − VAT. Prices without VAT (manual business orders): VAT = net × rate ÷ 100, gross = net + VAT. Totals are sums of rounded lines, never recalculated.
4. **Bundles.** All components of one class: that class. Different classes: split by the components' standard costs ([ADR-003 SPEC 6](../../product-model/spec/#6-product-kinds)), each part at its class; the split and costs are stored on the record. A component without a cost flags the line until it has one. The bundle form shows today's split and whether the minor-item rule passes.
5. **The minor-item rule.** A seller may mark a bundle whose standard-rated part is not priced separately and costs at most 20% of the whole and at most £1 without VAT; it is then zero-rated. The mark is tested against current costs each time a record is written.
6. **Charge lines** take their own VAT class, like a goods line, and are never split. This is the one place their VAT is stated.
7. **Delivery** follows the VAT liability of the goods it carries. One rate on the order: that rate. Mixed: split in proportion to the lines' gross values after discounts. A partial refund of delivery reuses the stored split. Delivery is never a charge line.
8. **Discounts.** A line discount reduces its line; an order discount is split by gross values. A discount the marketplace funds does not lower the goods' value; an unstated funder counts as the seller.
9. **Splitting rounds each part half up;** a leftover penny goes to the largest part, so the parts add up to the price exactly.

## 8. Differences from the marketplace

1. **Compared:** only goods, per order and per rate, where the marketplace gives a figure (Amazon's per-item tax; *Later:* Shopify's tax lines). eBay gives none for a UK domestic sale. Delivery and discount figures are shown, never compared.
2. **A difference over 1p flags the order.** The order ships as normal. Flags are grouped in the account's alerts by product, with the VAT at stake.
3. **No invoice while flagged.** A person settles it by fixing the product's class (a correction record follows) or, with a reason kept on the document, by issuing on Vervoro's figure ([runbook](../../runbooks/settle-a-vat-difference/)).
4. **Amazon orders** take Amazon's figure on the record, since Amazon's invoice stated it, and keep Vervoro's beside it; the flag asks the seller to fix the product's tax code at Amazon.
5. **A domestic order not priced in pounds** is flagged and cannot be invoiced at launch: its VAT would need converting to sterling.

## 9. Refunds and credit notes

| What happened | Vervoro |
| --- | --- |
| Refund on an order Vervoro invoiced | The order's screen offers a credit note for the refunded lines, with the date the law wants it by (14 days after the refund); a person confirms it. Nothing is stored before |
| Refund on an order the marketplace invoiced | A refund VAT record; the marketplace's credit note covers it |
| Refund on an order nobody invoiced | A refund VAT record at the original rates; no credit note |
| Return with a replacement, no refund | Nothing; the replacement is not a sale |
| Invoice issued in error | A credit note for all of it, then a new invoice if needed |

1. **A refund record** is negative against the original line, with its treatment, rate and split, in the VAT period of the refund date.
2. **A refund naming no lines** is split by gross values, like an order discount.
3. **An invoice asked for after a refund** shows the order less what was refunded.
4. **Refunds are made in the channel's tools;** Orders records them ([ADR-007 SPEC 12](../../order-ingestion/spec/#12-cancellations-and-refunds)).

## 10. Files, delivery and keeping

1. **Made once.** Issuing writes the PDF and a data file (the record as JSON) to object storage under keys never overwritten, encrypted under the company's key, with each file's hash on the record. A download always returns the same file.
2. **Delivery is by the seller.** The roles allowed ([section 13](#13-who-may-do-what)) download through a link that expires after 24 hours; each download is logged ([ADR-009](../../buyer-data/spec/#7-who-can-see-it)).
3. **Kept as accounting records:** 24 months in the cell, then archived with their month, deleted 7 years after its end ([ADR-002 SPEC 2](../../data-retention/spec/#2-the-retention-schedule)). After the order is anonymised, a full invoice is visible only as [ADR-009 SPEC 9](../../buyer-data/spec/#9-invoices-and-export-evidence) says; an erasure request keeps it, with the reason recorded.

## 11. Sales outside the UK and export evidence

1. **Northern Ireland from Great Britain:** `domestic`, UK rates.
2. **Delivered outside the UK by the seller:** `export`, zero-rated, needing proof the goods left within 3 months, kept 6 years. The record keeps the carrier, tracking number and dispatch date from Fulfilment's shipment, with a hash; no name or postcode. *Later:* the carrier's delivery event, captured when it arrives.
3. **An export line dispatched without a tracking number is flagged.** Nothing is reclassified automatically; changing it to standard-rated is the seller's correction.
4. **Marketplace sales into the EU up to €150** a consignment: the marketplace is the deemed supplier; recorded as `marketplace`.
5. **The seller's own shop selling into the EU:** recorded as exports; the EU import scheme is the seller's matter at launch.
6. **UK rules on overseas sellers do not apply** to UK-established sellers: they stay liable for their own UK sales.

## 12. The accounting export

1. **Two CSV files** for any date range, made by the roles allowed ([section 13](#13-who-may-do-what)):
   - **Document register**, one row per document: number, kind, issue date, tax point, order and marketplace order ids, the customer's name for business documents only, currency, and per rate net, VAT, gross, VAT in sterling, and a credit note's original invoice.
   - **VAT summary**, one row per day, channel, issuer, treatment and rate: sales, refunds and corrections as net, VAT and gross, with when each record was written.
2. **Every sale counts,** invoiced or not, since the summary is built from VAT records.
3. **A section per issuer:** Vervoro-invoiced, marketplace-invoiced, nobody-invoiced, and marketplace-collected (never the seller's output VAT). The file's header and a notice on the first export say not to post a section the seller's payout import already posts.
4. **Corrections to a period already exported** are their own section, with their net effect per period. Nothing in a period changes silently; the accountant decides where a correction goes.
5. **The header states the method:** per-line rounding, bundles by cost, delivery and order discounts by value.
6. **No buyer data,** except business customers' names on business documents.
7. **Currency:** the summary uses the sterling amounts the channel reports; exports and marketplace-collected lines carry no UK VAT to convert.

## 13. Who may do what

The rows are in [ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what) under "Invoicing". Overriding a VAT flag decides what VAT the seller owes on a document they cannot withdraw, so only Owners and Admins may; a Manager fixes the class or asks an Admin.

## 14. Storage

| Table | Rules |
| --- | --- |
| `invoicing_settings` | Registered details, VAT number and registration date, first number, the issuer per account; the first number fixed after the first document |
| `invoicing_vat_line` | The record of section 6; append-only; partitioned by month of tax point, archived with its month |
| `invoicing_document` | An issued invoice or credit note as issued, with override reason, eBay confirmation, file keys and hashes; unique (company, number); never updated; customer fields tagged `pii` |

Orders and products are named by plain id, never by foreign key ([ADR-000 SPEC 2](../../system-architecture/spec/#2-tables)). Counters are ADR-001's.

## 15. Constraints

| Constraint | Fact | Source |
| --- | --- | --- |
| UK: when a VAT invoice is needed | Standard- or reduced-rated supplies to a VAT-registered person; not zero-rated supplies or unregistered customers; an invoice for a zero-rated supply is not a VAT invoice | [VAT Notice 700, 3.5, 16.2.1](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: time limit | Normally within 30 days of the tax point | [VAT Notice 700, 16.2.3](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: full invoice | Sequential number in one or more series; tax point; supplier's name, address and VAT number; customer's name and address; description, quantity, rate, unit price and amount without VAT per line; totals; total VAT in sterling | [VAT Notice 700, 16.3.1](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: mixed invoices | Zero-rated and exempt items show no VAT and a separate total | [VAT Notice 700, 16.5](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: simplified invoice | Up to £250, customer agrees; supplier's details, tax point, description, per rate the total with VAT and the rate; a retailer must give a VAT invoice when asked | [VAT Notice 700, 16.6.1, 16.6.2](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: rounding | Per line to 1p or 0.5p, or down to 0.1p, consistently; retailers must not round down | [VAT Notice 700, 17.5, 17.6](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: third-party issuing and e-invoices | A third party may issue; obligations stay with the supplier; a PDF must ensure authenticity, integrity and legibility | [VAT Notice 700, 17.7, 17.8](https://www.gov.uk/guidance/vat-guide-notice-700), [VAT Notice 700/63](https://www.gov.uk/guidance/electronic-invoicing-notice-70063) |
| UK: credit notes | Within 14 days of the refund; both parties, description, quantity, amount, rate, VAT in sterling, original invoice's number and date; the original tax point's rate; adjusted in the refund's period | [VAT Notice 700, 18.2.3 to 18.2.6](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: tax point | Goods: when sent; an earlier payment or invoice sets an actual tax point | [VAT Notice 700, 14.2](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: VAT shown is owed | Recoverable from whoever issued it, whether or not chargeable | [VAT Act 1994, Schedule 11, paragraph 5(2), (3)](https://www.legislation.gov.uk/ukpga/1994/23/schedule/11/paragraph/5) |
| UK: mixed supplies and delivery | Split a single price fairly; a delivery the contract requires follows the goods' liability | [VAT Notice 700, 8.1, 8.3](https://www.gov.uk/guidance/vat-guide-notice-700), [VAT Notice 700/24, 2.2](https://www.gov.uk/guidance/vat-on-postage-delivery-and-direct-marketing-notice-70024) |
| UK: foreign currency | VAT in sterling at the market rate or HMRC's period rate | [VAT Notice 700, 7.6, 16.4](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: food | Most food zero-rated; confectionery, ice cream, crisps, soft drinks, alcohol standard; hampers mixed; the minor-item rule (not priced separately, at most 20% of the cost and £1) | [VAT Notice 701/14, 2.2, 6.1](https://www.gov.uk/guidance/food-products-and-vat-notice-70114) |
| UK: rates | Standard 20%, reduced 5%, zero 0% | [VAT rates](https://www.gov.uk/vat-rates) |
| UK: consumer prices | A selling price shown to consumers includes VAT | [Price Marking Order 2004, article 2](https://www.legislation.gov.uk/uksi/2004/102/article/2/made) |
| UK: records and MTD | At least 6 years; CSV export and import, file transfer and APIs are digital links, copy and paste is not | [VAT Notice 700/21](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021) |
| UK: exports | Export and evidence within 3 months; evidence kept 6 years; courier records with tracking are commercial evidence | [VAT Notice 703, 3.5, 6.7, 7.7](https://www.gov.uk/guidance/vat-on-goods-exported-from-the-uk-notice-703) |
| UK: online marketplaces | The marketplace is liable for goods in the UK sold by sellers not established in the UK, and imported consignments up to £135 | [HMRC](https://www.gov.uk/guidance/vat-and-overseas-goods-sold-to-customers-in-the-uk-using-online-marketplaces) |
| Amazon: invoice upload | `UPLOAD_VAT_INVOICE` needs the Tax Invoicing restricted role; totals must match Amazon's to the penny | [Invoicing feed type values](https://developer-docs.amazon.com/sp-api/docs/invoicing-feed-type-values), [Create and upload invoices](https://developer-docs.amazon.com/sp-api/docs/create-and-upload-invoices) |
| Amazon: VCS | Amazon can generate every invoice and credit note; the UK store is covered | [Create and upload invoices](https://developer-docs.amazon.com/sp-api/docs/create-and-upload-invoices), [VCS guide](https://amazonservicesstatic.com/guides/mws-vat-calculation-service-guide.pdf) |
| Amazon: Business orders | A VAT invoice within one business day after dispatch, a credit note within one business day of a return | [Amazon Business invoicing policy](https://m.media-amazon.com/images/G/02/rainier/help/legal/Amazon_Business_Invoicing_Policy_EN_161220.pdf) |
| Amazon: per-item tax | The order read's proceeds give each item's tax; restricted roles only for personal data | [Orders API model, 2026-01-01](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json), [Get order information](https://developer-docs.amazon.com/sp-api/docs/get-order-information) |
| eBay: invoices | VAT invoices, receipts and credit notes for a UK seller who opts in by form (out by email); not cancellable; invoices issued elsewhere too double the VAT | [eBay UK: VAT invoices](https://www.ebay.co.uk/sellercentre/news/2025-april/vat-invoices) |
| eBay: opt-in not readable | Seller programmes are `OUT_OF_STOCK_CONTROL`, `PARTNER_MOTORS_DEALER`, `SELLING_POLICY_MANAGEMENT`; selling preferences have no VAT invoice setting | [Account API](https://developer.ebay.com/develop/api/sell/account_api_v1), [GetUserPreferences](https://developer.ebay.com/devzone/xml/docs/Reference/eBay/GetUserPreferences.html) |
| eBay: order data | No invoice upload; a line's tax only when a tax applies; VAT eBay collects reported per line | [Fulfillment API](https://developer.ebay.com/develop/api/sell/fulfillment_api) |
| Shopify (*Later*): tax data | Whether taxes are included; tax lines with a rate and whether the channel is liable | [Order](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order), [TaxLine](https://shopify.dev/docs/api/admin-graphql/latest/objects/TaxLine) |
| EU: import scheme | Distance sales of imported goods up to €150 a consignment; a facilitating marketplace is the deemed supplier | [EU One Stop Shop](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop/declare-and-pay-oss_en), [VAT Directive, article 14a](https://eur-lex.europa.eu/eli/dir/2006/112/oj) |

## 16. Tests that prove each rule

| Test | Where | Proves |
| --- | --- | --- |
| Gap-free series | CI | A failed issue leaves its number unused; two issues at once get consecutive numbers |
| Frozen documents | CI | Updates and deletes on `invoicing_document` are refused for the runtime role ([ADR-001 SPEC 6](../../database-architecture/spec/#6-guard-rails)) |
| One issuer | CI, per channel | No invoice or credit note for an account the marketplace invoices; an eBay invoice needs the confirmation |
| Flag blocks issue | CI | No invoice while flagged, except an Owner's or Admin's issue with a reason |
| Rounding cases | CI | A mixed shop basket (honey £12.00, fudge £9.00, delivery £4.80: VAT £1.84); a £30.00 hamper split 5:7 by cost (VAT £2.92); a net business order with split delivery (VAT £19.97) and its credit note (£4.70); totals equal the sum of lines |
| Rate across a change | CI | A marketplace order keeps the rate at payment; a credit note keeps its invoice's rate |
| Cancellation | CI | A cancelled order's records sum to zero, across a period end |
| Export | CI | Totals per issuer section equal the sum of VAT records, with late records and corrections |
| Restore | ADR-001's restore test | Documents issued after the restore point are re-registered and the counter set past them |
| Switch-on | CI | Records start at the chosen date, none before |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **One writer:** only Invoicing writes `invoicing_` tables; it imports other modules' contracts only.
- [ ] **Events:** the VAT record is written by Invoicing's handler for Orders' import event, not inside Orders' transaction; each handler checks its receipt.
- [ ] **Append-only:** no code path updates or deletes a `invoicing_vat_line` or `invoicing_document` row; corrections insert.
- [ ] **One rounding function** serves lines, splits, credit notes and the export; its tests hold the four cases above.
- [ ] **Rate lookup** takes the tax point, never today's date.
- [ ] **Issue command** checks, in order: issuer, flag or override, currency, eBay confirmation; then takes the counter in the same transaction.
- [ ] **Files:** object-storage writes use keys that refuse overwrite; hashes are stored before the transaction commits.
- [ ] **Customer block:** stored only on `invoicing_document`, tagged `pii`; never written to the order.
- [ ] **Charge lines:** handled by the goods-line path with their own class, never split.
- [ ] **Export:** built only from `invoicing_vat_line`; the header text states the method and the payout warning.
- [ ] **Later parts:** no Amazon upload, Shopify comparison, EU treatment or per-country class at launch.
