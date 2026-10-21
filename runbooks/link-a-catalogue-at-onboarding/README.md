# Runbook: Link a catalogue at onboarding

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-005](../../catalogue-sync/), rules in [SPEC 10–14](../../catalogue-sync/spec/#10-suggestions) |
| **Who runs it** | The seller's Owner, Admin or Manager, after connecting an account and before going live. The operator helps only on request, through an operator grant |
| **Role or credential** | Owner, Admin or Manager in the app ([ADR-010 SPEC 4](../../users-and-access/spec/#4-who-may-do-what)). An operator grant ([Open an operator grant](../open-an-operator-grant/)) only reads |

The account is in shadow, so nothing in these steps sends a figure to a marketplace. The aim is every listing that shares stock linked or answered, and the selling ones linked first.

## Steps

1. Wait for the first full read. The list's header shows its progress; a push says when it is done. Details for unlinked eBay Seller Hub listings may take longer behind the daily page cap; their rows say "details not yet read".
2. Work the list in its default order: listings with open orders first, then shared-stock listings, then what sold in the last 30 days.
3. Filter to strong suggestions and run bulk accept. Read the preview: products that gain more than one listing come first, then five random rows. Untick any row that looks wrong.
4. Go through the medium suggestions one at a time. Check units per sale and the figure change on each: a six-pack is units per sale 6, not 1. A row with a ratio of 3 or more either way usually means a wrong units per sale.
5. For a listing group sold in sizes or colours, use Link to family, and check each pair in its preview.
6. For listings with no product yet, use Make product, or Make N products for many, and check each draft. Use Not stock for a warranty or gift wrap.
7. Filter to "needed for going live" and answer every shared-stock listing: link it, or "separate stock, leave to the marketplace" if it really sells other stock.
8. Leave the rest to the marketplace. They are a count, not a blocker.
9. Go on to [Take a company live](../take-a-company-live/).

## Verify

- "Needed for going live" is empty, and the account shows no open conflict.
- The shadow check lists no confirmed link with a ratio of 3 or more that nobody has looked at.

## If it stops halfway

Every link and answer is saved as it is made, so the seller can stop and come back. A wrong bulk accept is undone from the batch: undo closes only the links still belonging to it and says how many it skipped.
