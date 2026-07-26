# Adapters — on-demand lookups, not indexers

Three small modules (`kalshi/`, `polymarket/`, `azuro/`), one pattern: call a
venue's own API directly for a **specific market someone already found**
(via search), and normalize the result into the same shape our subgraphs
produce (`Market` / `Outcome` / `Resolution`).

## Why these exist alongside the subgraphs in `subgraphs/`

Our subgraphs prove the standardized schema works against **live, on-chain
data** — that's their whole point, and it's what the Graph track judges. But
a subgraph only knows about blocks after its `startBlock`; it can't retrieve
an arbitrary market that happens to be older than that window, and widening
the window to guarantee full coverage doesn't scale (see the sync-time notes
in `subgraphs/polymarket/README.md` and `subgraphs/azuro/`'s commit history —
short version: syncing takes real wall-clock time proportional to block
range, and there's no way to make a subgraph jump straight to one specific
past event without scanning everything before it).

So: **search** happens against each venue's own complete, instantly-queryable
API (Polymarket's Gamma/CLOB, Azuro's own hosted GraphQL feed, Kalshi's REST
API) — not our subgraphs. Once you have a specific market id from that
search, these adapters fetch and normalize it, on demand, no indexing wait.
Kalshi additionally *can't* be a subgraph at all (no blockchain — see
`kalshi/README.md`), but the same on-demand pattern applies to all three
either way.

## Usage

Every adapter exports the same two functions:

```ts
searchXMarkets(query: string, limit?: number): Promise<NormalizedMarket[]>
getXMarket(id: string): Promise<NormalizedMarket | null>
```

```ts
import { searchPolymarketMarkets } from './polymarket/polymarket'
import { searchAzuroMarkets } from './azuro/azuro'
import { searchKalshiMarkets } from './kalshi/kalshi'

const results = await searchPolymarketMarkets('rain')
```

All verified against live data (`node --experimental-strip-types`, Node 22+):
a Polymarket "rain" search, an Azuro "Real Madrid" search, and a Kalshi
"NATO"/"pope" search all return real markets with real prices and, where
resolved, real winning outcomes.

## When to use an adapter vs. a subgraph

- **Subgraph** (`subgraphs/`): browsing/aggregating across whatever's in the
  indexed window — the "standardized, composable" surface.
- **Adapter** (here): you already have a specific market id (from search or
  otherwise) and want it normalized now, regardless of whether it's inside
  any subgraph's indexed window.
