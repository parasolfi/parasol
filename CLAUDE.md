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

**`AsciiVideo.vue`** (hero) renders a video through an ASCII shader ported from an Efecto export.
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

- `public/ocean.mp4` is a 20 s loop (960×540, 550 kB, crossfaded so it repeats seamlessly) cut from
  a third-party YouTube video. It is **not licensed** for this use — swap it for owned or
  CC-licensed footage before this ships anywhere public-facing.
- The quote card's pricing is **illustrative** and computed client-side (`QuoteCard.vue`). It is not
  the protocol's pricing. Keep the "Demo pricing" label until it reads real pool state. Every market
  in it must expose exactly three thresholds — the selected index is kept across market switches.
- Never render dates from `new Date()` in templates — SSR hydration mismatch. Windows are described
  in words ("A weekend") for that reason.
- The footer disclaimer (not a regulated insurance product) is deliberate. Keep it.
