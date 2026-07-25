// Pairs a subgraph result (real on-chain price/resolution, no text) with the
// venue's own API (real text, no cross-venue standardization) — using the
// adapters purely as a text lookup, not as a data source in their own right.
// The subgraph stays the source of truth for price/resolution; this only
// fills in `question`, which no subgraph can ever carry (see project notes).

import { getPolymarketMarket } from '../adapters/polymarket/polymarket.ts';
import { getAzuroMarket } from '../adapters/azuro/azuro.ts';

export async function getQuestionText(venue: 'polymarket' | 'azuro', venueConditionId: string): Promise<string | null> {
  try {
    if (venue === 'polymarket') {
      const m = await getPolymarketMarket(venueConditionId);
      return m?.question ?? null;
    }
    if (venue === 'azuro') {
      // Known gap: our subgraph indexes Azuro's LIVE betting contract, but
      // adapters/azuro.ts hits Azuro's PRE-MATCH hosted feed — separate
      // product lines, separate id spaces, so this only resolves text for a
      // condition that happens to also exist pre-match. Confirmed Azuro does
      // run a live-specific feed (azuro-api-live-data-feed, found via their
      // SDK source), but it only contains Gnosis Chain data, not Polygon —
      // checked directly, no Polygon-height entries at all. No public
      // Polygon-live text source found after real effort; not chasing this
      // further speculatively.
      const m = await getAzuroMarket(venueConditionId);
      return m?.question ?? null;
    }
  } catch {
    return null;
  }
  return null;
}
