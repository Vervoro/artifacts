# Vervoro artifacts

Architecture decisions and plans, published with GitHub Pages.

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
- [ADR-009: Buyer data and privacy](buyer-data/README.md)

## Build order

The order to build in. Each step needs the ones before it.

1. **[ADR-000: System architecture](system-architecture/README.md), [ADR-001: Multi-tenant database architecture](database-architecture/README.md).** The skeleton: modules and ports, the outbox, the egress gate, tenancy and row-level security. Every later record is a module on top.
2. **[ADR-003: Product model](product-model/README.md).** Products come first; listings, stock and orders all point at them.
3. **[ADR-006: Stock ledger and reservations](stock-ledger/README.md).** Stock is recorded and reserved inside Vervoro before any marketplace sees a figure. Only the foundation writes it.
4. **[ADR-004: Channel connectors](channel-connectors/README.md), [ADR-004.1: eBay connector](ebay-connector/README.md), [ADR-004.2: Amazon Seller connector](amazon-seller-connector/README.md), [ADR-004.3: Shopify connector](shopify-connector/README.md).** The connector host first, then eBay and Amazon Seller side by side, then Shopify. Each runs against its simulator in shadow mode. Amazon Vendor (ADR-004.4, planned) comes later.
5. **[ADR-005: Catalogue sync and linking](catalogue-sync/README.md).** Needs the connectors' listing reads and the products to link them to.
6. **[ADR-009: Buyer data and privacy](buyer-data/README.md).** Before any real order stores a buyer's address; the marketplaces' data reviews ask for it. Buyer anonymisation from ADR-002 is built here.
7. **[ADR-007: Order ingestion](order-ingestion/README.md).** Needs links, reservations and the buyer-data rules.
8. **ADR-008: Inventory sync (planned).** Last: figures go to marketplaces only once links, the ledger and orders are proven in shadow mode.
9. **[ADR-002: Data retention and archiving](data-retention/README.md).** Archiving is switched on by its trigger (a cell past 500 GB, or the start of year 2), not at launch.
