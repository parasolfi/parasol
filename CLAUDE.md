# Parasol — front + broker

Parasol v2: an AI broker over Polymarket liquidity — see `SPEC.md` (authoritative) and
`PROJECT.md`. `/cover` is the product: agent interview (0G Compute Router), live quotes on
Polymarket daily-temperature buckets, fork-mode execution, policies attested on 0G Galileo
(`contracts/PolicyRegistry.sol`). Server routes live in `server/`, the Polymarket adapter in
`adapters/`. `RUNBOOK.md` is the demo pre-flight. The old Uniswap POC lives in `../poc` — dead
model, kept for CTF reference.

All user-facing copy is in **English**.

## Positioning

The product is **not** weather insurance. It covers any event a public source can settle — rain,
heat, flight delays, energy prices, quakes, port closures. Rain is only ever an *example*, never the
pitch. If copy starts implying weather is the product, it has drifted.

## Run

```bash
pnpm dev      # http://localhost:3000
pnpm build    # nitro output in .output/
pnpm preview
```

Nuxt 4 (`app/` directory), Tailwind v4 via the Vite plugin (no tailwind.config — the design tokens
live in `@theme` inside `app/assets/css/main.css`), fonts self-hosted by `@nuxt/fonts`.

There is no marketing landing: `app/pages/index.vue` redirects to `/cover`. The pages are `/cover`
(the product), `/policies` (the holder's covers) and that redirect.

## Art direction

**Warm golden-hour theme** over a full-bleed photo (`public/background.jpg`), content on frosted
glass. The palette is tuned to that photo; `main.css` is the source of truth for the tokens.

| token | hex | role |
|---|---|---|
| `canvas` | `#f3ecd9` | warm cream, glass fills |
| `canvas-soft` | `#e7dcc2` | deeper cream |
| `ink` | `#2b3a3a` | text, dark buttons |
| `deep` | `#202d2c` | deepest slate |
| `ocean` | `#5f88a6` | warm sky blue, secondary |
| `teal` | `#5f88a6` | accent, eyebrows, focus rings |
| `mint` | `#86a05a` | warm green, selection |
| `pale` | `#f4ecd8` | cream |

Display type is Space Grotesk (`font-display`), body is Inter. Headlines are plain in tone —
sentences, no marketing shouting.

The logo is deliberately abstract (concentric arcs over a point, a dome rather than an umbrella) so
the identity is not read as weather-only.

## Conventions

- Components are auto-imported from `app/components`; no `index.ts` barrels.
- Anchor navigation only (`#quote`, `#how`, …). Sections that are link targets need `scroll-mt-24`
  to clear the fixed header.
- `npx nuxi typecheck` is clean and needs `vue-tsc` + `typescript@5` in devDependencies (vue-tsc
  cannot drive typescript 7). There is no ESLint config.

## Gotchas

- The product name is drifting to **free** (see the `<title>` in `nuxt.config.ts`) while
  `COVER_DOMAIN.name`, the `parasol.*` ENS record keys and `parasol.eth` still say Parasol. Those
  are on-chain identifiers: renaming them invalidates live signatures and published records, so
  they move together or not at all.
- `polygon-rpc.com` answers 403 "tenant disabled". Every Polygon client — server, composable, and
  the wallet's add-chain payload — must pass `polygon-bor-rpc.publicnode.com` explicitly; viem's
  default transport lands on the dead one.
- Never render dates from `new Date()` in templates — SSR hydration mismatch. Windows are described
  in words ("A weekend") for that reason.
- The Cover authorization carries a `nonce` and a `deadline`. The nonce is claimed before delivery
  and never released, so a cover that fails half-way needs a fresh signature. `COVER_TYPES` in
  `server/utils/authorization.ts` and `app/pages/cover.vue` must stay identical or nothing verifies.
- `server/api/dev/` 404s outside `nuxt dev`. `scripts/preflight.sh` relies on that route, so it runs
  the app in dev mode.
- Policies live in `.data/policies.json`, keyed by an id claimed in-process. Deleting that file
  resets the counter and can collide with ENS names already published under the old ids.
- The footer disclaimer (not a regulated insurance product) is deliberate. Keep it.
