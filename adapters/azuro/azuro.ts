// On-demand lookup against Azuro's own hosted, always-fully-synced GraphQL
// feed (thegraph.azuro.org) — not our subgraph. Our subgraph's job is proving
// the standardized schema against live on-chain data; it isn't the right tool
// for "look up any specific market someone just found via search," since a
// subgraph only knows blocks after its startBlock (see project notes on why
// widening that window doesn't scale). Azuro already runs a complete index of
// its own data — reuse it for point lookups instead of trying to make our
// narrower one do a job it fundamentally can't.

const AZURO_API = 'https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3';

export interface NormalizedOutcome {
  outcomeIndex: number;
  label: string;
  impliedProbability: number; // 0..1, de-vigged (margin removed) for cross-venue comparability
  venueOutcomeId: string;
}

export interface NormalizedResolution {
  status: 'Pending' | 'Resolved';
  resolutionSource: string;
  winningOutcomeIndex: number | null;
  finalizedAt: null; // Azuro's feed doesn't expose a settlement timestamp on Condition
}

export interface NormalizedMarket {
  id: string; // "azuro-<conditionId>"
  venue: 'azuro';
  venueConditionId: string;
  question: string; // game title, e.g. "Liverpool – Real Madrid"
  outcomeSlotCount: number;
  outcomes: NormalizedOutcome[];
  resolution: NormalizedResolution | null;
}

interface AzuroOutcome {
  outcomeId: string;
  title: string | null;
  currentOdds: string;
  result: 'Won' | 'Lost' | 'Canceled' | null;
}

interface AzuroCondition {
  conditionId: string;
  status: string;
  outcomes: AzuroOutcome[];
  game: { title: string };
}

// Same multiplicative de-vig as the subgraph mapping (1/odds, normalized to
// sum to 1) — kept consistent so a market looked up here and one read from
// our subgraph produce comparable numbers, not two different conventions.
function devig(odds: number[]): number[] {
  const inverses = odds.map((o) => 1 / o);
  const sum = inverses.reduce((a, b) => a + b, 0);
  return inverses.map((i) => i / sum);
}

function normalizeCondition(c: AzuroCondition): NormalizedMarket {
  const odds = c.outcomes.map((o) => parseFloat(o.currentOdds));
  const probabilities = devig(odds);

  const winningIndex = c.outcomes.findIndex((o) => o.result === 'Won');

  return {
    id: `azuro-${c.conditionId}`,
    venue: 'azuro',
    venueConditionId: c.conditionId,
    question: c.game.title,
    outcomeSlotCount: c.outcomes.length,
    outcomes: c.outcomes.map((o, i) => ({
      outcomeIndex: i,
      label: o.title || `Outcome ${i}`,
      impliedProbability: probabilities[i],
      venueOutcomeId: o.outcomeId,
    })),
    resolution:
      c.status === 'Resolved'
        ? {
            status: 'Resolved',
            resolutionSource: 'azuro',
            winningOutcomeIndex: winningIndex >= 0 ? winningIndex : null,
            finalizedAt: null,
          }
        : null,
  };
}

async function queryAzuro(query: string): Promise<any> {
  const res = await fetch(AZURO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Azuro API error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

const CONDITION_FIELDS = `
  conditionId
  status
  outcomes { outcomeId title currentOdds result }
  game { title }
`;

export async function searchAzuroMarkets(query: string, limit = 20): Promise<NormalizedMarket[]> {
  // `first: limit` here bounds the number of GAMES, not conditions — each
  // game can carry many betting markets (moneyline, spread, totals, ...), so
  // this over-fetches and slices at the end rather than truncating games,
  // which would silently hide most of a match's markets to hit an early game.
  const data = await queryAzuro(`{
    games(first: ${limit}, where: { title_contains_nocase: "${query}" }) {
      conditions { ${CONDITION_FIELDS} }
    }
  }`);
  const markets: NormalizedMarket[] = [];
  for (const game of data.games) {
    for (const condition of game.conditions) {
      markets.push(normalizeCondition(condition));
    }
  }
  return markets.slice(0, limit);
}

export async function getAzuroMarket(conditionId: string): Promise<NormalizedMarket | null> {
  // Not condition(id: ...) — this feed's entity id is a composite (core
  // contract address + conditionId, per Azuro-subgraphs' own
  // getConditionEntityId helper), not the bare conditionId. Filtering on the
  // plain conditionId field avoids needing to reconstruct that composite.
  const data = await queryAzuro(`{
    conditions(where: { conditionId: "${conditionId}" }, first: 1) { ${CONDITION_FIELDS} }
  }`);
  return data.conditions.length > 0 ? normalizeCondition(data.conditions[0]) : null;
}
