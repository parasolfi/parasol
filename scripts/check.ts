// End-to-end smoke check: search all 3 venues via their adapters, and query
// both live subgraphs directly, so everything can be eyeballed in one run.
//
// Usage: node --experimental-strip-types scripts/check.ts [topic]
// Defaults to "rain" if no topic given (works for Polymarket/Kalshi; Azuro's
// catalog is sports, so it uses a fixed team-name search regardless).

import { searchPolymarketMarkets } from '../adapters/polymarket/polymarket.ts';
import { searchAzuroMarkets } from '../adapters/azuro/azuro.ts';
import { searchKalshiMarkets } from '../adapters/kalshi/kalshi.ts';

const SUBGRAPH_BASE = 'https://api.studio.thegraph.com/query/1756988';
const POLYMARKET_SUBGRAPH = `${SUBGRAPH_BASE}/parasol-polymarket/v0.0.5`;
const AZURO_SUBGRAPH = `${SUBGRAPH_BASE}/parasol-azuro/v0.0.3`;

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

function printMarket(m: { question: string; outcomes: { label: string; impliedProbability: number }[]; resolution: any }) {
  const prices = m.outcomes.map((o) => `${o.label}=${(o.impliedProbability * 100).toFixed(1)}%`).join(', ');
  const status = m.resolution ? `[${m.resolution.status}]` : '[open]';
  console.log(`  - ${m.question} ${status} -- ${prices}`);
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
  console.log('\n=== SUBGRAPHS (standardized on-chain index) ===');

  console.log('\nPolymarket subgraph:');
  const pmMeta = await querySubgraph(POLYMARKET_SUBGRAPH, '{ _meta { block { number } hasIndexingErrors } }');
  console.log('  sync status:', JSON.stringify(pmMeta._meta));
  const pmData = await querySubgraph(
    POLYMARKET_SUBGRAPH,
    '{ markets(first: 3) { venueConditionId outcomes { label impliedProbability } resolution { status } } }',
  );
  if (pmData.markets.length === 0) {
    console.log('  (no markets yet — this version may still be syncing, or queued behind older versions in Studio)');
  }
  for (const m of pmData.markets) {
    printMarket({ question: m.venueConditionId, outcomes: m.outcomes, resolution: m.resolution });
  }

  console.log('\nAzuro subgraph:');
  const azMeta = await querySubgraph(AZURO_SUBGRAPH, '{ _meta { block { number } hasIndexingErrors } }');
  console.log('  sync status:', JSON.stringify(azMeta._meta));
  const azData = await querySubgraph(
    AZURO_SUBGRAPH,
    '{ markets(first: 3) { venueConditionId outcomes { label impliedProbability } resolution { status winningOutcomeIndex } } }',
  );
  for (const m of azData.markets) {
    printMarket({ question: m.venueConditionId, outcomes: m.outcomes, resolution: m.resolution });
  }
}

const topic = process.argv[2] ?? 'rain';
await checkAdapters(topic);
await checkSubgraphs();
