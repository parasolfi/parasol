# Parasol — front

Landing page for Parasol, parametric cover built on the mechanism described in `../PROJECT.md`
(insurers are Uniswap v4 LPs, buying cover is a swap). This app is marketing only — no wallet, no
contract calls yet. The POC front for the contracts lives in `../poc/app` and is a separate
React/Vite app; do not merge the two.

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

## Art direction

The whole identity derives from one mesh-gradient preset: five colour points on a ring over black.

| token | hex | role |
|---|---|---|
| `ink` | `#05070c` | page background |
| `deep` | `#0d2447` | night blue |
| `ocean` | `#1d4f7a` | mid blue |
| `teal` | `#3aa9b6` | accent |
| `mint` | `#7bd9b8` | highlight, focus rings |
| `pale` | `#c6f4cf` | brightest, used for figures |

Display type is Instrument Serif (`font-display`), body is Inter. Headlines are serif and lowercase
in tone — plain sentences, no marketing shouting.

The logo is deliberately abstract (concentric arcs over a point, a dome rather than an umbrella) so
the identity is not read as weather-only.

`MeshGradient.vue` reimplements that preset as a WebGL shader (inverse-distance blend of five
orbiting colour points, simplex domain warp, film grain). Constants at the top of the `<script>` are
the preset's parameters — tune those rather than the GLSL. Notes:

- Colours are blended in **linear** space and gamma-encoded at the end; changing that flattens the gradient.
- Output alpha is the radial falloff, so the canvas fades into whatever sits behind it (always `ink`).
- It pauses off-screen and on tab blur, and renders a single static frame under `prefers-reduced-motion`.
- A CSS radial-gradient fallback shows if WebGL is unavailable; `live` swaps between them.

Avoid `text-glow` on text sitting over near-black backgrounds — the blur reads as a grey rectangle.

## Conventions

- Components are auto-imported from `app/components`; no `index.ts` barrels.
- Sections live inline in `app/pages/index.vue`; only genuinely reusable pieces get their own file.
- Anchor navigation only (`#quote`, `#how`, …). Sections that are link targets need `scroll-mt-24`
  to clear the fixed header.

## Gotchas

- The quote card's pricing is **illustrative** and computed client-side (`QuoteCard.vue`). It is not
  the protocol's pricing. Keep the "Demo pricing" label until it reads real pool state. Every market
  in it must expose exactly three thresholds — the selected index is kept across market switches.
- Never render dates from `new Date()` in templates — SSR hydration mismatch. Windows are described
  in words ("A weekend") for that reason.
- The footer disclaimer (not a regulated insurance product) is deliberate. Keep it.
