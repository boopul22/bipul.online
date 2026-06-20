#!/usr/bin/env bash
# Build + deploy the portfolio to the EXISTING Cloudflare Worker "bipulonline".
#
# Why this script: Astro 6's @astrojs/cloudflare adapter emits a Workers build
# (dist/server/wrangler.json) and auto-adds a SESSION KV binding with no id.
# On deploy wrangler tries to PROVISION a new KV and fails because the worker
# already has one. So we patch the existing namespace id in before deploying.
set -euo pipefail
cd "$(dirname "$0")/.."

WORKER_NAME="bipulonline"
SESSION_KV_ID="d357ef8dfd5e4f09b8e1393587fa8ab1"   # existing "bipulonline-session" namespace

echo "▶ Building…"
npm run build

echo "▶ Binding existing SESSION KV ($SESSION_KV_ID)…"
node -e '
  const fs=require("fs"); const p="dist/server/wrangler.json";
  const d=JSON.parse(fs.readFileSync(p,"utf8")); const id=process.argv[1];
  d.kv_namespaces=[{binding:"SESSION",id}];
  if(d.previews) d.previews.kv_namespaces=[{binding:"SESSION",id}];
  fs.writeFileSync(p,JSON.stringify(d));
' "$SESSION_KV_ID"

echo "▶ Deploying to worker '$WORKER_NAME'…"
# astro build drops a .wrangler/deploy/config.json whose base path conflicts
# with dist/server/wrangler.json — remove it so wrangler uses the build config.
rm -f .wrangler/deploy/config.json
( cd dist/server && npx wrangler deploy --name "$WORKER_NAME" )

echo "✅ Deployed: https://$WORKER_NAME.bipul281b.workers.dev"
echo "   (Secret GA_SA_KEY is already set on the worker — set once via:"
echo "    wrangler secret put GA_SA_KEY --name $WORKER_NAME )"
