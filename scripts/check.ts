// End-to-end smoke check: search all 3 venues via their adapters, and query
// both live subgraphs directly, so everything can be eyeballed in one run.
//
// Usage: node --experimental-strip-types scripts/check.ts [topic]
// Defaults to "rain" if no topic given (works for Polymarket/Kalshi; Azuro's
// catalog is sports, so it uses a fixed team-name search regardless).

import { searchPolymarketMarkets } from '../adapters/polymarket/polymarket.ts';
import { searchAzuroMarkets } from '../adapters/azuro/azuro.ts';
import { searchKalshiMarkets } from '../adapters/kalshi/kalshi.ts';
import { getQuestionText } from './enrich.ts';

const SUBGRAPH_BASE = 'https://api.studio.thegraph.com/query/1756988';
const POLYMARKET_SUBGRAPH = `${SUBGRAPH_BASE}/parasol-polymarket/v0.0.6`;
const AZURO_SUBGRAPH = `${SUBGRAPH_BASE}/parasol-azuro/v0.0.4`;

async function querySubgraph(url: string, query: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

function printMarket(m: {
  question: string;
  outcomes: { label: string; impliedProbability: number; volume?: number; tradeCount?: number }[];
  resolution: any;
}) {
  const prices = m.outcomes.map((o) => `${o.label}=${(o.impliedProbability * 100).toFixed(1)}%`).join(', ');
  const status = m.resolution ? `[${m.resolution.status}]` : '[open]';
  console.log(`  - ${m.question} ${status} -- ${prices}`);
  if (m.outcomes[0]?.volume !== undefined) {
    // GraphQL serializes BigDecimal/Int as strings — `+` on strings
    // concatenates rather than adds, unlike `*` above (which coerces).
    const totalVolume = m.outcomes.reduce((sum, o) => sum + parseFloat(String(o.volume ?? 0)), 0);
    const totalTrades = m.outcomes.reduce((sum, o) => sum + parseInt(String(o.tradeCount ?? 0), 10), 0);
    console.log(`      volume=${totalVolume.toFixed(2)}  trades=${totalTrades}`);
  }
}

async function checkAdapters(topic: string) {
  console.log(`\n=== ADAPTERS (on-demand search: "${topic}") ===`);

  console.log('\nPolymarket:');
  const pm = await searchPolymarketMarkets(topic, 3);
  pm.length ? pm.forEach(printMarket) : console.log('  (no results)');

  console.log('\nAzuro (fixed "Real Madrid" search — its catalog is sports, not weather):');
  const az = await searchAzuroMarkets('Real Madrid', 3);
  az.length ? az.forEach(printMarket) : console.log('  (no results)');

  console.log('\nKalshi:');
  const ks = await searchKalshiMarkets(topic, 3);
  ks.length ? ks.forEach(printMarket) : console.log('  (no results)');
}

async function checkSubgraphs() {
  console.log('\n=== SUBGRAPHS (standardized on-chain index, enriched with venue API text) ===');

  console.log('\nPolymarket subgraph:');
  const pmMeta = await querySubgraph(POLYMARKET_SUBGRAPH, '{ _meta { block { number } hasIndexingErrors } }');
  console.log('  sync status:', JSON.stringify(pmMeta._meta));
  const pmData = await querySubgraph(
    POLYMARKET_SUBGRAPH,
    '{ markets(first: 3) { venueConditionId outcomes { label impliedProbability volume tradeCount } resolution { status } } }',
  );
  if (pmData.markets.length === 0) {
    console.log('  (no markets yet — this version may still be syncing, or queued behind older versions in Studio)');
  }
  for (const m of pmData.markets) {
    const question = (await getQuestionText('polymarket', m.venueConditionId)) ?? m.venueConditionId;
    printMarket({ question, outcomes: m.outcomes, resolution: m.resolution });
  }

  console.log('\nAzuro subgraph:');
  const azMeta = await querySubgraph(AZURO_SUBGRAPH, '{ _meta { block { number } hasIndexingErrors } }');
  console.log('  sync status:', JSON.stringify(azMeta._meta));
  const azData = await querySubgraph(
    AZURO_SUBGRAPH,
    '{ markets(first: 3) { venueConditionId outcomes { label impliedProbability volume tradeCount } resolution { status winningOutcomeIndex } } }',
  );
  for (const m of azData.markets) {
    const question = (await getQuestionText('azuro', m.venueConditionId)) ?? m.venueConditionId;
    printMarket({ question, outcomes: m.outcomes, resolution: m.resolution });
  }
}

const topic = process.argv[2] ?? 'rain';
await checkAdapters(topic);
await checkSubgraphs();
