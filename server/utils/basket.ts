import type { Basket, BasketLeg, Bucket, CoverEvent } from '~~/shared/types/cover'

export interface BookLevel {
  price: number
  size: number
}

export interface BucketQuote {
  asks: BookLevel[]
  minOrderSize: number
  tickSize: number
  feeRate: number
  feeExponent: number
}

export interface BasketInput {
  event: CoverEvent
  threshold: number
  payoutUsdc: number
  quotes: Map<string, BucketQuote>
}

export function takerFee(shares: number, price: number, feeRate: number, feeExponent: number): number {
  return shares * feeRate * (price * (1 - price)) ** feeExponent
}

function isWinning(bucket: Bucket, threshold: number, peril: CoverEvent['peril']): boolean {
  return peril === 'heat'
    ? bucket.lo !== null && bucket.lo >= threshold
    : bucket.hi !== null && bucket.hi <= threshold
}

function straddlesThreshold(bucket: Bucket, threshold: number, peril: CoverEvent['peril']): boolean {
  if (peril === 'heat') {
    const hi = bucket.hi ?? Number.POSITIVE_INFINITY
    const lo = bucket.lo ?? Number.NEGATIVE_INFINITY
    return lo < threshold && hi >= threshold
  }
  const hi = bucket.hi ?? Number.POSITIVE_INFINITY
  const lo = bucket.lo ?? Number.NEGATIVE_INFINITY
  return hi > threshold && lo <= threshold
}

/**
 * Walks the book up to `shares`. The CLOB returns asks in descending price order,
 * so the best one is last — hence the explicit sort.
 */
function walkAsks(asks: BookLevel[], shares: number): { filled: number, cost: number, limitPrice: number | null } {
  const sorted = [...asks].sort((a, b) => a.price - b.price)

  let remaining = shares
  let cost = 0
  let limitPrice: number | null = null

  for (const level of sorted) {
    if (remaining <= 0) break
    const take = Math.min(remaining, level.size)
    cost += take * level.price
    remaining -= take
    limitPrice = level.price
  }

  return { filled: shares - remaining, cost, limitPrice }
}

export function buildBasket({ event, threshold, payoutUsdc, quotes }: BasketInput): Basket {
  const warnings: string[] = []

  const straddling = event.buckets.filter(bucket => straddlesThreshold(bucket, threshold, event.peril))
  const winning = event.buckets.filter(bucket => isWinning(bucket, threshold, event.peril))

  for (const bucket of straddling) {
    warnings.push(
      `“${bucket.outcome}” straddles the ${threshold}°${event.unit} threshold: it is not bought, cover starts above it.`,
    )
  }

  const legs: BasketLeg[] = []
  let premium = 0
  let fees = 0

  for (const bucket of winning) {
    const quote = quotes.get(bucket.tokenId)
    if (!quote || quote.asks.length === 0) {
      warnings.push(`No liquidity quoted on “${bucket.outcome}” — leg dropped from the basket.`)
      continue
    }

    const { filled, cost, limitPrice } = walkAsks(quote.asks, payoutUsdc)

    if (filled < payoutUsdc) {
      warnings.push(
        `Not enough depth on “${bucket.outcome}”: ${filled} shares available out of ${payoutUsdc} requested.`,
      )
    }
    if (filled < quote.minOrderSize) {
      warnings.push(`“${bucket.outcome}” is below the minimum size (${quote.minOrderSize}) — leg dropped.`)
      continue
    }

    const price = cost / filled
    const legFee = takerFee(filled, price, quote.feeRate, quote.feeExponent)

    legs.push({
      tokenId: bucket.tokenId,
      conditionId: bucket.conditionId,
      outcome: bucket.outcome,
      shares: filled,
      price: limitPrice ?? price,
      cost,
    })

    premium += cost
    fees += legFee
  }

  const tailKind = event.peril === 'heat' ? 'tail' : 'below'
  const tailOnly = legs.length === 1 && winning[0]?.kind === tailKind

  return {
    eventSlug: event.slug,
    peril: event.peril,
    threshold,
    unit: event.unit,
    payoutUsdc,
    legs,
    premium,
    fees,
    impliedProbability: payoutUsdc > 0 ? premium / payoutUsdc : 0,
    signatures: legs.length,
    tailOnly,
    warnings,
  }
}

/**
 * Thresholds that cut no bucket in half — the ones the agent should offer first
 * (fewer signatures, no grey zone).
 */
export function alignedThresholds(event: CoverEvent): number[] {
  const values = event.peril === 'heat'
    ? event.buckets.map(bucket => bucket.lo)
    : event.buckets.map(bucket => bucket.hi)

  return values.filter((value): value is number => value !== null).sort((a, b) => a - b)
}
