# Runbook: Take a company live

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-008](../../inventory-sync/), rules in [SPEC 14](../../inventory-sync/spec/#14-shadow-and-going-live); shadow mode in [ADR-004](../../channel-connectors/spec/#11-shadow-mode-and-launch-gates) |
| **Who runs it** | The seller's Owner or Admin confirms; the operator watches a company's first go-live. A later account follows steps 4–7 only |
| **Role or credential** | Owner or Admin in the app. The operator console to watch the sends |

A company's first go-live is a move from an older system. Every account the old system syncs goes live in one step, so two systems never write the same listing.

## Steps

1. **When shadow starts,** import on hand from the old system. Shadow then imports orders and records what it would send.
2. **Before going live,** check that billing is ready (a payment method, the stop choice and a stock contact, [ADR-012 SPEC 6](../../billing-and-plans/spec/#6-going-live)), and that the account's share of every shared pool has room.
3. **Import on hand again** from the old system. Vervoro lists every product that fell by more than its imported orders explain. The seller ticks each one off: it usually shows an order type Vervoro does not see. This import sets on hand to the old system's figure as one adjustment per product.
4. Run one complete order read and read every linked listing. Every shared-stock listing must be answered first ([Link a catalogue at onboarding](../link-a-catalogue-at-onboarding/)).
5. Work through the listing check. Every listing showing more than Vervoro's figure will get the decrease. Listings showing less can be accepted in bulk; a ratio of 3 or more either way needs its own tap.
6. The seller turns off the old system's stock sync, and confirms it in Vervoro.
7. The seller confirms going live, with the totals shown: decreases now, raises after the next order read.

## Verify

- Each account's health shows "catching up", then "right" within one order read.
- No operator page for the company in the first hour; the send log shows the decreases confirmed.
- On-hand imports are now refused for the company.

## If it stops halfway

Before step 7, nothing has been sent: start again from step 3, because on hand must match the old system at the moment of going live. After step 7, every account is live. If the old system is found still syncing, use [Hold raises or pause an account](../hold-raises-or-pause-an-account/) on the affected accounts until it is off.
