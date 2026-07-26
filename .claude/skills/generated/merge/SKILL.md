---
name: merge
description: "Skill for the Merge area of parasol. 8 symbols across 2 files."
---

# Merge

8 symbols | 2 files | Cohesion: 93%

## When to Use

- Working with code in `merge/`
- Understanding how searchPolymarketMarkets, getPolymarketMarket, getEnrichedMarkets work
- Modifying merge-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `merge/merge.ts` | querySubgraph, fetchQuestionText, fallbackQuestion, getEnrichedMarkets, getSubgraphMeta |
| `adapters/polymarket/polymarket.ts` | normalizeClobMarket, searchPolymarketMarkets, getPolymarketMarket |

## Entry Points

Start here when exploring this area:

- **`searchPolymarketMarkets`** (Function) — `adapters/polymarket/polymarket.ts:77`
- **`getPolymarketMarket`** (Function) — `adapters/polymarket/polymarket.ts:96`
- **`getEnrichedMarkets`** (Function) — `merge/merge.ts:96`
- **`getSubgraphMeta`** (Function) — `merge/merge.ts:123`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `searchPolymarketMarkets` | Function | `adapters/polymarket/polymarket.ts` | 77 |
| `getPolymarketMarket` | Function | `adapters/polymarket/polymarket.ts` | 96 |
| `getEnrichedMarkets` | Function | `merge/merge.ts` | 96 |
| `getSubgraphMeta` | Function | `merge/merge.ts` | 123 |
| `normalizeClobMarket` | Function | `adapters/polymarket/polymarket.ts` | 47 |
| `querySubgraph` | Function | `merge/merge.ts` | 50 |
| `fetchQuestionText` | Function | `merge/merge.ts` | 72 |
| `fallbackQuestion` | Function | `merge/merge.ts` | 88 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GetEnrichedMarkets → Devig` | cross_community | 5 |
| `GetEnrichedMarkets → NormalizeClobMarket` | intra_community | 4 |
| `GetEnrichedMarkets → QueryAzuro` | cross_community | 4 |
| `SearchPolymarketMarkets → NormalizeClobMarket` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Azuro | 1 calls |

## How to Explore

1. `gitnexus_context({name: "searchPolymarketMarkets"})` — see callers and callees
2. `gitnexus_query({query: "merge"})` — find related execution flows
3. Read key files listed above for implementation details
