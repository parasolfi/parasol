import type { CoverOption } from './catalog'
import { singleOrderThreshold } from './basket'

export interface Exposure {
  optionId: string
  threshold: number
  payoutUsdc: number
  rationale: string
}

export interface AgentTurn {
  reply: string
  exposure: Exposure | null
  source: 'zg-router' | 'mock'
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const ROUTER_URL = process.env.ZG_ROUTER_URL ?? 'https://router-api.0g.ai/v1'
const MODEL = process.env.ZG_MODEL ?? '0gm-1.0-35b-a3b'

function catalogDigest(options: CoverOption[]): string {
  return options
    .map((o) => {
      const degs = o.buckets.filter((b) => b.thresholdDeg !== null).map((b) => b.thresholdDeg!)
      return `${o.id} | ${o.city} | ${o.date} | ${o.peril} | ${Math.min(...degs)}-${Math.max(...degs)}°${o.unit} | single-order threshold: ${singleOrderThreshold(o) ?? 'n/a'}`
    })
    .join('\n')
}

function systemPrompt(options: CoverOption[]): string {
  return `You are Parasol's cover broker. You interview a business owner to understand what weather event would hurt them, then map it onto EXACTLY ONE market from the catalog below. Never invent a city, date or market not in the catalog. If nothing in the catalog covers their exposure, say so honestly and list what IS coverable.

CATALOG (id | city | date | peril | bucket range | single-order threshold):
${catalogDigest(options)}

Rules:
- Ask short questions until you know: their business, the city, whether heat or cold hurts, the temperature at which pain starts, and roughly how much money a bad day costs them.
- Prefer thresholds at or beyond the single-order threshold when close to the client's pain point (cheaper, one signature).
- payoutUsdc between 50 and 10000.
- Respond ONLY with JSON, no markdown fences: {"reply": "<what you say to the client>", "exposure": null | {"optionId": "<catalog id>", "threshold": <number>, "payoutUsdc": <number>, "rationale": "<one line>"}}
- Keep exposure null until you are confident; then fill it and summarise the cover in reply.`
}

function validateTurn(raw: string, options: CoverOption[]): AgentTurn | null {
  let parsed: any
  try {
    parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim())
  } catch {
    return null
  }
  if (typeof parsed?.reply !== 'string') return null
  if (parsed.exposure === null || parsed.exposure === undefined)
    return { reply: parsed.reply, exposure: null, source: 'zg-router' }
  const e = parsed.exposure
  const option = options.find((o) => o.id === e?.optionId)
  if (!option || typeof e.threshold !== 'number' || typeof e.payoutUsdc !== 'number') return null
  if (e.payoutUsdc < 50 || e.payoutUsdc > 10_000) return null
  return {
    reply: parsed.reply,
    exposure: { optionId: e.optionId, threshold: e.threshold, payoutUsdc: e.payoutUsdc, rationale: String(e.rationale ?? '') },
    source: 'zg-router',
  }
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
  const pick = heatOptions.find((o) => new RegExp(`\\b${o.city}\\b`, 'i').test(userText)) ?? null
  const tempMatch = userText.match(/(?:above|over|beyond|past|reaches|au-dessus de|plus de)\s*(\d{1,3})|(\d{1,3})\s*°/i)
  const costMatch = userText.match(/[$€]\s*(\d{2,5})|(\d{2,5})\s*(?:\$|€|dollars?|euros?|usd)/i)

  if (!pick) {
    const cities = [...new Set(heatOptions.map((o) => o.city))].slice(0, 6).join(', ')
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

export async function runAgentTurn(history: ChatMessage[], options: CoverOption[]): Promise<AgentTurn> {
  const apiKey = process.env.ZG_ROUTER_API_KEY
  if (!apiKey) return mockTurn(history, options)

  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(options) }, ...history]
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await callRouter(messages, apiKey)
      const turn = validateTurn(raw, options)
      if (turn) return turn
      messages.push({ role: 'assistant', content: raw }, { role: 'user', content: 'Invalid: respond with the exact JSON shape only.' })
    } catch (err) {
      if (attempt === 2) break
    }
  }
  return mockTurn(history, options)
}
