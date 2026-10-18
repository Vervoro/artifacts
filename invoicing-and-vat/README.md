# ADR-011: Invoicing and VAT

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026 |
| **Scope** | The invoices and credit notes a seller issues to buyers for marketplace and manual orders, and the VAT on every sale: when a document is needed and who issues it, what it holds, numbering, rates and how VAT is worked out, mixed baskets and delivery, refunds, figures that differ from a marketplace's, delivery and retention of documents, sales outside the UK, and the export to accounting software. Not how Vervoro bills its own sellers |
| **Builds on** | [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-002: Data retention and archiving](../data-retention/), [ADR-003: Product model](../product-model/), [ADR-004: Channel connectors](../channel-connectors/) with [ADR-004.1](../ebay-connector/), [ADR-004.2](../amazon-seller-connector/) and [ADR-004.3](../shopify-connector/), [ADR-006: Stock ledger and reservations](../stock-ledger/), [ADR-007: Order ingestion](../order-ingestion/), [ADR-009: Buyer data and privacy](../buyer-data/), [ADR-010: Users, roles and sign-in](../users-and-access/) |

## Context

A seller who runs their own warehouse sells to consumers on marketplaces and on their own shop, and to businesses by phone or email. VAT is due on every one of those sales, but an invoice is needed for only some of them. Earlier records already decide parts of this:

- **ADR-001:** human-readable numbers come from a counter table keyed `(company_id, name)`, taken in the writer's transaction.
- **ADR-002:** accounting records are kept for 6 years from the end of the financial year, then deleted.
- **ADR-003:** a product holds a VAT class, not a rate. Rates come from one table per country with `valid_from` and `valid_to`. Every order and invoice line stores the country, class and rate it used, and a later rate change never rewrites it.
- **ADR-006 and ADR-007:** refunds are made in the channel's own tools. Vervoro records them and moves no stock for them. Returns come back held, for a person to inspect. Manual orders are ordinary orders.
- **ADR-010:** six fixed roles. An Accountant reads everything a report or an invoice needs and changes nothing. Each later module adds its own rows to the table of who may do what.
- **ADR-009:** Vervoro issues an invoice for the seller only when the buyer asks, or when the law or the marketplace requires one. It is a simplified invoice without buyer details wherever the law allows. Every issued invoice is kept unchanged for 6 years, and after the order is anonymised only owners, admins and accountants see it. Buyer email and billing addresses are not kept.

The facts this record has to work with:

- **Most of what the reference sellers sell is zero-rated.** Most food is zero-rated in the UK, but confectionery, crisps, ice cream, soft drinks and alcohol are standard-rated. A hamper of both is a mixed supply, and its price must be split.
- **A VAT invoice is required only for standard- or reduced-rated sales to a VAT-registered customer.** A consumer needs none, and an invoice for a zero-rated supply is not a VAT invoice. A retailer must still give a VAT invoice to anyone who asks.
- **VAT shown on an invoice is owed by whoever issued it,** even when the supply was not taxable at that rate. A wrong document costs the seller money. A missing one, for a consumer, costs nothing.
- **Marketplaces already invoice.** Amazon's VAT Calculation Service can generate every invoice and credit note itself, and Amazon Business orders need an invoice within one business day of dispatch. eBay can generate VAT invoices, receipts and credit notes for a UK seller who opts in, and warns that a second set issued elsewhere doubles the VAT owed.
- **The seller stays responsible.** A third party may issue invoices for a business, but the legal duties for their content and storage remain the seller's.
- **The seller's books live elsewhere.** Sellers file their VAT returns from accounting software under Making Tax Digital. What Vervoro holds must reach that software by a digital link, not by retyping.

## Decision

1. **The seller is the supplier, and Vervoro issues documents in the seller's name.** Vervoro never files a VAT return and is never the supplier.
2. **One issuer per sale.** Each marketplace account records who invoices its orders: the marketplace, or Vervoro. Vervoro refuses to issue an invoice or a credit note for an order whose account says the marketplace invoices. For an eBay order, the person issuing also confirms that eBay holds no invoice for it.
3. **Amazon orders are invoiced by Amazon at launch.** A VAT-registered seller connects Amazon with the VAT Calculation Service on and Amazon generating invoices. Vervoro issues and uploads nothing for Amazon, and it does not ask for Amazon's tax invoicing role.
4. **Vervoro issues a document only when one is needed or asked for.** A manual order to a business gets a full invoice when it is dispatched. Any other order gets one when a person asks for it for a buyer. No consumer order is invoiced automatically.
5. **One invoice layout, whose customer block the law fills or leaves empty.** The customer's name and address are printed for a business buyer, for a buyer who asks for them, or above £250. Otherwise the block is empty, which makes it a simplified invoice. The same layout shows no VAT for an order with only zero-rated lines, or for a seller who is not VAT-registered.
6. **Every sale line gets a VAT record when its order is imported,** invoiced or not, dated at its tax point. It holds the treatment, country, class, rate, net, VAT and gross. A cancellation writes a reversing record, and a change writes a correction. Nothing is ever rewritten. Documents, refunds and the accounting export read these records.
7. **Vervoro works out the VAT itself.** The gross price is what the buyer paid, as the marketplace reports it. VAT comes from the product's class, the rate valid at the tax point, and the treatment. A marketplace's own tax figure is stored beside Vervoro's, never in its place.
8. **A difference from the marketplace's figure is a problem for a person.** The goods are compared per order and per rate, and a difference beyond 1p flags the order. Delivery and discounts are shown but never flag it. No invoice can be issued until a person either fixes the class, or issues on Vervoro's figure with a recorded reason. The flag never holds the order's dispatch.
9. **Rounding is per line, to the nearest penny, half up.** For prices that include VAT, the VAT is taken out of the gross. For prices without VAT, it is added to the net. Totals are the sums of the rounded lines, and VAT is never rounded down.
10. **Mixed supplies are split by a stated rule.** A bundle whose components have different classes is split by their standard costs. Delivery follows the goods it carries and is split by their value. Discounts reduce the lines they apply to.
11. **One gap-free series per company** for invoices and credit notes alike. Each number comes from ADR-001's counter, in the transaction that issues the document. There are no drafts: issuing is one confirmed command. An issued document is never changed or deleted. A mistake is corrected with a credit note and a new invoice.
12. **An issued document is frozen.** Its record, its PDF and a data file are written when it is issued. The two files go to object storage under keys that are never overwritten. A download always returns the same file.
13. **A credit note is issued only against an invoice Vervoro issued.** When a refund is recorded on such an order, the order's screen offers one, worked out from the refund, and a person confirms it. It uses the original invoice's rates. Other refunds become VAT records only.
14. **The seller delivers documents.** Owners, Admins, Managers and Accountants download the PDF. Vervoro sends no invoice to a buyer, because it keeps no buyer email.
15. **The accounting export is a file.** It holds a register of documents and a VAT summary of every sale, refund and correction, per period, as CSV. That counts as a digital link for Making Tax Digital. The summary is split by who issued each sale's documents, so a seller who already imports marketplace payouts posts nothing twice. Vervoro connects to no accounting software at launch.
16. **Launch covers sales delivered in the UK, Northern Ireland included, at UK rates.** An order delivered outside the UK is a zero-rated export. Its carrier, tracking number and the carrier's delivery event are kept as export evidence. Where a marketplace collects the VAT itself, the line is recorded as marketplace-collected, and Vervoro issues nothing for it. EU VAT schemes are a later record.

## When a document is needed, and who issues it

| Sale | Who invoices | What Vervoro does |
| --- | --- | --- |
| Amazon order (seller- or Amazon-shipped), seller VAT-registered | Amazon, through the VAT Calculation Service | Records the VAT; issues nothing |
| Amazon order, seller not VAT-registered | Nobody issues a VAT invoice; Amazon issues receipts to business buyers for a seller who declares the exemption | Records the sale with treatment `none` |
| eBay order, seller opted in to eBay's VAT invoices | eBay | Records the VAT; issues nothing |
| eBay order, not opted in | Vervoro, when a person asks for it for a buyer | An invoice, after confirming eBay holds none |
| Shopify order | Vervoro, when a person asks for it for a buyer | An invoice |
| Manual order to a business | Vervoro, when the order is dispatched | An invoice with the customer block |
| Manual order to a consumer | Vervoro, when a person asks for it | An invoice |
| A line where the marketplace collects the VAT (eBay's collect-and-remit, a Shopify tax line the channel is liable for) | The marketplace, as the supplier the law deems | Records the line as marketplace-collected; issues nothing for it |

**The account's issuer is a setting, asked when the account is connected.** For Amazon it is fixed to "the marketplace". For eBay, the seller says whether they have opted in to eBay's VAT invoices. eBay's API does not say, and eBay's own invoices cannot be cancelled. Vervoro cannot find out for itself, so it asks, and it repeats the warning about doubled VAT next to the setting. A change applies to orders imported afterwards. A setting typed once is a weak guard against the one outcome eBay warns about, so each invoice for an eBay order also asks the person issuing to confirm "eBay holds no invoice for this order", and the confirmation is kept with the document.

**Why Amazon invoices its own orders.** Four reasons:

- Uploading invoices needs Amazon's tax invoicing role, a restricted role that releases buyer tax data. ADR-009 asks Amazon only for the shipping role.
- Amazon rejects an upload whose totals differ from its own.
- Amazon Business orders need a document within one business day of dispatch, and Amazon's own invoices meet that without depending on Vervoro.
- The service costs the seller nothing.

The cost: a seller who will not use the service has no way to invoice Amazon Business orders through Vervoro. The connections screen says so before the account is connected.

**Why not invoice every order automatically.** A full invoice keeps the buyer's name and address for 6 years (ADR-009). Most of these orders are zero-rated food sold to consumers, who need no invoice at all. Issuing on request keeps the documents that hold personal data to the few that need them. A seller who later finds requests too many could have invoices issued automatically with an empty customer block, which holds no buyer data. That is a small change, left to a later record if it is needed.

**The tax point.** For goods it is normally the dispatch date, or an earlier payment. A marketplace order is paid at purchase, so its tax point is the payment time the marketplace reports. A manual order on credit terms has its tax point at dispatch. The tax point picks the rate and the VAT period. A full invoice must be issued within 30 days of it. A manual business order is invoiced at dispatch, so it meets that unless the order is flagged, and the flag's alert covers that case.

## What a document holds

There is one invoice layout. With the customer block filled it is a full invoice. With it empty it is a simplified invoice, allowed up to £250 when the buyer is a consumer who has not asked for their details on it.

| Item | Invoice, customer block filled | Invoice, customer block empty | Credit note |
| --- | --- | --- | --- |
| Number from the series, and the date of issue | Yes | Yes | Yes |
| Tax point | Yes | Yes | The original invoice's |
| Seller's registered name, address and VAT number | Yes | Yes | Yes |
| Customer's name and address | Yes | No | Yes |
| Customer's VAT number | When given | No | When given |
| Each line: description, quantity, unit price, VAT rate, amount without VAT | Yes | Description only | Yes, for what is credited |
| Totals per rate: without VAT, VAT, with VAT | Yes | With VAT, and the rate | Yes |
| Zero-rated and exempt lines totalled separately, marked "no VAT" | Yes | Yes | Yes |
| Total VAT in sterling | Yes | Yes | Yes |
| Number and date of the original invoice | | | Yes |
| The order's marketplace order id | Yes | Yes | Yes |
| No payment instructions on a marketplace order (the marketplace collects payment) | Yes | Yes | Yes |

**The customer's name and address** in the customer block are typed or confirmed by the person who issues it. The delivery recipient and address are offered as a starting point, and a business buyer's company name and VAT number when the marketplace gives them. They are stored on the invoice only, never on the order. They stay for the invoice's 6 years, encrypted with the company's key, as ADR-009 decides.

**The seller's details** come from the company's invoicing settings: the registered name and address, and the VAT number with its registration date. Nothing else is needed by law, so there is no logo, footer or trading name at launch. The details are copied into each document when it is issued, so changing them later never changes a document already issued.

**Not VAT-registered.** A company without a VAT number issues invoices that show no VAT, no rates and no VAT number. Every line takes treatment `none`. A company that registers sets a registration date, and orders whose tax point falls on or after it use the rates.

## Numbering

- **One series:** a single counter named `invoice` in ADR-001's table, shared by invoices and credit notes. The law allows one series or several, and one means one counter and one rule to test.
- **Taken at issue, in the same transaction** that writes the document's record. A refused or failed issue rolls the number back with everything else, so the series has no gaps. The issuing transaction locks the counter's row, so two issues at once wait for each other.
- **Format:** a fixed prefix for the kind, then the number padded to six digits. Invoice 231 is `INV-000231`, and the credit note issued next is `CN-000232`. Before the first document, the seller may set the first number, for example to continue a series from earlier software. It is fixed once the first document is issued.
- **Never reused, never deleted, never edited.** Cancelling a mistaken invoice means a credit note for all of it. If a corrected invoice is needed, it takes a new number.
- **A company restore** (ADR-001) may roll the database back past documents that were already issued and handed to buyers. Their files are still in object storage. The restore re-registers every document found there that is newer than the restore point, and sets each counter past the highest number found. The series stays whole, and no number is issued twice.

## VAT rates and classes

ADR-003 keeps the class on the product and the rate in one table. This record adds how a line's VAT is decided.

**When the VAT record is written.** The tax point of a marketplace order is its payment, which comes before dispatch, so the record is written when the order is imported. Orders paid on the last weekend of a VAT quarter and shipped on the Monday are therefore in the quarter they were paid. Nothing is ever rewritten:

- **A cancellation** writes a reversing record dated the cancellation.
- **A change of quantity, class or split** writes a correction that names the record it replaces.
- **A refund** writes a negative record (below).
- **A manual order** gets its records when it is dispatched, which is its tax point, unless it was paid earlier.

**The line's treatment** is the first thing decided, when the line's VAT record is written:

| Treatment | When | Rate used |
| --- | --- | --- |
| `domestic` | Delivered in the UK, Northern Ireland included, by a VAT-registered seller | The UK rate for the line's class at the tax point |
| `export` | Delivered outside the UK, by a VAT-registered seller | 0%, with the class kept for reports |
| `marketplace` | The marketplace collects and pays the VAT itself | The marketplace's figure, recorded, not the seller's VAT |
| `none` | The seller was not VAT-registered at the tax point | No VAT |

**The rate is the one valid at the tax point.** The rate table already has `valid_from` and `valid_to`. A rate change that falls between an order's purchase and dispatch does not affect a marketplace order, whose tax point is the purchase. A credit note always uses the original invoice's rate. A temporary rate is two rows with their dates, like the reduced rate on children's meals in catering between 25 June and 1 September 2026.

**The UK classes for food.**

| Goods | UK class |
| --- | --- |
| Most food not supplied in catering: honey, jam, bread, cakes, tea, coffee, milk | Zero |
| Confectionery (except cakes and some biscuits), ice cream, crisps and roasted or salted nuts, soft drinks, alcohol | Standard |
| Packaging that is more than normal (a wicker basket, a reusable tin), sold with food | Standard, as its own part of the price |

The class is the seller's decision, recorded on the product. Vervoro shows what each class means and never guesses one.

**Northern Ireland** is in the UK's VAT territory for goods sold from Great Britain to consumers and businesses there, at UK rates. ADR-009 keeps the tax territory with the order after anonymisation, so reports can show it. Sales of goods between Northern Ireland and the EU follow different rules and are left to the later record on the EU.

## Working out the VAT

**What the buyer paid wins.** The gross line price, the delivery charge and the discounts come from the marketplace order, as ADR-007 imports them. Vervoro never changes what was charged; it works out how much of it is VAT.

**Per line, to the nearest penny, half up.**

- **Prices that include VAT** (marketplaces and the seller's shop in the UK): VAT = gross × rate ÷ (100 + rate), rounded; net = gross − VAT. The gross stays exactly what was paid.
- **Prices without VAT** (manual business orders, typed net): VAT = net × rate ÷ 100, rounded; gross = net + VAT.
- **Totals** are the sums of the rounded lines, per rate and in all. They are never worked out again from the totals.
- **Never rounded down.** A seller who sells to consumers is a retailer, who must not round VAT down but may round each calculation up or down. One rule for every order keeps the seller consistent, which HMRC requires.

**Mixed supplies.** A single price for goods at different rates must be split fairly, and the split must be explainable.

- **A bundle with components of one class** takes that class.
- **A bundle with components of different classes** is split by its components' standard costs (ADR-003), each part at its own class. ADR-003 gives a bundle a cost, the sum of its components, but no selling price, so cost is the one fair base Vervoro always has. The split and the costs it used are stored with the line.
- **The minor-item rule.** A small standard-rated item packed with zero-rated food may count as zero-rated when it is not priced separately and costs no more than 20% of the whole and no more than £1 without VAT. A seller may mark a bundle this way. The mark is tested against the components' costs each time a line's VAT record is written, so a cost that has grown past either test splits the next sale instead of zero-rating it.
- **A bundle with a component missing its cost** cannot be split. Its line is flagged, like a mismatch, until the cost is entered.
- **The bundle form shows the split** as it would be today ("58% standard-rated by cost") and whether the minor-item rule passes, so the seller sees the VAT effect when the bundle is built. Nothing extra is stored: each sale's record keeps the split it used.
- **Parts are rounded half up.** A leftover penny goes to the largest part, so the parts add up exactly to the price.

**Delivery.** These sellers must deliver under the contract of sale, so delivery follows the VAT of the goods it carries, even when it is charged separately. On an order whose lines share one rate, delivery takes that rate. On a mixed order, delivery is split in proportion to the lines' gross values after discounts, by the same rounding. A partial refund of delivery reuses the stored split.

**Discounts.** A discount the marketplace gives per line reduces that line. A discount on the whole order is split across the lines by their gross values. A discount the marketplace funds itself does not lower what the seller is paid for the goods. Where the marketplace does not say who funded a discount, it counts as the seller's.

### Worked example: a mixed basket on the seller's shop

A buyer, A. Sample, orders on the seller's shop: two jars of honey at £6.00 each, a box of fudge at £9.00, and standard delivery at £4.80. All prices include VAT. The buyer asks for an invoice.

| Line | Class | Gross | VAT | Net |
| --- | --- | --- | --- | --- |
| Honey × 2 | Zero | £12.00 | £0.00 | £12.00 |
| Fudge × 1 | Standard 20% | £9.00 | £1.50 | £7.50 |
| Delivery, zero part (12 ÷ 21 of £4.80 = £2.742…) | Zero | £2.74 | £0.00 | £2.74 |
| Delivery, standard part (9 ÷ 21 of £4.80 = £2.057…) | Standard 20% | £2.06 | £0.34 | £1.72 |
| **Total** | | **£25.80** | **£1.84** | **£23.96** |

The total is under £250 and the buyer is a consumer, so the invoice's customer block is empty, which makes it a simplified invoice: `INV-000232`. It shows the seller's details, the tax point, the descriptions, and per rate the total with VAT: zero rate £14.74, standard rate £11.06 with VAT of £1.84. It holds no buyer details.

### Worked example: a hamper

A "Breakfast hamper" bundle sells on eBay for £30.00, VAT included. Its components and their standard costs:

| Component | Class | Standard cost |
| --- | --- | --- |
| Honey × 1 | Zero | £2.00 |
| Jam × 2 | Zero | £3.00 |
| Fudge × 1 | Standard | £3.00 |
| Wicker basket × 1 | Standard | £4.00 |
| **Total** | | **£12.00** |

The standard-rated items cost £7.00 of £12.00, which is 58%, so the minor-item rule does not apply. The price is split by cost:

- **Zero part:** 5 ÷ 12 of £30.00 = £12.50, no VAT.
- **Standard part:** 7 ÷ 12 of £30.00 = £17.50, of which VAT is £17.50 ÷ 6 = £2.9166…, rounded to £2.92, and the net is £14.58.

The line's VAT record keeps both parts and the costs used. A credit note for this hamper reuses the same split.

### Worked example: a business order and its credit note

A manager enters a manual order for Sample Foods Ltd, VAT number GB 000 0000 00. It is 40 boxes of fudge at £2.35 each and 24 jars of honey at £4.10 each, plus delivery of £12.00. All prices are without VAT. On dispatch, Vervoro issues an invoice with the customer block filled, `INV-000231`.

| Line | Qty | Unit price | Rate | Net | VAT |
| --- | --- | --- | --- | --- | --- |
| Fudge, 200 g box | 40 | £2.35 | 20% | £94.00 | £18.80 |
| Honey, 340 g jar | 24 | £4.10 | 0% | £98.40 | no VAT |
| Delivery, standard part (94.00 ÷ 192.40 of £12.00 = £5.862…) | | | 20% | £5.86 | £1.17 |
| Delivery, zero part | | | 0% | £6.14 | no VAT |
| **Totals** | | | | **£204.40** | **£19.97** |

Standard-rated net £99.86 with VAT £19.97. Zero-rated net £104.54, totalled separately. The amount payable is £224.37. The invoice carries Sample Foods Ltd's name, address and VAT number, as the manager confirmed them, and the due date from the order's terms.

Ten boxes of fudge come back damaged. The manager records the return (ADR-006) and the refund, £23.50 plus £4.70 VAT. The order's screen offers a credit note for 10 × fudge at £2.35, net £23.50, VAT at 20% £4.70, naming `INV-000231` and its date. The manager confirms it, and it takes the next number, `CN-000233`, within the 14 days the law allows after the refund is paid. The VAT adjustment falls in the period the refund was paid.

### Worked example: a figure that differs

The seller's shop is set to charge 20% on everything. A buyer, B. Example, pays £6.00 for a jar of honey, and the marketplace's tax line says £1.00 of it is VAT. The honey's class is zero, so Vervoro's figure is £0.00.

- **The order is flagged.** The goods at the zero rate show "VAT differs from the marketplace: £1.00 against £0.00". The order ships as normal.
- **No invoice can be issued for this order** until a person resolves the flag. VAT shown on an invoice is owed by whoever issues it, so a document showing £1.00 would cost the seller £1.00.
- **The person chooses one of two fixes.** If the class is wrong, they correct the product, and a correction record replaces the line's VAT record. If the class is right, they issue on Vervoro's figure, giving a reason that is kept with the document, and fix the shop's tax setting so the next orders match.
- **Flags are grouped in the account's alerts** by product, with the VAT at stake, so a wrongly set listing shows once, not once per order.

**What is compared.** Only the goods, per order and per rate. Delivery and discounts are split by Vervoro's rule, and a shop may tax delivery differently, for example at 20% whatever the goods. Comparing them would flag almost every mixed basket for a difference in method, not in the VAT owed. Their figures are shown beside Vervoro's but never flag the order.

The comparison runs only where the marketplace gives a figure: the shop's tax lines, and Amazon's per-item tax, which its order read gives as the tax part of each item's proceeds. That is sales data, not personal data, so it needs none of Amazon's restricted roles. eBay gives none for a UK seller's domestic sale: a consumer price in the UK already includes VAT, so eBay adds no tax at checkout, and its order shows a tax only when tax is added or when eBay itself collects it. For Amazon orders, the VAT that counts is what Amazon put on the invoice it issued for the seller. So the VAT record takes Amazon's figure, keeps Vervoro's beside it, and the flag asks the seller to fix the product's tax code at Amazon.

## Refunds, returns and credit notes

| What happened | Vervoro |
| --- | --- |
| Refund on an order Vervoro invoiced | The order's screen offers a credit note for the refunded lines and amounts, worked out when shown, and the date by which the law wants it (14 days after the refund is paid). A person confirms it. Nothing is stored until then |
| Refund on an order the marketplace invoiced | Nothing to issue; the marketplace's own credit note covers it. A refund VAT record is written |
| Refund on an order nobody invoiced | No credit note, since there is no invoice for it to name. A refund VAT record is written, at the original rates |
| Return with no refund (a replacement sent) | No document. The replacement is not a new sale |
| An invoice issued in error | A credit note for all of it, then a new invoice if one is needed |

**Refund VAT records** are negative records against the original line. They take its treatment, rate and split, for the amount refunded. They fall in the VAT period of the refund date, as HMRC requires.

**A refund that names no lines** (a goodwill refund on the whole order) is split across the lines by their gross values, like an order discount.

**An invoice asked for after a refund** shows the order as it stands, less what was refunded, so no credit note is needed.

## Delivering and keeping documents

**PDF, made once.** Issuing renders the PDF and a data file (the document's record as JSON) and writes both to object storage. The keys are never overwritten (ADR-002), and both files are encrypted with the company's data key. A hash of each file is stored with the record. That proves the document has not changed, as HMRC's rules on electronic invoices ask.

**Delivery is by the seller.** The order's screen offers the PDF to the roles in the table below. A download is a link that expires after 24 hours, and each download is logged (ADR-009). The seller sends the file to the buyer through the marketplace's own messages, or to a business customer directly. Vervoro keeps no buyer email (ADR-009), so it sends no invoice itself.

**Retention.** Documents and VAT records are accounting records. They stay in the cell for 24 months, then move to the archive with their month, and are deleted 6 years after the end of the financial year (ADR-002). After the order is anonymised, a full invoice is the only place the buyer's name and address remain. It is shown only to owners, admins and accountants, and it is not searchable by buyer (ADR-009). A buyer's erasure request keeps the invoice, and records why.

**Export evidence.** An order delivered outside the UK is zero-rated only with proof it left the UK, obtained within 3 months and kept 6 years. The seller's courier invoices, which list each waybill, are their commercial evidence. Vervoro keeps the link from each order to its parcel:

- **What is kept:** the carrier, the tracking number, the dispatch date, and the carrier's delivery event (its date and country) captured when it arrives, with a hash. No postcode and no name: the destination country is already kept with the order (ADR-009).
- **A tracking lookup expires long before 6 years,** which is why the delivery event is captured when it arrives rather than looked up later.
- **An export line dispatched without a tracking number is flagged,** because it has no evidence from day one. Nothing is reclassified automatically. Changing a line to standard-rated is the seller's decision, and it is recorded as a correction.
- This needs an edit to ADR-009, below.

## Selling outside the UK

The reference sellers sell in the UK. Launch covers that, and records the rest correctly without trying to account for it.

- **Delivered to Northern Ireland from Great Britain:** treatment `domestic`, at UK rates.
- **Delivered outside the UK by the seller:** treatment `export`, zero-rated, with the evidence above.
- **Marketplace sales into the EU up to €150 a consignment:** the marketplace is the deemed supplier for the EU's import scheme. eBay reports the VAT it collects on the line. The line is recorded as `marketplace`, and Vervoro issues nothing for it.
- **The seller's own shop selling into the EU:** recorded as exports. Registering for the EU import scheme, which needs an EU intermediary for a seller established outside the EU, is the seller's matter at launch.
- **Stock held in the EU, or Amazon's European fulfilment programmes:** not supported at launch.

UK rules on overseas sellers do not apply to these sellers. A UK marketplace becomes the supplier for goods in the UK only when the seller is not established in the UK, or for imported consignments up to £135. A UK-established seller stays liable for their own UK sales.

## Accounting export

**Two CSV files per period,** made on request by anyone who may export without buyer data (ADR-010), for any date range:

| File | One row per | Columns |
| --- | --- | --- |
| Document register | Invoice or credit note | Number, type, issue date, tax point, order and marketplace order id, the customer's name for business documents only, currency, and per rate: net, VAT, gross, VAT in sterling, original invoice for a credit note |
| VAT summary | Day, channel, issuer, treatment and rate | Sales, refunds and corrections: net, VAT, gross; when each record was written |

- **Every sale counts, invoiced or not.** The VAT summary is built from the VAT records, so uninvoiced consumer sales, marketplace-invoiced sales and refunds are all in it. A seller's accountant can post one journal per day and channel.
- **It says which figures it owns, so nothing is posted twice.** The summary has a section per issuer: sales Vervoro invoiced, sales the marketplace invoiced, and sales nobody invoiced. Marketplace-collected lines have a section of their own and are never the seller's output VAT. Many sellers already import marketplace payouts into their accounting software, and those payouts carry the same sales. The file's header, and a notice on the first export, say not to post a section that the payout import already posts. Without that, a seller who posts both pays the VAT on those sales twice.
- **Corrections to a period already exported** are their own section, with their net VAT effect per period. Each record has a "written at" column, so the accountant can see what arrived after their last export. The accountant then decides whether a correction goes on the next return or needs telling HMRC separately. Vervoro never changes a figure in a period silently.
- **The rules are printed in the header:** per-line rounding, bundles split by cost, delivery and order discounts split by value. That lets the seller show HMRC the same method was used throughout.
- **Making Tax Digital.** The seller's VAT return is filed from their accounting software, not from Vervoro. HMRC accepts CSV export and import as a digital link, but not copying by hand. A seller who uses Vervoro's figures as the start of their records stays compliant by importing the file.
- **No buyer data** in either file, apart from business customers' names on business documents.
- **Direct connections** to accounting software are a later record.

**Currency.** At a UK launch almost every order is in pounds. An export or a marketplace-collected line carries no UK VAT, so its currency needs no conversion for VAT. The VAT summary uses the sterling amounts the channel reports for its shop or account currency. A domestic order not priced in pounds is the one case where VAT would need converting to sterling. Vervoro refuses to issue an invoice for one and flags the order, rather than keeping a table of exchange rates for a case the launch sellers do not have.

## Who may do what

These are rows for ADR-010's table, in its six roles. An Accountant reads and exports but changes nothing, as ADR-010 decides, so issuing stays with the roles that run the orders.

| Action | Owner | Admin | Manager | Warehouse | Accountant | Staff |
| --- | --- | --- | --- | --- | --- | --- |
| Issue an invoice; confirm a credit note | Yes | Yes | Yes | No | No | No |
| Issue on Vervoro's figure despite a VAT flag (reason required) | Yes | Yes | No | No | No | No |
| Read and download issued documents | Yes | Yes | While the order holds buyer data (ADR-009) | No | Yes | No |
| Change the invoicing settings (registered details, VAT registration, first number, eBay issuer) | Yes | Yes | No | No | No | No |
| Make the accounting export | Yes | Yes | Yes | No | Yes | No |

Overriding a VAT flag decides what VAT the seller owes on a document they cannot withdraw, so it sits with Owners and Admins. A Manager who meets a flag fixes the product's class, or asks an Admin.

## Storage

The invoicing module owns its tables. They are tenant tables (ADR-001), with `company_id` on every row, leading every key, under row-level security. They name orders and products by plain id, never by foreign key, as ADR-000 requires.

| Table | Holds | Rules |
| --- | --- | --- |
| `invoicing_settings` | The seller's registered name, address, VAT number and registration date, the first number, and the eBay issuer setting per account | The first number is fixed after the first document |
| `invoicing_vat_line` | One VAT record per sale line part, refund, reversal or delivery part: order and line ids, treatment, country, class, rate, net, VAT, gross, currency, tax point, the split and its inputs, the marketplace's figure, the flag, the record it replaces, and when it was written | Append-only: a correction is a new record naming the one it replaces, and both are kept. Partitioned by month of tax point, so it archives with its month (ADR-002) |
| `invoicing_document` | Invoice or credit note: number, kind, issue date, tax point, the seller's and customer's details as issued, the lines as issued, totals per rate, the original invoice, any override reason, the eBay confirmation, file keys and hashes | Unique (company, number). Never updated after issue. Customer fields tagged `pii` (ADR-009) |

Counters are ADR-001's, and the export evidence is fields on the VAT record of an exported line, so nothing else is added.

**Rules, each with a test:**

| Rule | Where it is enforced |
| --- | --- |
| A number is used once and the series has no gaps | Unique index; a test that fails an issue part way through and finds the number unused |
| An issued document never changes | Updates and deletes revoked from the runtime role (ADR-001's append-only rule); a test that tries |
| No invoice or credit note for an account the marketplace invoices | The issue command; a test per channel |
| No invoice while the order is flagged, unless a person gives an override reason | The issue command |
| Line VAT, splits and totals follow the rounding rules | A table of cases, including every worked example in this record |
| A credit note uses the original invoice's rates | The credit command; a test across a rate change |
| A restore re-registers documents issued after the restore point | The restore test of ADR-001, with documents issued in between |
| The export's totals equal the sum of the VAT records, per issuer section | A test per period with late records and corrections |
| A cancelled order's VAT records sum to zero | The cancellation command; a test that cancels across a period end |
| An eBay invoice needs the person's confirmation that eBay holds none | The issue command |

## Proposed edits to earlier records

These follow from this record and are proposed with it:

- **ADR-010: Users, roles and sign-in.** The five rows in "Who may do what" join its table of who may do what, under a new heading "Invoicing", decided in this record. Its later-records entry for ADR-011 then points here.
- **ADR-007: Order ingestion.** The order also holds its delivery charge, as the buyer paid it, and any order-level discount. Each line also holds its discount, who funded it (the seller or the marketplace), and the marketplace's tax figure with whether the marketplace collects it. `unit_price` is stated as what the buyer paid, with VAT included when the marketplace includes it. The "Customers and invoicing (a later record)" bullet points here.
- **ADR-009: Buyer data and privacy.** Three changes. First, "Billing addresses and payment details" are never kept, except the customer's address printed on an issued full invoice. Second, orders delivered outside the UK keep their carrier, tracking number, dispatch date and the carrier's delivery event (date and country) for the statutory period, as export evidence. Third, the fields table gains that row.
- **ADR-001: Multi-tenant database architecture.** Restoring one company gains a step: re-register issued documents found in object storage that are newer than the restore point, and set their counters past them.
- **ADR-002: Data retention and archiving.** The row "Invoices and payments" becomes "Invoices, credit notes, VAT records, export evidence and payments".

## Constraints

| Constraint | Fact | Source |
| --- | --- | --- |
| UK: when a VAT invoice is needed | Required for standard- or reduced-rated supplies to a VAT-registered person; not for zero-rated supplies or for customers who are not registered | [VAT Notice 700, 16.2.1](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: zero-rated invoices | An invoice for a zero-rated supply is not a VAT invoice | [VAT Notice 700, 3.5](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: time limit | Normally within 30 days of the tax point | [VAT Notice 700, 16.2.3](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: full invoice | Sequential number in one or more series; tax point; supplier's name, address and VAT number; customer's name and address; description; quantity, rate and amount without VAT per line; totals; total VAT in sterling; unit price | [VAT Notice 700, 16.3.1](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: mixed invoices | Zero-rated and exempt items show no VAT and a separate total | [VAT Notice 700, 16.5](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: simplified invoice | Up to £250, customer agrees; supplier's details, tax point, description, per rate the total with VAT and the rate. A retailer must give a VAT invoice when asked | [VAT Notice 700, 16.6.1 and 16.6.2](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: rounding | Per line to the nearest 1p or 0.5p, or down to 0.1p, consistently; retailers must not round down but may round each calculation up or down | [VAT Notice 700, 17.5 and 17.6](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: third-party issuing and e-invoices | A third party may issue invoices, but the obligations stay with the supplier; a PDF must ensure authenticity, integrity and legibility | [VAT Notice 700, 17.7 and 17.8](https://www.gov.uk/guidance/vat-guide-notice-700), [VAT Notice 700/63](https://www.gov.uk/guidance/electronic-invoicing-notice-70063) |
| UK: credit notes | Within 14 days of the refund; number, date, both parties, description, quantity and amount, rate and VAT in sterling, original invoice's number and date; the rate of the original tax point; adjusted in the period of the refund | [VAT Notice 700, 18.2.3 to 18.2.6](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: tax point | Goods: when sent; an earlier payment or invoice sets an actual tax point | [VAT Notice 700, 14.2](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: VAT shown is owed | VAT shown on an invoice is recoverable from whoever issued it, whether or not it was chargeable | [VAT Act 1994, Schedule 11, paragraph 5(2) and (3)](https://www.legislation.gov.uk/ukpga/1994/23/schedule/11/paragraph/5) |
| UK: mixed supplies and delivery | Split a single price fairly between rates; a delivery the contract requires follows the goods' liability | [VAT Notice 700, 8.1 and 8.3](https://www.gov.uk/guidance/vat-guide-notice-700), [VAT Notice 700/24, 2.2](https://www.gov.uk/guidance/vat-on-postage-delivery-and-direct-marketing-notice-70024) |
| UK: foreign currency | VAT expressed in sterling at the market rate or HMRC's period rate | [VAT Notice 700, 7.6 and 16.4](https://www.gov.uk/guidance/vat-guide-notice-700) |
| UK: food | Most food zero-rated; confectionery, ice cream, crisps, soft drinks, alcohol standard; hampers are mixed supplies; the minor-item rule (not priced separately, at most 20% of the cost and £1) | [VAT Notice 701/14, 2.2 and 6.1](https://www.gov.uk/guidance/food-products-and-vat-notice-70114) |
| UK: rates and threshold | Standard 20%, reduced 5%, zero 0%; registration above £90,000 taxable turnover | [VAT rates](https://www.gov.uk/vat-rates), [When to register](https://www.gov.uk/vat-registration/when-to-register) |
| UK: records and Making Tax Digital | Records kept at least 6 years; CSV export and import, file transfer and APIs are digital links, copy and paste is not | [VAT Notice 700/21](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021) |
| UK: exports | Export and evidence within 3 months; evidence kept 6 years; courier records with tracking are commercial evidence | [VAT Notice 703, 3.5, 6.7 and 7.7](https://www.gov.uk/guidance/vat-on-goods-exported-from-the-uk-notice-703) |
| UK: online marketplaces | The marketplace is liable for goods in the UK sold by sellers not established in the UK, and for imported consignments up to £135 | [HMRC: overseas goods sold through online marketplaces](https://www.gov.uk/guidance/vat-and-overseas-goods-sold-to-customers-in-the-uk-using-online-marketplaces) |
| Amazon: invoice upload | `UPLOAD_VAT_INVOICE` needs the Tax Invoicing restricted role; the invoice number must match the PDF; totals sent must match Amazon's to the penny; one upload every 3 seconds | [Invoicing feed type values](https://developer-docs.amazon.com/sp-api/docs/invoicing-feed-type-values), [Create and upload invoices](https://developer-docs.amazon.com/sp-api/docs/create-and-upload-invoices) |
| Amazon: VAT Calculation Service | Amazon can generate every invoice and credit note; the UK store is covered | [Create and upload invoices](https://developer-docs.amazon.com/sp-api/docs/create-and-upload-invoices), [VCS guide](https://amazonservicesstatic.com/guides/mws-vat-calculation-service-guide.pdf) |
| Amazon: Business orders | A VAT invoice within one business day after dispatch, a credit note within one business day of a return; receipts from sellers not registered | [Amazon Business invoicing policy](https://m.media-amazon.com/images/G/02/rainier/help/legal/Amazon_Business_Invoicing_Policy_EN_161220.pdf) |
| eBay: invoices | eBay can generate VAT invoices, receipts and credit notes for a UK seller who opts in; they cannot be cancelled, and invoices issued elsewhere too double the VAT | [eBay UK: VAT invoices](https://www.ebay.co.uk/sellercentre/news/2025-april/vat-invoices) |
| Amazon: per-item tax | The order read's proceeds give each item's tax; restricted roles are needed only for personal data (shipping address, buyer information) | [Orders API model, 2026-01-01](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json), [Get order information](https://developer-docs.amazon.com/sp-api/docs/get-order-information) |
| UK: consumer prices | A selling price shown to consumers includes VAT | [Price Marking Order 2004, article 2](https://www.legislation.gov.uk/uksi/2004/102/article/2/made) |
| eBay: order data | No invoice upload in the Fulfillment API; a line's tax amount is returned only when a tax applies, and VAT eBay collects is reported per line; buyer tax ids only for Italy and Spain | [Fulfillment API](https://developer.ebay.com/develop/api/sell/fulfillment_api) |
| Shopify: tax data | Orders say whether taxes are included, and give tax lines with a rate and whether the channel is liable for remitting | [Order](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order), [TaxLine](https://shopify.dev/docs/api/admin-graphql/latest/objects/TaxLine) |
| EU: import scheme | Distance sales of imported goods up to €150 a consignment; a marketplace facilitating them is the deemed supplier | [EU One Stop Shop](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop/declare-and-pay-oss_en), [VAT Directive, article 14a](https://eur-lex.europa.eu/eli/dir/2006/112/oj) |

## Consequences

**What this gives us**

- No sale is invoiced twice, and no invoice shows VAT the seller does not owe.
- Every sale and refund has a VAT record, dated at its tax point, whether or not a document was issued. So the export covers the whole sales side of the VAT return, in the right period.
- The export says which sales it owns, so a seller who also imports marketplace payouts does not pay VAT twice.
- Invoice numbers have no gaps and are never reused, even across a restore.
- Mixed baskets, hampers and delivery charges follow one stated rule, kept with each line.
- Documents that hold personal data are only the few that need it.
- No new Amazon role, and no buyer email.

**What it costs**

- A VAT-registered seller must use Amazon's VAT Calculation Service. One who will not cannot invoice Amazon Business orders through Vervoro.
- Buyers who want an invoice wait for a person to issue and send it. There is no self-service and no email.
- A difference from a marketplace's tax figure blocks invoicing for that order until a person fixes it or overrides it with a reason.
- A domestic order not priced in pounds cannot be invoiced at launch.
- Bundles need component costs before they can be split.
- The seller still imports the export file into their accounting software by hand each period.
- EU sales beyond marketplace-collected VAT are recorded but not accounted for.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Upload Vervoro's invoices to Amazon | Needs the restricted tax invoicing role and buyer tax data. Amazon rejects totals that differ from its own, and its own service already meets the one-business-day rule |
| Make invoices from Amazon's VAT data (the service's second option) | The same restricted role, a report to poll every few hours, and a deadline Vervoro would own, for documents Amazon can make itself |
| An invoice for every order | Keeps buyer names and addresses for 6 years on documents nobody asked for; most of these sales are zero-rated food to consumers |
| Take the marketplace's tax figure as the VAT | The seller is liable for the correct VAT; a shop set to 20% on zero-rated honey would put VAT the seller does not owe into their records |
| Recalculate the gross from Vervoro's VAT | The buyer paid what the marketplace charged; changing it would make documents that match no payment |
| Round VAT once per invoice | Lines and credit notes could not be traced to a total, and a part refund could not reuse a line's split |
| Round VAT down | Not allowed for retailers |
| Split hampers by selling price | Products hold no selling price (ADR-003); cost is always there and is fair |
| Two series, one for invoices and one for credit notes | Allowed, but a second counter and its rules prevent no failure; the prefix already says which kind a document is |
| Separate document kinds for full, simplified, zero-rated and unregistered invoices | One layout with an optional customer block covers all four; the law decides what is printed, not a kind |
| Drafts | A stored draft needs states and clean-up, and a numbered draft that is deleted leaves a gap; issuing is one confirmed command |
| Write the VAT record when the line ships | The tax point of a marketplace order is its payment; orders paid on the last weekend of a quarter would land in the next one |
| Compare delivery and discounts with the marketplace's figures | Shops tax delivery by their own method; nearly every mixed basket would be flagged for a difference in method, not in the VAT owed |
| A table of HMRC exchange rates | Needed only for a domestic sale priced in a foreign currency, which the launch sellers do not have |
| A self-service invoice link printed on the packing slip | Proposed in the debate: the buyer types their details and gets the invoice at once. It needs a public page, buyer-typed personal data and VAT-number checks, and prevents only a wait for a person; a later record if requests are many |
| A nightly check of every listing's tax code | The per-order comparison finds a wrong listing on its first differing order, with data already imported; a nightly read of every listing would spend marketplace allowances |
| Lock a VAT period once the accountant closes it | A late or corrected record must go somewhere; a lock would only make it fail. A "written at" column and a corrections section show what changed |
| Reclassify an export as standard-rated after 3 months without evidence | Would change a period already filed without a person; the missing evidence is flagged at dispatch instead |
| Credit notes for refunds on uninvoiced orders | A credit note must name an invoice; a refund VAT record does the accounting |
| Email invoices to buyers | Needs buyer email, which ADR-009 does not keep |
| Connect to accounting software at launch | A CSV is a digital link that every package imports; a connector per package can come when sellers ask |
| Account for EU VAT at launch | The reference sellers sell in the UK; marketplaces collect VAT on their EU sales up to €150 |

## What later records decide

- **Amazon invoice upload** (a later record): uploading Vervoro's invoices, or sending them through Amazon's buyer messages, for sellers who will not use Amazon's service. It needs the tax invoicing role, and so an edit to ADR-009.
- **Selling into the EU** (a later record): the EU's import and One Stop Shop schemes for the seller's own shop, stock held in the EU, Amazon's European fulfilment, and goods between Northern Ireland and the EU.
- **Accounting connections** (a later record): direct posting to accounting software, and receivables for business customers on credit terms.
- **Business customers** (a later record): saved business customers for manual orders, with their invoice address, VAT number and terms.
- **Shipping** (a later record): capturing the carrier's delivery event for exported parcels, and returns from the marketplaces.
- **Sending invoices to buyers** (a later record, if sellers ask): email, or the self-service link on the packing slip, either of which would change what ADR-009 keeps.
- **Settlement reconciliation** (a later record): comparing each channel's sales and refunds with the marketplace's payout reports each period, to catch missing orders before the return is filed.
