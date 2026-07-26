import type { CoverOption } from './catalog'
import { singleOrderThreshold } from './basket'
import { brokerCompletion } from './zg-broker'

export interface Exposure {
  optionId: string
  threshold: number
  payoutUsdc: number
  rationale: string
}

export type InferenceSource = 'zg-router' | 'zg-compute' | 'mock'

export interface AgentTurn {
  reply: string
  exposure: Exposure | null
  source: InferenceSource
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const ROUTER_URL = process.env.ZG_ROUTER_URL ?? 'https://router-api.0g.ai/v1'
const MODEL = process.env.ZG_MODEL ?? '0gm-1.0-35b-a3b'

// Only the cities the client actually mentioned reach the prompt: the full
// catalog runs ~100 lines and the model starts picking unrelated cities.
function catalogDigest(options: CoverOption[]): string {
  return options
    .map((o) => {
      const degs = o.buckets.filter((b) => b.thresholdDeg !== null).map((b) => b.thresholdDeg!)
      return `${o.id} | ${o.city} | ${o.date} | ${o.peril} | ${Math.min(...degs)}-${Math.max(...degs)}°${o.unit} | single-order threshold: ${singleOrderThreshold(o) ?? 'n/a'}`
    })
    .join('\n')
}

// City names come straight out of Polymarket event titles, so they reach this
// unescaped: "Washington, D.C." or a stray bracket compiles to a different
// pattern, or throws SyntaxError and takes the whole turn down.
function mentions(text: string, city: string): boolean {
  return new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
}

function citiesMentioned(options: CoverOption[], text: string): string[] {
  return [...new Set(options.map((o) => o.city))].filter((c) => mentions(text, c))
}

// The provider caps requests at 2000 tokens/min, so the market table is only
// sent for cities the client actually named; otherwise the city names alone.
function relevantOptions(options: CoverOption[], history: ChatMessage[]): CoverOption[] {
  const text = history.filter((m) => m.role === 'user').map((m) => m.content).join(' ')
  const cities = citiesMentioned(options, text)
  return cities.length > 0 ? options.filter((o) => cities.includes(o.city)) : []
}

function systemPrompt(options: CoverOption[], allCities: string[]): string {
  const markets = options.length
    ? `MARKETS FOR THE CITY THEY NAMED (id | city | date | peril | bucket range):\n${catalogDigest(options)}\n`
    : ''
  return `You are Parasol's cover broker. You interview a business owner and extract four facts. You never pick markets or compute prices — the pricing engine does that from your facts.

${markets}
Coverable cities: ${allCities.join(', ')}.

Ask short, warm questions until you know all four facts:
1. city — must be one of the coverable cities above
2. peril — "heat" if hot days hurt them, "cold" if cold days do
3. degrees — the temperature at which their business starts losing money
4. cost — what one such day costs them, in dollars

Respond ONLY with JSON, no markdown fences:
{"reply": "<what you say to the client>", "facts": null | {"city": "<exact city name>", "peril": "heat"|"cold", "degrees": <number>, "cost": <number>, "rationale": "<one line>"}}

Keep facts null until you have all four. Repeat back their own numbers — never substitute your own.

CRITICAL: if the client names a city that is NOT in the coverable list above, say plainly that you cannot cover that city yet and name it. Do NOT list alternative cities yourself — the interface shows the authoritative list. Never pretend to gather more details about an uncoverable city, and never silently switch them to another city.`
}

const CITIES_LISTED = 12

function coverableCitiesLine(options: CoverOption[]): string {
  const cities = [...new Set(options.map((o) => o.city))].sort()
  const rest = cities.length - CITIES_LISTED
  const listed = cities.slice(0, CITIES_LISTED).join(', ')
  return rest > 0 ? `Coverable today: ${listed} — and ${rest} more.` : `Coverable today: ${listed}.`
}

// The model extracts facts; the engine owns market choice and threshold, so a
// hallucinated city or a drifting threshold cannot reach the quote.
function factsToExposure(facts: any, options: CoverOption[]): Exposure | null {
  if (!facts || typeof facts.degrees !== 'number' || typeof facts.cost !== 'number') return null
  const peril = facts.peril === 'cold' ? 'cold' : 'heat'
  const candidates = options
    .filter((o) => o.peril === peril && String(facts.city ?? '').toLowerCase() === o.city.toLowerCase())
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
  const option = candidates[0]
  if (!option) return null

  const degs = option.buckets.filter((b) => b.thresholdDeg !== null).map((b) => b.thresholdDeg!)
  const threshold = Math.min(Math.max(facts.degrees, Math.min(...degs)), Math.max(...degs))
  const payoutUsdc = Math.min(Math.max(Math.round(facts.cost), 50), 10_000)

  return { optionId: option.id, threshold, payoutUsdc, rationale: String(facts.rationale ?? '') }
}

function validateTurn(raw: string, options: CoverOption[], source: InferenceSource): AgentTurn | null {
  let parsed: any
  try {
    parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim())
  } catch {
    return null
  }
  if (typeof parsed?.reply !== 'string') return null
  if (!parsed.facts) return { reply: parsed.reply, exposure: null, source }

  const exposure = factsToExposure(parsed.facts, options)
  if (!exposure) return null
  return { reply: parsed.reply, exposure, source }
}

async function callRouter(messages: ChatMessage[], apiKey: string): Promise<string> {
  const res = await fetch(`${ROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.3 }),
  })
  if (!res.ok) throw new Error(`router ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('router: empty completion')
  return content
}

// Keeps the demo alive with no key or a dead Router: a scripted interview
// that actually reads the client's answers — city, threshold, cost — asks
// for what is missing, proposes once, then points at the quote card.
function mockTurn(history: ChatMessage[], options: CoverOption[]): AgentTurn {
  const userText = history.filter((m) => m.role === 'user').map((m) => m.content).join(' ')
  const alreadyProposed = history.some((m) => m.role === 'assistant' && m.content.includes('Here is the cover'))

  const heatOptions = options.filter((o) => o.peril === 'heat')
  const pick = heatOptions.find((o) => mentions(userText, o.city)) ?? null
  const tempMatch = userText.match(/(?:above|over|beyond|past|reaches|au-dessus de|plus de)\s*(\d{1,3})|(\d{1,3})\s*°/i)
  const costMatch = userText.match(/[$€]\s*(\d{2,5})|(\d{2,5})\s*(?:\$|€|dollars?|euros?|usd)/i)

  if (!pick) {
    const cities = [...new Set(heatOptions.map((o) => o.city))]
      .sort((a, b) => (a === 'Madrid' ? -1 : b === 'Madrid' ? 1 : 0))
      .slice(0, 8)
      .join(', ')
    return {
      reply: `Got it. Which city are you in? I can currently cover daily temperature in: ${cities}.`,
      exposure: null,
      source: 'mock',
    }
  }
  if (!tempMatch) {
    return {
      reply: `${pick.city} — noted. At what temperature does the day start hurting your business? For reference, the market covers ${pick.question.toLowerCase().replace('?', '')}.`,
      exposure: null,
      source: 'mock',
    }
  }
  if (!costMatch) {
    return {
      reply: 'Last one: roughly how much money does such a day cost you, in dollars? That sets your payout.',
      exposure: null,
      source: 'mock',
    }
  }

  const degs = pick.buckets.filter((b) => b.thresholdDeg !== null).map((b) => b.thresholdDeg!)
  const rawThreshold = parseInt(tempMatch[1] ?? tempMatch[2]!, 10)
  const threshold = Math.min(Math.max(rawThreshold, Math.min(...degs)), Math.max(...degs))
  const payoutUsdc = Math.min(Math.max(parseInt(costMatch[1] ?? costMatch[2]!, 10), 50), 10_000)
  const exposure = {
    optionId: pick.id,
    threshold,
    payoutUsdc,
    rationale: `revenue exposed above ${threshold}°${pick.unit} in ${pick.city}`,
  }

  if (alreadyProposed) {
    return {
      reply: 'Your quote is ready on the right — connect your wallet and hit "Cover me" to execute it.',
      exposure,
      source: 'mock',
    }
  }
  return {
    reply: `Here is the cover: "${pick.question}" paying $${payoutUsdc} if the day reaches ${threshold}°${pick.unit} or more. The premium is the market's own odds times your payout — check the card on the right.`,
    exposure,
    source: 'mock',
  }
}

// Inference tiers: Router key, then the direct compute broker (wallet-signed
// requests settled on Galileo), then the scripted interview.
export async function runAgentTurn(history: ChatMessage[], options: CoverOption[]): Promise<AgentTurn> {
  const apiKey = process.env.ZG_ROUTER_API_KEY
  const source: InferenceSource = apiKey ? 'zg-router' : 'zg-compute'
  const scoped = relevantOptions(options, history)
  const allCities = [...new Set(options.map((o) => o.city))]
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(scoped, allCities) }, ...history]

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = apiKey ? await callRouter(messages, apiKey) : await brokerCompletion(messages)
      if (raw === null) break
      const turn = validateTurn(raw, scoped, source)
      if (turn) {
        const namedCoverable = citiesMentioned(options, history.filter((m) => m.role === 'user').map((m) => m.content).join(' '))
        if (!turn.exposure && namedCoverable.length === 0)
          turn.reply = `${turn.reply}\n\n${coverableCitiesLine(options)}`
        return turn
      }
      messages.push(
        { role: 'assistant', content: raw },
        { role: 'user', content: 'Invalid. Use the exact JSON shape, a coverable city, and my own numbers.' },
      )
    } catch {
      if (attempt === 2) break
    }
  }
  return mockTurn(history, options)
}
