const GAMMA_API = 'https://gamma-api.polymarket.com'

export interface CoverBucket {
  tokenId: string
  conditionId: string
  label: string
  thresholdDeg: number | null
  tail: 'low' | 'high' | null
  ask: number
  minOrderSize: number
  tickSize: number
}

export interface CoverOption {
  id: string
  venue: 'polymarket'
  executable: boolean
  question: string
  city: string
  date: string
  peril: 'heat' | 'cold'
  unit: 'C' | 'F'
  endDate: string
  buckets: CoverBucket[]
}

const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { at: number; options: CoverOption[] } | null = null

const EVENT_TITLE_RE = /^(Highest|Lowest) temperature in (.+?) on (.+?)\?$/i
const BUCKET_RE = /be (-?\d+(?:-\d+)?)°([CF])(?: or (below|lower|above|higher))?/i

function parseJsonArray(raw: unknown): any[] {
  try {
    const parsed = JSON.parse(typeof raw === 'string' ? raw : '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseBucket(m: any): CoverBucket | null {
  if (m.closed || m.active === false) return null
  const q = (m.question ?? '').match(BUCKET_RE)
  if (!q) return null
  const tokenIds = parseJsonArray(m.clobTokenIds)
  if (!tokenIds[0]) return null
  const dir = q[3]?.toLowerCase()
  const ask = Number(m.bestAsk) || Number(parseJsonArray(m.outcomePrices)[0]) || 0
  return {
    tokenId: tokenIds[0],
    conditionId: m.conditionId,
    label: `${q[1]}°${q[2]}${dir ? ` or ${dir}` : ''}`,
    thresholdDeg: parseFloat(q[1]),
    tail: dir === 'below' || dir === 'lower' ? 'low' : dir === 'above' || dir === 'higher' ? 'high' : null,
    ask,
    minOrderSize: Number(m.orderMinSize) || 5,
    tickSize: Number(m.orderPriceMinTickSize) || 0.001,
  }
}

function toCoverOption(event: any): CoverOption | null {
  if (event.closed) return null
  if (!event.endDate || new Date(event.endDate).getTime() <= Date.now()) return null
  const t = (event.title ?? '').match(EVENT_TITLE_RE)
  if (!t || !t[1] || !t[2] || !t[3]) return null
  const buckets = (event.markets ?? []).map(parseBucket).filter(Boolean) as CoverBucket[]
  if (buckets.length < 2) return null
  // markets[0] can be a closed or malformed bucket that parseBucket dropped, so
  // its question is not guaranteed to exist, let alone to match.
  const unit = ((event.markets as any[]).map((m) => (m?.question ?? '').match(BUCKET_RE)?.[2]).find(Boolean) ?? 'C') as 'C' | 'F'
  return {
    id: `polymarket-${event.id}`,
    venue: 'polymarket',
    executable: true,
    question: event.title,
    city: t[2],
    date: t[3],
    peril: t[1].toLowerCase() === 'highest' ? 'heat' : 'cold',
    unit,
    endDate: event.endDate ?? '',
    buckets: buckets.sort((a, b) => (a.thresholdDeg ?? 0) - (b.thresholdDeg ?? 0)),
  }
}

// The weather tag is the reliable listing surface — public-search ranking
// drops cities unpredictably. Gamma caps limit at 100, hence two pages.
async function fetchWeatherEvents(offset: number): Promise<any[]> {
  const res = await fetch(`${GAMMA_API}/events?tag_slug=weather&closed=false&limit=100&offset=${offset}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function getCatalog(): Promise<CoverOption[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.options

  const pages = await Promise.allSettled([fetchWeatherEvents(0), fetchWeatherEvents(100)])
  const events = pages.flatMap((p) => (p.status === 'fulfilled' ? p.value : []))

  const seen = new Set<string>()
  const options: CoverOption[] = []
  for (const e of events) {
    const opt = toCoverOption(e)
    if (opt && !seen.has(opt.id)) {
      seen.add(opt.id)
      options.push(opt)
    }
  }

  if (options.length > 0) cache = { at: Date.now(), options }
  return options
}

export async function findCoverOption(id: string): Promise<CoverOption | null> {
  const options = await getCatalog()
  return options.find((o) => o.id === id) ?? null
}
