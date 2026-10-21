# ADR-012 SPEC: Billing and plans

| | |
| --- | --- |
| **Decision** | [ADR-012: Billing and plans](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-012-billing-and-plans) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-012 from: the Billing module, always on, outside the core, needing Access ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

| Later part | Trigger | Rules |
| --- | --- | --- |
| The capped, lower-priority share of shared marketplace allowances for trial and restricted companies | Trials use over 25% of cell A's compute for 7 days ([ADR-001 SPEC 0](../../database-architecture/spec/#0-at-launch-and-later)) | [8](#8-what-runs-in-each-state) |
| Businesses outside the UK under the reverse charge, with the UK-use apportionment | Vervoro's accountant approves the apportionment; each country outside the UK and the EU after its rules are checked | [17](#17-vervoros-invoices-and-vat) |
| Contract plans with a billing path of their own | A later record, with the first enterprise contract ([ADR-001 SPEC 8](../../database-architecture/spec/#adding-a-dedicated-database)) | [2](#2-plans) |

## 1. Who does what

1. **Billing writes** the company's billing fields in control (section 21), the plan rows, its idempotency records, the provider's event ids and its notices. No other module writes them.
2. **Composition reads** the plan, the company's add-ons, its trial grant and its state from control on each request, cached like every control read ([ADR-000 SPEC 3](../../system-architecture/spec/#3-assembly-per-company)). A module the plan lacks is unavailable with the reason "not in your plan".
3. **Access stores the stock contact** as a company setting, and checks every billing action against the roles (section 19).
4. **Channels keeps each connection's stop choice** ([ADR-004 SPEC 11](../../channel-connectors/spec/#11-shadow-mode-and-launch-gates)) and refuses going live until section 6 holds, reading billing readiness through composition.
5. **Billing never calls Channels.** It publishes events: `company.restricted`, `company.closing_soon`, `company.closed`, `company.reopened`. Channels hears them: at closing it carries out each stop choice and sets decrease-only; at reopening it returns every account to shadow; for each notice it adds the block listing each connection's stop choice. Stock sync applies decrease-only ([ADR-008 SPEC 10](../../inventory-sync/spec/#10-listing-modes-and-stopping)).
6. **Erasure** is ADR-001's slice operation, run by the operations job ([Erase a company](../../runbooks/erase-a-company/)), after Channels disconnects every account.

## 2. Plans

1. **A plan row holds:** id and name; its modules (the foundation and the connectors are in every plan); the order ceiling; the support level (reply target and channels); one provider price id per billing interval. No amount is ever in the row or the code.
2. **Three tiers and add-ons.** Each tier includes the modules of the one below. The top tier differs from the middle one only by a higher ceiling and faster support. An add-on is one module sold on its own, and may need a minimum tier.
3. **Monthly or yearly,** in pounds sterling.
4. **Changing a row:** a change that adds something applies to everyone at once; one that takes something away applies to a paying company at its next renewal, after 30 days' notice.
5. **Contract plans** are agreed by the operator and invoiced by hand at the provider, with payment terms. No flag or billing path for them at launch.

## 3. What billing may refuse

This section owns [the rulebook's billing rule](../../rulebook/#7-money-and-countries).

1. **Nothing that moves orders or stock is ever refused for a billing reason,** in any state before erasure: importing, reserving, holding, picking, packing, dispatching, receiving, counting, and sending figures to live connections (decreases only once closed).
2. **The only refusal a plan makes** is switching on a module it does not include. The screen offers the plan that has it.
3. **Users, marketplace accounts and warehouses are never limited,** on any plan or in any state; restricted and closed narrow what each role may do (section 8), not how many there are.
4. **A refusal for billing** carries the reason "billing" and the date it began ([ADR-010 SPEC 5](../../users-and-access/spec/#5-rules-for-every-action)).

## 4. The order ceiling

1. **What counts:** an order dispatched from one of the seller's own warehouses, once, in the month of its first dispatch, however many parcels. Manual and business orders count.
2. **What never counts:** orders a marketplace ships from its own stock, orders cancelled before dispatch, replacements, returns.
3. **Counting** is one query a night per cell over the dispatch records the foundation already keeps. The sweeper upserts the full month-to-date count per company into control's usage rollups, so a rerun writes the same number. Nothing is added to the dispatch transaction. Archiving ([ADR-002](../../data-retention/)) does not touch the rollups.
4. **The measure** is the average of the last three complete calendar months, in the company's time zone.
5. **At 80 % and 100 %** of the ceiling, on the month-to-date count, the owners are told in the app. Nothing else changes.
6. **When the three-month average passes the ceiling** at a month's end, the owners are told the plan moves up a tier at the next renewal, with the date, at least 30 days ahead. If the average falls back first, the move is called off.
7. **Above the top tier's ceiling** the operator is alerted, to agree a contract plan. Nothing stops.
8. **The trial has no ceiling.**

## 5. The trial

1. **21 days from sign-up,** within ADR-001's range. The operator can extend a trial once, with a reason the owners see.
2. **It grants** the modules of the tier being tried, the middle tier unless the company chose another. It lives in a normal cell ([ADR-001 SPEC 8](../../database-architecture/spec/#trials)).
3. **No payment details to start.** They are asked for at going live (section 6), or at any time before the trial ends.
4. **Adding a payment method chooses a plan.** The subscription starts with the trial's end date and the first invoice is charged then, with no further step. Stripe's trial-ending email says so.
5. **One trial per company.** When a new company connects a marketplace account that was connected before, the operator is alerted. No trace of an erased company is kept to police trials.
6. **Demo companies** have no subscription.

## 6. Going live

1. **Before a connection first goes live,** in a trial or on a plan, the company has a payment method, the connection has a stop choice, and the company has a stock contact. Channels refuses going live until all three hold ([Take a company live](../../runbooks/take-a-company-live/)).
2. **The stop choice** is stored per connection and can be changed at any time in its settings.
3. **Shadow needs none of them.**

## 7. Company states

1. **Control keeps, per company:** when the trial ends, whether it has ever paid, when its oldest unpaid invoice first failed, whether a payment is processing, when its cancellation takes effect, when it closed, and any pause of its closing date.
2. **One pure function** of those dates and the current time returns the state. Composition reads it like the plan. The provider's own statuses are inputs, never the state.
3. **Jobs run only on a date that must act:** carrying out the stop choices at closing, and erasure. Nothing else moves a company.

| State | When | How it leaves |
| --- | --- | --- |
| **Trial** | From sign-up until the trial ends | Ends with a payment method: **active**, first charge made. Without one: **restricted** |
| **Active** | On a paid subscription; with an unpaid invoice, a banner and Stripe's emails | Day 14 after a payment first failed, unless one is processing: **restricted**. Cancellation takes effect: **closed** |
| **Restricted** | From day 14 after a payment first failed, or from the end of a trial with no payment method | Paid: **active** at once. Day 30 after the first failure, or 14 days after the trial ended: **closed** |
| **Closed** | From the closing date | Paid: **active**, reopened (section 10). 30 days after closing, with no payment processing: **erased** |

4. **A first charge that fails at a trial's end** follows the failed-payment days from the trial's end; the company is active with the banner.
5. **A processing payment** (a first Bacs debit takes up to 7 business days) holds off restriction, never closing. Erasure waits while one is processing.
6. **The operator can pause a closing date** once per company, however often it closes, by up to 14 days, with a reason the owners see: for a payment that cannot settle in time through no fault of the seller.
7. **Nothing moves between cells.** A company stays in its cell from sign-up to erasure ([ADR-001](../../database-architecture/spec/#trials)).

## 8. What runs in each state

1. **Trial and active** change nothing in [ADR-010's table](../../users-and-access/spec/#4-who-may-do-what).
2. **Restricted:** the stock path, billing pages and the export run. Catalogue edits and linking, new connections and going live, purchasing, settings, imports and every module that is neither warehouse nor stock are read-only. Inviting a Warehouse or Staff member, removing a person and ending sessions are still allowed.
3. **Closed:** every screen is read-only; sign-in, billing pages and the export run; orders import and reserve in the background under decrease-only (section 9).
4. *Later:* restricted companies get the capped share of shared marketplace allowances that ADR-001 gives trials, with the same exception for stock decreases on a live connection.

| Role | Restricted | Closed |
| --- | --- | --- |
| **Owner** | Pay, change the payment method, cancel; the stock path; change a stop choice; invite Warehouse or Staff; remove a person; export | Pay, change the payment method; switch a decrease-only connection to "send zero"; export; remove a person |
| **Admin** | The stock path; change a stop choice; invite Warehouse or Staff; remove a person below Admin; export | Switch a decrease-only connection to "send zero"; export; remove a person below Admin |
| **Manager** | The stock path ADR-010 gives a Manager; change a stop choice | Switch a decrease-only connection to "send zero"; read |
| **Warehouse** | Floor work, unchanged | Read |
| **Accountant** | Read, reports, export without buyer data, Vervoro's invoices | Read, export without buyer data, Vervoro's invoices |
| **Staff** | Read | Read |

"The stock path" is ADR-010's rows for stock and orders. Everything else is refused with section 3.4's reason.

## 9. Closing a company

1. **Nothing changes before the closing date.**
2. **On the closing date** each live connection carries out its stop choice. "Send zero" sends zero to every linked listing and waits until each is confirmed ([ADR-008 SPEC 10](../../inventory-sync/spec/#10-listing-modes-and-stopping)); "leave the figures" starts from the figures as they are. Then the connection is decrease-only.
3. **A connection with no stop choice** cannot have gone live under section 6; as a defence only, it is treated as "leave the figures".
4. **In decrease-only,** until erasure: notices and the completeness check go on, orders import and reserve, a sale on one marketplace still lowers the others, and no figure is ever raised, whatever raised the computed figure (a receipt, a return, a cancellation). An Owner, Admin or Manager can still switch a connection to "send zero".
5. **Orders shipped by hand while closed** come back as shipped outside Vervoro and deduct their reserved stock ([ADR-007 SPEC 17](../../order-ingestion/spec/#17-shipped-outside-vervoro)).
6. **At erasure** every connection is disconnected: notice subscriptions removed and credentials forgotten ([ADR-004 SPEC 12](../../channel-connectors/spec/#12-switching-on-and-off)). Every figure stays at its last value. A zero still unconfirmed alerts the operator and is named in the seller's last email.
7. **Vervoro never sends zero unasked.** No code path sends zero without a stored "send zero" choice.
8. **Orders imported after closing** stay in the company's data and its export, and their buyer data goes at erasure, within the 30 days [ADR-009](../../buyer-data/spec/#8-retention-and-anonymisation) allows after sending ends.

Procedure: [Close and reopen a company for non-payment](../../runbooks/close-and-reopen-a-company/).

## 10. Reopening a closed company

1. **Payment.** The Owner pays on the billing page. A subscription left unpaid pays its open invoice and carries on; a cancelled company, or a trial that never paid, starts a new subscription through Checkout. No second trial.
2. **Active at once.** The dates change in control, the plan is available on the next request, and the erasure date is cancelled.
3. **Every connection returns to shadow** from decrease-only, as after a reconnect ([ADR-008 SPEC 15](../../inventory-sync/spec/#15-recovery)). Nothing was disconnected, so no marketplace approval is needed again.
4. **The closed weeks are shown** per connection: what was sent (zeros, decreases), the orders imported and those shipped by hand, and what Vervoro could not see (goods received, listings edited on the marketplace).
5. **Goods received while closed** are received or counted ([ADR-006 SPEC 8–9](../../stock-ledger/spec/#8-receiving)) before going live.
6. **Going live again** follows ADR-008's listing check for a later account ([SPEC 14.3](../../inventory-sync/spec/#14-shadow-and-going-live)), confirmed per account by an Owner or Admin.
7. **A restricted company that pays** is active at once with its connections still live; there is nothing to catch up.
8. **After erasure** there is nothing to reopen. The seller signs up as a new company, with no trial.

## 11. Notices

1. **Stripe sends** its own payment emails: trial ending, payment failed, card expiring, and the notices Bacs rules require.
2. **Vervoro sends three,** because only Vervoro knows the stop choices:

| When | What it says |
| --- | --- |
| Entering restricted | What still runs; the closing date; each live connection's stop choice; how to pay |
| 7 days before closing | The same, with the choices still open |
| Closing | What each choice did; that no listing will rise again; a file of the last figure sent to each listing, ready to upload to the marketplace by hand; the export link; the erasure date; how to reopen |

3. **Who gets them:** every Owner, the billing contact and the stock contact, by email, with a banner for Owners and Admins. Dates are always named, never only a number of days.
4. **A bounced notice** puts the banner on every user and alerts the operator once.

## 12. Payment

| Need | How |
| --- | --- |
| A payment method | Stripe Checkout, a full page Vervoro redirects to. Bacs mandates are collected only there |
| Changing the method or billing details; reading invoices | Stripe's customer portal, from Vervoro's billing page, with plan switching and cancelling turned off |
| Plan changes and cancellation | Vervoro's own billing screen, which calls Stripe |
| Charging | Subscriptions, charged automatically; contract plans by invoice with payment terms |

1. **Card data never touches Vervoro.** Vervoro stores only what Stripe returns: ids, the card's brand, last four digits and expiry. No page of Vervoro embeds a payment form, so the SAQ A script criterion does not apply ([PCI SSC FAQ 1588](#22-constraints)).
2. **Bank details for Direct Debit** stay with Stripe.
3. **Bacs timing.** A payment confirms about 4 business days after submission, up to 7 with a new mandate. "Processing" is not "failed".
4. **A lost dispute,** card or Bacs, makes the amount owed again: a new invoice is issued and the failed-payment days start. After erasure it is written off and the operator alerted. A Bacs dispute has no time limit and cannot be contested.
5. **Mandate events** (cancelled by the bank, changed account) come from Stripe's events. A cancelled mandate with no other method asks the Owner for a new one before the next charge.

## 13. Calls to and events from Stripe

1. **Calls follow the egress pattern** ([ADR-000 SPEC 7](../../system-architecture/spec/#7-the-egress-gate)): the intent is recorded in control with an idempotency key and the call made after commit with that key, so a retry never charges twice.
2. **Verify before any read.** The `Stripe-Signature` header is checked with the endpoint's secret within Stripe's 5-minute tolerance; a failure is refused.
3. **Queue a minimal message** (event id, type, object id) and answer 2xx at once.
4. **The consumer** records the event id in control, so a second delivery does nothing, then fetches the object's current state from Stripe and sets the dates from it, because events arrive out of order.
5. **Before closing or erasing,** the dated job re-reads the company's subscription and invoices from Stripe, so a lost "payment succeeded" event never closes or erases a company that paid.
6. **A failed queue delivery** goes to the dead-letter queue, which alerts the operator ([Replay dead letters](../../runbooks/replay-dead-letters/)).

## 14. Plan changes

1. **Upgrade** (higher tier, an add-on, monthly to yearly): at once; the rest of the period charged at once, credited for the unused part already billed.
2. **Downgrade** (lower tier, removing an add-on): at the end of the period.
3. **No plan change while an invoice is unpaid.**
4. **A module that ends** is read-only from that day; its data stays visible and exportable until erasure, and taking it back restores everything. If ending it would stop sends to a live connection, the stop choice is shown and confirmed first.

## 15. Failed payments

1. **Retries:** cards by Stripe's Smart Retries in a 14-day window; Bacs payments that fail for lack of funds are retried by Stripe up to twice within 30 days.
2. **Days 0–14** active with a banner; **day 14** restricted unless a payment is processing; **day 30** closed.
3. **At day 14** the Stripe subscription is left unpaid, not cancelled, so its open invoice can still be paid and the subscription carries on.
4. **Paying the open invoice** before erasure makes the company active.

Procedure: [Work a failed payment](../../runbooks/work-a-failed-payment/).

## 16. Cancellation, export, erasure and refunds

1. **Cancelling** is the Owner's step on Vervoro's billing screen. It shows each live connection's stop choice for confirmation, then ends the subscription at the end of the paid period. Until then the company is active, and the cancellation can be taken back.
2. **Export** runs in every state until erasure: with buyer data only by an Owner or Admin ([ADR-009 SPEC 12](../../buyer-data/spec/#12-exports)), otherwise by the roles in [ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what) ([ADR-001 SPEC 10](../../database-architecture/spec/#export), buyer data per [ADR-009 SPEC 12](../../buyer-data/spec/#12-exports)).
3. **Erasure** runs 30 days after closing with ADR-001's slice operation. A seller may ask sooner; it then runs after a confirmation and once every stop choice has been carried out.
4. **Refunds.** Part periods are not refunded. A charge made by Vervoro's mistake is refunded or credited by credit note at Stripe. A Bacs refund is made only after the original payment settled, and the seller is told first, so their bank does not also pay them back under the Direct Debit Guarantee. Procedure: [Refund a seller](../../runbooks/refund-a-seller/).

## 17. Vervoro's invoices and VAT

1. **Stripe issues** every invoice and credit note in Vervoro's name, in one sequence for the whole account with one prefix, never reset or reused.
2. **Content:** what a UK VAT invoice must show: number, tax point and issue date, Vervoro's name, address and VAT number, the company's name and address (and VAT number where it has one), what was supplied, the rate and the amounts.
3. **Issued when Stripe finalises it,** within the 30 days HMRC allows; never edited after issue, corrected by a credit note and, where needed, a new invoice.
4. **At launch, UK businesses only,** charged UK VAT at the standard rate. Sign-up asks the company to declare it is a business; consumers are not accepted.
5. *Later:* **businesses outside the UK.** No UK VAT on the part used abroad; the customer accounts for it under the reverse charge, and the invoice says "reverse charge" with the customer's VAT number. Checkout is refused until that number is verified (VIES for EU customers), because Stripe's tax calculation applies the reverse charge to any well-formed number. Vervoro does not register in the EU. A company with any warehouse in the UK pays UK VAT on the UK share the accountant's apportionment sets (use and enjoyment).

## 18. Records kept

1. **Vervoro's billing records** (invoices, credit notes, payments, VAT evidence) are kept 6 years after the end of Vervoro's financial year, the statutory period [ADR-002](../../data-retention/) cites.
2. **They live in Stripe and in Vervoro's accounting software,** which holds a copy of each invoice and the digital VAT records. A yearly check confirms the two agree.
3. **They outlive the company.** The tombstone in control keeps the company id, Stripe's customer id and the invoice numbers; the billing contact's name and address stay only on the invoices.
4. **Stripe is not a buyer-data sub-processor;** Vervoro's privacy notice names it for the seller's own account data ([ADR-009 SPEC 2](../../buyer-data/spec/#2-roles-and-agreements)).

## 19. Who may manage billing

1. **The billing rows** of [ADR-010's table](../../users-and-access/spec/#4-who-may-do-what) are this record's: only the Owner chooses, changes or cancels the plan, changes the payment method or billing details and pays; Owners and Admins set the stop choice at going live and name the stock contact; Owners, Admins and Managers change a stored stop choice; Owners, Admins and Accountants read Vervoro's invoices.
2. **Every billing action** is written to `audit_log` with the person and time; the plan, payment and cancel steps need ADR-010's fresh check ([SPEC 5](../../users-and-access/spec/#5-rules-for-every-action)).
3. **The operator's two levers,** extending a trial and pausing a closing date, each need a recorded reason the owners see. Credits are made at Stripe as credit notes.

## 20. The payment simulator

1. **Stripe has a simulator** like every outside service ([ADR-000 SPEC 9](../../system-architecture/spec/#9-simulators)): calls, events, retries, disputes and Bacs timing.
2. **Before launch,** every call and event the design uses is checked against a recorded reply from Stripe's test mode, and the simulator fixed where it differs.

## 21. Storage

All in control, written by Billing ([ADR-001 SPEC 7](../../database-architecture/spec/#7-control-database-and-routing)).

| Data | Holds |
| --- | --- |
| Plans | Section 2's rows and the add-on catalogue |
| Company billing | Plan, add-ons, interval, Stripe customer and subscription ids, section 7.1's dates, billing contact |
| Payment method summary | Brand, last four digits, expiry; mandate status |
| Billing intents | Each call to Stripe with its idempotency key and outcome |
| Provider events | Event ids seen, for idempotency |
| Usage rollups | Month-to-date dispatched orders per company (control's existing table) |

## 22. Constraints

Checked against official sources on 18 October 2026.

| Constraint | What it means here | Source |
| --- | --- | --- |
| Bacs Direct Debit | UK accounts, sterling; confirmed in about 4 business days, up to 7 with a new mandate; mandates only through Checkout; Stripe sends the required notices; disputes have no time limit, cannot be contested, are final; refunds within 180 days; Bacs needs Stripe's approval and starts with limits | [Bacs Direct Debit](https://docs.stripe.com/payments/payment-methods/bacs-debit) |
| Retries | Smart Retries within a set window; Bacs retries up to 2 within 30 days; after the last try a subscription can be left unpaid | [Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries) |
| Proration | Charged at once with `always_invoice`; credits what was last billed | [Prorations](https://docs.stripe.com/billing/subscriptions/prorations) |
| Trials without a payment method | Allowed; an event and emails before the end | [Free trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials) |
| Events | Signed, 5-minute tolerance; answer 2xx first; duplicates; no order guarantee; retried up to three days | [Webhooks](https://docs.stripe.com/webhooks) |
| Idempotent requests | Every POST takes a key; kept at least 24 hours | [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) |
| Customer portal | Cancelling on by default, so it is turned off | [Configure the portal](https://docs.stripe.com/customer-management/configure-portal) |
| Invoice numbers | Account-level sequential numbering | [Customize invoices](https://docs.stripe.com/invoicing/customize) |
| VAT numbers | Reverse charge applied on any well-formed number whatever the check says | [Customer tax IDs](https://docs.stripe.com/billing/customer/tax-ids) |
| PCI DSS SAQ A | A redirect to the provider's page is outside the script criterion | [PCI SSC FAQ 1588](https://www.pcisecuritystandards.org/faqs/1588) |
| VAT invoices | Sequential number, tax point, supplier's VAT number; issued within 30 days | [VAT Notice 700, section 16](https://www.gov.uk/guidance/vat-guide-notice-700) |
| VAT records | At least 6 years; the VAT account kept digitally | [VAT Notice 700/21, 2.4 and 7](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021) |
| B2B place of supply (*Later*) | Supplied where the customer belongs; the VAT number is the best evidence | [VAT Notice 741A, section 6](https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a) |
| Reverse charge in the EU (*Later*) | The customer is liable; the invoice says "reverse charge" | [VAT Directive 2006/112/EC, articles 44, 196, 226](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0112) |
| Use and enjoyment (*Later*) | The part of an electronically supplied service used in the UK is taxable in the UK, apportioned | [VAT Notice 741A, section 13](https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a), [VATPOSS15500](https://www.gov.uk/hmrc-internal-manuals/vat-place-of-supply-services/vatposs15500), [VATPOSS13550](https://www.gov.uk/hmrc-internal-manuals/vat-place-of-supply-services/vatposs13550) |

## 23. Tests that prove each rule

| Test | Where | Proves |
| --- | --- | --- |
| State function | CI | A table of dates in, a state out, for every row of section 7, including a processing payment at day 14 and day 30 |
| Never refused | CI | In trial, active and restricted, orders import, reserve and dispatch and figures go; in closed, orders import and reserve; no billing state refuses a stock or order command |
| Roles by state | CI | In restricted and closed each role can do exactly what section 8 allows; everything else is refused with the reason |
| Going live | CI | Refused without a payment method, a stop choice or a stock contact; shadow needs none |
| Closing | CI, simulators | "Send zero" confirms zeros then goes decrease-only; "leave" and no choice go decrease-only; a sale lowers figures, a receipt, return or cancellation raises none; erasure disconnects; no path sends zero without a stored choice |
| Reopening | CI, simulators | Paying while closed makes the company active, cancels erasure, returns every account to shadow, sends nothing until the listing check |
| Before a dated step | CI | A dropped "payment succeeded" event never closes or erases a company that paid |
| Events | CI | Duplicated, late or out-of-order events leave control matching Stripe; a bad signature is refused before any read |
| Order count | CI, real Postgres | Repeated dispatches, second parcels and reruns count an order once |
| Idempotent calls | CI | A retried plan change with the same key charges once |
| Card data | Build check | No page takes a card number; payment pages are reached by redirect only |
| Recorded replies | Before launch | Every Stripe call and event used matches Stripe's test mode |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Module:** Billing's manifest says always on and needs Access only; it imports no other module.
- [ ] **One writer:** only Billing's code writes plan rows and company billing fields in control.
- [ ] **No price:** no amount in the plan rows, seeds or code; only provider price ids.
- [ ] **State:** one pure function of dates and now; no stored status column; no job that changes state.
- [ ] **Never refused:** stock and order commands have no billing check; the only plan refusal is in composition's module check.
- [ ] **Events, not calls:** closing and reopening reach Channels only through `company.closed` and `company.reopened`.
- [ ] **Decrease-only:** Stock sync's send path refuses a figure above B in that mode, in one place.
- [ ] **Zero:** the only path that sends zero reads a stored "send zero" choice.
- [ ] **Dated jobs:** closing and erasure re-read Stripe before acting, and erasure waits on a processing payment.
- [ ] **Events in:** the signature check runs before any database read; event ids are recorded; the consumer fetches current state.
- [ ] **Calls out:** every Stripe POST carries the recorded idempotency key.
- [ ] **Card data:** no card field in any page; Checkout and the portal are redirects; only brand, last four and expiry stored.
- [ ] **Portal:** its configuration turns off plan switching and cancelling.
- [ ] **Audit:** every billing action writes `audit_log`; plan, payment and cancel ask for the fresh check.
- [ ] **Later parts:** no reverse charge, no trial or restricted allowance cap, no contract-plan path at launch.
