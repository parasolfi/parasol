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
      const m = await getAzuroMarket(venueConditionId);
      return m?.question ?? null;
    }
  } catch {
    return null;
  }
  return null;
}
