---
name: azuro
description: "Skill for the Azuro area of parasol. 5 symbols across 1 files."
---

# Azuro

5 symbols | 1 files | Cohesion: 91%

## When to Use

- Working with code in `adapters/`
- Understanding how searchAzuroMarkets, getAzuroMarket work
- Modifying azuro-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `adapters/azuro/azuro.ts` | devig, normalizeCondition, queryAzuro, searchAzuroMarkets, getAzuroMarket |

## Entry Points

Start here when exploring this area:

- **`searchAzuroMarkets`** (Function) — `adapters/azuro/azuro.ts:108`
- **`getAzuroMarket`** (Function) — `adapters/azuro/azuro.ts:127`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `searchAzuroMarkets` | Function | `adapters/azuro/azuro.ts` | 108 |
| `getAzuroMarket` | Function | `adapters/azuro/azuro.ts` | 127 |
| `devig` | Function | `adapters/azuro/azuro.ts` | 52 |
| `normalizeCondition` | Function | `adapters/azuro/azuro.ts` | 58 |
| `queryAzuro` | Function | `adapters/azuro/azuro.ts` | 88 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GetEnrichedMarkets → Devig` | cross_community | 5 |
| `GetEnrichedMarkets → QueryAzuro` | cross_community | 4 |
| `SearchAzuroMarkets → Devig` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "searchAzuroMarkets"})` — see callers and callees
2. `gitnexus_query({query: "azuro"})` — find related execution flows
3. Read key files listed above for implementation details
