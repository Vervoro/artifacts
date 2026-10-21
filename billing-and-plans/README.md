# ADR-012: Billing and plans

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 18 October 2026; split into ADR, SPEC and RUNBOOK with Billing as an always-on module outside the core, 21 October 2026 |
| **Scope** | The Billing module and how Vervoro charges sellers: what a plan holds and limits, the trial, a company's states from sign-up to erasure, what runs in each, closing and reopening a company, the payment provider, plan changes, failed payments, Vervoro's own invoices and VAT, cancellation and refunds. Not how sellers invoice their own buyers ([ADR-011](../invoicing-and-vat/)) |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/), [ADR-002](../data-retention/), [ADR-004](../channel-connectors/), [ADR-008](../inventory-sync/), [ADR-009](../buyer-data/), [ADR-010](../users-and-access/) |
| **SPEC** | [The rules to build from, the evidence and how to check them](spec/) |
| **RUNBOOK** | [The procedures for this record](../runbooks/#adr-012-billing-and-plans) |

## Context

- **Billing must never oversell a seller.** A company that stops paying still has listings buyers can order from. Whatever billing stops must leave the seller's figures safe, or be stopped the way the seller chose.
- **One operator.** Retries, reminders, state changes and erasure run by themselves; no billing step waits for a person at a particular hour.
- **Sellers are UK businesses.** They expect a proper VAT invoice, often pay software by Direct Debit, and lose trust in a bill that changes without warning.
- **Small at launch:** 5 to 10 trial sellers, about 100 in the first year. Machinery for a scale or an abuse that does not exist yet waits until it does.
- **The repository is public,** so this record describes the plan structure and never a price.

## Decision

1. **Billing is an always-on module outside the core,** and it needs Access ([ADR-000 module map](../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). It writes the company's billing dates and the payment provider's ids, and sends its own notices. Plans and their quotas live in the control database ([ADR-001](../database-architecture/spec/#7-control-database-and-routing)). A **plan** is a row there: the modules it includes, a monthly ceiling on orders, a support level and the provider's price ids. Prices live only at the provider.
2. **Users, marketplace accounts and warehouses are unlimited on every plan.** A limit there would push a seller to keep a channel's stock outside Vervoro, or to share logins. What a plan measures is orders dispatched from the seller's own warehouses, on the average of the last three complete months. The ceiling is soft: crossing it warns, then moves the plan up at the next renewal after at least 30 days' notice. Nothing is charged as overage.
3. **Nothing that moves orders or stock is ever refused for a billing reason.** A plan may refuse only something new: switching on a module it does not include. This rule is owned here ([SPEC 3](spec/#3-what-billing-may-refuse)).
4. **The trial lasts 21 days and needs no payment details.** One per company. **Going live needs a payment method, a stop choice and a stock contact:** before a connection first goes live, in a trial or on a plan, the Owner adds a payment method, answers "if Vervoro ever has to stop sending, leave the figures or send zero?" (the **stop choice**), and names who should hear about stock if billing goes wrong. Shadow mode sends nothing, so it needs none of them.
5. **A company's state is computed from a few dates, never stored:** trial, active, restricted or closed. An erased company is only a tombstone. The provider's events set the dates. No job moves a company between states, so none can be missed or run twice.
6. **The stock path runs in trial, active and restricted.** A failed payment restricts the company after 14 days and closes it after 30; a trial that ends with no payment method is restricted at once and closed 14 days later. **Restricted** makes everything off the stock path read-only. A payment still processing delays restriction, never closing.
7. **Closing carries out each connection's stop choice, then makes it decrease-only until erasure.** **Decrease-only** is an account mode in which orders still import and reserve, and a figure may fall but is never raised ([ADR-008](../inventory-sync/spec/#10-listing-modes-and-stopping)). Vervoro never sends zero unasked. A closed company keeps an export for 30 days, then is erased; at erasure every connection is disconnected and its figures stay where they are. **Paying before erasure reopens the company** with its data whole, and its accounts return to shadow.
8. **Card data never touches Vervoro.** Stripe is the payment provider, with cards and Bacs Direct Debit. Checkout is by redirect to Stripe's own pages, so Vervoro is eligible for SAQ A, the shortest PCI DSS self-assessment. Bank details for Direct Debit stay with Stripe.
9. **Upgrades apply at once, downgrades and cancellations at the end of the paid period,** and go through Vervoro's own screens, because they may end a module or stop sends. Part periods are not refunded; refunds and credits are only for Vervoro's mistakes.
10. **Vervoro's invoices are Stripe's,** in one sequence, never edited once issued, corrected only by credit notes, and kept 6 years after the end of Vervoro's financial year. UK businesses only at launch, charged UK VAT. *Later: businesses outside the UK under the reverse charge, when Vervoro's accountant approves the split of UK use.*

## Company states

<!-- DIAGRAM -->

Who may do what in each state, the closing and reopening steps, and the three notices that carry the stop choice are in the [SPEC](spec/#7-company-states). Who may manage billing joins [ADR-010's table](../users-and-access/spec/#4-who-may-do-what): only the Owner pays, changes the plan or cancels.

## Consequences

**Gives**

- No billing rule can oversell a seller: the stock path runs until closing, and after closing a figure only falls.
- A seller who comes back within 30 days of closing loses nothing: same data, same marketplace approvals, live again after one listing check.
- A seller's bill changes only at a renewal they were warned about, never by overage.
- The operator does nothing on a schedule: state is a function of dates, Stripe runs the retries and payment emails, and dated steps re-read Stripe first.
- Plans are rows, so a new tier or add-on is a row and a price at the provider, not a code change.

**Costs**

- A closed company still imports orders and sends decreases for 30 days without paying.
- At erasure the figures are left where they are; a seller who ignored every notice and keeps trading by hand can still oversell after that.
- Bacs disputes can arrive at any time and cannot be contested, so a paid invoice is never quite final.
- Unlimited users and connections mean a large seller pays by orders only; the top tier and contract plans carry that.
- One provider for charging, invoices and payment emails; changing it later means moving every mandate.

## Alternatives rejected

- **Overage per order above the ceiling:** an unpredictable bill, and the count would have to be invoice-grade.
- **Stop importing orders at the ceiling:** sold orders would reserve nothing, and other channels would oversell.
- **Limit accounts or users per plan:** a channel outside Vervoro oversells the others; a user limit invites shared logins.
- **Card details at sign-up:** asks for money before Vervoro has sent anything; going live is when cost and risk begin.
- **Disconnect at closing:** the figures freeze while the seller may keep selling; decrease-only removes that risk for 30 days.
- **Send zero when nobody answers:** hides every listing of a seller who may only have missed an email.
- **A stored state moved by jobs:** a missed or doubled job leaves a company in the wrong state.
- **A merchant of record:** takes no Bacs Direct Debit, and the seller's invoice would come from another company.
- **Payment fields embedded in Vervoro's pages:** brings Vervoro's scripts into PCI scope.
- **Vervoro numbering its own invoices:** a second sequence to keep gapless; the provider does it.

## Open items

- **Tax on Vervoro's own invoices to sellers.** Selling to businesses outside the UK waits for Vervoro's accountant to approve how a customer's UK use is apportioned, and each country outside the UK and the EU waits for its own rules to be checked. Confirm with the accountant before launch that UK VAT at the standard rate on every launch invoice is right.
- **The payment provider's terms.** Bacs Direct Debit needs Stripe's approval, and a new account starts with transaction and weekly limits; both are checked on Vervoro's account before the first seller pays.
- **The customer terms** must allow decrease-only after closing and the 30-day erasure; they need writing and legal review before launch.
- **Prices, tier names and which modules sit in which tier** are the owner's, set in the plan rows and at the provider, and never published.
- **Contract plans** (a dedicated database, residency outside the EU) wait for a later record.
- **Stripe's and HMRC's rules** were checked on 18 October 2026; recheck them before launch.
