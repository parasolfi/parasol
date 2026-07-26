---
name: components
description: "Skill for the Components area of parasol. 7 symbols across 1 files."
---

# Components

7 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `app/`
- Understanding how writeOrbits, resize, draw work
- Modifying components-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/components/MeshGradient.vue` | writeOrbits, resize, draw, loop, play (+2) |

## Entry Points

Start here when exploring this area:

- **`writeOrbits`** (Function) — `app/components/MeshGradient.vue:169`
- **`resize`** (Function) — `app/components/MeshGradient.vue:180`
- **`draw`** (Function) — `app/components/MeshGradient.vue:197`
- **`loop`** (Function) — `app/components/MeshGradient.vue:204`
- **`play`** (Function) — `app/components/MeshGradient.vue:211`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `writeOrbits` | Function | `app/components/MeshGradient.vue` | 169 |
| `resize` | Function | `app/components/MeshGradient.vue` | 180 |
| `draw` | Function | `app/components/MeshGradient.vue` | 197 |
| `loop` | Function | `app/components/MeshGradient.vue` | 204 |
| `play` | Function | `app/components/MeshGradient.vue` | 211 |
| `pause` | Function | `app/components/MeshGradient.vue` | 216 |
| `onVisibility` | Function | `app/components/MeshGradient.vue` | 227 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Loop → Resize` | intra_community | 3 |
| `Loop → WriteOrbits` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "writeOrbits"})` — see callers and callees
2. `gitnexus_query({query: "components"})` — find related execution flows
3. Read key files listed above for implementation details
