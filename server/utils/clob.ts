const CLOB_API = 'https://clob.polymarket.com'

export interface BookLevel {
  price: number
  size: number
}

export interface MarketRules {
  tickSize: number
  minOrderSize: number
  negRisk: boolean
}

// Gamma's bestAsk is a snapshot; the book gives real depth, so a quote can
// price what it would actually pay instead of the top level only.
export async function getBook(tokenId: string): Promise<BookLevel[]> {
  const res = await fetch(`${CLOB_API}/book?token_id=${tokenId}`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.asks ?? [])
    .map((l: any) => ({ price: Number(l.price), size: Number(l.size) }))
    .filter((l: BookLevel) => l.price > 0 && l.size > 0)
    .sort((a: BookLevel, b: BookLevel) => a.price - b.price)
}

export interface FillEstimate {
  averagePrice: number
  worstPrice: number
  filledShares: number
  depthShort: boolean
}

export function estimateFill(asks: BookLevel[], shares: number): FillEstimate | null {
  if (asks.length === 0 || shares <= 0) return null
  let remaining = shares
  let cost = 0
  let worstPrice = 0
  for (const level of asks) {
    if (remaining <= 0) break
    const take = Math.min(level.size, remaining)
    cost += take * level.price
    worstPrice = level.price
    remaining -= take
  }
  const filled = shares - remaining
  if (filled <= 0) return null
  return {
    averagePrice: cost / filled,
    worstPrice,
    filledShares: filled,
    depthShort: remaining > 0,
  }
}

export interface FeeParams {
  rate: number
  exponent: number
}

// /markets exposes taker_base_fee (1000): that is the value written into a
// signed order, not a multiplier. The rate that prices the cost is fd.r on
// /clob-markets, which is what the SDK feeds to adjustBuyAmountForFees.
// Swapping the two is a 100x error on the premium.
export async function getFeeParams(conditionId: string): Promise<FeeParams> {
  const res = await fetch(`${CLOB_API}/clob-markets/${conditionId}`)
  if (!res.ok) return { rate: 0, exponent: 1 }
  const data = await res.json()
  return { rate: Number(data?.fd?.r) || 0, exponent: Number(data?.fd?.e) || 1 }
}

// Polymarket's taker fee, mirroring adjustBuyAmountForFees in clob-client-v2:
// it peaks mid-book and vanishes at the extremes.
export function takerFee(shares: number, price: number, fee: FeeParams): number {
  return shares * fee.rate * (price * (1 - price)) ** fee.exponent
}

export async function getMarketRules(conditionId: string): Promise<MarketRules | null> {
  const res = await fetch(`${CLOB_API}/markets/${conditionId}`)
  if (!res.ok) return null
  const data = await res.json()
  return {
    tickSize: Number(data.minimum_tick_size) || 0.001,
    minOrderSize: Number(data.minimum_order_size) || 5,
    negRisk: Boolean(data.neg_risk),
  }
}

export async function isGeoBlocked(): Promise<boolean> {
  try {
    const res = await fetch('https://polymarket.com/api/geoblock')
    if (!res.ok) return true
    return Boolean((await res.json()).blocked)
  } catch {
    return true
  }
}
