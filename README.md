# Vervoro artifacts

Architecture decisions and plans, published with GitHub Pages.

- [Engineering rulebook](rulebook/README.md)
- [Architecture map and glossary](guide/README.md)
- [ADR-000: System architecture](system-architecture/README.md)
- [ADR-001: Multi-tenant database architecture](database-architecture/README.md)
- [ADR-002: Data retention and archiving](data-retention/README.md)
- [ADR-003: Product model](product-model/README.md)
- [ADR-004: Channel connectors](channel-connectors/README.md)
  - [ADR-004.1: eBay connector](ebay-connector/README.md)
  - [ADR-004.2: Amazon Seller connector](amazon-seller-connector/README.md)
  - [ADR-004.3: Shopify connector](shopify-connector/README.md)
- [ADR-005: Catalogue sync and linking](catalogue-sync/README.md)
- [ADR-006: Stock ledger and reservations](stock-ledger/README.md)
- [ADR-007: Order ingestion](order-ingestion/README.md)
- [ADR-008: Inventory sync](inventory-sync/README.md)
- [ADR-009: Buyer data and privacy](buyer-data/README.md)
- [ADR-010: Users, roles and sign-in](users-and-access/README.md)
- [ADR-011: Invoicing and VAT](invoicing-and-vat/README.md)
- [ADR-012: Billing and plans](billing-and-plans/README.md)

## Build order

The order to build in. Each step needs the ones before it.

1. **[ADR-000: System architecture](system-architecture/README.md), [ADR-001: Multi-tenant database architecture](database-architecture/README.md).** The skeleton: modules and ports, the outbox, the egress gate, tenancy and row-level security. Every later record is a module on top.
2. **[ADR-010: Users, roles and sign-in](users-and-access/README.md).** Users, roles and sign-in are part of the skeleton: every later module names its actions, and this record decides who holds them. Sign-in, sessions and operator grants exist before any screen shows a buyer's address. Sign-in is its own Worker with its own build and deploy, so it is set up with the skeleton.
3. **[ADR-003: Product model](product-model/README.md).** Products come first; listings, stock and orders all point at them.
4. **[ADR-006: Stock ledger and reservations](stock-ledger/README.md).** Stock is recorded and reserved inside Vervoro before any marketplace sees a figure. Only the foundation writes it.
5. **[ADR-004: Channel connectors](channel-connectors/README.md), [ADR-004.1: eBay connector](ebay-connector/README.md), [ADR-004.2: Amazon Seller connector](amazon-seller-connector/README.md), [ADR-004.3: Shopify connector](shopify-connector/README.md).** The connector host first, then eBay and Amazon Seller side by side, then Shopify. Each runs against its simulator in shadow mode. Amazon Vendor (ADR-004.4, planned) comes later.
6. **[ADR-005: Catalogue sync and linking](catalogue-sync/README.md).** Needs the connectors' listing reads and the products to link them to.
7. **[ADR-009: Buyer data and privacy](buyer-data/README.md).** Before any real order stores a buyer's address; the marketplaces' data reviews ask for it. Buyer anonymisation from ADR-002 is built here.
8. **[ADR-007: Order ingestion](order-ingestion/README.md).** Needs links, reservations and the buyer-data rules.
9. **[ADR-011: Invoicing and VAT](invoicing-and-vat/README.md).** Invoices follow orders: needs order lines, refunds, the buyer-data rules and the roles. Built before any real sale, so every sale line has its VAT record from the first day.
10. **[ADR-012: Billing and plans](billing-and-plans/README.md).** Before any connection goes live: going live needs a payment method, the stop choice (leave the figures or send zero) and a stock contact, even in a trial. It is beside the stock path, never in it: nothing in it stops orders or stock.
11. **[ADR-008: Inventory sync](inventory-sync/README.md).** Last before launch: figures go to marketplaces only once links, the ledger, orders and the go-live checks are proven in shadow mode.
12. **[ADR-002: Data retention and archiving](data-retention/README.md).** Archiving is switched on by its trigger (a cell past 500 GB, or the start of year 2), not at launch.
