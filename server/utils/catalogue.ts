import type { Bucket, CoverEvent, Peril, Unit } from '~~/shared/types/cover'
import { DAILY_TEMPERATURE_TAG, GAMMA_HOST } from './polymarket'

const CACHE_TTL_MS = 5 * 60 * 1000

interface GammaMarket {
  conditionId: string
  groupItemTitle?: string
  clobTokenIds?: string
  bestAsk?: number
  closed?: boolean
  acceptingOrders?: boolean
}

interface GammaEvent {
  slug: string
  title: string
  endDate: string
  closed?: boolean
  negRisk?: boolean
  markets?: GammaMarket[]
}

const SLUG_RE = /^(highest|lowest)-temperature-in-(.+)-on-[a-z]+-\d+-\d{4}$/

// “27°C or below” · “82-83°F” · “96°F or higher” · “28°C”
const BUCKET_RE = /^(\d+)(?:\s*-\s*(\d+))?\s*°([CF])(?:\s+or\s+(below|higher))?$/i

let cache: { at: number, events: CoverEvent[] } | null = null

function parseBucket(title: string): { kind: Bucket['kind'], lo: number | null, hi: number | null, unit: Unit } | null {
  const m = title.trim().match(BUCKET_RE)
  if (!m) return null

  const first = Number(m[1])
  const second = m[2] === undefined ? null : Number(m[2])
  const unit = m[3]!.toUpperCase() as Unit
  const suffix = m[4]?.toLowerCase()

  if (suffix === 'below') return { kind: 'below', lo: null, hi: first, unit }
  if (suffix === 'higher') return { kind: 'tail', lo: first, hi: null, unit }
  return { kind: 'range', lo: first, hi: second ?? first, unit }
}

function firstTokenId(market: GammaMarket): string | null {
  if (!market.clobTokenIds) return null
  try {
    const ids = JSON.parse(market.clobTokenIds)
    return Array.isArray(ids) && typeof ids[0] === 'string' ? ids[0] : null
  }
  catch {
    return null
  }
}

function toCoverEvent(event: GammaEvent): CoverEvent | null {
  const slugMatch = event.slug.match(SLUG_RE)
  if (!slugMatch) return null

  const peril: Peril = slugMatch[1] === 'highest' ? 'heat' : 'cold'
  const city = slugMatch[2]!.replace(/-/g, ' ')

  let unit: Unit | null = null
  const buckets: Bucket[] = []

  for (const market of event.markets ?? []) {
    if (market.closed || market.acceptingOrders === false) continue

    const tokenId = firstTokenId(market)
    const parsed = market.groupItemTitle ? parseBucket(market.groupItemTitle) : null
    if (!tokenId || !parsed) continue

    unit ??= parsed.unit
    if (parsed.unit !== unit) continue

    buckets.push({
      tokenId,
      conditionId: market.conditionId,
      outcome: market.groupItemTitle!,
      kind: parsed.kind,
      lo: parsed.lo,
      hi: parsed.hi,
      bestAsk: typeof market.bestAsk === 'number' ? market.bestAsk : null,
    })
  }

  if (!unit || buckets.length < 2) return null

  buckets.sort((a, b) => (a.lo ?? Number.NEGATIVE_INFINITY) - (b.lo ?? Number.NEGATIVE_INFINITY))

  return {
    slug: event.slug,
    title: event.title,
    city,
    peril,
    unit,
    endDate: event.endDate,
    negRisk: event.negRisk === true,
    buckets,
  }
}

async function fetchDailyTemperatureEvents(): Promise<CoverEvent[]> {
  const raw = await $fetch<GammaEvent[]>(`${GAMMA_HOST}/events`, {
    query: {
      closed: false,
      limit: 200,
      tag_slug: DAILY_TEMPERATURE_TAG,
      order: 'endDate',
      ascending: true,
    },
  })

  // closed=false still returns events whose window has elapsed (seen: May 2026).
  const now = Date.now()

  return raw
    .filter(event => event.closed !== true && Date.parse(event.endDate) > now)
    .map(toCoverEvent)
    .filter((event): event is CoverEvent => event !== null)
}

export async function getCatalogue(force = false): Promise<CoverEvent[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.events

  const events = await fetchDailyTemperatureEvents()
  cache = { at: Date.now(), events }
  return events
}

export async function getCoverEvent(slug: string): Promise<CoverEvent | null> {
  const catalogue = await getCatalogue()
  return catalogue.find(event => event.slug === slug) ?? null
}
