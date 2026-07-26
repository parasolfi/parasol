---
name: kalshi
description: "Skill for the Kalshi area of parasol. 3 symbols across 1 files."
---

# Kalshi

3 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `adapters/`
- Understanding how searchKalshiMarkets, getKalshiMarket work
- Modifying kalshi-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `adapters/kalshi/kalshi.ts` | normalizeMarket, searchKalshiMarkets, getKalshiMarket |

## Entry Points

Start here when exploring this area:

- **`searchKalshiMarkets`** (Function) — `adapters/kalshi/kalshi.ts:90`
- **`getKalshiMarket`** (Function) — `adapters/kalshi/kalshi.ts:114`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `searchKalshiMarkets` | Function | `adapters/kalshi/kalshi.ts` | 90 |
| `getKalshiMarket` | Function | `adapters/kalshi/kalshi.ts` | 114 |
| `normalizeMarket` | Function | `adapters/kalshi/kalshi.ts` | 51 |

## How to Explore

1. `gitnexus_context({name: "searchKalshiMarkets"})` — see callers and callees
2. `gitnexus_query({query: "kalshi"})` — find related execution flows
3. Read key files listed above for implementation details
