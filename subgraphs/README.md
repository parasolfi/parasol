# Parasol — standardized prediction-market index

Canonical, cross-venue schema for prediction markets (`Market` / `Outcome` /
`Resolution`), implemented per-venue as separate Subgraph Studio deployments
that share an identical `schema.graphql`. `subgraphs/common/schema.graphql` is
the source of truth — copy it verbatim into each venue folder when it changes.

## Layout

```
subgraphs/
  common/schema.graphql   <- canonical schema, copy into each venue below
  polymarket/             <- venue 1, built and building
  omen/                   <- not started (CTF-native, same pattern as polymarket)
  seer/                   <- not started (CTF-native, same pattern as polymarket)
  azuro/                  <- not started (different model — odds, not CTF)
```

## Polymarket (venue 1)

Two data sources on Polygon mainnet (`network: matic`):

- `ConditionalTokens` (`0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`) — market
  creation (`ConditionPreparation`) and resolution (`ConditionResolution`).
- `Exchange` (`0xE111180000d2663C0091e4f400237545B87B996B`) — **this is CTF
  Exchange V2**, the currently-active/audited contract per Polymarket's own
  docs. Trade pricing comes from `OrderFilled`.

`startBlock` is set ~2 weeks back from the chain head at time of writing
(~90,867,208 as of 2026-07-25) — indexing is bounded by *time*, not by a
curated list of markets, per the "index everything, standardize the shape"
decision. Re-check the current head before deploying if this goes stale.

### Two things that would have silently broken this, noted so nobody re-learns them the hard way

1. **V1 vs V2 Exchange.** Polymarket's own official reference subgraph
   (`Polymarket/polymarket-subgraph` on GitHub) indexes the **V1** Exchange
   (`0x4bFb41d5...982E`). V1's `OrderFilled` has a different shape
   (`makerAssetId`/`takerAssetId` pair) than V2's (`side` + single `tokenId`).
   Copying V1's mapping pattern against the V2 address decodes nothing, with
   no error. `abis/Exchange.json` here is hand-built from V2's actual source
   (`ctf-exchange-v2/src/exchange/mixins/Events.sol`), not pulled from
   Polygonscan (needs an API key we don't have) — worth a real verification
   pass once someone has a key.
2. **CTF position IDs are not a simple hash.** Modern Gnosis CTF derives
   `collectionId` as an elliptic-curve point (calls the `ecAdd` precompile,
   does a modular square root over a ~254-bit prime) rather than
   `keccak256(parent, conditionId, indexSet)`. Confirmed via Polymarket's own
   ABI (`getCollectionId` is `view`, not `pure` — the tell) and Gnosis's
   current `CTHelpers.sol`. The mapping does **not** reimplement this — it
   calls the CTF contract's own `getCollectionId`/`getPositionId` view
   functions via a generated contract binding (`try_getCollectionId` /
   `try_getPositionId` in `src/mapping.ts`), which is the standard graph-node
   pattern for exactly this situation.

### Known simplifications

- `Market.question` is always `null` from this mapping — the human-readable
  question text isn't on-chain (only `questionId`, a hash). Populating it
  needs an off-chain metadata join (e.g. Polymarket's Gamma API) at the
  application/merge layer, not here.
- No cross-venue correlation table — by design (see project decisions).
  Browsing/search across venues happens at the merge layer, not in any single
  subgraph.

## Local dev

```bash
cd subgraphs/polymarket
npm install
npm run codegen
npm run build
```

Deploying requires a Subgraph Studio deploy key (`graph auth`, then
`npm run deploy -- <subgraph-name>`) — not run from here yet.

## Next up

Omen and Seer are both CTF-native (same `ConditionalTokens` event shapes,
same `TokenToOutcome` derivation pattern) — copy this venue's structure and
swap the contract addresses/collateral token. Azuro is a genuinely different
model (AMM odds, not CTF) and needs its own mapping logic (see project notes
on odds -> probability normalization).
