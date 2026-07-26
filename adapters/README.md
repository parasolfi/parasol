# Adapters — on-demand lookups, not indexers

One module (`polymarket/`), one pattern: call the venue's own API directly for
a **specific market someone already found**, and normalize the result into the
same shape the subgraph produces (`Market` / `Outcome` / `Resolution`).

## Why this exists alongside the subgraph in `subgraphs/`

The subgraph proves the standardized schema works against **live, on-chain
data** — that's its whole point. But a subgraph only knows about blocks after
its `startBlock`; it can't retrieve an arbitrary market older than that window,
and widening the window to guarantee full coverage doesn't scale (syncing takes
wall-clock time proportional to block range, and there's no way to jump
straight to one past event without scanning everything before it).

So resolution reads the subgraph first and falls back here: `getPolymarketMarket`
fetches and normalizes a single condition from the CLOB, on demand, no indexing
wait. `server/api/resolve.post.ts` is the caller.

## Usage

```ts
import { getPolymarketMarket } from './polymarket/polymarket'

const market = await getPolymarketMarket(conditionId)
```

## When to use an adapter vs. the subgraph

- **Subgraph** (`subgraphs/`): the resolution authority — an on-chain payout
  report, inside the indexed window.
- **Adapter** (here): the condition falls outside that window and you need it
  normalized now.
