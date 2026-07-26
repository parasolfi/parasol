// The merge layer: the one place that combines a subgraph's on-chain-verified
// price/resolution/volume with a venue's own off-chain question text. This is
// "the standard" output shape — every consumer (the check script, a future
// frontend) should go through here rather than querying a subgraph directly
// and improvising its own text handling.
//
// Why text lives here and not in the subgraph: mapping code has no network
// access (deterministic-by-design — see subgraphs/README.md), so a subgraph
// can never carry text. This is the layer that fills that gap, on demand.

import { getPolymarketMarket } from '../adapters/polymarket/polymarket.ts';
import { getAzuroMarket } from '../adapters/azuro/azuro.ts';

export type Venue = 'polymarket' | 'azuro';

export interface EnrichedOutcome {
  label: string;
  impliedProbability: number;
  volume: number;
  tradeCount: number;
}

export interface EnrichedResolution {
  status: string;
  winningOutcomeIndex: number | null;
}

export interface EnrichedMarket {
  id: string;
  venue: Venue;
  venueConditionId: string;
  question: string;
  questionSource: 'venue-api' | 'unavailable';
  outcomes: EnrichedOutcome[];
  resolution: EnrichedResolution | null;
}

interface SubgraphOutcome {
  label: string;
  impliedProbability: string; // GraphQL serializes BigDecimal as a string
  volume: string;
  tradeCount: number;
}

interface SubgraphMarket {
  venueConditionId: string;
  outcomes: SubgraphOutcome[];
  resolution: { status: string; winningOutcomeIndex: number | null } | null;
}

async function querySubgraph(url: string, query: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Subgraph error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Real gap, not a bug: an on-chain condition can exist before the venue's
// off-chain systems have registered its metadata (confirmed by checking both
// Polymarket's CLOB and Gamma APIs for a condition our subgraph already
// indexed — neither had it). Azuro has an additional, separate gap: our
// subgraph indexes their LIVE betting product, but their public hosted feed
// only covers PRE-MATCH (and, for the live-specific feed that does exist,
// only Gnosis Chain, not Polygon) — see adapters/azuro/azuro.ts and
// merge/merge.ts callers for the full trail. Either way, "unavailable" is a
// real, expected state, not something to keep retrying.
async function fetchQuestionText(venue: Venue, venueConditionId: string): Promise<string | null> {
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

function fallbackQuestion(venue: Venue, venueConditionId: string): string {
  const shortId =
    venueConditionId.length > 14
      ? `${venueConditionId.slice(0, 10)}…${venueConditionId.slice(-4)}`
      : venueConditionId;
  return `(${venue} condition ${shortId} — not yet published by the venue)`;
}

export async function getEnrichedMarkets(subgraphUrl: string, venue: Venue, first = 10): Promise<EnrichedMarket[]> {
  const data = await querySubgraph(
    subgraphUrl,
    `{ markets(first: ${first}) { venueConditionId outcomes { label impliedProbability volume tradeCount } resolution { status winningOutcomeIndex } } }`,
  );

  const results: EnrichedMarket[] = [];
  for (const m of data.markets as SubgraphMarket[]) {
    const questionText = await fetchQuestionText(venue, m.venueConditionId);
    results.push({
      id: `${venue}-${m.venueConditionId}`,
      venue,
      venueConditionId: m.venueConditionId,
      question: questionText ?? fallbackQuestion(venue, m.venueConditionId),
      questionSource: questionText ? 'venue-api' : 'unavailable',
      outcomes: m.outcomes.map((o) => ({
        label: o.label,
        impliedProbability: parseFloat(o.impliedProbability),
        volume: parseFloat(o.volume),
        tradeCount: o.tradeCount,
      })),
      resolution: m.resolution,
    });
  }
  return results;
}

export async function getSubgraphMeta(subgraphUrl: string): Promise<{ block: number; hasIndexingErrors: boolean }> {
  const data = await querySubgraph(subgraphUrl, '{ _meta { block { number } hasIndexingErrors } }');
  return { block: Number(data._meta.block.number), hasIndexingErrors: data._meta.hasIndexingErrors };
}
