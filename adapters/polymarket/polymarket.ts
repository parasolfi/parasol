// On-demand lookup against Polymarket's own public APIs (Gamma for search,
// CLOB for per-market detail) — not our subgraph. Same reasoning as the Azuro
// adapter: our subgraph only knows blocks after its startBlock, and widening
// that to guarantee coverage of "whatever market someone just searched for"
// doesn't scale (see project notes). Polymarket already runs a complete,
// instant index of its own data — reuse it for point lookups.

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
  price: number | string;
}

interface ClobMarket {
  condition_id: string;
  question: string;
  closed: boolean;
  tokens: ClobToken[];
}

// The CLOB serializes prices as numbers on some routes and as strings on
// others, and a settled outcome reads 0.9995 as often as a clean 1. A strict
// `=== 1` silently reported "no winner", which resolution reads as a loss.
const RESOLVED_WINNER_PRICE = 0.99;

function normalizeClobMarket(m: ClobMarket): NormalizedMarket {
  const winningIndex = m.closed ? m.tokens.findIndex((t) => Number(t.price) >= RESOLVED_WINNER_PRICE) : -1;

  return {
    id: `polymarket-${m.condition_id}`,
    venue: 'polymarket',
    venueConditionId: m.condition_id,
    question: m.question,
    outcomeSlotCount: m.tokens.length,
    outcomes: m.tokens.map((t, i) => ({
      outcomeIndex: i,
      label: t.outcome,
      impliedProbability: Number(t.price),
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

export async function getPolymarketMarket(conditionId: string): Promise<NormalizedMarket | null> {
  const res = await fetch(`${CLOB_API}/markets/${conditionId}`);
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as ClobMarket;
  return normalizeClobMarket(data);
}
