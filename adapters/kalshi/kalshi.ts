// Kalshi has no blockchain — it's a CFTC-regulated, fully off-chain exchange
// with a REST API and a traditional database behind it. There is nothing for
// a Graph subgraph to index (a subgraph reads on-chain event logs; Kalshi
// emits none). This is why Kalshi lives here, as a plain API adapter, and not
// under subgraphs/ as a fourth venue subgraph — it normalizes into the exact
// same shape (Market/Outcome/Resolution) so it merges cleanly with the
// on-chain venues at the application layer, but it is not, and cannot be, an
// indexer.

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

export interface NormalizedOutcome {
  outcomeIndex: number;
  label: string;
  impliedProbability: number; // 0..1
}

export interface NormalizedResolution {
  status: 'Pending' | 'Resolved';
  resolutionSource: string;
  winningOutcomeIndex: number | null;
  finalizedAt: number | null; // unix seconds
}

export interface NormalizedMarket {
  id: string; // "kalshi-<ticker>"
  venue: 'kalshi';
  venueConditionId: string; // Kalshi's own ticker
  question: string; // Kalshi always has this — off-chain platform, no CTF-style hash gap
  outcomeSlotCount: 2;
  outcomes: NormalizedOutcome[];
  resolution: NormalizedResolution | null;
}

interface KalshiMarket {
  ticker: string;
  title: string;
  status: string;
  result: string;
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  close_time: string;
}

// NOTE on resolution status strings: only verified against "active" markets
// live. Kalshi's settled-market status string ("finalized"? "settled"?) is
// inferred from their docs, not confirmed against a real resolved market at
// build time — check this against an actual closed market before relying on
// Resolution data for a demo.
const RESOLVED_STATUSES = new Set(['finalized', 'settled', 'closed']);

function normalizeMarket(m: KalshiMarket): NormalizedMarket {
  const yesBid = parseFloat(m.yes_bid_dollars);
  const yesAsk = parseFloat(m.yes_ask_dollars);
  const yesProbability = (yesBid + yesAsk) / 2;

  const isResolved = RESOLVED_STATUSES.has(m.status.toLowerCase());
  const winningOutcomeIndex = isResolved
    ? (m.result.toLowerCase() === 'yes' ? 0 : m.result.toLowerCase() === 'no' ? 1 : null)
    : null;

  return {
    id: `kalshi-${m.ticker}`,
    venue: 'kalshi',
    venueConditionId: m.ticker,
    question: m.title,
    outcomeSlotCount: 2,
    outcomes: [
      { outcomeIndex: 0, label: 'Yes', impliedProbability: yesProbability },
      { outcomeIndex: 1, label: 'No', impliedProbability: 1 - yesProbability },
    ],
    resolution: isResolved
      ? {
          status: 'Resolved',
          resolutionSource: 'kalshi',
          winningOutcomeIndex,
          finalizedAt: Math.floor(new Date(m.close_time).getTime() / 1000),
        }
      : null,
  };
}

// Client-side keyword filter over open events' titles — Kalshi's public API
// doesn't expose full-text search on this endpoint, so this fetches a page of
// open events and filters locally. Fine for a demo; paginate further (via the
// `cursor` field Kalshi returns) if you need broader coverage.
//
// Word-boundary match, not substring — plain `.includes()` matches "rain"
// inside "Ukraine" and returns unrelated election markets for a weather
// search. Found by actually running it, not hypothetically.
export async function searchKalshiMarkets(query: string, limit = 20): Promise<NormalizedMarket[]> {
  const eventsRes = await fetch(`${KALSHI_API_BASE}/events?limit=200&status=open`);
  const eventsData = await eventsRes.json();
  // Escape regex special characters — query is user-typed, e.g. a stray "?"
  // would otherwise break the pattern instead of matching literally.
  const escaped = query.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const needle = new RegExp(`\\b${escaped}\\b`);

  const matchingTickers: string[] = eventsData.events
    .filter((e: { title: string }) => needle.test(e.title.toLowerCase()))
    .map((e: { event_ticker: string }) => e.event_ticker)
    .slice(0, limit);

  const markets: NormalizedMarket[] = [];
  for (const eventTicker of matchingTickers) {
    const res = await fetch(`${KALSHI_API_BASE}/events/${eventTicker}?with_nested_markets=true`);
    const data = await res.json();
    for (const m of data.event.markets as KalshiMarket[]) {
      markets.push(normalizeMarket(m));
    }
  }
  return markets;
}

export async function getKalshiMarket(ticker: string): Promise<NormalizedMarket | null> {
  const res = await fetch(`${KALSHI_API_BASE}/markets/${ticker}`);
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  return normalizeMarket(data.market as KalshiMarket);
}
