# NC-20260907-004 checkpoint B2 integration

Integrated at: 2026-09-07T18:47:54.503Z

All seven sanitized provider source checksums matched the final receipt.

Stripe: 75 primary and 53 alt products were returned; 28 labels exactly match the local safe checkout baseline. All 9 declared entitlement product references exist in their observed namespaces. Three return the declared default price, six return `default_price:null`, and none conflict. Product references retain account scope: `mcs-full` has one primary and one alt product and must not be flattened into a single offer-level account binding.

Plutio: 18 invoice, 5 proposal, 22 contract, 5 project, and 72 task templates were read, plus 74 custom-field definitions. Three proposal-to-contract links resolve. Two unique proposal project references remain unverified after exact supported operations; they are not proven missing. No item-level offer binding or live agreement population was exposed.
