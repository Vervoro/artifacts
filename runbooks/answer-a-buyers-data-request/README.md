# Runbook: Answer a buyer's data request

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-009](../../buyer-data/), rules in [SPEC 10](../../buyer-data/spec/#10-buyers-requests) |
| **Who runs it** | The seller's Owner or Admin, when a buyer asks them to see, correct or erase their data. The operator watches due dates and steps in only when one is near |
| **Role or credential** | An Owner or Admin in the app, with a fresh check ([ADR-010 SPEC 5](../../users-and-access/spec/#5-rules-for-every-action)). The operator needs no grant to read due dates; reading the orders needs one |

A buyer never asks Vervoro. Erasures that arrive from a marketplace (an eBay account deletion matching a buyer) run by themselves and need nothing here.

## Steps

1. Open Privacy requests and choose the kind: access, correction or erasure.
2. Find the buyer's orders by their marketplace order ids, or by the exact phone number the buyer gave. Add every order the buyer names; the request stores order ids only.
3. **Erasure:** confirm. The orders are anonymised at once and their label files deleted. If an issued invoice names the buyer, the request records that it was kept and why; tell the buyer so.
4. **Access:** confirm. A file of the named orders' buyer data is ready within 7 days, through a link that expires after 24 hours. Download it and send it to the buyer through the marketplace's messages.
5. **Correction:** edit the field on the order. It is saved as set by a person, and a later marketplace read does not overwrite it.
6. Tell the buyer it is done, through the marketplace. The law gives the seller one month.

## Verify

- The request shows done, with its time.
- An erased order shows anonymised, with no name, address, phone or label.

## If it stops halfway

- An open request keeps its due date; the operator is alerted 2 days before it.
- Confirming an erasure again is safe: an anonymised order stays anonymised.
- An expired access link is made again from the request.
