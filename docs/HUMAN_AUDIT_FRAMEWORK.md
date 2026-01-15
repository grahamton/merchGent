# The Persuasive Store: Ecommerce Experience Audit Framework

> **Core Philosophy**: A high-converting store is not just "functional"; it is "persuasive". It guides customers through a logical, trustworthy experience from discovery to purchase.

## 1. The Foundation: Building Trust with Logic-First Product Data

**Why**: Clean, structured data is the engine of discovery. If a user can't filter by it, it doesn't exist.

| Core Data Area        | Assessment Criteria                                                                 | Business Impact                         |
| :-------------------- | :---------------------------------------------------------------------------------- | :-------------------------------------- |
| **Titles & Taxonomy** | Clear, scannable, include key attributes (Brand, Type). Category tree is intuitive. | Prevents "I can't find it" abandonment. |
| **Core Attributes**   | 100% Fill Rate for critical specs (Size, Color, Material, Dimensions).              | Enables confident decision making.      |
| **Normalization**     | Standardized units ("inches" vs "in"). No free-text in facet fields.                | Ensures filters actually work.          |

## 2. Guiding the Customer: Discovery & Navigation

**Why**: An effective experience feels "effortless".

| Component       | Assessment Criteria                                            |
| :-------------- | :------------------------------------------------------------- |
| **Search**      | Handles synonyms, misspellings, and "zero results" gracefully. |
| **Filters**     | Logic is clear (AND/OR). Filters persist on back-navigation.   |
| **PLP (Cards)** | "Visible without Hover": Image, Price, Rating, Availability.   |

## 3. Making the Case: The Persuasive PDP

**Why**: This is where the sale is made. Emphasize "Who is this for?" and "Why this one?".

| Element           | Persuasive Goal                                      |
| :---------------- | :--------------------------------------------------- |
| **Content**       | Answer unique questions. "Why this vs alternatives?" |
| **Imagery**       | High-res, mobile zoom, all variants visualised.      |
| **Social Proof**  | Ratings distribution, Q&A, review volume.            |
| **Trust Signals** | Returns, Warranty, and Shipping _visible near CTA_.  |
| **Error States**  | Test "Out of Stock" selection and invalid inputs.    |

## 4. Closing the Sale: Frictionless Cart & Checkout

**Why**: Eliminate surprises to prevent abandonment.

- **Relevance**: Cross-sells must be strictly relevant (no clutter).
- **No Sticker Shock**: Taxes and Shipping visible _before_ checkout flow.
- **Guest Checkout**: Must be available and discoverable.

## 5. Audit Action Plan (Assessment Criteria)

| Audit Phase       | Category         | Success Heuristic                                 | Severity     |
| :---------------- | :--------------- | :------------------------------------------------ | :----------- |
| **Step 1: Data**  | Titles/Taxonomy  | Scannable, Breadcrumbs accurate                   | High         |
| **Step 1: Data**  | Content Quality  | Mobile Zoom, Visual Variants                      | High         |
| **Step 1: Data**  | Commercials      | No Price/Promo conflicts. Stock visible.          | **Critical** |
| **Step 1: Data**  | Attributes       | Normalized values, no free-text pollution         | Medium       |
| **Step 2: Flows** | Search           | Synonym handling, Zero-state suggestions          | **Critical** |
| **Step 2: Flows** | PLP Cards        | Price/Rating visible without hover                | Medium       |
| **Step 3: PDP**   | Hierarchy        | Critical info (Price/CTA) visible above fold      | High         |
| **Step 3: PDP**   | Decision Support | Variant selection clear. No surprise price jumps. | High         |
| **Step 4: Cart**  | Cost/Fees        | Taxes/Shipping visible in Cart                    | **Critical** |
| **Step 4: Cart**  | Checkout         | Guest Checkout available. Inline validation.      | **Critical** |
