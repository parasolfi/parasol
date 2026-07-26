// On-demand lookup against Polymarket's own public APIs (Gamma for search,
// CLOB for per-market detail) — not our subgraph. Same reasoning as the Azuro
// adapter: our subgraph only knows blocks after its startBlock, and widening
// that to guarantee coverage of "whatever market someone just searched for"
// doesn't scale (see project notes). Polymarket already runs a complete,
// instant index of its own data — reuse it for point lookups.

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

export interface NormalizedOutcome {
  outcomeIndex: number;
  label: string;
  impliedProbability: number; // 0..1, last traded price
  venueOutcomeId: string; // CLOB token id
}

export interface NormalizedResolution {
  status: 'Pending' | 'Resolved';
  resolutionSource: string;
  winningOutcomeIndex: number | null;
  finalizedAt: null; // not exposed on this endpoint
}

export interface NormalizedMarket {
  id: string; // "polymarket-<conditionId>"
  venue: 'polymarket';
  venueConditionId: string;
  question: string;
  outcomeSlotCount: number;
  outcomes: NormalizedOutcome[];
  resolution: NormalizedResolution | null;
}

interface ClobToken {
  token_id: string;
  outcome: string;
  price: number;
}

interface ClobMarket {
  condition_id: string;
  question: string;
  closed: boolean;
  tokens: ClobToken[];
}

function normalizeClobMarket(m: ClobMarket): NormalizedMarket {
  const winningIndex = m.closed ? m.tokens.findIndex((t) => t.price === 1) : -1;

  return {
    id: `polymarket-${m.condition_id}`,
    venue: 'polymarket',
    venueConditionId: m.condition_id,
    question: m.question,
    outcomeSlotCount: m.tokens.length,
    outcomes: m.tokens.map((t, i) => ({
      outcomeIndex: i,
      label: t.outcome,
      impliedProbability: t.price,
      venueOutcomeId: t.token_id,
    })),
    resolution: m.closed
      ? {
          status: 'Resolved',
          resolutionSource: 'polymarket',
          winningOutcomeIndex: winningIndex >= 0 ? winningIndex : null,
          finalizedAt: null,
        }
      : null,
  };
}

// Gamma's own search only returns Gamma-shaped market objects (question +
// conditionId, no live tokens/prices) — for a consistent shape with
// getPolymarketMarket, this re-fetches each hit from the CLOB by conditionId
// rather than normalizing Gamma's shape separately.
export async function searchPolymarketMarkets(query: string, limit = 20): Promise<NormalizedMarket[]> {
  const res = await fetch(`${GAMMA_API}/public-search?q=${encodeURIComponent(query)}&limit_per_type=${limit}`);
  const data = await res.json();

  const conditionIds: string[] = [];
  for (const event of data.events ?? []) {
    for (const m of event.markets ?? []) {
      if (m.conditionId) conditionIds.push(m.conditionId);
    }
  }

  const markets: NormalizedMarket[] = [];
  for (const conditionId of conditionIds.slice(0, limit)) {
    const market = await getPolymarketMarket(conditionId);
    if (market) markets.push(market);
  }
  return markets;
}

export async function getPolymarketMarket(conditionId: string): Promise<NormalizedMarket | null> {
  const res = await fetch(`${CLOB_API}/markets/${conditionId}`);
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as ClobMarket;
  return normalizeClobMarket(data);
}
