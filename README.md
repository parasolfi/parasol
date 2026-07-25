# Parasol — front

Landing page for Parasol: parametric cover for any event a public data source can settle. Name the
event and the number that would hurt, pay a premium, and get paid automatically when it happens —
no claim, no adjuster.

Under the hood, underwriters are liquidity providers in a Uniswap v4 pool and buying cover is a swap
against it, so the price of protection is a market price. Deployed on Polygon.

This repository is the marketing front only. It does not talk to a wallet or to the contracts yet;
the quote card runs illustrative client-side pricing.

## Stack

Nuxt 4, Tailwind CSS v4 (Vite plugin, tokens declared in `@theme`), self-hosted fonts via
`@nuxt/fonts`. Two WebGL backgrounds — an ASCII shader rendering a sky in the hero and a mesh
gradient lower down — both written against the raw WebGL API, with no three.js or postprocessing
dependency.

## Develop

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # nitro output in .output/
pnpm preview
```

## Conventions

See `CLAUDE.md` for the design tokens, the shader's parameters and the gotchas worth knowing before
touching the background or the pricing card.
