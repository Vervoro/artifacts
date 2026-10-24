# ADR-003: Product model

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026; charge lines, a units setting and barcodes without a type question (owner rulings), split into ADR, SPEC and RUNBOOK, 21 October 2026; serial tracking deferred 21 October 2026; amended by owner rulings of 25 October 2026: lot questions at packing for use-by products and business buyers |
| **Scope** | What a product is and what it holds: the SKU, packs, bundles, box sizes, barcodes, size and colour families, VAT classes, best-before and lot tracking (serial tracking *Later*), the link from a listing, units of measure, and how products are created |
| **Builds on** | [ADR-000](../system-architecture/), [ADR-001](../database-architecture/); used by [ADR-005](../catalogue-sync/), [ADR-006](../stock-ledger/), [ADR-007](../order-ingestion/) and [ADR-011](../invoicing-and-vat/) |
| **SPEC** | [The rules to build from, and how to check them](spec/) |
| **RUNBOOK** | [The operator's procedures for this record](../runbooks/#adr-003-product-model) |

## Context

- **One product, many listings.** A jar of honey may sell singly on Amazon and as a six-pack on eBay, from the same stock. A wrong product list is a wrong number on every channel.
- **Three things are called a "pack":** a listing of six singles, a sealed six-pack on the shelf, and a gift set. Mixing them up counts stock twice or never deducts it.
- **Four codes, four owners:** the seller's SKU, the manufacturer's barcode, the marketplace's code (such as an ASIN) and the supplier's code identify different things.
- **Sellers arrive with 100 to 5,000 products,** often in a spreadsheet, and staff scan barcodes on phones.
- **Food and VAT.** Expired food must never be sold, and a recall must find every buyer of a lot. VAT depends on the product and the country, and rates change.

## Decision

Parts marked *Later* keep their rules in the SPEC but are built only when their trigger arrives.

1. **A product is one thing the warehouse counts,** in whole base units: a jar, a piece, or a metre or 100 g for goods sold by length or weight. A charge that is not stock (a service fee, gift wrap) is never a product but a **charge line** on a manual order or invoice: a name, an amount and a VAT class, never touching stock. A marketplace listing that is not stock is marked "not stock", never linked (owner ruling, 21 October 2026).
2. **The SKU is the seller's permanent name for a product,** unique in the company whatever its case, fixed once the product is used, and never reused. A used product is retired, never deleted.
3. **A product is one of three kinds,** fixed once used: **simple**, **pack** (a sealed multiple of one simple product, with its own stock) and **bundle** (a set of products with no stock of its own, limited by its scarcest component). A bundle never contains a bundle.
4. **Barcodes are records of their own,** many per product and unique in the company, so a scan finds one thing. Every GTIN (the worldwide barcode number) of 8, 12, 13 or 14 digits is accepted without asking its type, checked, and stored as 14 digits (owner ruling, 21 October 2026). **Box and pallet sizes** convert cases to units and never hold stock.
5. **A listing links to exactly one product,** with the units one sale uses and who ships it. The product holds no selling price; prices belong to the channel.
6. **Sizes and colours are product families.** Each size or colour is its own product with its own stock; the family groups up to three options, so a range is linked to one variation listing in one step. *Later: creating a range as a grid and editing it together.*
7. **VAT is a class on the product; rates come from one table by country,** kept by the operator. Every line stores the class and rate it used. *Later: a different class per country, when selling into the EU.*
8. **Best-before and lot tracking are switched on per product.** With dates or lots on, no stock enters without them, expired stock is never sold, and every dispatch records its lot. *Later: serial tracking (electronics, tools), when a first customer needs it; its rules stay in the [SPEC](spec/#0-at-launch-and-later).* *Later: a dangerous-goods class and an age check on the product, when the shipping record needs them for carriers and labels.*
9. **Measures are stored in whole grams and millimetres** and shown metric or imperial by a company setting, which defaults from the country (metric for the UK), is changed in Settings and is never asked at sign-up. Values are converted only on entry and display (owner ruling, 21 October 2026).
10. **Products are created three ways through one validation:** on screen, by spreadsheet, and from a marketplace listing. A person confirms each one. *Later: from a pasted Amazon link, a category tree and more than one image.* In a spreadsheet a blank cell changes nothing.

The Products module, a core module, is the only writer of these ([ADR-000](../system-architecture/spec/#4-the-foundation-and-the-launch-modules)), through the typed query builder, never SQL ([ADR-001](../database-architecture/)).

## Consequences

**Gives**

- One stock number per physical thing: nothing is counted twice or never deducted.
- A scan always finds one product or one box size.
- A spreadsheet round trip is safe: blank cells change nothing, and every change is previewed.
- A clothing or shoe range is linked as one family, while each size keeps its own stock.
- Food sellers can show which lot went to which buyer, and never sell expired stock; VAT rates change in one table.

**Costs**

- One component sale changes every bundle and listing that uses it; that must stay fast.
- A wrong SKU or kind found after first use means a new product and a retired one, not an edit.
- The operator keeps the VAT rate table up to date.
- With lot tracking on, every receipt asks warehouse staff one more question, and packing asks it for use-by products and business buyers ([ADR-014 SPEC 3](../fulfilment/spec/#3-packing)).
- Charges that are not stock live on orders and invoices, so the product list cannot report on them.

## Alternatives rejected

- **Stock on a variant below the product:** every stock rule would need two levels.
- **No grouping of sizes:** twelve sizes and colours would be twelve unrelated products to create and list.
- **A "service" product kind for charges:** a kind never counted would need exceptions in stock, picking and counts.
- **The VAT rate on the product:** a rate change would edit every product.
- **Best-before and lot always required:** general goods have neither.
- **Serials recorded at receipt:** every unit scanned in, when only what left and what came back is ever checked.
- **A bundle inside a bundle:** sellable becomes recursive and loops become possible.
- **A listing linked to several products:** every order line would split; a bundle does the same with one link.
- **Box sizes as products with stock:** a case and its units would count the same goods twice.
- **A pack worked out from its singles:** a sealed pack could not be counted.
- **A selling price on the product:** prices differ per channel and belong to it.
- **Fractional quantities:** shelves hold whole items; a base unit of 100 g covers weight.
- **Weights stored in the seller's unit:** rounding in every report and on every label.
- **Asking whether a barcode is an EAN or a UPC:** the length answers it.
- **A blank spreadsheet cell clears the field:** one dropped column would wipe every product in the file.
- **A SKU editable at any time:** labels, documents and supplier emails already carry it.

## Open items

- **SKU length.** 40 characters is Amazon's limit as reported by third parties; check it in Seller Central, including whether it counts bytes.
- **Restricted barcode ranges** (13-digit codes starting 20–29, 12-digit codes starting 2 or 4): recheck against the GS1 General Specifications before launch, including 8-digit codes.
- **Imperial display:** the precision shown (0.1 oz, 0.1 in) is a proposal for the product owner.
- **Serial tracking is deferred** (owner, 21 October 2026) until a first customer needs it. When it is built, [ADR-014 Fulfilment](../fulfilment/) takes the packing and returns side (recording at packing, checking on return).
- **Not covered at launch:** items shipped in several boxes (furniture) and items whose weight differs piece by piece. Free-form attributes stay on the listing.
- **Amazon Vendor** items link like listings, but wait for the Vendor connector (ADR-004.4, not written).
