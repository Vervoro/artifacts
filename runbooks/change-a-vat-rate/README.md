# Runbook: Change a VAT rate

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-003](../../product-model/), rules in [SPEC 11](../../product-model/spec/#11-vat) |
| **Who runs it** | The operator, when a law changes a rate or sets a temporary one, as soon as the change is published and before the date it starts |
| **Role or credential** | The operator console with a fresh check. The rate table is platform data in control; no company's data is touched |

A rate is never edited in place: past lines keep the rate they used, and the table keeps every rate with its dates.

## Steps

1. Read the published change: the country, the class, the new rate and the date it starts, and its end date if it is temporary. Keep the link to it.
2. Close the current row for that country and class: set its last valid date to the day before the change.
3. Add the new row with the new rate and its first valid date. For a temporary rate, also add the row that returns to the old rate on the day after it ends.
4. Write the link to the published change as the reason. The console records who made the change and when.
5. Have Vervoro's owner check the rows against the published change before the start date.

## Verify

- For the country and class, the console shows exactly one rate for every date, with no gap and no overlap.
- A test order dated before the change shows the old rate, and one dated on or after it shows the new rate.
- The platform security log holds the change.

## If it stops halfway

The table refuses a gap or an overlap, so a half-done change is refused rather than saved. If the old row was closed but the new row is missing, add the new row before the start date; until then the console shows the gap as an alert. Never change a row whose dates have already passed: a mistake in a past rate is a matter for the seller's accountant and ADR-011's corrections, not this table.
