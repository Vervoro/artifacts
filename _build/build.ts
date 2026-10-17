// Builds the GitHub Pages site: each document's README.md becomes index.html beside it, plus a root index.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

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
.cards b { display: block; font-size: 17px; } .cards span { color: var(--muted); font-size: 14px; }
.order li { margin-top: 10px; } .order span { color: var(--muted); font-size: 14px; }
footer { margin-top: 64px; color: var(--muted); font-size: 13px; }
`;

const page = (title: string, body: string, home: boolean) => `<!doctype html>
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
${home ? "" : '<header class="site"><a href="../">← Vervoro artifacts</a></header>'}
<main>
${body}
<footer>Vervoro</footer>
</main>
</body>
</html>
`;

const docs: { dir: string; title: string; blurb: string; parent?: string }[] = [
  { dir: "system-architecture", title: "ADR-000: System architecture", blurb: "A modular monolith of modules with typed ports, one core that owns stock and orders, an outbox, one egress gate, connector plugins and simulators. Proposed, 17 October 2026." },
  { dir: "database-architecture", title: "ADR-001: Multi-tenant database architecture", blurb: "Control database, shared-table customer databases with row-level security, dedicated and trial databases. Proposed, 17 October 2026." },
  { dir: "data-retention", title: "ADR-002: Data retention and archiving", blurb: "24 months of history in each cell, older months archived per company in object storage, statutory retention, then deletion. Proposed, 17 October 2026." },
  { dir: "product-model", title: "ADR-003: Product model", blurb: "SKU identity, barcodes, simple products, packs with their own stock, bundles built from components, box sizes, size and colour families, VAT classes, best-before and lot tracking, listing links including FBA and Vendor, and how products are created. Proposed, 17 October 2026." },
  { dir: "channel-connectors", title: "ADR-004: Channel connectors", blurb: "Each marketplace is a translator behind a small contract (read orders, read listings, write stock, read back); the host owns credentials, HTTP, rate limits and shared daily allowances; orders arrive by notice; simulators, shadow mode, and failures kept per account. Proposed, 17 October 2026." },
  { dir: "ebay-connector", parent: "channel-connectors", title: "ADR-004.1: eBay connector", blurb: "One app every seller approves, orders by eBay's Notification API, the Inventory API and the Trading API for every linked listing, the shared Trading pool, the out-of-stock option, account deletion notices. Proposed, 17 October 2026." },
  { dir: "amazon-seller-connector", parent: "channel-connectors", title: "ADR-004.2: Amazon Seller connector", blurb: "Seller Central approval renewed yearly, one account per seller and region, the AWS notice relay, single decreases and feeds for raises, read back on every write, no figure for listings Amazon ships, buyer data. Proposed, 17 October 2026." },
  { dir: "shopify-connector", parent: "channel-connectors", title: "ADR-004.3: Shopify connector", blurb: "Installing Vervoro's app, expiring tokens, one warehouse location, webhooks to one address, compare-and-set writes in batches of 250, a cost-point budget, variants without a unique SKU, orders other marketplaces put into the shop, privacy webhooks. Proposed, 18 October 2026." },
  { dir: "catalogue-sync", title: "ADR-005: Catalogue sync and linking", blurb: "Listings keyed by the marketplace's own id, a full read on connect plus notices, a daily safety read and refresh, two proofs before a listing ends, suggestions in three tiers with vetoes, links made only by a person and kept as versions, unlinked listings left to the marketplace, products from listings, Amazon offers by ASIN. Proposed, 18 October 2026." },
  { dir: "stock-ledger", title: "ADR-006: Stock ledger and reservations", blurb: "An append-only ledger proved every night, four numbers per product, batch and spot (on hand, reserved, held, sellable), reserving on import with the earliest sell-by date first, packs and bundles, orders that wait for a link, dispatch by shipment, cancellations, returns, counts, no negative stock, one lock per company and commands safe to repeat. Proposed, 18 October 2026." },
];

// The order to build in: each step needs the ones before it. `adrs` are dirs (linked) or planned titles.
const buildOrder: { adrs: string[]; why: string }[] = [
  { adrs: ["system-architecture", "database-architecture"], why: "The skeleton: modules and ports, the outbox, the egress gate, tenancy and row-level security. Every later record is a module on top." },
  { adrs: ["product-model"], why: "Products come first; listings, stock and orders all point at them." },
  { adrs: ["stock-ledger"], why: "Stock is recorded and reserved inside Vervoro before any marketplace sees a figure. Only the foundation writes it." },
  { adrs: ["channel-connectors", "ebay-connector", "amazon-seller-connector", "shopify-connector"], why: "The connector host first, then eBay and Amazon Seller side by side, then Shopify. Each runs against its simulator in shadow mode. Amazon Vendor (ADR-004.4, planned) comes later." },
  { adrs: ["catalogue-sync"], why: "Needs the connectors' listing reads and the products to link them to." },
  { adrs: ["ADR-009: Buyer data and privacy (in draft)"], why: "Before any real order stores a buyer's address; the marketplaces' data reviews ask for it. Buyer anonymisation from ADR-002 is built here." },
  { adrs: ["ADR-007: Order ingestion (planned)"], why: "Needs links, reservations and the buyer-data rules." },
  { adrs: ["ADR-008: Inventory sync (planned)"], why: "Last: figures go to marketplaces only once links, the ledger and orders are proven in shadow mode." },
  { adrs: ["data-retention"], why: "Archiving is switched on by its trigger (a cell past 500 GB, or the start of year 2), not at launch." },
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
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
  writeFileSync(join(site, d.dir, "index.html"), page(d.title, html, false));
}

const index = `<h1>Vervoro artifacts</h1>
<p>Architecture decisions and plans.</p>
<ul class="cards">
${docs
  .filter((d) => !d.parent)
  .map((d) => {
    const card = (c: (typeof docs)[number]) => `<a href="${c.dir}/"><b>${c.title}</b><span>${c.blurb}</span></a>`;
    const kids = docs.filter((c) => c.parent === d.dir);
    const sub = kids.length ? `\n    <ul class="cards sub">\n${kids.map((c) => `      <li>${card(c)}</li>`).join("\n")}\n    </ul>\n  ` : "";
    return `  <li>${card(d)}${sub}</li>`;
  })
  .join("\n")}
</ul>
${orderHtml}`;
writeFileSync(join(site, "index.html"), page("Vervoro artifacts", index, true));
writeFileSync(join(site, ".nojekyll"), "");
writeFileSync(
  join(site, "README.md"),
  `# Vervoro artifacts\n\nArchitecture decisions and plans, published with GitHub Pages.\n\n${docs.map((d) => `${d.parent ? "  " : ""}- [${d.title}](${d.dir}/README.md)`).join("\n")}\n\n${orderMd}`,
);
console.log("built");
