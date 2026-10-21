# ADR-003 SPEC: Product model

| | |
| --- | --- |
| **Decision** | [ADR-003: Product model](../) |
| **Procedures** | [RUNBOOK](../../runbooks/#adr-003-product-model) |
| **Date** | 21 October 2026 |
| **For** | The developer and coding agents building it, and the person reviewing their work |

The rules to build ADR-003 from. Rules another record owns are linked, not repeated. Where this page and the ADR disagree, the ADR wins and this page is fixed. Words are defined in the [map and glossary](../../guide/).

## 0. At launch and later

Everything below is built at launch except these parts, which keep their rules here and are built only when their trigger arrives.

| Later part | Trigger | Rules |
| --- | --- | --- |
| A VAT class per country that differs from the product's own | Selling into the EU, in its own record ([ADR-011](../../invoicing-and-vat/)) | [11](#11-vat) |
| Amazon Vendor catalogue items linked like listings | The Vendor connector (ADR-004.4, not written) | [8](#8-the-link-from-a-listing) |
| A standard cost in a currency other than the company's | Selling or buying in a second currency | [2](#2-fields) |
| A category tree (`category`, `product_category`); tags group products at launch | Sellers ask for nested grouping or reports by category | [2.2](#22-related-tables) |
| More than one image per product | Sellers ask for more than the main image | [5](#5-images) |
| Creating a family as a grid, a SKU pattern, "add a size", and editing members together | Sellers with ranges ask for faster creation than the spreadsheet | [10](#10-sizes-and-colours) |
| Creating a product from a pasted Amazon link or ASIN | Sellers ask for it beyond "make product" from their own listings | [13](#13-creating-products) |
| Dangerous goods (`un_number`, `battery`) and age-restricted goods (`min_age`) on the product | The shipping record, when carriers and labels need them | [2](#2-fields) |
| Serial tracking (`tracks_serial`): a serial recorded at packing and checked on return (owner ruling, 21 October 2026) | A first customer needs it | [12](#12-best-before-lot-and-serial-numbers), rules 7–8 |

## 1. What a product is

1. **A product is what the warehouse counts.** If a picker can pick it and a count can count it, it is a product. A way of offering or grouping products (a six-unit listing, a family, a price) is not.
2. **A product does not hold:** stock, batches, best-before dates or landed cost ([ADR-006](../../stock-ledger/)); selling price, shopper-facing title, photos or marketplace codes such as an ASIN ([ADR-005](../../catalogue-sync/)); supplier codes, pack sizes, lead times or reorder points (purchasing, a later record).
3. **The Products module** is the only writer of the tables in this page except the link (section 8), which Listings writes ([ADR-000 SPEC 4](../../system-architecture/spec/#4-the-foundation-and-the-launch-modules)). Every table is declared through `tenantTable()` and queried through the typed query builder ([ADR-001 SPEC 5](../../database-architecture/spec/#5-declaring-tables)).

### 1.1 Charge lines and listings that are not stock

Owner ruling, 21 October 2026: non-stock charges are charge lines, not a product kind.

1. **A charge line** is a name (1–200 characters), an amount with its currency, and a VAT class (section 11). It sits on a manual order ([ADR-007](../../order-ingestion/#manual-orders)) and on the invoice made from it ([ADR-011](../../invoicing-and-vat/#what-a-document-holds)). It never reserves, picks or moves stock, and never reaches a pick list.
2. **Delivery is not a charge line.** It stays the order's delivery charge, and its VAT follows the goods ([ADR-011](../../invoicing-and-vat/#working-out-the-vat)).
3. **A marketplace listing that is not stock** (a warranty, gift wrap) is marked "not stock" with a VAT class instead of being linked ([ADR-005](../../catalogue-sync/spec/#12-unlinked-listings-and-going-live)). It gets no figure; its order lines import as charge lines and never wait for a link.
4. **No product kind, flag or setting** turns a product into a charge.

## 2. Fields

**`product`**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | uuidv7 | Yes | Never shown to sellers |
| `sku` | text | Yes | Section 3 |
| `name` | text | Yes | 1–200 characters. The seller's working name, not a marketplace title |
| `kind` | `simple`, `pack`, `bundle` | Yes | Section 6 |
| `status` | `active`, `inactive`, `retired` | Yes | Default `active`. Section 9 |
| `brand` | text | No | Up to 100 characters |
| `description` | text | No | Up to 2,000 characters. Internal; never sent to a channel |
| `base_unit` | text | Yes | What one unit is called: "piece" (default), "jar", "metre", "100 g". Up to 30 characters |
| `pack_of`, `units_per_pack` | product id, integer | Pack only | Section 6.2 |
| `family_id`, `option_1`–`option_3` | family id, text | In a family | Section 10. Values up to 50 characters |
| `tracks_best_before`, `date_kind`, `tracks_lot` | boolean, `best_before` or `use_by`, boolean | Yes | Section 12. Defaults from the company setting |
| `tracks_serial` | boolean | Yes | *Later* ([section 0](#0-at-launch-and-later)). Default off. Section 12 |
| `min_days_on_receipt` | integer | No | 1–3,650 |
| `min_days_to_sell` | integer | No; required for `use_by` | 0–3,650. Section 12 |
| `weight_g` | integer | No | Gross weight of one unit, 1–1,000,000 |
| `length_mm`, `width_mm`, `height_mm` | integer | No | Packed size of one unit, 1–10,000 each. All three or none |
| `hs_code` | text | No | Customs commodity code: 6, 8 or 10 digits, stored without dots or spaces |
| `country_of_origin` | text | No | ISO 3166-1 alpha-2, upper case |
| `un_number` | text | No | *Later.* A dangerous good's UN number: `UN` and 4 digits, such as `UN1950` for aerosols |
| `battery` | `none`, `in_equipment`, `with_equipment`, `alone` | No | *Later.* Whether and how a lithium battery travels, as carriers ask it |
| `min_age` | integer | No | *Later.* 16 or 18. The buyer's age a carrier must check on delivery (alcohol, knives) |
| `vat_class` | Section 11 | Yes | Default `standard` |
| `standard_cost`, `standard_cost_currency` | decimal (4 places), ISO 4217 | No; together | Expected cost of one unit, for planning before any batch exists. The company's currency at launch |
| `created_at`, `updated_at`, `version` | | Yes | Set by the data layer. An edit based on an older `version` is refused, so two people never overwrite each other unseen |

### 2.1 Numbers and money

1. Every quantity is an integer of base units. No decimal quantity type exists.
2. Weights and sizes are whole grams and millimetres, so no rounding reaches a courier label. Section 15 says how other units are entered.
3. A unit cost is a decimal with 4 places, never a floating-point number. Totals are rounded to the currency's minor unit only when a document is written.
4. Money always carries its currency; amounts in different currencies are never added ([ADR-000 SPEC 14](../../system-architecture/spec/#14-money-and-countries)).

### 2.2 Related tables

| Table | Fields | Rules |
| --- | --- | --- |
| `product_barcode` | product, box size (optional), code, kind (`gtin`, `internal`), original length, primary | Section 4 |
| `product_component` | bundle, component, quantity | Section 6.3 |
| `product_package` | product, name, units, weight, three sizes | Section 7 |
| `product_image` | product, source (`upload`, `marketplace`), source address, object key, position, width, height | Section 5. One row per product at launch |
| `product_family` | name, brand, option names 1–3, SKU pattern (*Later*) | Section 10 |
| `category`, `product_category` | name, parent, archived; product, category | *Later.* A tree per company, at most 4 levels, names unique among siblings. A product may sit in several |
| `tag`, `product_tag` | name; product, tag | Flat; names unique in the company whatever their case |
| `vat_rate` | country, class, rate in hundredths of a percent, valid from, valid to | Platform data in control, the same for every company (section 11) |
| `product_vat` | product, country, class | *Later* (section 0) |

### 2.3 Activity

Every change to a product, its barcodes, components or box sizes writes an activity entry: who, when, which field, the old value and the new value. A bulk change writes one per product.

## 3. SKU

1. 1–40 characters: letters, digits, `-`, `_`, `.`, `/`; no spaces at the ends. 40 fits every launch marketplace's listing SKU (section 16).
2. **Unique in the company whatever its case:** `HONEY-1` and `honey-1` cannot both exist, because people type SKUs and marketplaces compare them differently.
3. **Editable until first use, then fixed.** First use is the first ledger entry, listing link, purchase order line or order line. After it the SKU is on labels, documents and supplier emails.
4. **Never reused,** so old documents and reports still find their product.
5. **"Copy as new product"** copies every field except SKU and barcodes, links nothing and moves no stock. It is how a used SKU is changed: the seller relinks listings, moves stock with a recorded transfer, and retires the old product.

## 4. Barcodes

1. **Many per product:** the current barcode, an older one still on stock, and each box size's barcode.
2. **Normalised first:** spaces and hyphens are removed.
3. **The kind is worked out, never asked** (owner ruling, 21 October 2026). A code of only digits, 8, 12, 13 or 14 long, is a `gtin`. Anything else is `internal`: 4–40 letters and digits, with no check digit.
4. **A GTIN is checked and stored as 14 digits,** padded with leading zeros, so `5012345678900` and `05012345678900` are one code. The original length is kept for display. A wrong check digit (the GS1 modulo-10 check) is refused with the digit it should be, because it is almost always a typing error.
5. **Restricted numbers** (13-digit codes starting 20–29, 12-digit codes starting 2 or 4) are for in-store or internal use. They are accepted, marked as not unique worldwide, and never used to match a marketplace listing. Internal codes are never matched either.
6. **Unique in the company:** a code belongs to one product, or to one box size of one product.
7. **One primary barcode per product,** printed on labels and sent when a listing is created.

## 5. Images

1. Images are for people in the warehouse and in Vervoro. Shoppers see the listing's own photos.
2. **One main image per product at launch,** shown on pick lists and in search. *Later:* up to 10, position 0 being the main one.
3. **Uploads** go straight to object storage. Object keys are never overwritten; a replacement writes a new key.
4. **Marketplace images** are shown from their address at once and copied into object storage by a background job, because marketplace addresses change or vanish when a listing ends. The address is kept to show where it came from.

## 6. Product kinds

### 6.1 The three kinds

| | Simple | Pack | Bundle |
| --- | --- | --- | --- |
| What it is | One item | A sealed multiple of one simple product | Several products sold as one item |
| Own stock, batches and dates | Yes | Yes | No |
| What a sale uses | Its own stock | Its own stock | Its components' stock |
| Sellable | Its own | Its own | The scarcest component decides |
| Can be a component | Yes | Yes | No |

### 6.2 Pack

1. `pack_of` names one simple product; `units_per_pack` is 2–10,000. A pack of packs is refused: a case of four six-packs is a box size.
2. **Stock is separate.** A six-pack sale uses six-pack stock, never singles.
3. **Repacking** opens packs into singles or makes packs from singles. It takes one number, the packs opened or made, and the other side follows from `units_per_pack`, so base units never change. Both ledger entries are one transaction, and the new stock keeps the batch, dates, lot and landed cost per unit ([ADR-006](../../stock-ledger/spec/#6-what-a-line-reserves)).
4. **Assembly** of a product sealed from several others (a gift set Amazon needs as one labelled unit) makes a simple product of its own, through a manager's job that states every input ([ADR-006](../../stock-ledger/spec/#6-what-a-line-reserves)).
5. Six singles shipped loose in one parcel are a listing with six units per sale, not a pack. A pack exists only when a sealed pack sits on the shelf.

### 6.3 Bundle

1. **Components:** 1–20, each a simple product or a pack with a whole quantity of 1–1,000, and at least 2 units in all. Three of one product and nothing else is refused, with a pointer to units per sale = 3.
2. **Sellable is worked out, never stored:** for each component, its sellable divided by the quantity needed, rounded down; the bundle's is the smallest.
3. **A sale reserves whole sets of components,** in the same transaction; dispatch deducts the components ([ADR-006](../../stock-ledger/spec/#6-what-a-line-reserves)). Each component reserves its own earliest qualifying batch, and the line records each component's lot.
4. **Components still sell on their own,** from the same stock. When a component's sellable changes, every bundle using it and every listing linked to those bundles gets a new figure.
5. **Changing the components** applies to orders received afterwards. An open order keeps the components it was reserved with, recorded on its line.
6. **Cost** is the sum of the components' standard costs, worked out when read. **Weight and size** are entered for the packed bundle.
7. **A ledger entry against a bundle is refused** ([ADR-006](../../stock-ledger/)).

### 6.4 Changing a kind

The kind can change only before first use (section 3). After it, the seller creates a new product and retires the old one.

## 7. Box and pallet sizes

1. A box size says how many base units one case or pallet holds. It never holds stock: five cases of 12 received is 60 units in the ledger.
2. `units` is 2–100,000 and unique per product; names are unique per product. A box size has its own weight and three sizes.
3. Documents show "4 cases (48 units)" where a box size fits. Scanning a box size's barcode while receiving or counting adds its units.
4. A box sold to shoppers and kept on the shelf as one item is a pack product. A box that is only how goods arrive or travel is a box size.
5. A box size on one delivery belongs to that delivery's batch ([ADR-006](../../stock-ledger/)), because suppliers change them.

## 8. The link from a listing

Listings and how they are read and matched are [ADR-005](../../catalogue-sync/). The link is defined here because it decides how much stock a sale uses; Listings writes it and versions it ([ADR-005](../../catalogue-sync/spec/#11-linking)).

| Field | Rules |
| --- | --- |
| Listing | One live link per listing |
| Product | Any kind |
| Units per sale | 1–10,000 base units of the product per sale of the listing |
| Fulfilled by | `seller` or `marketplace` (Amazon FBA and similar) |

1. **One listing, one product;** a product may have any number of listings. A set of different products is a bundle.
2. **The listing's figure** is the product's sellable divided by units per sale, rounded down ([ADR-008](../../inventory-sync/)).
3. **One sale reserves** units per sale of the product; for a bundle, that many sets of its components.
4. **A listing that is not linked** reserves nothing; its orders are imported and flagged ([ADR-007](../../order-ingestion/#orders-for-unlinked-listings)). A listing marked not stock is section 1.1.

### 8.1 Amazon

1. **Shipped by Amazon:** a listing linked with `fulfilled_by = marketplace`. Vervoro reserves nothing and sends it no figure; its orders are for reports.
2. **Amazon's unit label** (FNSKU) identifies the listing, so it is stored on the listing. Scanning it finds the product through the link.
3. **Sending stock to Amazon** is a transfer, not a sale ([ADR-006](../../stock-ledger/)), and uses the product's box sizes, weight, sizes and dates.
4. *Later:* **Amazon Vendor** catalogue items link like listings with `fulfilled_by = seller`; units per sale is the base units in one item of Amazon's purchase order; an unlinked item stops its purchase-order line. Carton data comes from box sizes. The price Amazon pays is never on the product.

## 9. Status

| Status | Meaning | Purchasing |
| --- | --- | --- |
| `active` | Bought and sold | Suggested for reorder |
| `inactive` | Being sold off or paused | Not suggested |
| `retired` | Finished | Cannot be ordered |

1. **Status never stops stock sync.** A linked listing gets the sellable figure whatever the status, so no listing shows old stock.
2. **Retiring needs an empty product:** no stock, open reservations, open purchase orders or linked listings (an ended listing does not count, [ADR-005](../../catalogue-sync/)), and no bundle that is not retired uses it. The screen names what blocks it.
3. **Deleting** is allowed only before first use.

## 10. Sizes and colours

| `product_family` field | Rules |
| --- | --- |
| `name` | 1–200 characters |
| `brand` | Copied to new members |
| `option_1_name` | Required, up to 30 characters, such as "Size" |
| `option_2_name`, `option_3_name` | Optional; option 2 before option 3 |
| `sku_pattern` | *Later.* Optional, such as `{family}-{option_1}-{option_2}` |

1. **Members are simple products or packs;** a product is in at most one family.
2. **Every member has a value for every option,** and no two members share a combination.
3. **The family has no stock.** Its screen is a grid of members' sellable figures with totals.
4. *Later:* **Create as a grid:** the option values give one draft product per combination, with SKUs from the pattern and shared fields copied (brand, category, VAT class, commodity code, country of origin, weight). The seller adds barcodes and confirms. Adding a value later drafts the new members the same way.
5. *Later:* **Edit together:** a shared field changed on the family screen is written to each ticked member as a normal product change. Members may still differ.
6. **Listed as one variation listing,** while each variation links to one member ([ADR-005](../../catalogue-sync/spec/#11-linking)).
7. A product can move out of a family or into another; its stock and history do not change.
8. **At launch** members are created one at a time, by spreadsheet (family name and option values on the Products sheet), or from a variation listing ([ADR-005](../../catalogue-sync/spec/#11-linking)).

## 11. VAT

1. **The classes:** `standard`, `reduced`, `second_reduced`, `super_reduced`, `zero`, `exempt`. They cover every kind of rate UK and EU law allows (section 16). A country with a new kind of rate gets a class in a release, never free text.
2. **The rate table** is platform data in control, the same for every company, changed only by the operator ([runbook](../../runbooks/change-a-vat-rate/)). At launch it holds the UK's rows. Rows for one country and class never overlap or leave a gap, and a row whose dates have passed is never changed. A temporary rate is rows with their dates. A class a country lacks is not offered there.
3. **The screen shows the class with the home rate:** "Standard (20%)", "Zero (0%)", "Exempt".
4. **Zero is not exempt:** a zero-rated sale is taxable at 0% and is on the VAT return; an exempt sale is outside VAT.
5. **Every order line, charge line, invoice line and purchase order line** stores the country, class and rate it used; a later rate change never rewrites it. Which rate applies to a sale is [ADR-011](../../invoicing-and-vat/#vat-rates-and-classes).
6. **The class is the seller's decision.** Vervoro explains each class and never guesses one.
7. *Later:* a `product_vat` row sets a different class for one country; every other country uses the product's own.

## 12. Best-before, lot and serial numbers

Batches, dates and lots live on stock ([ADR-006](../../stock-ledger/spec/#4-dates-blocks-and-the-date-pass)); the product says only that they are required. The food-law constraints are ADR-006's.

1. **`tracks_best_before` on:** no stock enters (receiving, a count that finds stock, a return) without a date. Expired stock is never sellable or reserved. Stock with fewer than `min_days_to_sell` days left is held back from sale but stays on hand. Stock arriving with fewer than `min_days_on_receipt` days left needs a manager to accept it.
2. **`date_kind = use_by`** is a hard stop: `min_days_to_sell` is required and at least 1 plus the company's delivery days, and a use-by batch is never reserved, packed or dispatched on or after its date ([ADR-006](../../stock-ledger/#decision)).
3. **`tracks_lot` on:** no stock enters without a lot, and every dispatch records which lot went to which order line, bundles included. A recall is one search from the lot to every order, buyer country and date, and to the stock still on hand, which can be blocked at once.
4. **A pack follows its content product:** a six-pack of a dated product is dated too. Repacking keeps the batch, date and lot.
5. **Switching on while stock is on hand** flags that stock for a count to fill in the dates or lots. Until then it stays sellable, shown as missing them.
6. A company setting gives new products their defaults, so a food seller starts with both on.
Rules 7 and 8 are *Later* ([section 0](#0-at-launch-and-later)): kept here, built when a first customer needs serial tracking.

7. **`tracks_serial` on** (electronics, tools, bikes): each unit's serial number is recorded when it is packed, by a scan, and stored with the order line. A serial is unique per product among units shipped and not returned. A return of that product asks for the serial and checks it against the order's; a mismatch puts the return in front of a manager. Serials are not recorded at receipt or counted on the shelf. The stock side belongs to [ADR-006](../../stock-ledger/), which takes it when it is split.
8. Serial and lot tracking may both be on. A bundle records the serial of each serial-tracked component.

## 13. Creating products

Every route ends in the same validation and the same create command, and none creates a product without a person confirming it.

1. **On screen.** A scanned barcode is checked at once; if another product holds it, that product is shown.
2. **From a spreadsheet** (section 14).
3. **From a marketplace listing** or an unmatched order line: a draft filled from the listing, saved and linked in one step ([ADR-005](../../catalogue-sync/spec/#14-making-a-product-from-a-listing)). At first connection, drafts for every unlinked listing go into a workbook. Listings with the same barcode or SKU on different accounts become one draft; two on the same account never do, because one may be a multipack of the other.
4. *Later:* **From an Amazon product link or a bare 10-character ASIN:** Vervoro looks it up in Amazon's catalogue and fills name, brand, barcode, main image, weight and sizes where present. The ASIN is not stored on the product.

## 14. Spreadsheet import and bulk edit

One workbook serves export, bulk edit and bulk create.

1. **Sheets:** Products (one row each, with family name and option values), Bundle components, Box sizes and Barcodes, each keyed by SKU. Only Products is required.
2. **SKU is the match key,** whatever its case. A known SKU updates; a new SKU creates and must carry every required field.
3. **A blank cell or a missing column changes nothing.** To empty a field on purpose the cell holds `(clear)`. Spreadsheet programs drop and reorder columns; a blank read as empty would wipe data.
4. **Lists replace per product:** a product named on Bundle components, Box sizes or Barcodes gets exactly those rows; others keep theirs.
5. **Measure columns name their unit** in the heading ("Weight (g)", "Weight (oz)"). Either is read whatever the company's setting, and converted as in section 15.
6. **Preview first:** the whole file is checked before anything is written. The preview lists, per row, what is created, each field that changes (old and new value), and every error with its sheet, row and column.
7. **Errors never apply.** Rows with errors are skipped and can be downloaded with the error beside each; the valid rows are written in one transaction on confirm.
8. **Refused outright:** a SKU twice in one file; a component that is a bundle; a change of kind or SKU on a used product; a barcode another product holds.
9. **Up to 10,000 product rows per file.**

## 15. Units of measure

Owner ruling, 21 October 2026.

1. **A company setting, `metric` or `imperial`,** held with the company's settings ([ADR-010](../../users-and-access/spec/#4-who-may-do-what)). It defaults from the company's country: imperial for the United States, metric everywhere else, the UK included. Owners and Admins change it in Settings. It is never asked at sign-up.
2. **Storage never changes:** whole grams and millimetres, whatever the setting.
3. **Imperial entry:** weight in pounds and ounces, size in inches. 1 oz = 28.349523125 g; 1 in = 25.4 mm.
4. **Rounding on entry:** the converted value is rounded half up to the nearest whole gram or millimetre, and never below 1. The screen shows the stored value back in the person's units before saving.
5. **Display:** imperial weights to the nearest 0.1 oz (pounds and ounces from 1 lb), sizes to the nearest 0.1 in. Documents and labels use the same setting.
6. **Only a field a person changed is converted.** Saving a form, or importing a row, never rewrites an unchanged measure from its displayed value, so values never drift through repeated rounding.
7. **Selling by length or weight** uses the base unit (a metre, 100 g) in whole units; the setting does not change quantities.

## 16. Constraints

| Constraint | What it means here | Source |
| --- | --- | --- |
| GTIN check digit | The modulo-10 check refuses a mistyped barcode | [GS1: check digit calculation](https://www.gs1.org/services/how-calculate-check-digit-manually) |
| Restricted circulation numbers | 13-digit 20–29 and 12-digit 2 and 4 are local or in-store, not unique worldwide | [GS1 General Specifications, 2.1.11](https://www.gs1.org/standards/barcodes-epcglobal-tag-data/gs1-general-specifications), [GS1 prefixes 20–29](https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf) |
| Amazon seller SKU | At most 40 characters (unconfirmed with Amazon, see the ADR's open items) | Seller Central upload rules |
| VAT kinds of rate | A standard rate, up to two reduced rates, a super-reduced rate, zero and exempt | [Council Directive 2006/112/EC, Articles 98–99](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0112), [VAT Act 1994](https://www.legislation.gov.uk/ukpga/1994/23/contents) |
| Countries and currencies | Two-letter country codes; three-letter currency codes | ISO 3166-1, ISO 4217 |
| Commodity codes | 6 digits worldwide, 8 for exports, 10 for UK imports | [UK Trade Tariff](https://www.trade-tariff.service.gov.uk/) |

## 17. Tests that prove each rule

Database tests run on real Postgres under the runtime role ([ADR-000 SPEC 15](../../system-architecture/spec/#15-testing-and-verification)).

| Test | Proves |
| --- | --- |
| SKU | Two SKUs differing only in case are refused; a used SKU and a used kind cannot change; a retired SKU is never reused |
| Barcodes | Each length normalises to 14 digits and keeps its original length; a wrong check digit is refused with the right one; restricted and internal codes never match a listing; a code held by another product or box size is refused; no input asks for a barcode type |
| Pack | A pack of a pack or of a bundle is refused; a repack changes no total of base units |
| Bundle | Sellable equals the smallest component quotient; a bundle in a bundle, a single-product bundle and a ledger entry against a bundle are refused; an open order keeps its components after an edit |
| Box sizes | Scanning a box barcode adds its units; no box size has a balance |
| Families | A missing option value and a repeated combination are refused; a variation listing pairs with members by SKU or options |
| Status | Retiring is refused while any blocker holds, and each blocker is named; a retired product's linked listing still gets its figure until unlinked |
| Charge lines | A manual order with only charge lines reserves nothing and never reaches the pick list; a not-stock listing's order line imports as a charge line, gets a VAT record and never waits |
| Units | Imperial entry rounds half up to whole grams and millimetres; saving a form without touching a measure leaves it unchanged; an imperial-headed column imports for a metric company |
| Spreadsheet | A blank cell and a missing column change nothing; `(clear)` empties; a file with errors writes only its valid rows, all at once; a SKU twice in a file is refused |
| Serials (*Later*) | A serial-tracked unit cannot be packed without a serial; a serial already shipped and not returned is refused; a return with a different serial goes to a manager |
| Concurrent edits | An edit on an older `version` is refused |
| VAT | A rate change writes no past line; a class with no rate in a country is not offered there |

## How to check it was built right

For someone reviewing code an AI wrote. Each line says where to look.

- [ ] **Writers:** only the Products module writes the tables in section 2; the link is written only by Listings (search the other modules for inserts into them).
- [ ] **No SQL:** the module's queries all go through the typed query builder; no `sql` or `raw` import in the module.
- [ ] **Quantities:** every quantity column is an integer; no decimal or float quantity type in the schema or the domain types.
- [ ] **Measures:** weight and size columns are integers in grams and millimetres; conversion lives in one function used by forms, imports and display.
- [ ] **No drift:** the product update command writes only fields present in the change set; the units test is green.
- [ ] **SKU:** the unique index is on the company and the lower-cased SKU; the update command checks first use before a SKU or kind change.
- [ ] **Barcodes:** one normalise-and-check function used by the form, the import and the scan; no barcode type field on any form.
- [ ] **Bundles:** no stored sellable for a bundle; the ledger's insert refuses a bundle; component kinds checked in the same transaction as the write.
- [ ] **Packs:** the repack command takes one number and writes both entries in one transaction.
- [ ] **Charge lines:** no product kind, flag or setting for services; charge lines have no product id and no path into reservations or pick lists.
- [ ] **VAT:** lines store country, class and rate; nothing reads a rate from the product; the rate table is read from control, never copied into cells.
- [ ] **Version:** every update command compares `version` and raises it.
- [ ] **Spreadsheet:** blank means unchanged in the parser, `(clear)` is the only way to empty; the preview and the write share one validation; the write is one transaction.
- [ ] **Activity:** every product command writes an activity entry with old and new values.
- [ ] **Images:** one per product; marketplace images are copied to object storage; no key is overwritten.
- [ ] **Later parts:** no `product_vat` table, Vendor link, second cost currency, `tracks_serial`, `un_number`, `battery` or `min_age`, category tree, second image, family grid or ASIN lookup at launch.
