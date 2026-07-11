# Project Profile: E-commerce / Online Storefront

Online retail surfaces: product listing/category grids, product detail pages (PDP), cart, and checkout. Any stack. When this profile applies, the rules below OVERRIDE the universal defaults in the other reference files; everything not mentioned here keeps its universal rule.

Detection: routes or components named product/products/catalog/category/collection/cart/basket/checkout/shop/store; product grids or cards; price, add-to-cart, variant/option pickers, or quantity steppers; a checkout step machine; or the user saying so.

Source of truth: when the repo is available, read the design-token/theme files, the product-card and price components, and any cart/checkout state machine before auditing. This profile describes the patterns; the config and the card component hold the exact values. If they conflict, the code wins and the conflict is itself a finding. Localization: storefronts almost always sell across regions, so the Category 14 localization checks apply at Warning minimum, with currency, tax, and address formats stress-tested per target locale.

## Overrides: price, availability, and trust (the money-clarity bar)

- **Price is never ambiguous or hidden.** The price a buyer pays is visible before any add-to-cart, in the buyer's currency, with tax-inclusion stated where the locale expects it (EU prices are tax-inclusive). A buried, unparseable, or per-unit-vs-total-confused price is Critical.
- **No surprise fees late in checkout.** Shipping, taxes, and mandatory surcharges are disclosed before the final pay step, not sprung on the review screen. Revealing real cost only at the end is a dark pattern and a Blocker (ties to Category 14 dark patterns).
- **Stock state is explicit and honest.** In-stock / low-stock / out-of-stock / back-order each read unambiguously; an out-of-stock item never shows an active add-to-cart that fails after the tap. Misleading availability is Critical.
- **Scarcity and urgency cues must be truthful.** "Only 2 left" or a countdown must reflect real inventory/real deadlines. Fabricated or resetting countdowns and fake low-stock counters are dark patterns: Blocker.
- **Trust signals must be genuine.** Secure-payment, returns/refund, and review/rating components reflect real policy and real data. Fabricated reviews, invented star counts, or stock testimonials presented as real are Critical and tie to Category 14 fake-content.
- **Sale pricing is honest.** A struck-through "was" price is a real prior price, not an inflated anchor; discount math (percent off, "save X") is correct.

## Overrides: product card consistency across the grid

- **Cards in a grid are uniform.** Image aspect ratio, title line-count/truncation, price position, badge placement, rating slot, and CTA must be identical cell to cell. Drift (one card taller, one price lower, one badge floating) is Warning, escalating to Critical if it breaks grid alignment at a common viewport.
- **Variable content is bounded.** Long titles clamp to a fixed line count (`line-clamp-2`) with `min-w-0`; missing rating/badge/discount collapses to reserved space, not a shifted layout. The card renders cleanly with the longest title, no rating, no badge, and the longest price string.
- **Badges are a fixed vocabulary in fixed slots.** "Sale", "New", "Low stock" use one badge system, one corner, one z-order; never overlap the image focal point or each other.

## Overrides: product imagery and media

- **Every product image has explicit dimensions or a locked aspect ratio.** Grids load many images; unsized images shifting the grid on load is Critical (cumulative layout shift). Reserve the box, lazy-load below the fold, and prioritize the first viewport / the PDP hero.
- **Gallery and zoom states are complete.** The PDP gallery has thumbnails with a clear selected state, a working zoom/lightbox, keyboard navigation, and a sensible single-image and no-image fallback. A zoom with no escape or no focus management is a Blocker.

## Overrides: variant and option pickers

- **Selected state is unmistakable and accessible.** Size/color/material pickers show the active option with more than color alone (border + check/inset, plus `aria-pressed`/radio semantics); a color-only selected state is Critical.
- **Availability is reflected per option.** Unavailable variants are visibly disabled (not hidden), with the reason conveyed in text, not just a faded swatch. Selecting a variant updates price, image, and stock atomically.
- **Quantity steppers validate.** Min/max enforced, non-numeric rejected, the value editable directly, and out-of-stock quantities blocked before add-to-cart, not at checkout.

## Overrides: cart and checkout (the highest-stakes path)

- **A broken or confusing checkout is a Blocker, not a Warning.** This is the conversion path and the money path; hold it to the strictest bar in the audit.
- **Every step shows progress and a way back.** A visible step indicator, and a return path to a prior step or the cart that never silently discards entered data or the cart contents. Losing the cart on back-navigation is a Blocker.
- **Guest checkout exists.** Forcing account creation before purchase is a documented conversion killer; treat a mandatory-account wall with no guest path as Critical unless the brief justifies it.
- **Validation errors sit at the field, inline, in text.** Per-field messages on blur and on submit, focus moved to the first error, and the failed field never silently cleared. Errors in color alone, a single top-of-form summary with no field anchor, or a wiped form on error are Critical (ties to Forms, Category 6).
- **All cart/checkout states are built, not just the happy path:** empty cart (with a route back to shopping, distinct from a loading skeleton), item removed/undo, payment-declined, address-invalid, shipping-unavailable-to-region, coupon-invalid, and the in-flight/disabled submit state that prevents double-charge. A missing empty or error state on this flow is Critical; a double-submittable pay button is a Blocker.
- **Cart persists.** Cart contents survive reload and, for signed-in buyers, across sessions and devices; an anonymous cart is not silently dropped on sign-in (it merges). Silent cart loss is Critical.
- **Address and payment fields use correct input affordances.** `autocomplete` tokens (name, address-line, postal-code, cc-number with `inputmode`/`autocomplete="cc-*"`), country-appropriate address shape and postal/state labels, and never a placeholder as the only label.

## Overrides: mobile-first (retail traffic is mostly mobile)

- **Design and audit the phone viewport first.** Most storefront traffic is mobile; a layout that only resolves at desktop is a Critical responsive failure, not a Warning.
- **Primary actions are thumb-reachable and sticky where it counts.** A sticky add-to-cart on the PDP and a sticky/persistent checkout CTA in cart, within the bottom thumb zone, not stranded above a long fold.
- **Filters and sort are reachable on mobile** via an accessible sheet/drawer with a visible applied-filter count and a clear-all; an off-canvas filter that traps focus or has no close is a Blocker.

## Aesthetic and content notes (storefront-specific)

- Lead with the real product, not template furniture: a category page's job is scannable, comparable, honest cards, not a hero gradient and three icon feature cards (Category 14 generic-AI tells still apply).
- Photography is real product imagery or an honestly labeled placeholder slot; never div-built fake product shots or stock images implying they are the item.
- Review counts, ratings, and "bestseller"/"trending" labels come from real data or do not appear (Category 14 fake-content).
- Copy: buttons name the outcome ("Add to cart", "Place order", "Continue to payment"), one term per concept ("cart" vs "bag" vs "basket" picked once), and order/error states say what happened and the next step. Confirmshaming on declines/unsubscribes and pre-ticked marketing or insurance add-ons are dark patterns (Blocker).
