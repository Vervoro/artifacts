// Builds the GitHub Pages site: each document's README.md becomes index.html beside it, plus a root index.

import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { marked } from "marked";

// Give every heading the id GitHub would give it, so in-page links such as #platform-constraints work on the site.
const headingId = (text: string) => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;|&#\d+;/g, "").replace(/[^\w\- ]/g, "").trim().replace(/ /g, "-");
marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      return `<h${depth} id="${headingId(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});

const site = join(import.meta.dir, "..");

const css = `
:root {
  --bg: #f6f6f8; --surface: #ffffff; --sunken: #ededf1; --text: #16161a; --muted: #5c5c66; --border: #e0e0e6;
  --accent: #4338ca; --accent-soft: #eef0ff; --edge: #8a8a96; --tint: #f0f0f4;
  --sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root {
  --bg: #111114; --surface: #1a1a1f; --sunken: #23232a; --text: #ececf1; --muted: #a2a2ad; --border: #2d2d35;
  --accent: #a5b4fc; --accent-soft: #23264a; --edge: #74747f; --tint: #202027; color-scheme: dark; } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.65 var(--sans); }
main { max-width: 860px; margin: 0 auto; padding: 48px max(20px, env(safe-area-inset-left)) 80px; }
header.site { max-width: 860px; margin: 0 auto; padding: 20px max(20px, env(safe-area-inset-left)) 0; font-size: 14px; }
header.site a { color: var(--muted); text-decoration: none; }
header.site a:hover { color: var(--accent); }
h1, h2, h3 { line-height: 1.25; text-wrap: balance; }
h1 { font-size: clamp(28px, 4vw, 38px); letter-spacing: -0.02em; margin: 0 0 20px; }
h2 { font-size: 23px; margin: 48px 0 12px; padding-top: 20px; border-top: 1px solid var(--border); }
h3 { font-size: 18px; margin: 32px 0 8px; }
p, li { max-width: 72ch; }
a { color: var(--accent); }
code { font-family: var(--mono); font-size: 0.86em; background: var(--sunken); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
pre { background: var(--sunken); padding: 14px 16px; border-radius: 10px; overflow-x: auto; font-size: 13.5px; line-height: 1.5; }
pre code { background: none; padding: 0; overflow-wrap: normal; }
table { border-collapse: collapse; width: 100%; font-size: 14.5px; margin: 16px 0; background: var(--surface); }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
.table-wrap table { margin: 0; }
th, td { text-align: left; vertical-align: top; padding: 9px 12px; border-bottom: 1px solid var(--border); }
th { background: var(--sunken); font-weight: 600; font-size: 13px; color: var(--muted); }
tr:last-child td { border-bottom: none; }
ul, ol { padding-left: 22px; }
li + li { margin-top: 4px; }
figure { margin: 20px 0; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow-x: auto; }
svg.diagram { display: block; width: 100%; min-width: 640px; height: auto; font-family: var(--sans); }
svg .ink { fill: var(--text); } svg .quiet { fill: var(--muted); }
svg .edge { stroke: var(--edge); } svg .edge-fill { fill: var(--edge); }
svg .accent { stroke: var(--accent); } svg .accent-fill { fill: var(--accent); }
svg .box { fill: none; stroke: var(--edge); stroke-width: 1.25; }
svg .box-main { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2; }
svg .band { fill: var(--tint); stroke: var(--edge); stroke-width: 1.25; }
.cards { list-style: none; padding: 0; display: grid; gap: 12px; }
.cards a { display: block; padding: 18px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; text-decoration: none; color: var(--text); }
.cards a:hover, .cards a:focus-visible { border-color: var(--accent); outline: none; }
.cards.sub { margin: 12px 0 0 24px; padding-left: 16px; border-left: 2px solid var(--border); }
.parts { margin: 6px 0 0 20px; font-size: 14px; color: var(--muted); } .cards .parts a { display: inline; padding: 0; background: none; border: none; border-radius: 0; color: var(--accent); font-weight: 600; text-decoration: none; } .cards .parts a:hover { text-decoration: underline; }
.cards b { display: block; font-size: 17px; } .cards span { color: var(--muted); font-size: 14px; }
.order li { margin-top: 10px; } .order span { color: var(--muted); font-size: 14px; }
footer { margin-top: 64px; color: var(--muted); font-size: 13px; }
`;

// `back` is the header's trail of links, from the page up to the home page; empty on the home page.
const page = (title: string, body: string, back: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono&display=swap">
<style>${css}</style>
</head>
<body>
${back ? `<header class="site">${back}</header>` : ""}
<main>
${body}
<footer>Vervoro</footer>
</main>
</body>
</html>
`;

// `parent` nests a record under another on the home page (ADR-004.1 under ADR-004). `partOf` marks a page that belongs
// to a record, such as its SPEC or a runbook: it gets no card, and its header links back to the record. `links` are
// extra links shown under a record's card.
type Doc = { dir: string; title: string; blurb: string; parent?: string; partOf?: string; links?: { label: string; href: string }[] };
const docs: Doc[] = [
  { dir: "rulebook", title: "Engineering rulebook", blurb: "The 47 rules every change must keep, each a one-line summary of a decision a record makes, with a link to it. The record wins on any difference. Load it with every coding task." },
  { dir: "guide", title: "Architecture map and glossary", blurb: "How the records fit together, one word per concept, and what each status (Proposed, Accepted, Implemented, Superseded, Deprecated) means. Every record is Proposed today." },
  { dir: "system-architecture", title: "ADR-000: System architecture", blurb: "A modular monolith: six core modules each the only writer of its data, modules that call toward the core and hear back by events, an outbox, one egress gate, connector plugins and simulators. Proposed 17 October 2026; split into ADR, SPEC and RUNBOOK 20 October 2026.", links: [{ label: "SPEC", href: "system-architecture/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-000-system-architecture" }] },
  { dir: "system-architecture/spec", partOf: "system-architecture", title: "ADR-000 SPEC: System architecture", blurb: "The rules to build ADR-000 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "runbooks", title: "Runbooks", blurb: "The operator's procedures, one page each with numbered steps: who runs it, with which role, how to verify it, and what to do if it stops halfway." },
  ...[
    ["deploy-and-roll-back", "Deploy and roll back"],
    ["add-a-cell", "Add a cell"],
    ["add-a-dedicated-database", "Add a dedicated database"],
    ["move-a-company", "Move a company"],
    ["export-a-company", "Export a company"],
    ["erase-a-company", "Erase a company"],
    ["restore-a-company-look-back", "Restore a company, look back"],
    ["restore-a-company-full-rewind", "Restore a company, full rewind"],
    ["restore-a-whole-cell", "Restore a whole cell"],
    ["drills", "Drills"],
    ["use-the-owner-role", "Use the owner role"],
    ["check-an-archive-month", "Check an archive month"],
    ["change-a-vat-rate", "Change a VAT rate"],
    ["open-an-operator-grant", "Open an operator grant"],
    ["sign-in-incident-commands", "Sign-in incident commands"],
    ["rotate-the-better-auth-secret", "Rotate the Better Auth secret"],
    ["contain-a-poisoned-package", "Contain a poisoned package"],
    ["recover-a-last-owner", "Recover a company's last Owner"],
    ["recover-an-operator", "Recover an operator's access"],
    ["settle-a-stock-check-difference", "Settle a stock check difference"],
    ["a-stock-change-refused-as-negative", "A stock change refused as negative"],
    ["run-a-recall", "Run a recall"],
    ["hold-raises-or-pause-an-account", "Hold raises or pause an account"],
    ["take-a-company-live", "Take a company live"],
    ["recover-stock-sync-after-a-restore", "Recover stock sync after a restore"],
    ["check-a-marketplaces-launch-gates", "Check a marketplace's launch gates"],
    ["handle-a-marketplace-outage", "Handle a marketplace outage"],
    ["a-shared-pool-runs-low", "A shared pool runs low"],
    ["repair-a-notice-subscription", "Repair a notice subscription"],
    ["rotate-a-marketplace-app-secret", "Rotate a marketplace app secret"],
    ["replay-dead-letters", "Replay dead letters"],
    ["set-up-ebay-notices", "Set up eBay notices"],
    ["set-up-the-amazon-notice-bridge", "Set up the Amazon notice bridge"],
    ["link-a-catalogue-at-onboarding", "Link a catalogue at onboarding"],
    ["settle-a-held-catalogue-read", "Settle a held catalogue read"],
    ["order-ingestion-stalled", "Order ingestion stalled"],
    ["work-the-problem-orders-list", "Work the problem-orders list"],
    ["handle-a-buyers-cancellation-request", "Handle a buyer's cancellation request"],
    ["settle-an-order-shipped-outside-vervoro", "Settle an order shipped outside Vervoro"],
    ["answer-a-buyers-data-request", "Answer a buyer's data request"],
    ["answer-a-sellers-data-request", "Answer a seller's data request"],
    ["report-a-personal-data-breach", "Report a personal-data breach"],
    ["anonymise-after-a-connection-ends", "Anonymise after a connection ends"],
    ["check-the-anonymisation-job", "Check the anonymisation job"],
    ["run-the-quarterly-access-review", "Run the quarterly access review"],
    ["correct-or-credit-an-issued-invoice", "Correct or credit an issued invoice"],
    ["settle-a-vat-difference", "Settle a VAT difference"],
    ["work-a-failed-payment", "Work a failed payment"],
    ["close-and-reopen-a-company", "Close and reopen a company for non-payment"],
    ["refund-a-seller", "Refund a seller"],
  ].map(([dir, title]) => ({ dir: `runbooks/${dir}`, partOf: "runbooks", title: `Runbook: ${title}`, blurb: "" })),
  { dir: "database-architecture", title: "ADR-001: Multi-tenant database architecture", blurb: "Control database, shared-table customer databases with forced row-level security, a wrong-database check on every transaction, dedicated databases, trials as a state. Proposed 17 October 2026, revised 18 October 2026; split into ADR, SPEC and RUNBOOK 20 October 2026.", links: [{ label: "SPEC", href: "database-architecture/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-001-multi-tenant-database-architecture" }] },
  { dir: "database-architecture/spec", partOf: "database-architecture", title: "ADR-001 SPEC: Multi-tenant database architecture", blurb: "The rules to build ADR-001 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "data-retention", title: "ADR-002: Data retention and archiving", blurb: "24 months of history in each cell, older months archived per company in object storage once every company's files are verified, stock checkpoints, 7 years from the end of each month then deletion with 90 days' notice, logs on their own clocks. Later: archiving switched on at 500 GB or the start of year 2. Proposed 17 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "data-retention/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-002-data-retention-and-archiving" }] },
  { dir: "data-retention/spec", partOf: "data-retention", title: "ADR-002 SPEC: Data retention and archiving", blurb: "The rules to build ADR-002 from, the retention schedule, statutory periods with sources, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "product-model", title: "ADR-003: Product model", blurb: "A product is what the warehouse counts, in whole base units; charges that are not stock are charge lines. A permanent SKU, simple products, packs with their own stock and bundles from components, barcodes of any GTIN length, box sizes that never hold stock, size and colour families, VAT classes with one rate table, best-before, lot and serial tracking, the link from a listing, measures in grams and millimetres shown metric or imperial, and three ways to create products. Proposed 17 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "product-model/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-003-product-model" }] },
  { dir: "product-model/spec", partOf: "product-model", title: "ADR-003 SPEC: Product model", blurb: "The rules to build ADR-003 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "channel-connectors", title: "ADR-004: Channel connectors", blurb: "The Channels module and the connector contract: each marketplace a translator only; the host owns credentials, HTTP, rate budgets, shared daily pools counted exactly with a reserve per account, notice checks and the sending half of the egress gate; orders by notice with a completeness check behind (hourly where the order limit is shared, every 10 minutes where it is the seller's own); an unknown write settled before anything else; shadow first, with launch gates per marketplace; simulators with recorded replies. Proposed 17 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "channel-connectors/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-004-channel-connectors" }] },
  { dir: "channel-connectors/spec", partOf: "channel-connectors", title: "ADR-004 SPEC: Channel connectors", blurb: "The rules to build ADR-004 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "ebay-connector", parent: "channel-connectors", title: "ADR-004.1: eBay connector", blurb: "One app every seller approves, orders by eBay's Notification API with an hourly read behind, the Inventory API and the Trading API for every linked listing, the shared Trading pool (about 10 Seller Hub accounts until the Growth Check), resending an unknown Trading write, the out-of-stock option, account deletion notices. Proposed 17 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "ebay-connector/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-0041-ebay-connector" }] },
  { dir: "ebay-connector/spec", partOf: "ebay-connector", title: "ADR-004.1 SPEC: eBay connector", blurb: "The eBay rules, limits with sources, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "amazon-seller-connector", parent: "channel-connectors", title: "ADR-004.2: Amazon Seller connector", blurb: "Seller Central approval renewed yearly, one account per seller and region, notices through a no-code AWS bridge in an EU region, every stock write a single listing update read back, no figure for listings Amazon ships, Amazon-held stock as a reading, buyer data under the restricted role. Proposed 17 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "amazon-seller-connector/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-0042-amazon-seller-connector" }] },
  { dir: "amazon-seller-connector/spec", partOf: "amazon-seller-connector", title: "ADR-004.2 SPEC: Amazon Seller connector", blurb: "The Amazon rules, limits with sources, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "shopify-connector", parent: "channel-connectors", title: "ADR-004.3: Shopify connector", blurb: "Installing Vervoro's app, expiring tokens, one warehouse location, webhooks to one address, compare-and-set writes in batches of 250, a cost-point budget, variants without a unique SKU, orders other marketplaces put into the shop, privacy webhooks. Later: built when a seller needs Shopify. Proposed 18 October 2026; split into ADR and SPEC 21 October 2026.", links: [{ label: "SPEC", href: "shopify-connector/spec/" }] },
  { dir: "shopify-connector/spec", partOf: "shopify-connector", title: "ADR-004.3 SPEC: Shopify connector", blurb: "The Shopify rules, limits with sources, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "catalogue-sync", title: "ADR-005: Catalogue sync and linking", blurb: "Listings keyed by the marketplace's own id, a full read on connect plus notices, a daily safety read and refresh, two proofs before a listing ends, suggestions in three tiers with vetoes, links made only by a person and kept as versions, unlinked listings left to the marketplace, products from listings, Amazon offers by ASIN. The Listings module, the only writer of listings and links. Proposed 18 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "catalogue-sync/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-005-catalogue-sync-and-linking" }] },
  { dir: "catalogue-sync/spec", partOf: "catalogue-sync", title: "ADR-005 SPEC: Catalogue sync and linking", blurb: "The rules to build ADR-005 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "stock-ledger", title: "ADR-006: Stock ledger and reservations", blurb: "The Inventory module: an append-only ledger that only its own entries can change, proved every night; four numbers per product, batch and spot (on hand, reserved, held, sellable); one reservation per demand, naming a batch, earliest sell-by date first; use-by dates; bundles in whole sets; receiving, blind counts while picking goes on, no negative stock, one lock per company, commands safe to repeat, and an outbox note so Stock sync works out each listing's figure. Proposed 18 October 2026, revised after review the same day; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "stock-ledger/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-006-stock-ledger-and-reservations" }] },
  { dir: "stock-ledger/spec", partOf: "stock-ledger", title: "ADR-006 SPEC: Stock ledger and reservations", blurb: "The rules to build ADR-006 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "order-ingestion", title: "ADR-007: Order ingestion", blurb: "Orders arrive by webhook with the completeness check behind, and only a complete read moves the order watermark; one order per marketplace order; one status worked out from mapped facts; reserving on import, oldest purchase first; problem rows instead of dropped orders; holds in three kinds beside the status; cancellations made only on the marketplace (Vervoro never sends one); whole orders; unlinked, marketplace-shipped and shipped-outside lines; manual orders with charge lines; deadlines handed to Fulfilment. The Orders module, the only writer of orders. Proposed 18 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "order-ingestion/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-007-order-ingestion" }] },
  { dir: "order-ingestion/spec", partOf: "order-ingestion", title: "ADR-007 SPEC: Order ingestion", blurb: "The rules to build ADR-007 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "inventory-sync", title: "ADR-008: Inventory sync", blurb: "The Stock sync module, the only writer of each listing's figure, worked out after the stock commit from one warehouse's sellable stock; near zero every change sent at once and above it only a gap of 20, raises only after a complete order read, one belief per listing that errs only upward, every write confirmed, eBay's 250 revisions a day, single Amazon patches, the last 2 units kept for one account, one stop question, shadow before live, and recovery. Proposed 18 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "inventory-sync/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-008-inventory-sync" }] },
  { dir: "inventory-sync/spec", partOf: "inventory-sync", title: "ADR-008 SPEC: Inventory sync", blurb: "The rules to build ADR-008 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "buyer-data", title: "ADR-009: Buyer data and privacy", blurb: "The Buyer data module, core and the only writer of buyers' names and addresses. The seller as controller and Vervoro as processor; only what a parcel and its tax need; one place, in the EU, encrypted per field under the company key; views by role and order state, every view logged; anonymised 30 days after delivery; erasure through backups and restores; incidents told within 24 hours; the security schedule marketplaces ask for. Proposed 18 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "buyer-data/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-009-buyer-data-and-privacy" }] },
  { dir: "buyer-data/spec", partOf: "buyer-data", title: "ADR-009 SPEC: Buyer data and privacy", blurb: "The rules to build ADR-009 from, the data inventory, constraints with sources, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "users-and-access", title: "ADR-010: Users, roles and access", blurb: "One login per person across companies, one person per phone, six fixed roles with warehouse scope in one permission matrix, invitation only, removal on the next request, read-only operator grants the seller sees and can end, two audit trails, and no API tokens at launch. Proposed, 18 October 2026; sign-in moved to ADR-013 and split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "users-and-access/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-010-users-roles-and-access" }] },
  { dir: "users-and-access/spec", partOf: "users-and-access", title: "ADR-010 SPEC: Users, roles and access", blurb: "The rules to build ADR-010 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "invoicing-and-vat", title: "ADR-011: Invoicing and VAT", blurb: "The Invoicing module: the seller as supplier and one issuer per sale (Amazon by its VAT Calculation Service, eBay when the seller opted in, otherwise Vervoro with an \"eBay holds none\" confirmation), documents only when needed or asked for, one layout with an optional customer block, a VAT record for every sale line from import, Vervoro's VAT beside the marketplace's with differences over 1p blocking the invoice, per-line rounding, hampers split by cost and delivery following the goods, one gap-free series, frozen documents and credit notes only against Vervoro's invoices, a CSV export split by issuer, UK only at launch. Proposed 18 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "invoicing-and-vat/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-011-invoicing-and-vat" }] },
  { dir: "invoicing-and-vat/spec", partOf: "invoicing-and-vat", title: "ADR-011 SPEC: Invoicing and VAT", blurb: "The rules to build ADR-011 from, constraints with sources, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "billing-and-plans", title: "ADR-012: Billing and plans", blurb: "The Billing module, always on outside the core. Plans as rows of modules with a soft order ceiling averaged over three months and no overage, unlimited users and connections, nothing that moves orders or stock ever refused for billing, a 21-day trial with no card until a connection goes live, four states computed from dates, closing by the seller's stop choice and then figures that only fall until erasure, reopening back to shadow, Stripe with cards and Bacs Direct Debit by redirect (SAQ A), upgrades at once and downgrades at renewal, one invoice sequence, UK VAT. Proposed 18 October 2026; split into ADR, SPEC and RUNBOOK 21 October 2026.", links: [{ label: "SPEC", href: "billing-and-plans/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-012-billing-and-plans" }] },
  { dir: "billing-and-plans/spec", partOf: "billing-and-plans", title: "ADR-012 SPEC: Billing and plans", blurb: "The rules to build ADR-012 from, constraints with sources, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "sign-in", title: "ADR-013: Sign-in", blurb: "Vervoro runs sign-in with Better Auth as its engine, inside a Worker of its own and on Vervoro's own database; no hosted identity provider. Better Auth says who a person is, ADR-010 what they may do. A passkey by default, a password only with an authenticator code, Amazon's password rules as a small policy layer, one sign-in a day on one session model, recovery through the company first, lockouts with a named owner each, one versioned secret and four incident commands. Proposed 18 October 2026 within ADR-010; its own record, split into ADR, SPEC and RUNBOOK 21 October 2026; Better Auth replaces the in-house engine the same day.", links: [{ label: "SPEC", href: "sign-in/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-013-sign-in" }] },
  { dir: "sign-in/spec", partOf: "sign-in", title: "ADR-013 SPEC: Sign-in", blurb: "The rules to build ADR-013 from, the tests that prove them, and a checklist for reviewing the code." },
  { dir: "fulfilment", title: "ADR-014: Fulfilment", blurb: "The Fulfilment module, always on outside the core: pick lists that choose spots when picking starts, packing that records the batch that left, one shipment per whole order that deducts exactly what was packed, put-back after a cancellation, returns held until inspected, and the recall list. Split out of ADR-006, 21 October 2026.", links: [{ label: "SPEC", href: "fulfilment/spec/" }, { label: "RUNBOOK", href: "runbooks/#adr-014-fulfilment" }] },
  { dir: "fulfilment/spec", partOf: "fulfilment", title: "ADR-014 SPEC: Fulfilment", blurb: "The rules to build ADR-014 from, the tests that prove them, and a checklist for reviewing the code." },
];

// The order to build in: each step needs the ones before it. `adrs` are dirs (linked) or planned titles.
const buildOrder: { adrs: string[]; why: string }[] = [
  { adrs: ["system-architecture", "database-architecture"], why: "The skeleton: modules and ports, the outbox, the egress gate, tenancy and row-level security. Every later record is a module on top." },
  { adrs: ["users-and-access", "sign-in"], why: "Users, roles and sign-in are part of the skeleton: every later module names its actions, and ADR-010 decides who holds them. Sign-in, sessions and operator grants exist before any screen shows a buyer's address. Sign-in is its own Worker running Better Auth, with its own build, deploy and auth schema in control, so it is set up with the skeleton; Better Auth hands ADR-010 a login id and decides nothing about access." },
  { adrs: ["product-model"], why: "Products come first; listings, stock and orders all point at them." },
  { adrs: ["stock-ledger"], why: "Stock is recorded and reserved inside Vervoro before any marketplace sees a figure. Only Inventory writes it." },
  { adrs: ["channel-connectors", "ebay-connector", "amazon-seller-connector", "shopify-connector"], why: "The connector host first, then eBay and Amazon Seller side by side. Shopify (ADR-004.3) is Later, built when a seller needs it. Each runs against its simulator in shadow mode. Amazon Vendor (ADR-004.4, planned) comes later." },
  { adrs: ["catalogue-sync"], why: "Needs the connectors' listing reads and the products to link them to." },
  { adrs: ["buyer-data"], why: "Before any real order stores a buyer's address; the marketplaces' data reviews ask for it. Buyer anonymisation from ADR-002 is built here." },
  { adrs: ["order-ingestion", "fulfilment"], why: "Orders need links, reservations and the buyer-data rules. Fulfilment then picks, packs and ships them, and takes returns, through Inventory's and Orders' ports." },
  { adrs: ["invoicing-and-vat"], why: "Invoices follow orders: needs order lines, refunds, the buyer-data rules and the roles. Built before any real sale, so every sale line has its VAT record from the first day." },
  { adrs: ["billing-and-plans"], why: "Before any connection goes live: going live needs a payment method, the stop choice (leave the figures or send zero) and a stock contact, even in a trial. It is beside the stock path, never in it: nothing in it stops orders or stock." },
  { adrs: ["inventory-sync"], why: "Last before launch: figures go to marketplaces only once links, the ledger, orders and the go-live checks are proven in shadow mode." },
  { adrs: ["data-retention"], why: "The log drops run from launch; archiving is switched on by its trigger (a cell past 500 GB, or the start of year 2)." },
];
const titleOf = (a: string) => docs.find((d) => d.dir === a)?.title ?? a;
const orderHtml = `<h2>Build order</h2>
<p>The order to build in. Each step needs the ones before it.</p>
<ol class="order">
${buildOrder.map((o) => `  <li><b>${o.adrs.map((a) => (docs.some((d) => d.dir === a) ? `<a href="${a}/">${titleOf(a)}</a>` : titleOf(a))).join(", ")}</b><br><span>${o.why}</span></li>`).join("\n")}
</ol>`;
const orderMd = `## Build order\n\nThe order to build in. Each step needs the ones before it.\n\n${buildOrder.map((o, i) => `${i + 1}. **${o.adrs.map((a) => (docs.some((d) => d.dir === a) ? `[${titleOf(a)}](${a}/README.md)` : titleOf(a))).join(", ")}.** ${o.why}`).join("\n")}\n`;

for (const d of docs) {
  const md = readFileSync(join(site, d.dir, "README.md"), "utf8");
  let html = await marked.parse(md, { gfm: true });
  const svg = join(import.meta.dir, "diagrams", `${d.dir}.svg`);
  if (html.includes("<!-- DIAGRAM -->")) html = html.replace("<!-- DIAGRAM -->", `<figure>${readFileSync(svg, "utf8")}</figure>`);
  // A page with more than one diagram names the others: `<!-- DIAGRAM:calls -->` reads `diagrams/<dir>/calls.svg`.
  html = html.replace(/<!-- DIAGRAM:([a-z0-9-]+) -->/g, (_, name: string) => `<figure>${readFileSync(join(import.meta.dir, "diagrams", d.dir, `${name}.svg`), "utf8")}</figure>`);
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
  const up = "../".repeat(d.dir.split("/").length);
  const owner = d.partOf ? docs.find((o) => o.dir === d.partOf) : undefined;
  const back = `<a href="${up}">← Vervoro artifacts</a>${owner ? ` / <a href="${relative(d.dir, owner.dir)}/">${owner.title}</a>` : ""}`;
  writeFileSync(join(site, d.dir, "index.html"), page(d.title, html, back));
}

const index = `<h1>Vervoro artifacts</h1>
<p>Architecture decisions and plans. Every record is <b>Proposed</b> until the developer has reviewed it and the owner has signed it off; see the <a href="guide/">architecture map and glossary</a> for what each status means.</p>
<ul class="cards">
${docs
  .filter((d) => !d.parent && !d.partOf)
  .map((d) => {
    const parts = (c: Doc) => (c.links ? `<p class="parts">${c.links.map((l) => `<a href="${l.href}">${l.label}</a>`).join(" · ")}</p>` : "");
    const card = (c: Doc) => `<a href="${c.dir}/"><b>${c.title}</b><span>${c.blurb}</span></a>${parts(c)}`;
    const kids = docs.filter((c) => c.parent === d.dir);
    const sub = kids.length ? `\n    <ul class="cards sub">\n${kids.map((c) => `      <li>${card(c)}</li>`).join("\n")}\n    </ul>\n  ` : "";
    return `  <li>${card(d)}${sub}</li>`;
  })
  .join("\n")}
</ul>
${orderHtml}`;
writeFileSync(join(site, "index.html"), page("Vervoro artifacts", index, ""));
writeFileSync(join(site, ".nojekyll"), "");
writeFileSync(
  join(site, "README.md"),
  `# Vervoro artifacts\n\nArchitecture decisions and plans, published with GitHub Pages.\n\n${docs.map((d) => `${d.parent || d.partOf ? "  " : ""}- [${d.title}](${d.dir}/README.md)`).join("\n")}\n\n${orderMd}`,
);
console.log("built");
