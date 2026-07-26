import type { BucketResolution, EventResolution } from '~~/shared/types/cover'
import { parseAbi } from 'viem'
import { polygonClient } from './chain'
import { CONDITIONAL_TOKENS, GAMMA_HOST } from './polymarket'

const CTF_ABI = parseAbi([
  'function payoutNumerators(bytes32, uint256) view returns (uint256)',
  'function payoutDenominator(bytes32) view returns (uint256)',
])

interface GammaResolutionMarket {
  conditionId: string
  groupItemTitle?: string
}

/**
 * Source of truth for resolution is the on-chain CTF, not Gamma nor the subgraph.
 * payoutNumerators[0] maps to the “Yes” token of each negRisk bucket.
 */
export async function getEventResolution(slug: string): Promise<EventResolution | null> {
  const events = await $fetch<{ markets?: GammaResolutionMarket[] }[]>(`${GAMMA_HOST}/events`, {
    query: { slug },
  })

  const markets = events?.[0]?.markets
  if (!markets?.length) return null

  const client = polygonClient()
  const address = CONDITIONAL_TOKENS as `0x${string}`

  const results = await client.multicall({
    contracts: markets.flatMap(market => [
      {
        address,
        abi: CTF_ABI,
        functionName: 'payoutDenominator',
        args: [market.conditionId as `0x${string}`],
      },
      {
        address,
        abi: CTF_ABI,
        functionName: 'payoutNumerators',
        args: [market.conditionId as `0x${string}`, 0n],
      },
    ] as const),
  })

  const buckets: BucketResolution[] = markets.map((market, index) => {
    const denominator = results[index * 2]
    const yesNumerator = results[index * 2 + 1]

    const resolved
      = denominator?.status === 'success'
        && typeof denominator.result === 'bigint'
        && denominator.result > 0n

    return {
      conditionId: market.conditionId,
      outcome: market.groupItemTitle ?? '',
      resolved,
      yesWon: resolved && yesNumerator?.status === 'success' && typeof yesNumerator.result === 'bigint'
        ? yesNumerator.result > 0n
        : null,
    }
  })

  const winner = buckets.find(bucket => bucket.yesWon === true)

  return {
    slug,
    resolved: buckets.length > 0 && buckets.every(bucket => bucket.resolved),
    settledOutcome: winner?.outcome ?? null,
    buckets,
  }
}
