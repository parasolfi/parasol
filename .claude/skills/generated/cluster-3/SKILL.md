---
name: cluster-3
description: "Skill for the Cluster_3 area of parasol. 7 symbols across 2 files."
---

# Cluster_3

7 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `server/`
- Understanding how runAgentTurn, singleOrderThreshold work
- Modifying cluster_3-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `server/utils/agent.ts` | catalogDigest, systemPrompt, validateTurn, callRouter, mockTurn (+1) |
| `server/utils/basket.ts` | singleOrderThreshold |

## Entry Points

Start here when exploring this area:

- **`runAgentTurn`** (Function) — `server/utils/agent.ts:100`
- **`singleOrderThreshold`** (Function) — `server/utils/basket.ts:51`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `runAgentTurn` | Function | `server/utils/agent.ts` | 100 |
| `singleOrderThreshold` | Function | `server/utils/basket.ts` | 51 |
| `catalogDigest` | Function | `server/utils/agent.ts` | 24 |
| `systemPrompt` | Function | `server/utils/agent.ts` | 33 |
| `validateTurn` | Function | `server/utils/agent.ts` | 47 |
| `callRouter` | Function | `server/utils/agent.ts` | 68 |
| `mockTurn` | Function | `server/utils/agent.ts` | 83 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunAgentTurn → SingleOrderThreshold` | intra_community | 4 |

## How to Explore

1. `gitnexus_context({name: "runAgentTurn"})` — see callers and callees
2. `gitnexus_query({query: "cluster_3"})` — find related execution flows
3. Read key files listed above for implementation details
