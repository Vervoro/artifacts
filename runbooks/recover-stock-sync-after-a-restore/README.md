# Runbook: Recover stock sync after a restore

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-008](../../inventory-sync/), rules in [SPEC 13](../../inventory-sync/spec/#13-one-writer-per-listing) and [SPEC 15](../../inventory-sync/spec/#15-recovery) |
| **Who runs it** | The operator, after [Restore a company: full rewind](../restore-a-company-full-rewind/) or [Restore a whole cell](../restore-a-whole-cell/), before any figure is sent |
| **Role or credential** | The operator console; the sync epoch is in control |

After a restore, Vervoro's stock and what each marketplace shows may disagree in either direction, and old writes must never be mistaken for new ones.

## Steps

1. Check the company's sync epoch in control has risen. The restore raises it; if it has not, raise it now, before anything else.
2. Check every account of the company is back in shadow, with every belief unknown.
3. Re-import orders placed since the restore time, and have the seller confirm the stock differences ([ADR-001 SPEC 10](../../database-architecture/spec/#restore)).
4. Let the reads finish: listings are read by reports and bulk reads, never one Trading call per listing. eBay revisions count at their worst for 24 hours.
5. Review the listing check with the seller: every listing showing more than Vervoro's figure will get the decrease.
6. Sign off in the console. Only then does each account go live, by the later-account path of [Take a company live](../take-a-company-live/).

## Verify

- No write was sent between the restore and the sign-off (the send log is empty for that period).
- Every key sent after sign-off carries the new epoch.
- Each account's health reaches "right" within one order read.

## If it stops halfway

Accounts stay in shadow until signed off, so nothing is sent. Start again from step 2; the epoch only ever rises, so raising it again is harmless.
