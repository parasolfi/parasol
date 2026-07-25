# Kalshi adapter — not a subgraph, on purpose

Kalshi is a CFTC-regulated, fully off-chain exchange. There is no blockchain,
no contract, no event log — nothing a Graph subgraph could index. This is a
plain TypeScript module that calls Kalshi's public REST API directly and
normalizes the result into the exact same shape as the on-chain venues
(`Market` / `Outcome` / `Resolution`), so it merges cleanly at the app/merge
layer without pretending to be indexed data.

## Usage

```ts
import { searchKalshiMarkets, getKalshiMarket } from './kalshi'

const results = await searchKalshiMarkets('NATO')     // keyword search
const market = await getKalshiMarket('KXNEXTNATOSECGEN-99-KIOH') // by ticker
```

Verified working against the live API (`node --experimental-strip-types`,
Node 22+) — a "NATO" search returns real markets with real yes/no midpoint
prices.

## Known gaps

- **Search is client-side keyword filtering** over one page of open events
  (Kalshi's public API doesn't expose full-text search on this endpoint).
  Paginate via the `cursor` field if broader coverage is needed.
- **Resolution status strings are inferred, not confirmed against a real
  resolved market** — `RESOLVED_STATUSES` in `kalshi.ts` is a best guess
  (`finalized`/`settled`/`closed`). Verify against an actual closed Kalshi
  market before relying on `resolution` data in a demo.
- `impliedProbability` is the yes_bid/yes_ask midpoint, not a trade price —
  Kalshi's dollar-denominated prices are already 0–1 scaled (each contract
  settles at $1), so no unit conversion is needed, just the bid/ask average.
