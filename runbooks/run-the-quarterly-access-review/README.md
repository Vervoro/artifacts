# Runbook: Run the quarterly access review

| | |
| --- | --- |
| **Built** | At launch |
| **Record** | [ADR-009](../../buyer-data/), rules in [SPEC 14](../../buyer-data/spec/#14-security-controls); grants in [ADR-010 SPEC 7](../../users-and-access/spec/#7-operator-access-to-a-company) |
| **Who runs it** | The operator, once a quarter; Vervoro's owner checks it and signs it off |
| **Role or credential** | The operator console, the source-control and build-pipeline admin pages, and the hosting and database accounts' member lists. No grant: the review reads who has access, never company data |

The review covers Vervoro's own people and credentials. Each seller manages their own users ([ADR-010](../../users-and-access/)).

## Steps

1. List every operator account, every developer account, and every service account or credential: deploy identities, the CI migration job, marketplace app credentials, the Amazon bridge's account, and the hosting, database and email accounts.
2. For each, write who owns it, what it can reach, and why it is still needed. A person who left or changed role must already be removed, within 24 hours of the change; one found here is an incident ([Report a personal-data breach](../report-a-personal-data-breach/) decides whether it is a breach).
3. Remove anything with no current owner or need, and narrow anything that reaches more than its job.
4. Check each person has multi-factor sign-in, and that no account is shared.
5. Read the quarter's operator grants and uses of the owner role in the platform security log: each has a reason, and the owner role's uses each match an alert ([Use the owner role](../use-the-owner-role/)).
6. Check the credentials due for yearly rotation, and book any that are due ([Rotate a marketplace app secret](../rotate-a-marketplace-app-secret/), [Rotate the Better Auth secret](../rotate-the-better-auth-secret/)).
7. Write the review, with what was removed or changed, into the platform security log. Vervoro's owner signs it off.

## Verify

- The review is in the security log for this quarter, signed off, and lists every account in step 1.

## If it stops halfway

Nothing removed is restored by stopping. Finish within the quarter; the next review starts from this one's list.
