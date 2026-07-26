# Polymarket subgraph

Indexes Polymarket conditions on Polygon from the Conditional Tokens Framework
at `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`, into the shared schema in
[`../common/schema.graphql`](../common/schema.graphql).

Consumed by `server/utils/subgraph.ts`, which the resolution watcher calls to
decide whether a policy pays out.

## Why it listens to the CTF and not to an oracle adapter

Polymarket's bucketed markets — "Highest temperature in Madrid on July 26?" and
every other daily temperature market — are **negRisk** markets. Their conditions
are prepared with `NegRiskAdapter 0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` as
oracle, not with the UMA CTF adapter that binary Yes/No markets use.

This is verifiable without trusting the claim. `getConditionId` is deterministic:

```
conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))
```

For the winning bucket of Madrid on July 25 2026:

| | |
|---|---|
| conditionId | `0xa32059633e16326c8f311bdf3f0f96a1b4baae855e1e61c09645684dd6f46e30` |
| questionId | `0x06ee13389466dd29f629d44fb7ce93fcb600e645f63950e447f456d1a05c8d02` |
| oracle that reproduces it | **NegRiskAdapter**, `outcomeSlotCount = 2` |

So a subgraph filtered on the UMA adapter indexes none of these markets. Both
handlers here bind to the CTF contract itself and record whichever oracle the
event carries, so binary and bucketed markets land in the same schema.

## Backfilling resolutions

`ConditionResolution` creates the `Market` if `ConditionPreparation` fell before
`startBlock`. Without that, a resolution inside the indexed range but whose
market was prepared before it would be unreachable by `venueConditionId` — the
only key a consumer has.

## startBlock

`90700000`, about four days of Polygon. Daily temperature markets open roughly
two days before their window, so this covers J-2 onward, which is what the
demo's "yesterday's policy, resolved and paid" needs. Lower it to backfill
further; the CTF is a busy contract and each extra day is real sync time.

## Build and deploy

```bash
npm install
npm run codegen
npm run build
graph auth <studio-deploy-key>
npm run deploy
```

Then point the server at it:

```
POLYMARKET_SUBGRAPH_URL=https://api.studio.thegraph.com/query/<id>/parasol-polymarket/<version>
```

## Checking it actually works

The failure this replaces was silent: `server/utils/subgraph.ts` returns `null`
when a condition is missing and the watcher quietly falls back to the venue API,
so `/api/resolve` kept answering `"via": "venue-api"` while the subgraph looked
healthy. Query a condition you know is resolved before trusting it:

```bash
curl -s -X POST "$POLYMARKET_SUBGRAPH_URL" -H 'content-type: application/json' \
  -d '{"query":"{ markets(where:{venueConditionId:\"0xa32059633e16326c8f311bdf3f0f96a1b4baae855e1e61c09645684dd6f46e30\"}){ resolution { status winningOutcomeIndex } } }"}'
```

An empty `markets` array means the condition is outside the indexed range, not
that it is unresolved. `/api/resolve` reporting `"via": "subgraph"` is the
end-to-end signal.

## Not indexed here

`TokenToOutcome` (ERC-1155 position id to outcome) stays empty. Populating it
needs `getCollectionId`/`getPositionId` calls per outcome, and for negRisk
markets the collateral is the adapter's wrapped token rather than USDC.e, so the
naive derivation returns position ids that do not match `clobTokenIds`. Getting
it wrong is worse than leaving it null, since it silently mismatches quotes.

Prices and volume (`Outcome.impliedProbability`, `volume`, `tradeCount`) are
initialised to zero: they come from the exchange's fill events, not from the
CTF. The CLOB book remains the price source.
