// End-to-end smoke check: search all 3 venues via their adapters, and pull
// both live subgraphs through the merge layer (real price/volume + real
// text), so everything can be eyeballed in one run.
//
// Usage: node --experimental-strip-types scripts/check.ts [topic]
// Defaults to "rain" if no topic given (works for Polymarket/Kalshi; Azuro's
// catalog is sports, so it uses a fixed team-name search regardless).

import { searchPolymarketMarkets } from '../adapters/polymarket/polymarket.ts';
import { searchAzuroMarkets } from '../adapters/azuro/azuro.ts';
import { searchKalshiMarkets } from '../adapters/kalshi/kalshi.ts';
import { getEnrichedMarkets, getSubgraphMeta, type EnrichedMarket } from '../merge/merge.ts';

const SUBGRAPH_BASE = 'https://api.studio.thegraph.com/query/1756988';
const POLYMARKET_SUBGRAPH = `${SUBGRAPH_BASE}/parasol-polymarket/v0.0.6`;
const AZURO_SUBGRAPH = `${SUBGRAPH_BASE}/parasol-azuro/v0.0.4`;

function printMarket(m: {
  question: string;
  outcomes: { label: string; impliedProbability: number; volume?: number; tradeCount?: number }[];
  resolution: any;
}) {
  const prices = m.outcomes.map((o) => `${o.label}=${(o.impliedProbability * 100).toFixed(1)}%`).join(', ');
  const status = m.resolution ? `[${m.resolution.status}]` : '[open]';
  console.log(`  - ${m.question} ${status} -- ${prices}`);
  if (m.outcomes[0]?.volume !== undefined) {
    const totalVolume = m.outcomes.reduce((sum, o) => sum + (o.volume ?? 0), 0);
    const totalTrades = m.outcomes.reduce((sum, o) => sum + (o.tradeCount ?? 0), 0);
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
  console.log('\n=== SUBGRAPHS (via the merge layer: real chain data + real venue text) ===');

  console.log('\nPolymarket subgraph:');
  const pmMeta = await getSubgraphMeta(POLYMARKET_SUBGRAPH);
  console.log('  sync status:', JSON.stringify(pmMeta));
  const pmMarkets = await getEnrichedMarkets(POLYMARKET_SUBGRAPH, 'polymarket', 3);
  if (pmMarkets.length === 0) {
    console.log('  (no markets yet — this version may still be syncing, or queued behind older versions in Studio)');
  }
  pmMarkets.forEach((m: EnrichedMarket) => printMarket(m));

  console.log('\nAzuro subgraph:');
  const azMeta = await getSubgraphMeta(AZURO_SUBGRAPH);
  console.log('  sync status:', JSON.stringify(azMeta));
  const azMarkets = await getEnrichedMarkets(AZURO_SUBGRAPH, 'azuro', 3);
  azMarkets.forEach((m: EnrichedMarket) => printMarket(m));
}

const topic = process.argv[2] ?? 'rain';
await checkAdapters(topic);
await checkSubgraphs();
