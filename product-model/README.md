# ADR-003: Product model

| | |
| --- | --- |
| **Status** | Proposed |
| **Date** | 17 October 2026 |
| **Scope** | What a product is, which fields it has, how packs, bundles, box sizes and size or colour families behave, how VAT and best-before apply, and how products are created |
| **Builds on** | [ADR-001: Multi-tenant database architecture](../database-architecture/) |

## Context

A seller keeps one list of the things they stock and sell. Every other part of Vervoro hangs off that list: stock and its ledger, purchase orders, order lines, and the listings on Amazon, eBay, Shopify and other channels. If the product list is wrong, every channel shows the wrong number.

The design has to meet these requirements:

- **One product, many listings.** One jar of honey may be sold as a single on Amazon, shipped by the seller, as a single shipped by Amazon, and as a six-pack on eBay. All of them draw on the same stock.
- **Three things are called a "pack".** A listing that sells six singles at once, a sealed six-pack that sits on the shelf with its own stock, and a gift set made of different products. Mixing them up either double-counts stock or never deducts it.
- **Box and pallet sizes** appear on documents ("4 cases, 48 units") but must never change a stock count.
- **Four codes, four owners.** The seller's SKU, the manufacturer's barcode, the marketplace's own product code (such as an ASIN) and the supplier's code identify different things. The product model must keep them apart.
- **Sellers arrive with a catalogue.** A typical company has 100 to 5,000 SKUs, already listed on one or more marketplaces and often kept in a spreadsheet. Creating products one by one is not an option.
- **Phone first.** Warehouse staff scan barcodes on phones, so a scan must resolve to exactly one thing.
- **Sizes and colours.** A seller of shoes or clothes sells one design in many sizes and colours. Each size is counted and reordered on its own, but the seller thinks of, creates and lists the design as one thing.
- **Food.** For food, best-before dates and lot numbers are not optional: expired stock must never be sold, and a recall must find every order that received a lot.
- **VAT** depends on the product and on the country of sale, and rates change.

Existing ERP practice for warehouse-run sellers informed the field list and the pack and bundle rules below: components with a quantity, a sellable figure set by the scarcest component, repack jobs between a pack and its singles, and spreadsheet edits where a blank cell changes nothing.

## Decision

1. **A product is one thing the seller stocks or sells, counted in whole base units.** Every quantity anywhere in Vervoro is an integer number of base units of one product.
2. **The SKU is the seller's permanent name for a product,** unique within the company. It can be corrected until the product is first used, then it is fixed, and it is never reused.
3. **A product has one of three kinds,** fixed at creation: **simple** (its own stock), **pack** (a sealed multiple of one simple product, with its own stock) and **bundle** (a set of other products, with no stock of its own). Bundles are one level deep.
4. **Barcodes are their own records,** many per product. Each is normalised, checked against the GTIN check digit, and unique within the company, so a scan always resolves to one product or one box size.
5. **Box and pallet sizes are package configurations** on a product. They convert between cases and units on documents and when scanning. They never hold stock.
6. **A listing links to exactly one product,** with the number of units one sale uses and who ships it. A set of different products is sold through a bundle, never by linking one listing to several products. Amazon-shipped (FBA) listings and Amazon Vendor catalogue items link to products the same way.
7. **Sizes and colours are product families.** Each size or colour is its own product with its own SKU, barcode and stock. A family groups them under one name, with up to three options (such as size and colour), so they are created as a grid, edited together and listed as one variation listing.
8. **VAT is a class on the product, and the rate comes from a per-country table.** The screen shows "Standard (20%)". Every order and invoice line stores the rate it used.
9. **Best-before and lot tracking are switched on per product.** When on, no stock enters without them, expired stock is never sellable, and every dispatch records which lot went to which order.
10. **The product holds no selling price.** Prices live on listings and belong to the channel. The product holds a standard cost for planning; real cost lives on each batch.
11. **Products are created four ways,** all through the same validation: one at a time on screen, by spreadsheet, from a marketplace listing, and from an Amazon ASIN. Nothing is created without a person confirming it.

## What a product is

A product is the unit the warehouse counts. If a picker can pick it and a stock count can count it, it is a product. If it is only a way of offering or grouping products (a six-pack listing, a family of sizes, a price), it is not.

**What a product holds:** identity (SKU, name, barcodes), its kind and composition, the physical facts a warehouse and a courier need (weight, dimensions), whether it needs best-before dates and lot numbers, the facts customs and tax need (commodity code, country of origin, VAT class), a standard cost, and how it is grouped (family, categories, tags).

**What a product does not hold:**

| Data | Lives with | Why |
| --- | --- | --- |
| Stock levels, batches, best-before dates, landed cost | Stock ledger and batches (ADR-006) | Stock changes only through ledger entries; a counter on the product would drift |
| Selling price, title and photos shown to shoppers | Listings (ADR-005) | Each channel has its own; Vervoro never sets a selling price |
| Marketplace product codes (ASIN, item id) | Listings (ADR-005) | They identify a marketplace page, not the physical item |
| Supplier codes, supplier pack sizes, lead time, reorder point, minimum order | Purchasing | They differ per supplier |

## Product fields

All tables are declared through `tenantTable()` (ADR-001), so every row also carries `company_id` and every key leads with it. IDs are uuidv7.

**`product`**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | uuid | Yes | uuidv7, never shown to sellers |
| `sku` | text | Yes | 1–40 characters: letters, digits, `-`, `_`, `.`, `/`. No spaces at the ends. Unique within the company, ignoring case. See "SKU" below |
| `name` | text | Yes | 1–200 characters. The seller's working name, not a marketplace title |
| `kind` | enum `simple`, `pack`, `bundle` | Yes | Fixed once the product is used |
| `status` | enum `active`, `inactive`, `retired` | Yes | Default `active`. See "Status" below |
| `brand` | text | No | Up to 100 characters |
| `description` | text | No | Up to 2,000 characters. Internal notes on the product; never sent to a channel |
| `base_unit` | text | Yes | What one unit is called on documents: "jar", "piece", "bottle". Default "piece" |
| `pack_of` | uuid → `product` | For `pack` only | The simple product inside the pack. Must be `simple` |
| `units_per_pack` | integer | For `pack` only | 2–10,000 |
| `family_id` | uuid → `product_family` | No | See "Sizes and colours" |
| `option_1`, `option_2`, `option_3` | text | In a family | This product's value for each of the family's options, such as `42` and `Black`. Up to 50 characters each |
| `tracks_best_before` | boolean | Yes | Default from the company setting (on for food sellers). See "Best-before and lot numbers" |
| `tracks_lot` | boolean | Yes | Default from the company setting. See "Best-before and lot numbers" |
| `min_days_on_receipt` | integer | No | 1–3,650. Stock arriving with fewer days to its best-before needs a manager to accept it |
| `min_days_to_sell` | integer | No | 0–3,650. Stock with fewer days left is held back from sale. Blank means sellable until the best-before date |
| `weight_g` | integer | No | Gross weight of one unit in grams, 1–1,000,000 |
| `length_mm`, `width_mm`, `height_mm` | integer | No | Packed size of one unit in millimetres, 1–10,000. All three or none |
| `hs_code` | text | No | Customs commodity code: 6, 8 or 10 digits, stored without dots or spaces |
| `country_of_origin` | text | No | ISO 3166-1 alpha-2, upper case |
| `vat_class` | enum `standard`, `reduced`, `second_reduced`, `super_reduced`, `zero`, `exempt` | Yes | Default `standard`. See "VAT" |
| `standard_cost` | decimal, 4 places | No | Expected cost of one unit in the currency's main unit: `14.99` means 14.99 US dollars when the currency is `USD`. Up to 4 decimal places, because a unit can cost a fraction of a penny. For planning and margin estimates before any batch exists |
| `standard_cost_currency` | text | With `standard_cost` | ISO 4217 |
| `created_at`, `updated_at` | timestamptz | Yes | Set by the data layer |
| `version` | integer | Yes | Raised on every change; an edit based on an older version is refused, so two people cannot overwrite each other unseen |

Weight and dimensions are integers in grams and millimetres, so no rounding ever reaches a courier label. Money always travels with its currency, and amounts in different currencies are never added. A unit cost is a decimal with 4 places, never a floating-point number, because cheap items and shared freight produce fractions of a penny. Totals on documents (orders, invoices) are rounded to the currency's own minor unit only when the document is written.

**Related tables**

| Table | Fields | Rules |
| --- | --- | --- |
| `product_barcode` | `product_id`, `package_id` (nullable), `code`, `kind` (`gtin`, `internal`), `is_primary` | See "Barcodes" |
| `product_component` | `bundle_id`, `component_id`, `quantity` (integer) | See "Bundles" |
| `product_package` | `product_id`, `name`, `units`, `weight_g`, `length_mm`, `width_mm`, `height_mm` | See "Box and pallet sizes" |
| `product_image` | `product_id`, `source` (`upload`, `marketplace`), `source_url`, `object_key`, `position`, `width`, `height` | See "Images" |
| `product_family` | `name`, `brand`, `option_1_name`, `option_2_name`, `option_3_name`, `sku_pattern` | See "Sizes and colours" |
| `product_vat` | `product_id`, `country`, `vat_class` | A class for one country that differs from the product's own. See "VAT" |
| `category` | `name`, `parent_id`, `archived` | A tree per company, at most 4 levels. Names unique among siblings |
| `product_category` | `product_id`, `category_id` | A product may sit in several categories |
| `tag` | `name` | Flat. Names unique within the company, ignoring case |
| `product_tag` | `product_id`, `tag_id` | |

Every change to a product, its barcodes, components or packages writes an activity entry: who, when, which field, the old value and the new value.

## SKU

The SKU is the seller's own code for a product, and the key every spreadsheet, scan and support conversation uses.

- **Unique within the company, ignoring case.** `HONEY-1` and `honey-1` cannot both exist, because sellers type SKUs by hand and marketplaces compare them differently.
- **At most 40 characters,** so a product SKU can always be used as a listing SKU on every connected marketplace.
- **Editable until first use, then fixed.** First use is the first ledger entry, listing link, purchase order line or order line. Before that, a typo can be corrected. After that, the SKU appears on documents, labels and supplier emails, and changing it would break them.
- **Never reused.** A retired product keeps its SKU, so old documents and reports still resolve to the right product.
- **To change a used SKU, make a new product.** "Copy as new product" copies every field except SKU and barcodes, links nothing, and moves no stock. The seller relinks listings, moves stock with a recorded transfer if needed, and retires the old product.

## Barcodes

A barcode identifies the physical item. It is what a picker scans.

- **Many per product.** A product may carry its current barcode, an older one still on stock in the warehouse, and the barcode of each box size.
- **Normalised before anything else.** Spaces and hyphens are removed. A GTIN is stored as 14 digits, padded with leading zeros, so `5012345678900` and `05012345678900` are the same code. The original length is kept for display.
- **Checked.** A `gtin` code must be 8, 12, 13 or 14 digits with a valid check digit (the standard modulo-10 check). A wrong check digit is refused with the digit it should have been, because it is almost always a typing error.
- **Restricted numbers are flagged.** 13-digit codes starting 20–29, and 12-digit codes starting 2 or 4, are for in-store or internal use. They are accepted, marked as not unique worldwide, and never used to match a product to a marketplace listing.
- **Internal codes.** A seller's own labels may use codes that are not GTINs. These are `internal`: any 4–40 letters and digits, not check-digit tested, and never used for marketplace matching.
- **Unique within the company.** A code belongs to one product, or to one box size of one product. A scan therefore never has to ask "which one?".
- **One primary barcode per product.** It is the one printed on labels and sent when a listing is created.

## Images

A product's images are for people in the warehouse and in Vervoro: recognising the item when picking, checking a match. What a shopper sees is the listing's own photos, managed in the channel.

- **Two sources.** An image is uploaded by the seller (`upload`), or taken from a marketplace listing or catalogue entry (`marketplace`) when a product is created from one.
- **Marketplace images are copied in.** The image is shown from `source_url` at once, and a background job copies it into Vervoro's object storage (`object_key`). Marketplace image links change or disappear when a listing ends, so a product never depends on one. `source_url` is kept to show where it came from.
- **Uploads** go straight to object storage. Object keys are never overwritten; replacing an image writes a new key.
- **Up to 10 per product.** Position 0 is the main image, shown on pick lists and in search.

## Product kinds

| | Simple | Pack | Bundle |
| --- | --- | --- | --- |
| What it is | One single item | A sealed multiple of one simple product, sold as its own item | Several products sold together as one item |
| Own stock | Yes | Yes | No |
| Batches and best-before | Yes | Yes | No |
| What a sale uses | Its own stock | Its own stock | Its components' stock |
| Sellable | Its own sellable | Its own sellable | The scarcest component decides |
| Can be a bundle component | Yes | Yes | No |

### Simple

A simple product is one item on the shelf: one jar, one bottle, one cable. Most products are simple.

### Pack

A pack is a physical product that holds a fixed number of one simple product: a shrink-wrapped six-pack with its own barcode. It sits on the shelf as its own item, so it has its own stock, batches and best-before dates.

- **One content product.** `pack_of` points at a simple product; `units_per_pack` says how many. A pack of packs is not allowed: a case of four six-packs is a box size, not a product.
- **Stock is separate.** Selling a six-pack uses six-pack stock, never singles. Ten six-packs on the shelf are ten packs, not sixty singles, until someone opens them.
- **Repacking moves stock between the two.** A repack job takes a number of packs and produces `units_per_pack` times as many singles (opening packs), or the reverse (making packs). It writes both ledger entries in one transaction, so the total number of base units never changes. The new stock keeps the batch, best-before date and landed cost per unit of the stock it came from.
- **When to use a pack, and when not.** If the seller ships six singles loose in one parcel, that is a listing with six units per sale, not a pack. A pack exists only when a sealed pack physically sits on the shelf.

### Bundle

A bundle (also called a kit or set) is several products sold as one item: a gift set of one jar of honey and two jars of jam. Nobody counts bundles on the shelf, so a bundle has no stock of its own.

- **Components.** Each component is a product and a whole-number quantity, 1–1,000. A bundle has 1 to 20 components, and at least 2 units in total. A "bundle" of three of the same product with nothing else is refused, with a pointer to the right tool: a listing with three units per sale.
- **One level deep.** A component must be simple or a pack, never another bundle. This keeps the sellable figure one step from real stock and makes a cycle impossible.
- **Sellable is worked out, never stored.** For each component, divide its sellable by the quantity the bundle needs and round down; the bundle's sellable is the smallest result. If bundle A is 1 × B plus 2 × C, and 10 B and 20 C are sellable, A can sell min(10 ÷ 1, 20 ÷ 2) = 10 times.
- **A sale reserves the components.** An order for one bundle reserves one honey and two jam, against their batches, in the same transaction. Dispatch deducts the components.
- **Components still sell on their own.** B and C keep their own listings. Selling A uses B and C stock, and selling B on its own lowers what A can sell. In the example, selling 4 B on their own leaves A able to sell 6.
- **One stock serves every use.** Honey sold on its own and honey sold in the bundle draw on the same stock. When a component's sellable changes, every bundle that uses it gets a new sellable, and every listing linked to those bundles is told.
- **Changing a bundle's components** applies to orders received afterwards. An open order keeps the components it was reserved with, recorded on the order line, so editing a bundle never strands or doubles a reservation.
- **Cost and weight.** A bundle's standard cost is the sum of its components' standard costs, worked out when read. Its weight and dimensions are entered for the packed bundle, because the gift box adds both.
- **No bundle stock, ever.** A ledger entry against a bundle is refused.
- **Best-before and lots come from the components.** Picking a bundle picks each component's earliest best-before batch, and the order line records each component's lot.

### Changing a product's kind

A product's kind can be changed only before first use. After that, stock history, listings and orders depend on it, so the seller creates a new product and retires the old one.

## Box and pallet sizes

A package configuration says how many base units come in one box, case or pallet of a product: "case of 12", "pallet of 480". It is a handling unit, not a product.

- **Never stock.** Stock is always counted in base units. Five cases of 12 received is 60 units in the ledger, nothing else.
- **On documents.** Purchase orders, delivery notes and pick lists show "4 cases (48 units)" where a configuration fits.
- **When scanning.** A configuration may carry its own barcode, usually a 14-digit GTIN. Scanning it while receiving or counting adds the configuration's units.
- **Rules.** `units` is a whole number, 2–100,000, unique per product. Names are unique per product. A configuration has its own weight and dimensions for shipments and pallet planning.
- **Box size versus pack.** If the box is sold to a shopper as one item and sits on the shelf as one item, it is a pack product. If it is only how goods arrive or travel, it is a box size.

Units per box on a particular delivery belong to that delivery's batch (ADR-006), because a supplier may change box sizes between deliveries.

## Linking listings to products

A listing is one offer on one channel account. Listings themselves, how they are read and how they are matched, are ADR-005 (catalogue sync and linking). The link from a listing to a product is defined here, because it decides how much stock a sale uses.

**`listing_link`**

| Field | Type | Rules |
| --- | --- | --- |
| `listing_id` | uuid | One link per listing |
| `product_id` | uuid → `product` | Any kind |
| `units_per_sale` | integer | 1–10,000. How many base units of the product one sale of this listing uses |
| `fulfilled_by` | enum `seller`, `marketplace` | Who ships orders for this listing. `marketplace` is FBA and similar programmes |

- **One listing, one product.** A listing that sells a set of different products links to a bundle. This keeps every order line resolvable to one product.
- **Many listings, one product.** A product may have any number of listings across channels and accounts.
- **What the listing shows.** The product's sellable divided by `units_per_sale`, rounded down. A six-unit listing on 86 sellable singles shows 14.
- **What a sale uses.** One sale of the listing reserves `units_per_sale` units of the product. For a bundle, that is `units_per_sale` bundles' worth of each component.
- **Marketplace-shipped listings.** When the marketplace ships from its own warehouse, Vervoro reserves nothing and sends no quantity to that listing; its orders are recorded for reporting only.
- **Unlinked listings.** An order for a listing with no link is imported and flagged, and reserves nothing until someone links it.

## Amazon: FBA and Vendor

Both are ways of selling a product, so they live on the listing side. The product model needs nothing of its own for them beyond the fields above.

**Shipped by Amazon (FBA)**

- An FBA offer is a listing linked to the product with `fulfilled_by = marketplace`, usually under its own SKU. The same product can also have seller-shipped listings.
- Vervoro reserves no own stock for an FBA order and never sends a quantity to an FBA listing, because Amazon ships from its own stock. FBA orders are recorded for reports.
- Amazon's own unit label (the FNSKU) identifies the listing, not the product, so it is stored on the listing. Scanning an FNSKU label in the warehouse resolves through the listing's link to the product.
- Sending stock to Amazon is a transfer out of the warehouse, not a sale (ADR-006). It uses the product's box sizes for cartons, its weight and dimensions, and for dated products its best-before dates, which Amazon checks against its own minimum.

**Amazon Vendor (Amazon buys wholesale)**

- Each item Amazon buys is a Vendor catalogue entry on the Vendor account, linked to a product like any listing, with `fulfilled_by = seller`, because the seller ships cartons to Amazon. `units_per_sale` says how many base units one item on Amazon's purchase order is.
- Amazon's purchase orders name items by ASIN or barcode. They resolve through the catalogue entry to the product. An item with no link stops the purchase order line until a person links it, as an unmatched order line does.
- Vendor shipping needs carton data: the case size (a box size with its own 14-digit barcode), carton weight and dimensions, and pallet sizes. These are the product's box sizes.
- The price Amazon pays is on the Vendor catalogue entry and its purchase orders, never on the product.


| Status | Meaning | Stock sync | Purchasing |
| --- | --- | --- | --- |
| `active` | Bought and sold | Linked listings get its sellable | Suggested for reorder |
| `inactive` | Being sold off or paused | Linked listings still get its sellable | Not suggested for reorder |
| `retired` | Finished | No linked listings remain | Cannot be ordered |

- **Status never stops stock sync.** While a listing is linked, it is told the sellable figure, whatever the product's status. A product that stopped updating its listings would leave them showing old stock and selling it.
- **Retiring needs an empty product:** no stock on hand, no open reservations or purchase orders, no linked listings, and not a component of any bundle that is not retired. The screen says which of these blocks it.
- **Deleting** is allowed only before first use. A used product is retired, never deleted, so history keeps pointing at it.

## Sizes and colours

A shoe in sizes 40 to 45 is six products in one family. Each size is a product, because each is picked, counted, reordered and runs out on its own. The family is what the seller sees and works with as one design.

**`product_family`**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | text | Yes | 1–200 characters, such as "Trail runner" |
| `brand` | text | No | Copied to new members |
| `option_1_name` | text | Yes | Such as "Size". Up to 30 characters |
| `option_2_name`, `option_3_name` | text | No | Such as "Colour", "Width". Option 2 before option 3 |
| `sku_pattern` | text | No | How member SKUs are made, such as `{family}-{option_1}-{option_2}` |

**Rules**

- **Members are simple products or packs,** never bundles. A product belongs to at most one family.
- **Every member has a value for every option the family has,** and no two members share the same combination. A family with size and colour cannot hold two "42 Black".
- **The family has no stock.** Its screen shows a grid: one row per colour, one column per size, each cell the member's sellable, with row and family totals.
- **Create as a grid.** The seller names the family, enters the option values (sizes 40–45, colours Black and White) and gets one draft product per combination, here 12. SKUs come from the pattern, and shared fields (brand, category, VAT class, commodity code, country of origin, weight) are copied in. The seller adds each member's barcode, by scanning or in a spreadsheet, and confirms.
- **Add a size later** by adding a value; the new members are drafted the same way.
- **Edit together.** A change to a shared field on the family screen is written to every member the seller ticks, each as a normal product change with its own activity entry. Members can still differ: a larger size may weigh more.
- **Listing as one.** A family can be published or linked as one variation listing: an Amazon parent with children, an eBay listing with variations, a Shopify product with variants (ADR-005). Each child listing still links to exactly one member product, so stock and orders work as for any product.
- **Leaving a family.** A product can be moved out of a family or into another; its stock and history do not change.

## VAT

The product holds a VAT class, not a rate. The rate comes from a reference table of rates per country.

- **Why not the rate on the product.** One product sold in several countries has several rates: a standard-rate item is 20% in the UK and 19% in Germany. Rates also change by law. A class on the product and one rate table means a rate change is one edit, not thousands.
- **The rate table** (`vat_rate`: `country`, `vat_class`, `rate` in hundredths of a percent, `valid_from`, `valid_to`) is the same for every company. The operator maintains it for each country Vervoro supports. Classes a country does not have are not offered for that country.
- **Why the class is a fixed list.** Countries differ in their rates, not in the kinds of rate. UK and EU law allow a standard rate, up to two reduced rates, a super-reduced rate, zero and exempt, and the six classes cover that. A fixed list lets every screen, report and VAT return group by class across countries. A country with a kind of rate the list lacks gets a new class in a release, not free text per product.
- **What the seller sees.** The class with the rate for the company's home country: "Standard (20%)", "Reduced (5%)", "Zero (0%)", "Exempt".
- **Zero is not exempt.** A zero-rated sale is taxable at 0% and appears on a VAT return; an exempt sale is outside VAT. Food and children's clothes are often zero-rated in the UK.
- **Different in another country.** When a product's class differs in one country (children's clothes are zero-rated in the UK but standard in Germany), a `product_vat` row sets the class for that country. Every other country uses the product's own class.
- **Each document keeps its rate.** Every order line, invoice line and purchase order line stores the country, class and rate it used. A later rate change never rewrites a past document.

Example of the rate table:

| Country | Class | Rate |
| --- | --- | --- |
| GB | standard | 20% |
| GB | reduced | 5% |
| GB | zero | 0% |
| GB | exempt | none |
| DE | standard | 19% |
| DE | reduced | 7% |

## Best-before and lot numbers

For food, cosmetics and supplements, the best-before date and the lot number are what keep a buyer safe. Two switches on the product decide what the warehouse must record. A company setting gives new products their default, so a food seller has both on from the start.

**`tracks_best_before` on:**

- No stock enters without a best-before date: receiving, a stock count that finds new stock, and a return each ask for it.
- The earliest best-before goes first when stock is reserved and picked. A manager can override it, and the override is recorded.
- Expired stock is never sellable and never allocated.
- `min_days_to_sell` holds stock back earlier: with 30, stock with fewer than 30 days left is no longer sellable, so a buyer never receives a jar that expires on arrival. It stays on hand to be written off, sold off by hand or returned to the supplier.
- `min_days_on_receipt` protects the seller from short-dated deliveries: stock arriving with fewer days left needs a manager to accept it.

**`tracks_lot` on:**

- No stock enters without a lot number.
- Every dispatch records which lot went to which order line, bundles included.
- A recall is one search: the lot number gives every order, buyer country and date that received it, and the stock of that lot still on hand, which can be blocked from sale at once.

**Both switches:**

- Batches, best-before dates and lots live on the stock, not the product (ADR-006). The product only says they are required.
- A pack follows its content product: a six-pack of a dated product is dated too.
- Repacking keeps the batch, best-before date and lot of the stock it came from.
- Turning a switch on while stock is on hand flags that stock for a count, where the missing dates or lots are filled in. Until then it is still sellable but shown as missing them.

## How products are created

Every route ends in the same validation and the same create command. None of them creates a product without a person confirming it.

1. **On screen.** The seller fills in the form. A scanned barcode is checked at once and, if it belongs to another product, that product is shown.
2. **From a spreadsheet** (below), for many products at once.
3. **From a marketplace listing.** From an unlinked listing or an unmatched order line, "make a product from this" fills a draft from the listing: SKU from the listing's SKU, name, brand, barcode, main image and weight where the channel has them. The person checks it, saves, and the listing is linked in the same step. When a channel is first connected, catalogue onboarding pulls drafts for every unlinked listing into a workbook, which then imports like any spreadsheet. Listings with the same barcode or SKU on different accounts become one draft. Two listings on the same account never do, because one may be a multipack of the other.
4. **From an Amazon link or ASIN.** The seller pastes a product link or a bare 10-character ASIN. Vervoro looks it up in the marketplace catalogue and fills in name, brand, barcode, main image, weight and dimensions where available. The person checks the draft before it is created. The ASIN is not stored on the product; it is a listing identifier.

## Spreadsheet import and bulk edit

One workbook format serves export, bulk edit and bulk create.

- **Sheets:** Products (one row per product, with family name and option values), Bundle components (bundle SKU, component SKU, quantity), Box sizes (SKU, name, units, barcode), Barcodes (SKU, code). Only the Products sheet is required.
- **SKU is the match key.** A row whose SKU exists updates that product. A row whose SKU is new creates a product, and then must carry every required field. Matching ignores case.
- **A blank cell means "leave alone", never "clear".** Spreadsheet programs drop and reorder columns, and a blank read as "empty" would quietly wipe data nobody meant to touch. To empty a field on purpose (for example, to remove a brand from 50 products), the cell holds the word `(clear)`. A missing column is also left alone.
- **Lists replace per product.** For a bundle or product that appears on the Bundle components, Box sizes or Barcodes sheet, those rows become its whole list. Products not on the sheet keep theirs.
- **Preview first.** Every import is checked in full before anything is written. The preview lists, per row, what will be created, each field that will change (old and new value), what is unchanged, and every error with its sheet, row and column.
- **Errors never apply.** Rows with errors are skipped; the seller can download them with the error beside each row, fix them and import again. The valid rows are written in one transaction when the seller confirms, so an import never lands half-done.
- **Refused outright:** a SKU twice in one file, a bundle component that is itself a bundle, a change of kind or SKU on a used product, a barcode already held by another product.
- **Limits.** Up to 10,000 product rows per file. Larger catalogues import in several files.

## Validation summary

| Rule | Where it is enforced |
| --- | --- |
| SKU unique within the company, ignoring case | Unique index on `(company_id, lower(sku))` |
| Barcode unique within the company | Unique index on `(company_id, code)` over the normalised code |
| GTIN check digit | Create and update command, before the write |
| Pack points at a simple product; `units_per_pack` ≥ 2 | Command, plus a check constraint on the pack fields |
| Bundle components are simple or packs, 1–20 of them, at least 2 units | Command, in the same transaction as the write |
| No ledger entry against a bundle | Stock ledger (ADR-006) refuses it |
| Kind and SKU fixed after first use | Command checks for history before changing either |
| Retire only an empty product | Command checks stock, reservations, purchase orders, links and bundles |
| Family members have every option value, no two the same combination | Unique index on `(company_id, family_id, option_1, option_2, option_3)`, plus the command |
| Best-before or lot required when switched on | Stock ledger (ADR-006) refuses an entry without them |
| A document line's VAT rate never changes | Stored on the line when it is written |
| All quantities are whole base units | Integer columns everywhere; no decimal quantity type exists |

## Consequences

**What this gives us**

- One stock number per physical thing. Packs, bundles, box sizes and multi-unit listings each have one rule, so nothing is counted twice or never deducted.
- A scan always resolves to one product or one box size.
- Every channel's figure comes from one formula: the product's sellable, divided by units per sale.
- Spreadsheets are safe to round-trip: blank cells change nothing, and every change is previewed.
- Customs, tax and courier data sit on the product once, for every channel; VAT rates change in one table.
- A shoe or clothing range is created, edited and listed as one family, while each size keeps its own stock.
- Food sellers can prove which lot went to which buyer, and never sell expired stock.

**What it costs**

- A bundle's sellable is computed from its components, so one component sale updates every bundle using it and every listing linked to those bundles. That fan-out must stay fast.
- A SKU or kind mistake found after first use means a new product and a retired one, not an edit.
- The operator maintains VAT rates for every supported country.
- With lot tracking on, every receipt and every dispatch asks one more question of warehouse staff.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A variant as a second level under the product, with stock on the variant | Every stock rule, scan and order line would need to know two levels; a family over ordinary products gives the same grid with one stock rule |
| No grouping of sizes at all | A range of 12 sizes and colours would be 12 unrelated products to create, edit and list one by one |
| VAT rate stored on the product | One product sold in several countries has several rates, and a rate change would edit every product |
| Best-before and lot always required | General goods have neither; asking for them on every receipt slows warehouses that do not need them |
| Nested bundles (a bundle inside a bundle) | Sellable becomes a recursive calculation, cycles become possible, and reservation fans out unpredictably; flatten the inner bundle instead |
| A listing linked to several products | Every order line would split into several products; a bundle does the same job with one link |
| Box sizes as products with their own stock | A case and its units would both hold stock, so the same goods count twice unless every move is mirrored |
| Treating a pack as its singles, computed like a bundle | A sealed pack on the shelf would not be countable, and opening packs could not be recorded |
| One barcode field on the product | No room for an old barcode still in stock or for box barcodes; scans would miss |
| Unit cost as an integer of pennies | Cheap items and shared freight give costs of a fraction of a penny, which would be rounded away |
| Linking marketplace images by URL only | Marketplace image links change or vanish when a listing ends |
| Selling price on the product | Prices differ per channel and belong to the channel; Vervoro never sets a selling price |
| Fractional quantities (for example, 0.5 of a component) | Shelves hold whole items; fractions bring rounding into every stock figure |
| A blank spreadsheet cell clears the field | One dropped column would wipe data for every product in the file |
| SKU editable at any time | Documents, labels and supplier emails already carry it; old records would point at a code that no longer exists |
