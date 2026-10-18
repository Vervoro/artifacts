# ADR-012: Billing and plans

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026 |
| **Scope** | How Vervoro charges sellers: what a plan holds and limits, what happens at a limit, the trial, a company's states from sign-up to erasure, what each role may do in each, stopping sends when a company closes, reopening a closed company, the payment provider, cards and Direct Debit, plan changes, failed payments, Vervoro's own invoices and VAT, counting orders, cancellation, export and refunds, and who may manage billing. Not how sellers invoice their own buyers (ADR-011) |
| **Builds on** | [ADR-000: System architecture](../system-architecture/), [ADR-001: Multi-tenant database architecture](../database-architecture/), [ADR-002: Data retention and archiving](../data-retention/), [ADR-004: Channel connectors](../channel-connectors/), [ADR-008: Inventory sync](../inventory-sync/), [ADR-009: Buyer data and privacy](../buyer-data/), [ADR-010: Users, roles and sign-in](../users-and-access/) |

## Context

Vervoro charges each seller's company a subscription. Earlier records already decide parts of how:

- **ADR-000:** a module is available to a company only when its plan includes it. Stopping stock sends on a live connection always asks first: leave the figures as they are, or send zero.
- **ADR-001:** the control database holds each company's plan (trial or paid), status and subscription, the usage rollups and the alerts. A trial is a state, not a place: a trial company lives in a normal cell with capped shares of background work and marketplace allowances, and paying changes its plan with nothing moving. What happens when a trial lapses or a paying company closes, and when its data is erased, is left to this record. Trials last 14 to 28 days. One generated company-slice operation exports, moves and erases a company, and erasure releases the company's marketplace seller ids.
- **ADR-002:** the statutory period for accounting records is 6 years from the end of the financial year.
- **ADR-004:** some marketplace allowances belong to Vervoro's whole application, and trial companies get a capped, lower-priority share of them, except stock decreases on a live connection. An account's mode is shadow, live, paused or disconnected.
- **ADR-008:** every stop asks one question, leave the figure or send 0, and a restore or a reconnect returns an account to shadow.
- **ADR-009:** Vervoro is the controller of its own account data, billing included. When a connection ends, the buyer data of its orders goes within 30 days.
- **ADR-010:** six fixed roles (Owner, Admin, Manager, Warehouse, Accountant, Staff). Only the Owner manages the plan and billing and closes the company. What each role may still do when a trial ends unpaid or a payment fails is left to this record.

This record ties those pieces into one billing design. The design has to meet these requirements:

- **Billing must never oversell a seller.** A company that stops paying still has listings that buyers can order from. Whatever billing stops must leave the seller's figures safe, or be stopped in a way the seller chose.
- **One operator.** Retries, reminders, state changes and erasure run by themselves. No billing step waits for a person at a particular hour.
- **Sellers are UK businesses** that expect a proper VAT invoice and often pay suppliers by Direct Debit. A bill that changes without warning loses their trust.
- **Vervoro never holds card data,** so the payment pages are the provider's, not Vervoro's.
- **Small at launch.** 5 to 10 trial sellers, about 100 in the first year. Machinery for a scale or an abuse that does not exist yet is left out until it does.
- **The repository is public,** so this record describes the plan structure and never a price.

## Decision

1. **A plan is a row in the control database:** the modules it includes, a monthly ceiling on orders dispatched from the seller's own warehouses, a support level, and the provider's price ids. Prices live only at the payment provider.
2. **Users, marketplace accounts and warehouses are unlimited on every plan.** A limit there would push a seller to keep a channel's stock outside Vervoro, or to share logins.
3. **The order ceiling is soft.** It is measured on the average of the last three complete months. Crossing it warns, then moves the plan up at the next renewal with at least 30 days' notice. Nothing is charged as overage, and nothing is ever blocked by it.
4. **A plan may refuse only something new:** switching on a module the plan does not include. Nothing that moves orders or stock is ever refused for a billing reason.
5. **The trial lasts 21 days,** needs no payment details, and grants the modules of the tier the company is trying. One trial per company. The operator can extend one, with a recorded reason.
6. **Going live needs a payment method, a stop choice and a stock contact.** Before a connection first goes live, in a trial or on a plan, the Owner adds a payment method, answers "if Vervoro ever has to stop sending, leave the figures or send zero?", and names who should hear about stock if billing goes wrong. Shadow mode sends nothing, so it needs none of them.
7. **A company's state is computed from a few dates in the control database,** never stored: trial, active, restricted or closed. An erased company is only a tombstone. The provider's events set the dates; its own statuses are inputs, not the state.
8. **The stock path runs in trial, active and restricted:** orders are imported, reserved, held, picked, packed and dispatched, stock is received and counted, and figures go to live connections. Restricted makes everything else read-only.
9. **A failed payment restricts the company after 14 days and closes it after 30.** A trial that ends with no payment method is restricted at once and closed 14 days later. A payment still processing delays restriction, never closing.
10. **Closing makes every live connection decrease-only until erasure,** after carrying out its stop choice. "Send zero" first sends zero and waits for every zero to be confirmed. "Leave the figures", and a connection with no answer, starts from the figures as they are. From then on, orders keep coming in and reserving, figures only fall, and nothing is raised. At erasure every connection is disconnected and its figures stay where they are. Vervoro never sends zero unasked.
11. **A closed company keeps an export for 30 days, then it is erased** with the company-slice operation. Paying before erasure reopens it with its data whole. Its connections come back in shadow and go live again on the usual listing check, after the goods received while it was closed are recorded.
12. **Stripe is the payment provider,** with cards and Bacs Direct Debit. A payment method is entered only on Stripe's hosted pages, so Vervoro qualifies for the shortest PCI DSS self-assessment, SAQ A.
13. **Upgrades apply at once and are charged for the rest of the period. Downgrades apply at the end of the period.** Plan changes and cancellations go through Vervoro's own screens, because they may end a module or stop sends.
14. **Stripe retries failed payments for 14 days and sends the payment emails.** Vervoro sends only the three notices that carry the stop choice, to the owners, the billing contact and the stock contact.
15. **Vervoro's invoices are Stripe's invoices,** in one sequence for the whole account, never edited once issued, corrected only by credit notes, and kept for 6 years after the end of Vervoro's financial year.
16. **UK businesses only at launch, charged UK VAT.** Sign-up declares that the company is a business. Selling to businesses outside the UK, under the reverse charge, is switched on later after Vervoro's accountant confirms it.
17. **No charge is based on usage.** The order count for the ceiling is a nightly query over dispatch records.
18. **Cancelling ends the subscription at the end of the paid period.** Part periods are not refunded. Refunds and credits are only for Vervoro's mistakes.
19. **Only the Owner manages billing,** as ADR-010 says. Owners, Admins and Accountants can read Vervoro's invoices. Each role keeps its own work on the stock path while a company is restricted.
20. **The payment provider has a simulator,** like every other outside service. Every call and event is checked against a recorded reply from the provider's test mode before launch.

## Company states

<!-- DIAGRAM -->

**The state is computed, not stored.** Control keeps, per company: when the trial ends, whether it has ever paid, when its oldest unpaid invoice first failed, whether a payment is processing, when its cancellation takes effect, and when it closed. One function of those dates and the current time returns the state, and composition (ADR-000) reads it like the plan. There is no job that moves a company from state to state, so none can be missed or run twice. Jobs run only where something must happen on a date: carrying out the stop choices at closing, and erasure.

| State | When | What runs | How it leaves |
| --- | --- | --- | --- |
| **Trial** | From sign-up until the trial ends | Everything the trial grants. A connection can go live once decision 6 is met | Trial ends with a payment method: **active**, and the first charge is made. Without one: **restricted** |
| **Active** | On a paid subscription. With an unpaid invoice, a banner and the provider's emails, but nothing else changes | Everything the plan includes | 14 days after a payment first failed, unless one is processing: **restricted**. The cancellation takes effect: **closed** |
| **Restricted** | From day 14 after a payment first failed, or from the end of a trial with no payment method | The stock path, billing pages and the export. Everything else is read-only | The invoice is paid: **active** at once. Day 30 after the payment first failed, or 14 days after the trial ended: **closed** |
| **Closed** | From the closing date | Every live connection decrease-only (below): orders still import and reserve in the background. Sign-in, billing pages and the export. Every screen is read-only | Payment: **active**, reopened (below). 30 days after closing, with no payment processing: **erased** |

- **A first charge that fails at the end of a trial** follows the same days as any failed payment, counted from the trial's end. The company is active, with the banner, and its connections stay as they are.
- **A payment that is processing,** such as a first Bacs Direct Debit that takes up to 7 business days to confirm, holds off restriction. It never holds off closing, because day 30 leaves time for any Bacs retry to settle, and a payment that succeeds after closing reopens the company anyway.
- **Erasure waits** while any payment is processing, so a late success can still reopen the company.
- **Restricted, in detail.** Read-only: catalogue edits and linking, new connections and going live, purchasing, settings, imports, and the modules that are neither warehouse nor stock. Still allowed: everything on the stock path; inviting a Warehouse or Staff member, so a seller can still take on a picker; removing a person and ending sessions, which is security. The table below says what each role may do. A restricted company gets the capped, lower-priority share of shared marketplace allowances that ADR-001 gives trials, with the same exception for stock decreases on a live connection.
- **Nothing moves between states.** A company stays in its cell in every state, from sign-up to erasure (ADR-001). A state only changes what composition makes available and what the egress gate sends.
- **The operator can pause the closing date,** once per company, by up to 14 days, with a reason the owners see. It is for a payment that cannot settle in time through no fault of the seller, such as a provider outage or a disputed charge near day 30.

### What each role may do

The six roles are ADR-010's. Trial and active change nothing in ADR-010's table. Restricted and closed narrow it:

| Role | Restricted | Closed |
| --- | --- | --- |
| **Owner** | Pay, change the payment method, cancel; every action on the stock path; change a connection's stop choice; invite a Warehouse or Staff member; remove a person; export | Pay, change the payment method; switch a decrease-only connection to "send zero"; export; remove a person |
| **Admin** | Every action on the stock path; change a connection's stop choice; invite a Warehouse or Staff member; remove a person below Admin; export | Switch a decrease-only connection to "send zero"; export; remove a person below Admin |
| **Manager** | Every action on the stock path ADR-010 gives a Manager (holds, cancellations, counts, adjustments, approvals); change a connection's stop choice | Switch a decrease-only connection to "send zero"; read |
| **Warehouse** | Floor work, unchanged | Read |
| **Accountant** | Read, reports, export without buyer data, Vervoro's invoices | Read, export without buyer data, Vervoro's invoices |
| **Staff** | Read | Read |

"Every action on the stock path" is ADR-010's rows for stock and orders. Everything else in ADR-010's table is refused while restricted or closed, with the reason "billing" and the date it began.

## Stopping sends when a company closes

A closed company must stop sending in the end, because once it is erased its data, credentials and data key are gone and Vervoro can send nothing more (ADR-001). ADR-000 says stopping sends asks first. This record keeps that rule, asks the question early, and fills the gap between closing and erasure.

- **The question is asked at going live.** The answer is stored per connection and can be changed at any time in its settings. The notices say what the stored answer is, so in most cases the seller has answered long before money is owed.
- **Nothing changes until the closing date.** Until then the stock path still runs.
- **On the closing date every live connection becomes decrease-only,** a mode of its own beside shadow, live, paused and disconnected (ADR-004, ADR-008). "Send zero" first sends zero to every linked listing and waits for each to be confirmed, as ADR-008 requires before a mode changes. "Leave the figures" starts from the figures as they are.
- **Decrease-only, until erasure.** Order notices and the completeness read go on, orders are imported and reserve stock, and a figure may fall but is never raised, whatever raised the computed figure (a receipt, a return, a cancellation). A sale on one marketplace still lowers the others. Stock received in the warehouse is not sent, because nobody is working in Vervoro any more. An Owner, Admin or Manager can still switch a decrease-only connection to "send zero".
- **At erasure** every connection is disconnected: its notice subscriptions are removed and its credentials forgotten (ADR-004). Every figure stays at its last value, which is never higher than at closing. A zero still unconfirmed at erasure alerts the operator and is named in the seller's last email.
- **Orders the seller ships by hand while closed** come back from the marketplace as shipped outside Vervoro, which deducts their reserved stock (ADR-007). The stock record stays right through the closed weeks, apart from goods received.
- **No answer** cannot happen for a connection that went live under decision 6. As a defence only, a connection with no stored answer is treated as "leave the figures".
- **Vervoro never sends zero unasked.** Zero hides every listing of a seller who may only have missed an email. Decrease-only cannot oversell from a figure Vervoro sent, and it costs only the decreases, which ADR-001 and ADR-004 already put first.
- **Imported orders after closing** stay in the company's data, appear in its export, and are erased with it. Their buyer data goes at erasure, 30 days after the closing date, within the 30 days ADR-009 allows from the end of sending.

## Reopening a closed company

A closed company can pay at any time before it is erased. Its data is whole, because nothing is deleted before erasure, so reopening is a payment and a return to shadow, not a restore.

1. **Payment.** The Owner pays on the billing page. A company whose subscription was left unpaid pays its open invoice, and the subscription carries on from there. A company that cancelled, or a trial that never paid, starts a new subscription through Checkout. There is no second trial.
2. **Active at once.** Paying changes the dates in control, so composition makes the plan available on the next request. Nothing moves (ADR-001). The erasure date is cancelled.
3. **Every connection returns to shadow,** from decrease-only, as after a reconnect (ADR-008): what each marketplace shows is unknown until it is read, and nothing is sent until the account goes live again. Connections are still approved, because nothing is disconnected before erasure, so no one has to approve Vervoro on a marketplace again.
4. **The closed weeks are shown.** A screen lists, per connection, what was sent while closed (zeros, decreases) and the orders imported, with those shipped by hand. It also says what Vervoro could not see: goods received, and listings the seller edited by hand on the marketplace.
5. **Record what arrived.** Goods received while closed were never recorded. The seller receives or counts them (ADR-006) before going live, or the first figures would be too low. Too low is safe, but costs sales.
6. **Going live again** follows ADR-008's listing check for a later account: a complete order read, every listing read, a listing showing more than Vervoro's figure is never accepted as explained, and raises wait for the order read. An Owner or Admin confirms it per account, as for any go-live (ADR-010).

- **Restricted is simpler.** A restricted company that pays is active at once, with its connections still live: the stock path never stopped, so there is nothing to catch up.
- **Closing again** follows the same days. The operator's pause of a closing date stays once per company, however often it closes.
- **After erasure** there is nothing to reopen. The seller signs up again as a new company, without a trial, and connects its marketplace accounts afresh: erasure released their seller ids (ADR-001).

## Notices

Stripe sends the payment emails it already sends: the trial is ending, a payment failed, a card is about to expire, and the notices that Bacs rules require. Vervoro sends three notices of its own, because only Vervoro knows the stop choices.

| When | What it says |
| --- | --- |
| Entering restricted | What still runs; the closing date; each live connection's stored stop choice (or that it has none, and what happens then); how to pay |
| 7 days before closing | The same, with the choices still open |
| Closing | What each connection's choice did, and that no listing will rise again, so stock received must be put on the marketplaces by hand; a file with the last figure sent to each listing, in a form the seller can upload to the marketplace by hand; the export link; the erasure date; how to reopen before then |

- **Who gets them:** every owner, the billing contact and the stock contact, by email, with a banner for owners and admins in the app. Dates are always named, never only a number of days.
- **A notice that bounces** is an event. The banner then goes to every user, and the operator is alerted once. It is an alert, not a task with a deadline.

## Plans

A plan is a row in the control database. That row is the only place that says what a plan gives.

| A plan holds | Purpose |
| --- | --- |
| Id and name | What composition and the screens refer to |
| Modules | What composition makes available (ADR-000). The foundation and the connectors are in every plan |
| Order ceiling | Orders dispatched from the seller's own warehouses in a month, averaged over three months |
| Support level | The reply target and channels |
| Provider price ids | One per billing interval. The amounts are set at the provider, never in the row or the code |

- **Three tiers and add-ons.** Each tier includes the modules of the one below it. The top tier differs from the middle one only by a higher order ceiling and a faster support level. An add-on is one module sold on its own, and may need a minimum tier.
- **Monthly or yearly,** in pounds sterling.
- **Changing a plan's row.** A change that adds something applies to everyone at once. A change that takes something away applies to a paying company at its next renewal, after 30 days' notice.
- **Contract plans** (a dedicated database under ADR-001, or anything not in the catalogue) are agreed by the operator and invoiced by hand at the provider, with payment terms. At launch volumes a flag and a billing path for them are not worth building.
- **Composition reads the plan** from control, cached like every other control read, together with the company's add-ons, its trial grant and its state. A module the plan lacks is unavailable, with the reason "not in your plan", and the screen offers the plan that has it.

**Why users and connections are unlimited.** A limit on marketplace accounts would leave some channel outside Vervoro. That channel's sales would reserve nothing, and the seller's other channels would oversell. A limit on users would make staff share a login, and ADR-009 needs every view of buyer data logged against one person who signs in with a second factor. What grows Vervoro's cost with a seller is orders, so orders are what the tiers measure. Shared marketplace allowances are already capped and watched by ADR-004.

## The order ceiling

- **What counts:** an order dispatched from one of the seller's own warehouses, once, in the month of its first dispatch, however many parcels it needed. Manual and business orders count like marketplace orders.
- **What never counts:** orders a marketplace ships from its own stock, orders cancelled before dispatch, replacements, and returns.
- **Counting** is one query a night per cell: distinct orders with a first own-warehouse dispatch in the month, per company, read from the dispatch records the foundation already keeps. The cell's sweeper writes the full month-to-date count into control's usage rollups as an upsert, so a rerun writes the same number and nothing can count twice. Nothing is added to the dispatch transaction. Restores and moves carry the dispatch records, so the count follows the company. Control keeps the monthly rollups, so archiving (ADR-002) does not touch them.
- **The measure** is the average of the last three complete calendar months, in the company's time zone. One busy month alone never moves a plan.
- **At 80 % and 100 % of the ceiling,** on the month-to-date count, the owners are told in the app. Nothing else changes.
- **When the three-month average passes the ceiling** at a month's end, the owners are told that the plan will move up a tier at the next renewal, and the date, at least 30 days ahead. If the average falls back under before then, the move is called off.
- **Above the top tier's ceiling** the operator is alerted, to agree a contract plan. Nothing stops.
- **The trial has no ceiling.** Its share of shared allowances is already capped (ADR-001).

## The trial

- **21 days from sign-up,** within ADR-001's range. The operator can extend a trial once, with a reason, for a seller whose catalogue takes longer to link.
- **What it grants:** the modules of the tier the company is trying, the middle tier unless it chose another. It lives in a normal cell, with the capped shares of background work and shared allowances that ADR-001 sets.
- **No payment details to start.** Shadow mode sends nothing, so a trial costs little and risks nothing. Payment details are asked for when a connection is about to go live (decision 6), or at any time before the trial ends.
- **Adding a payment method chooses a plan.** The subscription starts with the trial's end date, and the first invoice is charged at the end without a further step. Stripe's trial-ending email says so beforehand.
- **One trial per company.** The control database's external directory already holds one marketplace account in one company only. When a new company connects an account that was connected before, the operator is alerted. No trace of an erased company is kept to police trials; at launch volumes the operator sees abuse.
- **Demo companies** have no subscription.

## Payment

**Stripe Billing,** with cards and Bacs Direct Debit.

| Need | How |
| --- | --- |
| A payment method | Stripe Checkout, as a full page Vervoro redirects to. Bacs mandates can only be collected there, and Stripe sends the mandate confirmation and advance notices that Bacs rules require |
| Changing the method and the billing details; reading invoices | Stripe's customer portal, reached from Vervoro's billing page. Its plan switching and cancelling are turned off |
| Plan changes and cancellation | Vervoro's own billing screen, which calls Stripe, because a change may end a module or stop sends |
| Charging | Subscriptions, charged automatically. Contract plans by invoice with payment terms |

**Why both cards and Direct Debit.** UK businesses commonly pay software by Direct Debit, and a mandate does not expire the way a card does. A card is instant and suits a seller who wants to start today. Stripe takes both in one subscription and one invoice sequence.

**What Bacs changes.** A payment is confirmed about 4 business days after it is submitted, or up to 7 with a new mandate. A bank may report a failure after Stripe showed success; it then arrives as a dispute. A Bacs dispute can be raised at any time, cannot be contested, and is final. So:

- **"Processing" is not "failed".** It holds off restriction, as above.
- **A lost dispute, card or Bacs,** makes the amount owed again. Vervoro issues a new invoice for it, and the failed-payment days start. After erasure there is no one to charge, so it is written off, and the operator is alerted.
- **Mandate events** (cancelled by the seller's bank, a changed account) are read from Stripe's events. A cancelled mandate with no other method asks the owner for a new one before the next charge.

**Card data never touches Vervoro.** Card numbers are entered only on Stripe's pages, reached by redirect. Vervoro stores only what Stripe returns: ids, the card's brand, its last four digits and its expiry. With every payment page outsourced by redirect, Vervoro is eligible for SAQ A. The SAQ A criterion about scripts on the merchant's page covers only payment forms embedded in it, and Vervoro has none. Bank details for Direct Debit are not card data, and they too stay with Stripe.

**Calls to Stripe follow the egress pattern.** The intent (create a subscription, change a plan) is recorded in control with an idempotency key, and the call is made after commit with that key, so a retry never charges twice. Stripe keeps a key for at least 24 hours, longer than any retry here.

### Events from Stripe

Stripe's events are handled like marketplace notices (ADR-004):

1. **Verify before any database read.** The `Stripe-Signature` header is checked with the endpoint's secret, within Stripe's default 5-minute tolerance. A request that fails is refused.
2. **Queue a minimal message:** the event id, its type and the object's id. Then answer at once with a 2xx, as Stripe asks.
3. **The consumer** records the event id in control, so a second delivery does nothing. It then **fetches the object's current state** from Stripe and sets the company's dates from it, because Stripe does not deliver events in order.
4. **Before any date-driven step,** the job that carries out the stop choices and the erasure job re-read the company's subscription and invoices from Stripe. A lost "payment succeeded" event can then never close or erase a company that paid.
5. **Stripe retries an unanswered event for up to three days.** A failed queue delivery goes to the dead-letter queue, which alerts the operator (ADR-000).

### Plan changes

- **Upgrade** (a higher tier, an add-on, monthly to yearly): applies at once. The rest of the period is charged at once, credited for the unused part of what was already billed.
- **Downgrade** (a lower tier, removing an add-on): applies at the end of the period. A module it ends follows the module-ending rule below.
- **No plan change while an invoice is unpaid.** Paying it comes first, so no credit is given for time that was never paid.
- **A module that ends** becomes read-only on the day it ends. Its data stays visible and exportable until the company is erased, and taking the module back restores everything. If ending it would stop sends to a live connection, the connection's stop choice is shown and confirmed first.

### Failed payments

- **Retries:** cards by Stripe's Smart Retries, set to a 14-day window. Bacs payments that fail for lack of funds are retried by Stripe up to twice, within 30 days of the first try.
- **Days 0 to 14:** the company is active, with a banner and Stripe's emails.
- **Day 14:** restricted, unless a payment is processing. Stripe's subscription is left unpaid, not cancelled, so its open invoice can still be paid and the subscription carries on.
- **Day 30:** closed.
- **Paying the open invoice** at any point before erasure makes the company active again.

## Vervoro's invoices and VAT

**Invoices.** Stripe issues every invoice and credit note in Vervoro's name.

- **Numbering:** one sequence for the whole Stripe account, with one prefix, as UK and EU rules expect. A number is never reset or reused.
- **Content:** each invoice carries what a UK VAT invoice must show: its number, the tax point and the issue date, Vervoro's name, address and VAT number, the company's name and address (and VAT number where it has one), what was supplied, the VAT rate and the amounts.
- **Issued at once** when Stripe finalises it, well within the 30 days HMRC allows.
- **Never edited after it is issued.** A mistake is corrected with a credit note and, where needed, a new invoice.

**VAT on Vervoro's charges.** Vervoro is a UK business selling software to businesses.

- **At launch, UK businesses only,** charged UK VAT at the standard rate, with or without a VAT number of their own. Sign-up asks the company to declare that it is a business, and the customer terms are for businesses only.
- **Businesses outside the UK, when switched on:** a service to a business is supplied where the customer belongs, so no UK VAT, and the customer accounts for VAT under the reverse charge. The invoice says "reverse charge" and shows the customer's VAT number. The evidence is that VAT number, checked against the EU's register (VIES) for EU customers, or the customer's registration elsewhere. Checkout is refused until the number is verified, because Stripe's tax calculation would apply the reverse charge to any number of the right shape.
  - **No registration in the EU.** For an EU business customer the place of supply is its own country and the customer is liable for the VAT, so Vervoro does not register there. A country outside the UK and the EU is switched on only after its own rules are checked.
  - **Use in the UK brings UK VAT back.** Vervoro is an electronically supplied service. HMRC's use and enjoyment rule makes such a service to a business taxable in the UK for the part used in the UK, even when the customer belongs abroad. A business abroad that runs a UK warehouse through Vervoro uses it in the UK. So sign-up asks where the company's warehouses are: all outside the UK, the reverse charge; any in the UK, UK VAT on the share the accountant's apportionment sets.
  - This is built when the setting is switched on, after Vervoro's accountant approves the apportionment.
- **Consumers are not accepted.**

**Keeping the records.** Vervoro's billing records (invoices, credit notes, payments, VAT evidence) are kept for 6 years after the end of Vervoro's financial year in which they were made, the statutory period ADR-002 cites.

- **Where:** in Stripe, and in Vervoro's accounting software, which holds a copy of each invoice and the digital VAT records. A yearly check confirms the two agree.
- **They outlive the company.** Erasing a company (ADR-001) removes its cell data. Its tombstone in control keeps the company id, Stripe's customer id and the invoice numbers. The billing contact's name and address stay only on the invoices, which the law requires Vervoro to keep.
- **Stripe is not a buyer-data sub-processor.** It handles no buyer data, so it is not on ADR-009's list. Vervoro's privacy notice names it for the seller's own account data.

## Cancellation, export and refunds

- **Cancelling** is the owner's step on Vervoro's billing screen. It shows each live connection's stop choice for confirmation, then ends the subscription at the end of the paid period. Until then the company is active, and the cancellation can be taken back.
- **Export** is available in every state until erasure: the company export of ADR-001 and ADR-009, with buyer data only for orders that still hold it, made only by an owner or admin.
- **Erasure** runs 30 days after closing, with ADR-001's slice operation, and its erase ledger proves it. A seller may ask for it sooner. It then runs after a confirmation, and once every connection's stop choice has been carried out.
- **Refunds.** Part periods are not refunded on cancellation or downgrade. A charge made by Vervoro's mistake (a double charge, a wrong plan) is refunded or credited by credit note. A Bacs refund is made only after the original payment has settled, and the seller is told first, so that their bank does not also pay them back under the Direct Debit guarantee.

## Who may manage billing

These rows join ADR-010's table of who may do what, with its six roles:

| Action | Owner | Admin | Manager | Warehouse | Accountant | Staff |
| --- | --- | --- | --- | --- | --- | --- |
| Choose, change or cancel the plan; add or change the payment method; change billing details; pay an open invoice | Yes | No | No | No | No | No |
| Set a connection's stop choice when it goes live; name the stock contact | Yes | Yes | No | No | No | No |
| Change a connection's stored stop choice | Yes | Yes | Yes | No | No | No |
| See the plan, the state, the order count and the next charge | Yes | Yes | No | No | No | No |
| Read and download Vervoro's invoices and credit notes | Yes | Yes | No | No | Yes | No |

Changing a stop choice follows ADR-010's row for stopping sends (Owner, Admin, Manager). Setting it at going live follows its row for going live (Owner, Admin). Every billing action is written to `audit_log` with the person and the time, and the plan, payment and cancel steps need ADR-010's fresh check. The operator's two levers, extending a trial and pausing a closing date, each need a recorded reason that the company's owners see. Credits are made at Stripe, as a credit note.

## How this is proven

| Test | Where | Proves |
| --- | --- | --- |
| State function | CI | A table of dates in, a state out, for every row of the state table, including a processing payment at day 14 and at day 30 |
| Stock path by state | CI | In trial, active and restricted, orders import, reserve and dispatch, and figures go to live connections. In restricted, every other write is refused with the reason, except a warehouse invite and removing a user |
| Closing | CI, simulators | "Send zero" sends and confirms zeros, then goes decrease-only; "leave" and no answer go decrease-only; in decrease-only a sale lowers figures and a receipt, a return or a cancellation raises none; at erasure every connection is disconnected; no code path sends zero without a stored choice |
| Reopening | CI, simulators | Paying while closed makes the company active, cancels its erasure, and returns every connection to shadow with nothing sent until it goes live again on the listing check; no marketplace approval is needed again |
| Roles by state | CI | In restricted and closed, each role can do exactly what the roles table allows, and every other action is refused with the reason |
| Before a dated step | CI | A dropped "payment succeeded" event never closes or erases a company that paid |
| Events | CI | A duplicated, late or out-of-order event leaves control matching Stripe; a bad signature is refused before any read |
| Order count | CI, real Postgres | Repeated dispatches, second parcels and reruns count an order once |
| Idempotent calls | CI | A retried plan change with the same key charges once |
| Card data | Build check | No page of Vervoro takes a card number; payment pages are reached by redirect only |
| Recorded replies | Before launch | Every Stripe call and event the design uses is checked against Stripe's test mode, and the simulator is fixed where it differs |

## Constraints

Checked against official sources on 18 October 2026.

| Constraint | What it means here | Source |
| --- | --- | --- |
| Bacs Direct Debit | UK bank accounts, sterling; recurring payments with Billing; confirmed in about 4 business days, up to 7 with a new mandate; mandates collected only through Checkout; Stripe sends the required notices; disputes have no time limit, cannot be contested and are final; refunds within 180 days; new accounts start with transaction and weekly limits, and Bacs needs Stripe's approval | [Bacs Direct Debit](https://docs.stripe.com/payments/payment-methods/bacs-debit) |
| Retries | Smart Retries choose times within a set window (8 tries in 2 weeks recommended); Bacs retries for lack of funds, up to 2 within 30 days; after the last try a subscription can be cancelled, left unpaid or left past due | [Automate payment retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries) |
| Proration | Proration items are created by default; `always_invoice` charges at once; `none` turns it off per request; flexible billing mode credits what was last billed | [Prorations](https://docs.stripe.com/billing/subscriptions/prorations) |
| Trials without a payment method | Allowed; at the trial's end a subscription with no method can be cancelled, paused or invoiced; an event and emails before the end | [Free trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials) |
| Events | Signed in `Stripe-Signature`, 5-minute default tolerance; answer 2xx before any slow work; duplicates happen; order is not guaranteed; retried for up to three days | [Webhooks](https://docs.stripe.com/webhooks) |
| Idempotent requests | Every POST takes an `Idempotency-Key`; keys may be pruned after 24 hours | [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) |
| Customer portal | Plan switching off by default; cancelling on by default, so it is turned off | [Configure the portal](https://docs.stripe.com/customer-management/configure-portal) |
| Invoice numbers | Account-level sequential numbering, the usual requirement in the UK and EU | [Customize invoices](https://docs.stripe.com/invoicing/customize) |
| VAT numbers | EU numbers checked against VIES, UK numbers against HMRC; Stripe's tax calculation applies the reverse charge on a well-formed number whatever the check says | [Customer tax IDs](https://docs.stripe.com/billing/customer/tax-ids) |
| PCI DSS SAQ A | A merchant whose customers are redirected to the provider's payment page is outside the script criterion, which covers embedded payment forms only | [PCI SSC FAQ 1588](https://www.pcisecuritystandards.org/faqs/1588) |
| B2B place of supply | Services to a business are supplied where the customer belongs; an EU customer's VAT number is the best evidence that it is in business | [VAT Notice 741A, section 6](https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a) |
| VAT invoices | A sequential number that uniquely identifies the document, the tax point, the supplier's VAT number and the rest; normally issued within 30 days of the tax point | [VAT Notice 700, section 16](https://www.gov.uk/guidance/vat-guide-notice-700) |
| VAT records | Kept for at least 6 years; the VAT account kept digitally | [VAT Notice 700/21, sections 2.4 and 7](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021) |
| Reverse charge in the EU | A service to a business is supplied where the business is established; the customer is liable for the VAT when the supplier is not established in that country; the invoice must say "reverse charge" | [VAT Directive 2006/112/EC, articles 44, 196 and 226](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0112) |
| Use and enjoyment | For electronically supplied services to a business, the place of supply moves to where the service is effectively used and enjoyed; the part used in the UK is taxable in the UK, apportioned | [VAT Notice 741A, section 13](https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a), [VATPOSS15500](https://www.gov.uk/hmrc-internal-manuals/vat-place-of-supply-services/vatposs15500) |
| Electronically supplied services | Include website hosting, online data warehousing and access to software and its updates | [VATPOSS13550](https://www.gov.uk/hmrc-internal-manuals/vat-place-of-supply-services/vatposs13550) |

## Changes to earlier records

This record amends five published records, in the same publication.

- **ADR-000, "Talking to marketplaces":** after "Stopping sends on a live connection always asks first: leave the figures as they are, or send zero." add: "The question is first asked when the connection goes live, and the answer is kept. When a company closes for non-payment, its answer is carried out, and the connection then only lowers its figures until the company is erased ([ADR-012](../billing-and-plans/))."
- **ADR-001, "Trials":** "decided with billing and plans" becomes "decided in [ADR-012](../billing-and-plans/): it is erased 30 days after the company closes".
- **ADR-004, "Shadow and live at the egress gate":** after "Stopping a live account always asks first: leave the figures as they are, or send zero and wait until every zero is confirmed." add: "The answer is first asked when the account goes live, and kept. A company that closes for non-payment carries it out on its closing date, and its accounts are then decrease-only until the company is erased, when they are disconnected ([ADR-012](../billing-and-plans/))."
- **ADR-004, "Switching a marketplace on and off", the Account row:** "shadow, live, paused or disconnected" becomes "shadow, live, paused, decrease-only (a closed company, [ADR-012](../billing-and-plans/)) or disconnected".
- **ADR-008, "Inventory sync":**
  - Decision 9 adds: "A company that closes for non-payment carries out each account's answer on its closing date, and its accounts are then decrease-only until it is erased ([ADR-012](../billing-and-plans/))."
  - "Listing modes and stopping" adds: "**Decrease-only** is an account mode for a company closed under ADR-012, from its closing date until its erasure. Orders still import and reserve, and D is worked out as usual, but a figure is sent only when it is lower than B. A higher D is never sent, whatever raised it: a receipt, a return, a cancellation or a policy change. Rows of the sending table that would send a higher D send nothing."
  - "Recovery" adds a row: "**A closed company reopens** (ADR-012) | Every account returns to shadow and every B is unknown. Goods received while it was closed are recorded first; each account goes live again on the listing check, like a later account."
  - "Rules, each with a test" adds: "13. An account in decrease-only mode never sends a figure above B; a sale on one account still lowers the others."
- **ADR-010, "What later records decide":** the bullet for this record becomes "**Billing and plans ([ADR-012](../billing-and-plans/)):** decided there: what each role may do while a company is restricted or closed, and the billing rows of the table of who may do what."

## Consequences

**What this gives us**

- No billing rule can oversell a seller. The stock path runs until closing, and after closing a figure only falls, until the data is gone.
- A seller who closes and comes back within 30 days loses nothing: same data, same approvals, back in shadow, live again after one listing check.
- Most sellers answer the stop question when they go live, long before any payment fails.
- A seller's bill changes only at a renewal they were warned about, never by overage.
- The operator does nothing on a schedule. State is a function of dates, Stripe runs the retries and the payment emails, and the dated steps re-read Stripe first.
- No card data reaches Vervoro, which keeps PCI DSS to its shortest form.
- Plans are rows, so a new tier or add-on is a row and a price at the provider, not a code change.

**What it costs**

- A closed company still imports orders and sends decreases for 30 days without paying. It is a small cost, on the capped share.
- At erasure the figures are left where they are. A seller who ignored every notice and keeps trading by hand can still oversell after that; the last notice gives them the file of figures to take over.
- Bacs disputes can arrive at any time and cannot be contested, so a paid invoice is never quite final.
- Unlimited users and connections mean a large seller pays by orders only; the top tier and contract plans carry that.
- Vervoro depends on one payment provider for charging, invoices and its emails. Changing provider later means moving every mandate.
- Sellers outside the UK wait for the accountant's apportionment, and a business abroad with a UK warehouse still pays UK VAT on the UK share.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Charge overage per order above the ceiling | An unpredictable bill for a small business, and the count would have to be invoice-grade, with disputes to answer |
| Stop importing orders at the ceiling | Orders the marketplace already sold would reserve nothing, and other channels would oversell |
| Limit marketplace accounts or users per plan, refusing only new ones | A channel left outside Vervoro oversells the others; a user limit invites shared logins that break per-person logging |
| One busy month moves the plan, or the latest month when it is far over | Punishes a seasonal peak; the operator already sees a fast-growing seller |
| Card details at sign-up | Asks for money before Vervoro has sent anything; going live is when cost and risk begin |
| Disconnect at closing and leave the figures | The figures freeze while the seller may keep selling; decrease-only until erasure removes that risk for 30 days at little cost |
| Send zero when nobody answers | Hides every listing of a seller who may only have missed an email |
| Keep syncing in full until the company answers | It may never answer; the data could never be erased |
| A third stop choice: one last figure capped at what is available | Decrease-only does the same job without changing the two-choice rule |
| A stored state with jobs that move it | A missed or doubled job leaves a company in the wrong state; dates and one function cannot drift |
| A daily reconciliation with Stripe | Re-reading Stripe before each dated step protects the same moments with no extra job |
| A usage table written in the dispatch transaction | Adds a write to the stock path for a soft limit; a nightly query over dispatch records gives the same count |
| Versioned plan rows | At launch volumes, a 30-day notice for anything taken away does the same job |
| A trial extension that switches on by itself after the catalogue import | One more rule, notice and test; the operator extends the few trials that need it |
| A keyed hash of every trial's marketplace accounts, kept after erasure | Keeps a trace of an erased company; at launch volumes the operator sees abuse |
| Longer closing for companies that have paid before | Restricted keeps the stock path running and closing only lowers figures, so 30 days hurts no one |
| A paid pause for seasonal sellers | A new state and a price for a need not yet seen; a later record can add it |
| A merchant of record that sells in its own name and handles VAT | Does not take Bacs Direct Debit, and the seller's invoice would come from another company |
| A Direct Debit-only provider | No cards, so a second provider and a second invoice sequence for sellers who want to start at once |
| Payment fields embedded in Vervoro's pages | Brings scripts on Vervoro's page into PCI scope; Checkout by redirect keeps it out |
| Let the provider's portal change plans and cancel | Would end modules and stop sends without the stop choice |
| Vervoro numbering and rendering its own invoices | A second sequence to keep gapless and a document to keep compliant; the provider does both |

## What later records decide

- **ADR-011: Invoicing and VAT** (in draft): the seller's own invoices to their buyers, which this record does not cover.
- **Prices, tier names and which modules sit in which tier:** the owner's, set in the plan rows and at the provider, and never published here.
- **Contract plans** (a later record): dedicated databases, residency outside the EU and their terms.
- **Selling outside the UK:** switching it on after the accountant approves how a customer's use is split between the UK and abroad, and each country outside the UK and the EU after its own rules are checked.
