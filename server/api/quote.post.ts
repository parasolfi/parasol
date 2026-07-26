import { alignedThresholds, buildBasket } from '../utils/basket'
import { getCoverEvent } from '../utils/catalogue'
import { fetchBucketQuotes } from '../utils/clob'

interface QuoteBody {
  eventSlug?: unknown
  threshold?: unknown
  payoutUsdc?: unknown
}

// Books on the tail buckets move fast (measured: +7% within minutes on Madrid). Past this
// window the quote must be refreshed before signing, otherwise the signed order no longer
// matches the premium that was shown.
const QUOTE_TTL_MS = 60_000

export default defineEventHandler(async (event) => {
  const body = await readBody<QuoteBody>(event)

  const eventSlug = typeof body.eventSlug === 'string' ? body.eventSlug : null
  const threshold = Number(body.threshold)
  const payoutUsdc = Number(body.payoutUsdc)

  if (!eventSlug) {
    throw createError({ statusCode: 400, statusMessage: 'eventSlug is required' })
  }
  if (!Number.isFinite(threshold)) {
    throw createError({ statusCode: 400, statusMessage: 'threshold must be a number' })
  }
  if (!Number.isFinite(payoutUsdc) || payoutUsdc <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'payoutUsdc must be a positive number' })
  }

  const coverEvent = await getCoverEvent(eventSlug)
  if (!coverEvent) {
    throw createError({ statusCode: 404, statusMessage: `event ${eventSlug} is not in the catalogue` })
  }

  const quotes = await fetchBucketQuotes(coverEvent.buckets)
  const basket = buildBasket({ event: coverEvent, threshold, payoutUsdc, quotes })

  const quotedAt = Date.now()

  return {
    ...basket,
    city: coverEvent.city,
    endDate: coverEvent.endDate,
    negRisk: coverEvent.negRisk,
    alignedThresholds: alignedThresholds(coverEvent),
    quotedAt: new Date(quotedAt).toISOString(),
    expiresAt: new Date(quotedAt + QUOTE_TTL_MS).toISOString(),
  }
})
