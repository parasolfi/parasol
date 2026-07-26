#!/usr/bin/env bash
# Rebuilds the demo state from scratch and checks every leg. Run ~20 minutes
# before presenting; every line must read OK before you go on stage.
set -uo pipefail
cd "$(dirname "$0")/.."

FORK_PORT="${FORK_PORT:-8546}"
APP_PORT="${APP_PORT:-3100}"
CAST="${CAST:-$HOME/.foundry/bin/cast}"
ANVIL="${ANVIL:-$HOME/.foundry/bin/anvil}"
DEMO_WALLET="${DEMO_WALLET:-0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC}"
USDCE=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
REGISTRY="${POLICY_REGISTRY_ADDRESS:-0x504C64EBb9816AA9238404244fC8849d849B5A6e}"

fail=0
ok()   { printf '  OK   %s\n' "$1"; }
bad()  { printf '  FAIL %s\n' "$1"; fail=1; }
step() { printf '\n== %s ==\n' "$1"; }

set -a; [ -f .env ] && . ./.env; set +a

step "1. Polygon fork (Polymarket state must be fresh)"
pkill -f "anvil.*${FORK_PORT}" 2>/dev/null
sleep 1
nohup "$ANVIL" --fork-url "${POLYGON_FORK_URL:-https://polygon.drpc.org}" --port "$FORK_PORT" >/tmp/parasol-anvil.log 2>&1 &
disown
for _ in $(seq 1 30); do
  BLOCK=$("$CAST" block-number --rpc-url "http://127.0.0.1:${FORK_PORT}" 2>/dev/null) && break
  sleep 1
done
[ -n "${BLOCK:-}" ] && ok "fork at block $BLOCK" || bad "fork never came up (see /tmp/parasol-anvil.log)"

step "2. App server"
lsof -ti :"$APP_PORT" | xargs kill 2>/dev/null
sleep 2
FORK_RPC_URL="http://127.0.0.1:${FORK_PORT}" NUXT_IGNORE_LOCK=1 \
  nohup ./node_modules/.bin/nuxt dev --port "$APP_PORT" >/tmp/parasol-dev.log 2>&1 &
disown
for _ in $(seq 1 40); do
  curl -sf -o /dev/null --max-time 10 "http://localhost:${APP_PORT}/" && break
  sleep 2
done
curl -sf -o /dev/null --max-time 15 "http://localhost:${APP_PORT}/" && ok "server up" || bad "server did not start (see /tmp/parasol-dev.log)"

step "3. Live catalogue"
COUNT=$(curl -s --max-time 90 "http://localhost:${APP_PORT}/api/catalog" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("options",[])))' 2>/dev/null || echo 0)
[ "${COUNT:-0}" -gt 10 ] && ok "$COUNT cover options today" || bad "catalogue nearly empty ($COUNT) — markets may have rolled over"

step "4. Yesterday's policy (the payout moment)"
rm -f .data/policies.json
node scripts/seed-demo-policy.mjs "${DEMO_CITY:-Madrid}" "$DEMO_WALLET" >/tmp/parasol-seed.log 2>&1 \
  && ok "seeded: $(grep -o 'seeded policy.*' /tmp/parasol-seed.log)" \
  || bad "seed failed (see /tmp/parasol-seed.log) — try another resolved city"
python3 - "$DEMO_WALLET" <<'PY' 2>/dev/null
import json, sys
p = json.load(open('.data/policies.json'))
p[0]['authorization'] = '0xseed'
json.dump(p, open('.data/policies.json', 'w'), indent=2)
PY
curl -s --max-time 180 -X POST "http://localhost:${APP_PORT}/api/resolve" >/tmp/parasol-resolve.log 2>&1
BAL=$("$CAST" call "$USDCE" "balanceOf(address)(uint256)" "$DEMO_WALLET" --rpc-url "http://127.0.0.1:${FORK_PORT}" 2>/dev/null | awk '{print $1}')
[ -n "${BAL:-}" ] && [ "${BAL:-0}" != "0" ] && ok "payout landed: $BAL USDC.e" || bad "no payout — check /tmp/parasol-resolve.log"

step "5. 0G inference (the eligibility proof)"
SRC=$(curl -s --max-time 240 -X POST "http://localhost:${APP_PORT}/api/agent" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"icecream seller in Madrid, above 33C sales die, a bad day costs 200 dollars"}]}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("source","?"))' 2>/dev/null)
case "$SRC" in
  zg-compute|zg-router) ok "live on 0G ($SRC)" ;;
  mock) bad "fell back to the scripted interview — check the ledger and the token rate limit" ;;
  *) bad "agent unreachable" ;;
esac

step "6. On-chain attestations (0G Galileo)"
NEXT=$("$CAST" call "$REGISTRY" 'nextId()(uint256)' --rpc-url "${ZG_RPC_URL:-https://evmrpc-testnet.0g.ai}" 2>/dev/null | awk '{print $1}')
[ -n "${NEXT:-}" ] && ok "registry reachable, $NEXT policies attested" || bad "registry unreachable"

step "7. ENS"
BROKER=$(curl -s --max-time 90 "http://localhost:${APP_PORT}/api/ens/broker" | python3 -c 'import json,sys
b = json.load(sys.stdin).get("broker")
print("{} ({} policy records)".format(b["name"], b["policiesPublished"]) if b else "")' 2>/dev/null)
[ -n "$BROKER" ] && ok "broker identity resolves: $BROKER" || bad "broker name does not resolve"
[ -n "$BROKER" ] && case "$BROKER" in
  *"(0 policy records)") printf '  NOTE run scripts/publish-ens-records.mjs with the name owner key to publish policy records\n' ;;
esac

step "8. Public link"
if [ -n "${TUNNEL_URL:-}" ]; then
  curl -sf -o /dev/null --max-time 25 "${TUNNEL_URL}/cover" && ok "$TUNNEL_URL reachable" || bad "tunnel down — restart cloudflared and update SUBMISSION.md"
else
  printf '  SKIP tunnel (set TUNNEL_URL to check)\n'
fi

printf '\n'
[ "$fail" -eq 0 ] && printf 'ALL CLEAR — you can present.\n' || printf 'SOMETHING FAILED above — fix before presenting.\n'
exit "$fail"
