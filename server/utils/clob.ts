import type { OrderBookSummary } from '@polymarket/clob-client-v2'
import type { BookLevel, BucketQuote } from './basket'
import { ClobClient, Side } from '@polymarket/clob-client-v2'
import { CLOB_HOST, POLYGON_CHAIN_ID } from './polymarket'

let client: ClobClient | null = null

/** Read-only: no signer, no creds — the server never signs anything on Polygon. */
export function readOnlyClob(): ClobClient {
  client ??= new ClobClient({ host: CLOB_HOST, chain: POLYGON_CHAIN_ID })
  return client
}

function toLevels(levels: OrderBookSummary['asks']): BookLevel[] {
  return levels
    .map(level => ({ price: Number(level.price), size: Number(level.size) }))
    .filter(level => Number.isFinite(level.price) && Number.isFinite(level.size) && level.size > 0)
}

export interface QuotableBucket {
  tokenId: string
  conditionId: string
}

/**
 * Two distinct rates, not interchangeable: `fd.r` / `fd.e` price the cost, while
 * `getFeeRateBps()` (1000) is the value written into the signed order.
 * Mixing them up throws the premium off by a factor of 100.
 */
export async function fetchBucketQuotes(buckets: QuotableBucket[]): Promise<Map<string, BucketQuote>> {
  const clob = readOnlyClob()
  const quotes = new Map<string, BucketQuote>()
  if (buckets.length === 0) return quotes

  const [books, ...details] = await Promise.all([
    clob.getOrderBooks(buckets.map(bucket => ({ token_id: bucket.tokenId, side: Side.BUY }))),
    ...buckets.map(bucket => clob.getClobMarketInfo(bucket.conditionId).catch(() => null)),
  ])

  const detailByToken = new Map(buckets.map((bucket, index) => [bucket.tokenId, details[index]]))
  const bookByToken = new Map((books ?? []).filter(book => book?.asset_id).map(book => [book.asset_id, book]))

  for (const bucket of buckets) {
    const book = bookByToken.get(bucket.tokenId)
    if (!book) continue

    const detail = detailByToken.get(bucket.tokenId)

    quotes.set(bucket.tokenId, {
      asks: toLevels(book.asks ?? []),
      minOrderSize: Number(book.min_order_size) || detail?.mos || 0,
      tickSize: Number(book.tick_size) || detail?.mts || 0.01,
      feeRate: detail?.fd?.r ?? 0,
      feeExponent: detail?.fd?.e ?? 1,
    })
  }

  return quotes
}
