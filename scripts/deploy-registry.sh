#!/usr/bin/env bash
# Deploys PolicyRegistry to 0G Galileo and prints the .env line to add.
set -euo pipefail
cd "$(dirname "$0")/../contracts"

if [ -z "${ZG_DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "ZG_DEPLOYER_PRIVATE_KEY not set (source your .env first)" >&2
  exit 1
fi

FORGE="${FORGE:-$HOME/.foundry/bin/forge}"
OUT=$("$FORGE" create --broadcast --rpc-url https://evmrpc-testnet.0g.ai \
  --private-key "$ZG_DEPLOYER_PRIVATE_KEY" \
  src/PolicyRegistry.sol:PolicyRegistry)

echo "$OUT"
ADDR=$(echo "$OUT" | grep "Deployed to:" | awk '{print $3}')
echo
echo "add to .env:"
echo "POLICY_REGISTRY_ADDRESS=$ADDR"
echo "explorer: https://chainscan-galileo.0g.ai/address/$ADDR"
