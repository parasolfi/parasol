import type { CoverBucket, CoverOption } from './catalog'
import { getBook, estimateFill } from './clob'

export interface BasketLeg {
  tokenId: string
  conditionId: string
  label: string
  ask: number
  shares: number
  limitPrice?: number
  depthShort?: boolean
}

export interface Basket {
  legs: BasketLeg[]
  payoutUsdc: number
  premiumUsdc: number
  impliedProbability: number
  signatureCount: number
  pricedFrom: 'book' | 'snapshot'
}

// Cover pays out when the reading crosses the client's pain threshold:
// heat -> buckets at or above it (plus the high tail, never the low one),
// cold -> buckets at or below it (plus the low tail).
function coveredBuckets(option: CoverOption, threshold: number): CoverBucket[] {
  return option.buckets.filter((b) => {
    if (b.tail === 'high') return option.peril === 'heat'
    if (b.tail === 'low') return option.peril === 'cold'
    if (b.thresholdDeg === null) return false
    return option.peril === 'heat' ? b.thresholdDeg >= threshold : b.thresholdDeg <= threshold
  })
}

export function buildBasket(option: CoverOption, threshold: number, payoutUsdc: number): Basket | null {
  const legs = coveredBuckets(option, threshold)
  if (legs.length === 0) return null
  const impliedProbability = legs.reduce((s, b) => s + b.ask, 0)
  return {
    legs: legs.map((b) => ({
      tokenId: b.tokenId,
      conditionId: b.conditionId,
      label: b.label,
      ask: b.ask,
      shares: payoutUsdc,
    })),
    payoutUsdc,
    premiumUsdc: round2(payoutUsdc * impliedProbability),
    impliedProbability: Math.min(1, round4(impliedProbability)),
    signatureCount: legs.length,
    pricedFrom: 'snapshot',
  }
}

// Reprices a basket against live book depth: the premium a real order would
// pay, not the top-of-book snapshot, plus the limit price each leg needs.
export async function priceBasketFromBook(basket: Basket): Promise<Basket> {
  const priced = await Promise.all(
    basket.legs.map(async (leg) => {
      const fill = estimateFill(await getBook(leg.tokenId), leg.shares)
      if (!fill) return leg
      return { ...leg, ask: round4(fill.averagePrice), limitPrice: round4(fill.worstPrice), depthShort: fill.depthShort }
    }),
  )
  if (priced.every((l, i) => l.ask === basket.legs[i]!.ask && l.limitPrice === undefined)) return basket
  const impliedProbability = priced.reduce((s, l) => s + l.ask, 0)
  return {
    ...basket,
    legs: priced,
    premiumUsdc: round2(basket.payoutUsdc * impliedProbability),
    impliedProbability: Math.min(1, round4(impliedProbability)),
    pricedFrom: 'book',
  }
}

// The tail-start threshold turns the basket into a single order (one
// signature, minimal fees) — the agent proposes it when close to the ask.
export function singleOrderThreshold(option: CoverOption): number | null {
  const wanted = option.peril === 'heat' ? 'high' : 'low'
  const tail = option.buckets.find((b) => b.tail === wanted)
  return tail?.thresholdDeg ?? null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000
