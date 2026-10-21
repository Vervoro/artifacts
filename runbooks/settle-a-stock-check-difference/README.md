# Runbook: Settle a stock check difference

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-006](../../stock-ledger/), rules in [SPEC 14](../../stock-ledger/spec/#14-the-nightly-check-and-checkpoints) |
| **Who runs it** | The operator, when the nightly stock check pages, the same morning |
| **Role or credential** | The operator console to read. A rebuild runs only as a reviewed script through [Use the owner role](../use-the-owner-role/), because the runtime role cannot write balances |

The ledger is the truth. A difference means a balance, a position or a reservation disagrees with its entries. Since only the ledger trigger writes them, a difference is a defect or corruption, never normal drift. Raises on the affected products' listings are already held, and decreases still go.

## Steps

1. Open the check's report. It names the company, the rule that failed (balances, reserved, gaps, a closed line, documents) and the products, batches and spots.
2. Tell the seller's managers, in the app, that raises are held on those products while the operator checks. Nothing else changes for them.
3. **A gap in the sequence, or entries that contradict each other:** the ledger itself is damaged. Stop here and follow [Restore a company: full rewind](../restore-a-company-full-rewind/).
4. **A document rule (shipped lines or returns against their entries):** find the order line or return in the activity view. If an entry is missing, the seller's manager records it through the normal command (a count, a return), never the operator.
5. **A stored number differs from its entries:** write the cause in the platform security log. Then run the rebuild script through the owner role. It recomputes the named balances, positions and reservations from the latest checkpoint plus the entries after it, and writes nothing else.
6. Record the repair in the company's activity view: which numbers changed, from what, to what, and why.
7. Run the check again for that company. When it passes, Stock sync clears the hold, and the held raises wait for the next order read.
8. Open a defect for the cause, with the report attached.

## Verify

- The check passes for the company, and the affected listings show no "held" reason.
- The activity view and the security log both hold the repair.

## If it stops halfway

The rebuild is one transaction per company: it either wrote everything or nothing. Run the check again; if it still fails, run step 5 again. While the check fails, the hold stays, which is safe: listings can only fall.
