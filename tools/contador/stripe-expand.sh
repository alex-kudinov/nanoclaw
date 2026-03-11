#!/usr/bin/env bash
# stripe-expand.sh — Standalone Stripe session expander for testing
#
# Usage: STRIPE_RESTRICTED_KEY=rk_live_... ./stripe-expand.sh <session_id>
# Output: Full expanded JSON (pipe to `node -e` or `jq` for field extraction)

set -euo pipefail

SESSION_ID="${1:?Usage: stripe-expand.sh <session_id>}"
KEY="${STRIPE_RESTRICTED_KEY:?Set STRIPE_RESTRICTED_KEY env var}"

curl -sf \
  "https://api.stripe.com/v1/checkout/sessions/${SESSION_ID}?expand[]=line_items.data.price.product&expand[]=customer_details" \
  -u "${KEY}:"
