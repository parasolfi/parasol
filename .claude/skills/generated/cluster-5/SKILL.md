---
name: cluster-5
description: "Skill for the Cluster_5 area of parasol. 4 symbols across 1 files."
---

# Cluster_5

4 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `server/`
- Understanding how getCatalog, findCoverOption work
- Modifying cluster_5-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `server/utils/catalog.ts` | toCoverOption, fetchWeatherEvents, getCatalog, findCoverOption |

## Entry Points

Start here when exploring this area:

- **`getCatalog`** (Function) — `server/utils/catalog.ts:88`
- **`findCoverOption`** (Function) — `server/utils/catalog.ts:108`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getCatalog` | Function | `server/utils/catalog.ts` | 88 |
| `findCoverOption` | Function | `server/utils/catalog.ts` | 108 |
| `toCoverOption` | Function | `server/utils/catalog.ts` | 57 |
| `fetchWeatherEvents` | Function | `server/utils/catalog.ts` | 81 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `FindCoverOption → FetchWeatherEvents` | intra_community | 3 |
| `FindCoverOption → ToCoverOption` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "getCatalog"})` — see callers and callees
2. `gitnexus_query({query: "cluster_5"})` — find related execution flows
3. Read key files listed above for implementation details
