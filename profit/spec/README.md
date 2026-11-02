# ADR-016 SPEC: Profit

| | |
| --- | --- |
| **Decision** | [ADR-016: Profit](../) |
| **Procedures** | None yet |
| **Date** | 2 November 2026, draft for the owner's approval (owner delegation; ROADMAP 5.6.1); revised the same day after its plan review and completeness review |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-016 from: the Profit module. Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/). Nothing here is built until the owner approves the record ([ADR-016 decision 13](../#decision)); section 15 lists what the other records gain.

## 0. At launch and later

| Part | When | Trigger |
| --- | --- | --- |
| Sections 1–12 | Its own phase | The owner's approval; `sell.finances` on Vervoro's eBay keyset and Amazon's Finance and Accounting role on its developer profile |
| An estimate for lines waiting for fees | Later | Sellers ask for same-day profit |
| Amazon advertising per SKU (the Amazon Ads API) | Later | The owner approves the Ads API application and sellers ask |
| Labels Vervoro buys | Later | The shipping-labels record ([ADR-000 SPEC 4.7](../../system-architecture/spec/)) |
| Amazon Buy Shipping label costs | Later | The owner applies for the restricted Direct-to-Consumer Shipping role |
| A postage cost per product for parcels whose label is not seen | Later | Sellers ask |
| Money in another currency converted | Later | A seller sells in a second currency |
| The shipped batch's landed cost as the cost at sale | Later | Sellers ask for profit on the batch's landed cost ([ADR-006](../../stock-ledger/), [ADR-015 SPEC 12](../../purchasing/spec/)) |
| Shopify's fees | With [ADR-004.3](../../shopify-connector/) | Its connector is built |
| Profit by period exported | Later | Sellers or their accountants ask; the Accountant reads the screens meanwhile |

## 1. What Profit is

1. **A module** `profit`, switchable ([ADR-000 SPEC 3.4](../../system-architecture/spec/)), in every plan until Billing sets tiers ([ADR-012 SPEC 2.2](../../billing-and-plans/spec/)). It needs Orders (`sales`), Products, Channels and Access. Off, its slots draw nothing, its job stops, its data is kept, and Products' card shows gross margin before fees ([ADR-003 SPEC 2.4](../../product-model/spec/#24-the-products-figures)).
2. **It owns** fee entries, line costs and its day rows (section 10). Nothing else writes them.
3. **It reads, never changes:** Orders' **line read port** (order, line, account, product, the line's units as the sold figures count them, its revenue as the sold figures count it, its share of the delivery charge, the VAT rate stored on the line, the bundle's recorded components, status, refunds), Products' standard cost and Channels' **read-fees port**.
4. **It shows itself through slots,** never through a port another module calls ([ADR-000 SPEC 1.1, 4.2](../../system-architecture/spec/)): a `card` on the product page and on an account's page, a `column` on the Products list (one query, [ADR-000 SPEC 1.3](../../system-architecture/spec/)), and its own Profit page; each under the costs permission.

## 2. A line's profit

1. **Revenue** is the line's revenue as Orders' sold figures count it ([ADR-007 SPEC 1.7](../../order-ingestion/spec/#1-the-module)), plus its share of the order's delivery charge as paid, without VAT (VAT following the goods, [ADR-011 SPEC 7](../../invoicing-and-vat/spec/)), split over the order's lines by value. A cancelled line has none.
2. **Fees** are the marketplace's fees on the line (section 5): without VAT when the company is VAT-registered on the order's day and the marketplace gives the VAT apart; with VAT when it is not registered ([ADR-011](../../invoicing-and-vat/)); a fee with VAT included and no tax figure counts as charged, and the line says "fee VAT not given".
3. **Marketplace labels** are a label bought on the marketplace for the order, split over its lines by units, rounded so the lines add up to the label. A line the seller ships whose label is not seen says **postage not known**; its profit is before postage. A marketplace-shipped line's postage is in its fulfilment fee ([ADR-007 SPEC 15](../../order-ingestion/spec/)), and a counter sale has none; neither says postage not known.
4. **Cost** is the line's cost at sale (section 3) × its units.
5. **Refunds** are their own part: the refunded money without VAT at the line's stored rate, split over lines by gross value when the refund names none ([ADR-011 SPEC 9.2](../../invoicing-and-vat/spec/)). **Fee credits** the marketplace gives back on a refund are their own part (section 5). *Later:* a return put back on sale gives its units' cost back, trigger: a record publishes the return's restock as an event Profit may hear.
6. **Profit** = revenue − fees − labels − cost − refunds + fee credits. **Margin** = profit ÷ revenue, shown when revenue is above zero.
7. **A line shows every part.** A line waiting for fees counts in no profit sum; a line with no cost counts in no margin; both are counted beside every total that leaves them out.
8. **Never waiting:** a manual order's or counter sale's line, and a line on an account whose connector does not declare `read-fees`, has no fees and never waits; a reversed counter sale counts nothing.
9. **A charge line** ([ADR-007 SPEC 14.4](../../order-ingestion/spec/)) counts in its account's totals as "other lines", on no product. **A line waiting for a link** counts once resolved, on its order's day, as the sold figures do; a line whose product changes moves its rows to the new product and takes the cost at sale then if it had none.

## 3. Cost at sale

1. **Kept when Profit first sees the line:** the product's standard cost then, in the company's currency, with its time. A bundle's line takes the components recorded on the line ([ADR-003 SPEC 6.3](../../product-model/spec/)), each at its standard cost then; a component with no cost leaves the line with none.
2. **Never overwritten** by a later edit of the product's cost.
3. **A line seen with no cost** keeps none; when the product's cost is first set, the lines of that product with none take it, together, in one transaction.
4. **A cost in another currency** is not taken; the line keeps none and says why.
5. **Lines read at switch-on** (section 4.5) take today's cost, marked "cost at switch-on".

## 4. Reading fees

1. **A connector that reads fees declares `read-fees`** among its optional capabilities ([ADR-004 SPEC 1.3](../../channel-connectors/spec/)) with its Finances operations' pools and rates ([ADR-004 SPEC 6, 7](../../channel-connectors/spec/)). It returns pages of **fee entries**, each: the marketplace's entry id, the posting time, its status where given, the order's marketplace id and, where given, the line (eBay's line item id; Amazon's SKU within the order), the kind (section 5), the marketplace's name for it, the amount and currency, the VAT where given, and whether it is a credit. The contract type holds **no buyer field**; the connector drops any (eBay's transactions name the buyer).
2. **Profit's own job** reads each live or shadow account whose connector declares `read-fees`, once a day, over a window from the last read less 3 days (eBay's ad fees move for 72 hours; Amazon's post up to 48 hours late). It is a due row ([ADR-001 SPEC 9.7](../../database-architecture/spec/)): plan, call Channels' read-fees port outside any transaction, write. The host makes each call through the account's binding, buckets and pool, as any read ([ADR-004 SPEC 7](../../channel-connectors/spec/)), and checks each entry against the contract type; an entry that fails is kept by Profit as a **fee problem** with its reason, never dropped.
3. **A line still waiting** after 60 days shows **fees not found** and counts as a line with no fees, said so. A fee posted late carries its late posting time, so the daily window finds it; a window a failed read missed is read again by the next one.
4. **An entry is kept once** by its marketplace id; a later read with another amount or status (Amazon's deferred then released) replaces it, and its day row takes the difference in the same transaction.
5. **Switched on,** Profit reads the last 90 days of lines through Orders' line read port and fees over the same window (Amazon allows 180 days a call), in pages, as one due row per account. Switched on again, it reads the same 90 days; a line already seen keeps its cost at sale; lines older than 90 days sold while it was off are not seen, and the Profit page says from when it counts.
6. **An entry for an order Vervoro does not hold** (sold before the account connected, another site) is kept on the account as "order not in Vervoro", counted apart, in no profit. **A label with no order** is an account charge of kind shipping.
7. **Every read is a reading.** Nothing is sent to a marketplace; no stock moves. A failed read leaves the lines waiting, with the account's health saying so. With Profit off, no fee read runs; Channels holds nothing of Profit's.
8. **An account approved without the fee scope or role** (connected before Vervoro had them) reads no fees: its lines are not waiting and keep gross margin before fees, and its page offers approving again. The seller chooses when.
9. **A restricted company** ([ADR-012](../../billing-and-plans/)): fee reads go on as order imports do, and the screens stay readable.
10. **eBay** ([ADR-004.1](../../ebay-connector/)): the Finances API's `getTransactions`, signed for UK and EU sellers with Vervoro's key pair from eBay's Key Management API, an app secret declared with its rotation (the key lasts 3 years; [ADR-004 SPEC 2](../../channel-connectors/spec/)); 1,000 entries a page; the Finances calls' daily limit per application. A sale's fees per line from its line items; a refund's credits per line; a fee billed as a separate charge matched to its order by the order id; label transactions are their order's. Only the eBay account's owner can approve `sell.finances`: an account approved by a team login reads no fees and its health says "fees need the eBay account owner's approval".
11. **Amazon** ([ADR-004.2](../../amazon-seller-connector/)): the Finances API's `listTransactions` (not the v0 events Amazon withdraws on 27 August 2027), entries posted more than 2 minutes ago; a shipment's item fees by SKU within the order, two lines of one order with the same SKU split by units; refunds' credits; service fees and advertising invoices as account charges; deferred entries kept and replaced when released.

## 5. Kinds of fee

| Kind | eBay | Amazon | Where it counts |
| --- | --- | --- | --- |
| Selling fee | Final value fee, its fixed per-order part, regulatory fees | Referral fee, closing fees | The line |
| Fulfilment fee | none | FBA fulfilment fee | The line |
| Ad fee tied to a sale | Promoted listings (general) ad fee | none | The line |
| Marketplace label | Label transactions | Buy Shipping (Later) | The order, split by units |
| Account advertising | Cost-per-click charges | Sponsored Products in Finances | Account charge |
| Subscription, storage, other | Store subscription, other non-sale charges | Subscription, storage, service fees | Account charge |

A kind the connector does not map is kept as "other" on its line or account, with the marketplace's own name, never dropped.

## 6. Currency

Money in the company's currency is summed. A line, fee or charge in another currency is left out of every sum and counted, as the sold figures do ([ADR-007 SPEC 1.7](../../order-ingestion/spec/#1-the-module)).

## 7. Account charges

1. **Kept as fee entries with no order,** per account, with their kind, the marketplace's name and the day they post.
2. **Shown below the products' profit** on the account's card and the Profit page for the period; never spread over products.
3. **An account's net** for the period is its lines' profit less its charges; the company's is the sum over accounts.

## 8. What the figures sum

1. **Profit sums only accounts that read fees;** an account that does not keeps its gross margin before fees, shown beside, never added.
2. **Revenue on Profit's card is the sold figures' plus the delivery charge share,** labelled so; Products' own card, where it still shows, keeps the sold figures' revenue.
3. **Profit checks itself nightly:** its line revenue (without the delivery share, which is its own column) over the last 7 days, per product and account, equals Orders' `soldFigures` for the same window ([ADR-007 SPEC 1.7](../../order-ingestion/spec/#1-the-module)); a difference is an alert and the window's lines are read again.

## 9. Screens

1. **Profit's card on a product page** shows Revenue, Fees, Labels, Cost, Refunds, Profit and Margin per account and summed, over 7, 28 or 90 days, with the counts of lines waiting for fees, with no cost and with postage not known.
2. **The Products list's column** shows Profit and Margin over the chosen window, sortable, through the list extension.
3. **Profit's card on an account's page** shows the period's profit of its lines, its charges, its net, its fee problems and its "order not in Vervoro" entries.
4. **The Profit page** shows the company's period: totals, then by account (profit, charges, net), then by product (sortable by profit or margin), each row opening the product or the account. It says refunds count on their order's day while the VAT export counts them on the refund's.
5. **On a phone** the cards stack: totals, accounts, then products as cards.

## 10. Tables and events

| Table | What | Kept |
| --- | --- | --- |
| `profit_fee` | One row per marketplace fee entry: account, entry id, posted, status, order and line (or none), kind, marketplace's name, amount, VAT, currency, credit; problems with their reason | As closed orders: 24 months in the cell, then archived with their month until 7 years after it ends ([ADR-002](../../data-retention/)) |
| `profit_line` | One row per order line seen: product, account, order's day, revenue, delivery share, cost at sale and its time, waiting, refunds | As `profit_fee` |
| `profit_day` | One row per product, account and day: line revenue, delivery share, fees, labels, cost, refunds, fee credits, lines waiting, with no cost, postage not known | As sold day rows: 24 months, never archived ([ADR-007 SPEC 23](../../order-ingestion/spec/)) |

1. **Rows are written in Profit's own transactions:** a line event's handler or a fee page's write; the day row takes the difference in the same transaction.
2. **Events heard:** Orders' line imported or changed (a cancellation and a resolve are changes), refunded; Products' cost set.

## 11. Who may see what

| Action | Owner | Admin | Manager | Warehouse | Accountant | Staff |
| --- | --- | --- | --- | --- | --- | --- |
| See Profit's cards, column and page | Yes | Yes | Yes | No | Yes | No |

The same as "See costs, landed cost and margins" ([ADR-010 SPEC 4](../../users-and-access/spec/)). The figures are the company's, read as the sold figures are; a scoped Manager sees them whole. An operator sees them only under a grant.

## 12. Personal data

No personal data: fee rows hold marketplace order and entry ids and money; the connector drops every buyer field from a fee entry before the host sees it.

## 13. Costs, and the rule behind each

1. **Fee reads:** one daily window per account in the Finances pools (eBay's daily limit is per application, shared by every seller). The 3-day overlap is the cost of eBay's 72-hour ad adjustments.
2. **Writes:** one upsert per fee entry and one per touched day row in a page's transaction; about 3 entries per order line.
3. **Reads:** the column and cards read `profit_day` by company, product and day, one query.

## 14. Research and constraints

Read 2 November 2026.

- eBay Finances API (transactions, fee types, `sell.finances`): https://developer.ebay.com/api-docs/master/sell/finances/openapi/3/sell_finances_v1_oas3.json, https://developer.ebay.com/api-docs/sell/finances/types/api:FeeTypeEnum, https://developer.ebay.com/api-docs/sell/finances/types/pay:TransactionTypeEnum
- eBay digital signatures for UK and EU sellers' Finances calls, the developer's key pair: https://edp.ebay.com/develop/guides/digital-signatures-for-apis.md
- eBay call limits: https://developer.ebay.com/develop/api/sell/api_call_limits
- Amazon Finances API (`listTransactions`, by order): https://developer-docs.amazon/sp-api/docs/list-transactions-by-order.md, https://developer-docs.amazon/sp-api/docs/get-latest-transactions.md, https://github.com/amzn/selling-partner-api-models/tree/main/models/finances-api-model
- Amazon Finances v0 withdrawn 27 August 2027: https://developer-docs.amazon/sp-api/changelog/deprecation-of-finances-v0-operations
- Amazon roles (Finance and Accounting not restricted): https://developer-docs.amazon/sp-api/docs/roles-in-the-selling-partner-api
- Amazon settlement reports: https://developer-docs.amazon/sp-api/docs/report-type-values-settlement
- HMRC VAT Notice 700, input tax (only a registered business reclaims): https://www.gov.uk/guidance/vat-guide-notice-700
- Profit tools: Sellerboard (https://help.sellerboard.com/2025/12/04/2-1-2-products/, cost changes https://blog.sellerboard.com/2020/10/14/accounting-for-changing-cost-of-goods-for-profit-calculation/), A2X (https://support.a2xaccounting.com/a2x-cogs-and-inventory/overview-of-cost-of-goods-sold), Linnworks (https://help.linnworks.com/support/solutions/articles/7000050176), Veeqo (https://help.veeqo.com/en/articles/9626304-veeqo-profit-analyzer-overview)
- Unconfirmed: Amazon Ads API spend per SKU and its approval (third-party sources only); whether `sell.finances` itself needs eBay's Growth Check (checked when the owner applies).

## 15. What the other records gain on approval

- **ADR-000:** SPEC 4.1 a Profit row (switchable; needs Orders, Products, Channels, Access; shows a card on a product and an account, a Products column, its page), the re-run table and both diagrams; 4.7 takes "profit" off the parked list ("ads" and "shipping labels" stay); the guide's parked line.
- **ADR-001 SPEC 9:** the launch kinds table gains Profit's fee read and switch-on.
- **ADR-002 SPEC 2:** the retention rows of section 10.
- **ADR-003 SPEC 2.4 and How to check:** with Profit on, Profit's card shows the accounts that read fees; Products' card keeps gross margin before fees, at today's cost, for the accounts that do not and with Profit off.
- **ADR-004:** SPEC 1.1 a "Read fees" call, 1.2 the fee entry contract type, 1.3 `read-fees`, 4.3 the job name, 7.5 its place in the order, 13.4 a failing fee entry held as Profit's fee problem.
- **ADR-004.1:** SPEC 0 and 1.1: whether `sell.finances` needs the Growth Check is confirmed on the keyset (today's wording says it does); a Finances section (section 4.10), the signing key as an app secret with its 3-year rotation, the owner-only approval for fees, the Finances limits in SPEC 10, the simulator's Finances calls.
- **ADR-004.2:** a Finances section (section 4.11), its rate in SPEC 10, the simulator's Finances calls.
- **ADR-007:** SPEC 1.7 names Profit as a reader that keeps each line's revenue and checks it nightly; the line read port of section 1.3; SPEC 1.5 the events Profit hears (a cancellation and a resolve named as changes).
- **ADR-010 SPEC 4:** row 39 names Profit's cards, column and page, unscoped.
- **ADR-012 SPEC 2.2:** Profit in every plan until tiers are set.

## How to check it was built right

| Rule | Test |
| --- | --- |
| A line's profit (2) | Revenue with a delivery share, fees, a label, cost and a refund give profit and margin by hand; every part is shown |
| Revenue matches (8.3) | Profit's 7-day line revenue per product and account equals `soldFigures`; a difference alerts |
| Waiting (4.3) | A line with no fee entry counts in no sum and shows "fees not found" after 60 days; a late-posted fee is found by the next window |
| Never waiting (2.8) | A manual order's line and a line on an account with no `read-fees` are never waiting |
| Cost at sale (3) | Editing a product's cost leaves a seen line's cost; first setting a missing cost fills only lines with none; a bundle uses its recorded components |
| One entry once (4.4) | The same entry read twice is one row; a changed amount or a release replaces it and the day takes the difference |
| Account charges (7) | A subscription or Sponsored Products invoice is an account charge on no product |
| Postage (2.3) | A seller-shipped line with no marketplace label says "postage not known"; a marketplace-shipped line and a counter sale do not |
| Charge lines (2.9) | A charge line counts in its account's totals as "other lines", on no product |
| Fee problems (4.2) | An entry that fails the contract check is kept as a fee problem with its reason |
| Shadow accounts (4.2) | A shadow account's fees are read |
| Not in Vervoro (4.6) | An entry for an order Vervoro does not hold is counted apart; a label with no order is an account charge |
| No fee scope (4.8) | An account approved without the scope reads no fees, keeps before-fees margin and offers approving again |
| Team login (4.10) | An eBay account approved by a team login says "fees need the eBay account owner's approval" |
| Restricted company (4.9) | Fee reads go on and the screens stay readable |
| Another currency (6) | A fee in another currency is left out of every sum and counted |
| VAT (2.2) | A registered company's fee counts without VAT; an unregistered one's with it |
| Refunds (2.5) | A refund a week later counts on the order's day as its own part, with its fee credits once |
| Slots (1.4) | No module imports a Profit port; the product and account cards and the column come from Profit's slots |
| Switch-on (4.5) | Switching on reads 90 days and marks their cost "cost at switch-on"; off, no read runs and the cards draw nothing |
| Who sees (11) | Warehouse and Staff get no card, column or request; Accountant and a scoped Manager see the whole company's figures |
| No buyer field (4.1, 12) | A fee entry from eBay's simulator with a buyer name is stored without it |
