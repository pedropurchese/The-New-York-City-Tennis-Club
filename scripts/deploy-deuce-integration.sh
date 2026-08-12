#!/usr/bin/env bash
# Deploy Deuce read-only wait-times API (SQL + Edge Function secrets + function).
# Requires Supabase CLI login or SUPABASE_ACCESS_TOKEN in .env.supabase
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_REF="kwssjeuycjdypqcfcapc"
SQL_FILE="$ROOT/supabase/integration_read_api.sql"

if [ -f "$ROOT/.env.supabase" ]; then
  # shellcheck disable=SC1091
  set -a && source "$ROOT/.env.supabase" && set +a
fi

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ -f "$HOME/.supabase/access-token" ]; then
  SUPABASE_ACCESS_TOKEN="$(cat "$HOME/.supabase/access-token")"
  export SUPABASE_ACCESS_TOKEN
fi

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Missing SUPABASE_ACCESS_TOKEN."
  echo "  1. Create a token: https://supabase.com/dashboard/account/tokens"
  echo "  2. echo 'SUPABASE_ACCESS_TOKEN=sbp_...' > .env.supabase"
  echo "  Or run: npx supabase login"
  exit 1
fi

if [ -z "${INTEGRATION_API_KEY:-}" ]; then
  INTEGRATION_API_KEY="$(openssl rand -hex 32)"
  export INTEGRATION_API_KEY
  echo "Generated INTEGRATION_API_KEY (save for Deuce): $INTEGRATION_API_KEY"
fi

echo "Running integration SQL via Supabase Management API..."
QUERY="$(cat "$SQL_FILE")"
curl -sf -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(node -e "console.log(JSON.stringify({ query: process.argv[1] }))" "$QUERY")"

echo ""
echo "Linking project (if needed)..."
npx supabase link --project-ref "$PROJECT_REF" 2>/dev/null || true

echo "Setting Edge Function secret..."
npx supabase secrets set "INTEGRATION_API_KEY=${INTEGRATION_API_KEY}" --project-ref "$PROJECT_REF"

echo "Deploying wait-times-latest Edge Function..."
npx supabase functions deploy wait-times-latest --no-verify-jwt --project-ref "$PROJECT_REF"

echo ""
echo "Deuce Edge Function URL:"
echo "  https://${PROJECT_REF}.supabase.co/functions/v1/wait-times-latest"
echo "Header: x-api-key: ${INTEGRATION_API_KEY}"
