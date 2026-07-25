# Parasol — front + broker

Parasol v2: an AI broker over Polymarket liquidity — see `SPEC.md` (authoritative) and
`PROJECT.md`. The landing page is the marketing surface; `/cover` is the product: agent interview
(0G Compute Router), live quotes on Polymarket daily-temperature buckets, fork-mode execution,
policies attested on 0G Galileo (`contracts/PolicyRegistry.sol`). Server routes live in `server/`,
venue adapters in `adapters/` (shared with the subgraph branch `feat/graph-indexer`).
`RUNBOOK.md` is the demo pre-flight. The old Uniswap POC lives in `../poc` — dead model, kept for
CTF reference.

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

**Light theme.** White page, ink text, teal accents. The palette comes from one mesh-gradient preset
(five colour points on a ring); the gradient itself now only appears in the underwriters section.

| token | hex | role |
|---|---|---|
| `canvas` | `#ffffff` | page background |
| `canvas-soft` | `#f1f6f6` | alternating sections |
| `ink` | `#08172b` | text, dark buttons |
| `deep` | `#0d2447` | densest glyphs |
| `ocean` | `#1d4f7a` | figures, secondary headings |
| `teal` | `#3aa9b6` | accent, eyebrows, focus rings |
| `mint` | `#7bd9b8` | gradient end, selection |
| `pale` | `#c6f4cf` | lightest glyphs |

Display type is Instrument Serif (`font-display`), body is Inter. Headlines are serif and plain in
tone — sentences, no marketing shouting.

The logo is deliberately abstract (concentric arcs over a point, a dome rather than an umbrella) so
the identity is not read as weather-only.

## The two background shaders

Both are plain WebGL — no three.js, no R3F, no postprocessing. A full-screen quad does not justify
~600 kB of library on a landing page. Both pause off-screen and on tab blur, cap DPR, and fall back
gracefully.

**`MeshGradient.vue`** (underwriters section) reimplements the gradient preset: inverse-distance
blend of five orbiting colour points, simplex domain warp, film grain. Constants at the top of the
`<script>` are the preset's parameters — tune those rather than the GLSL.

- Colours are blended in **linear** space and gamma-encoded at the end; changing that flattens it.
- Output alpha is the radial falloff, so the canvas fades into whatever sits behind it.
- A CSS radial-gradient fallback shows if WebGL is unavailable; `live` swaps between them.

**`AsciiImage.vue`** (hero) renders `public/sky.webp` through an ASCII shader ported from an Efecto
export. The source is a still, so there is no animation loop: it draws once on image load and again
on resize. Efecto's time-driven uniforms (jitter, glitch, wave, noise, targetFPS) are therefore
dropped — they do nothing on a still. `coverRatio` reproduces `object-fit: cover` when sampling, so
the sky is never stretched.

The uniform set and post-FX names match Efecto's so its values can be pasted in, but three things
deliberately differ from that export:

- **The glyphs are real characters**, not Efecto's 4×4 block patterns: procedural `. : - + * #`
  drawn with `bar()` and distance tests in `getChar`. Density rises with brightness.
- **`backgroundColor`** (new): output is `mix(background, glyph, charValue)` instead of
  `glyph * charValue`, so glyphs sit on a light page instead of on black. Black background
  reproduces Efecto's original output exactly.
- **`colorPalette: 5`** (new): the Parasol ramp, `parasolRamp(1 - brightness)` — denser glyph, darker
  colour, deep → ocean → teal → mint → pale.

Efecto's export computes `sampledColor` (contrast, brightness, noise, aberration) and then never
uses it — the glyph reads an untouched `cellColor`. That is fixed here: those adjustments apply to
the sampled cell, so the uniforms actually do something. Only `style: standard` exists in the export
(the others return 0 and render black), so there is no style uniform.

Text over the hero needs both scrims: the horizontal one for desktop and `bg-canvas/78 lg:hidden`
for narrow screens, where the horizontal gradient cannot protect the copy.

## Conventions

- Components are auto-imported from `app/components`; no `index.ts` barrels.
- Sections live inline in `app/pages/index.vue`; only genuinely reusable pieces get their own file.
- Anchor navigation only (`#quote`, `#how`, …). Sections that are link targets need `scroll-mt-24`
  to clear the fixed header.

## Gotchas

- `public/sky.webp` is the hero source: a sunset sky downscaled to 1600 px wide (92 kB). Under a
  14 px ASCII grid nothing above that resolution is visible, so do not ship the 5760 px original.
  The image reads through the Parasol ramp, not its own warm colours — swapping in another image
  means rechecking that its bright mass sits on the right, away from the copy.
- The quote card's pricing is **illustrative** and computed client-side (`QuoteCard.vue`). It is not
  the protocol's pricing. Keep the "Demo pricing" label until it reads real pool state. Every market
  in it must expose exactly three thresholds — the selected index is kept across market switches.
- Never render dates from `new Date()` in templates — SSR hydration mismatch. Windows are described
  in words ("A weekend") for that reason.
- The footer disclaimer (not a regulated insurance product) is deliberate. Keep it.
