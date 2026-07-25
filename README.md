# Parasol — an AI broker for parametric cover

Prediction markets already price real-world risk — they just lack the insurance UX. Parasol is the
missing broker: an agent interviews a business owner, maps their exposure onto live Polymarket
weather markets, structures a basket of outcome positions that pays out when their pain threshold
is crossed, and executes it **into the client's own wallet**. Premium = market-implied probability
× payout. No claim, no adjuster, no custody.

**The broker's intelligence runs on 0G Compute** (TEE-sealed inference through the Router), and
every policy is attested by the agent's wallet in a `PolicyRegistry` contract on 0G Galileo.
Your keys move your money; the agent's key moves only its attestations.

## How it works

```
Interview      the agent (0G Compute Router) profiles the business — city, peril,
               pain threshold, size of a bad day
Catalog        live Polymarket daily-temperature events (negRisk buckets), indexed
               via Gamma + our standardized multi-venue adapters
Quote          deterministic basket: every bucket at/beyond the threshold;
               premium = payout × Σ ask
Execute        positions delivered to the client wallet (fork mode: real tokenIds,
               real prices, local settlement — see Geoblock note)
Attest         agent writes the policy on 0G Galileo (PolicyRegistry)
Resolve        real Polymarket resolutions flip policy status; winners are paid
               automatically in USDC.e
```

## Stack

- **0G Compute Router** — the agent's inference (`ZG_ROUTER_API_KEY`, OpenAI-compatible endpoint)
- **0G Chain (Galileo, 16602)** — `PolicyRegistry` attestation contract (Foundry, cancun)
- **The Graph** — standardized prediction-market subgraphs (Polymarket + Azuro) and on-demand
  venue adapters (Polymarket, Azuro, Kalshi) feeding the catalog
- **Polymarket** — liquidity: daily temperature bucket markets (CLOB v2, negRisk)
- **Nuxt 4** — front + server routes, plain WebGL landing shaders

## Contracts

| Contract | Network | Address |
|---|---|---|
| PolicyRegistry | 0G Galileo (16602) | _deploy pending_ |

## Run

```bash
pnpm install
anvil --fork-url https://polygon.drpc.org --port 8546   # fork leg
pnpm dev                                                 # http://localhost:3000
```

`.env`: `ZG_ROUTER_API_KEY` (0G Router), `ZG_DEPLOYER_PRIVATE_KEY` + `POLICY_REGISTRY_ADDRESS`
(Galileo attestations), `FORK_RPC_URL` (defaults to `http://127.0.0.1:8545`).

Without a Router key the interview falls back to a scripted flow, clearly labeled
"Offline fallback" in the UI — quotes and execution still run on live market data.

## Geoblock note

Polymarket order placement is geo-restricted in many jurisdictions. The demo executes settlement
on an Anvil fork of Polygon: the exact clobTokenIds at live CLOB prices, delivered by impersonating
live holders — never a CTF split, which cannot reproduce negRisk position ids. Prices, markets and
resolutions are all real mainnet data. Real CLOB execution is a config switch when run from an
unrestricted jurisdiction.

## Not weather insurance

Weather is the demo, not the product: the mechanism covers any event a public source can settle
and a prediction market can price. This is not a regulated insurance product.
