# Runbook: Check the anonymisation job

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-009](../../buyer-data/), rules in [SPEC 8](../../buyer-data/spec/#8-retention-and-anonymisation) |
| **Who runs it** | The operator, when the nightly check pages: some company holds orders past their due time that still hold buyer data |
| **Role or credential** | The operator console. The check and its counts need no grant; it shows order ids and due times, never buyer data |

Every hour an order stays overdue counts against Amazon's 30 days. Fix the cause the same day.

## Steps

1. Open the alert: the companies, the number of overdue orders per company, and the oldest due time.
2. Look at the sweeper for that cell: is it running, and is the `due` work for buyer anonymisation failing or waiting behind others?
3. **Failing:** read the error on the due row. A decrypt failure on a company mismatch is a possible breach: follow [Report a personal-data breach](../report-a-personal-data-breach/). Anything else, fix the cause and let the sweep retry.
4. **Never due:** an order with buyer data and no due row is a bug in the import. Run the repair that sets due times from each order's dates (delivery, dispatch, cancellation, connection end). It is a recorded command and needs no grant.
5. **Behind:** if the sweeper is only slow, raise its share for buyer anonymisation until the backlog clears.
6. Run the check again by hand.

## Verify

- The check returns 0 for every company, and the alert clears.
- If any order went past 30 days after delivery, it is recorded as an incident, with the count and how late.

## If it stops halfway

Anonymisation runs one transaction per company, so a stop leaves each company either done or untouched. Run the check again; it lists what is left.
