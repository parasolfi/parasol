import type { CoverBucket, CoverOption } from './catalog'
import { getBook, estimateFill, getFeeParams, takerFee } from './clob'

// The client signs a ceiling, not the exact premium: an exact figure is stale
// before the wallet returns a signature. Measured on the Madrid buckets, the
// repriced total swings ~1% within 90s and more across the minutes it takes to
// read a quote and confirm in MetaMask, so 2% rejects honest covers.
export const QUOTE_SLIPPAGE = 0.05

export interface BasketLeg {
  tokenId: string
  conditionId: string
  label: string
  ask: number
  shares: number
  limitPrice?: number
  depthShort?: boolean
  feeUsdc?: number
  thresholdDeg?: number | null
}

export interface Basket {
  legs: BasketLeg[]
  payoutUsdc: number
  premiumUsdc: number
  feesUsdc: number
  maxPremiumUsdc: number
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
      thresholdDeg: b.thresholdDeg,
    })),
    payoutUsdc,
    premiumUsdc: round2(payoutUsdc * impliedProbability),
    feesUsdc: 0,
    maxPremiumUsdc: round2(payoutUsdc * impliedProbability),
    impliedProbability: Math.min(1, round4(impliedProbability)),
    signatureCount: legs.length,
    pricedFrom: 'snapshot',
  }
}

// Reprices a basket against live book depth: the premium a real order would
// pay, not the top-of-book snapshot, plus the limit price each leg needs and
// the taker fee, which the snapshot ignores entirely.
export async function priceBasketFromBook(basket: Basket): Promise<Basket> {
  const priced = await Promise.all(
    basket.legs.map(async (leg) => {
      const [book, fee] = await Promise.all([getBook(leg.tokenId), getFeeParams(leg.conditionId)])
      const fill = estimateFill(book, leg.shares)
      if (!fill) return { leg, fee: 0 }
      const legFee = takerFee(fill.filledShares, fill.averagePrice, fee)
      return {
        leg: {
          ...leg,
          ask: round4(fill.averagePrice),
          limitPrice: round4(fill.worstPrice),
          depthShort: fill.depthShort,
          feeUsdc: round2(legFee),
        },
        fee: legFee,
      }
    }),
  )

  const legs = priced.map((p) => p.leg)
  const impliedProbability = legs.reduce((s, l) => s + l.ask, 0)
  const premiumUsdc = round2(basket.payoutUsdc * impliedProbability)
  const feesUsdc = round2(priced.reduce((s, p) => s + p.fee, 0))

  return {
    ...basket,
    legs,
    premiumUsdc,
    feesUsdc,
    maxPremiumUsdc: round2((premiumUsdc + feesUsdc) * (1 + QUOTE_SLIPPAGE)),
    impliedProbability: Math.min(1, round4(impliedProbability)),
    pricedFrom: 'book',
  }
}

export function basketTotal(basket: Basket): number {
  return round2(basket.premiumUsdc + basket.feesUsdc)
}

/**
 * Buying every bucket above a low threshold can cost more than the cover can
 * ever pay: on Madrid July 27 at 33°C the premium reached 1410 USDC against a
 * 1000 USDC payout. Raising the threshold drops the cheapest legs, so the
 * answer is a subset of the priced basket — no extra book reads needed.
 *
 * Returns the lowest threshold whose premium plus fees stays under the payout,
 * or null when even the tail alone costs too much.
 */
export function cheapestViableThreshold(basket: Basket): number | null {
  const ordered = [...basket.legs].sort(
    (a, b) => (a.thresholdDeg ?? Number.NEGATIVE_INFINITY) - (b.thresholdDeg ?? Number.NEGATIVE_INFINITY),
  )

  let premium = basket.premiumUsdc
  let fees = basket.feesUsdc

  for (const leg of ordered) {
    if (round2(premium + fees) < basket.payoutUsdc && leg.thresholdDeg != null) return leg.thresholdDeg
    premium -= leg.ask * basket.payoutUsdc
    fees -= leg.feeUsdc ?? 0
  }

  return null
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
