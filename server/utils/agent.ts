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
const MODEL = process.env.ZG_MODEL ?? 'zai-org/GLM-5-FP8'

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

// Keeps the demo alive with no key or a dead Router: scripted interview,
// deterministic pick. Same shape, flagged source so the UI can label it.
function mockTurn(history: ChatMessage[], options: CoverOption[]): AgentTurn {
  const userTurns = history.filter((m) => m.role === 'user').length
  const pick = options.find((o) => o.city === 'Madrid' && o.peril === 'heat') ?? options[0]
  if (userTurns < 2 || !pick)
    return {
      reply: "Tell me about your business — what do you do, in which city, and what kind of weather ruins a day for you?",
      exposure: null,
      source: 'mock',
    }
  const threshold = singleOrderThreshold(pick) ?? pick.buckets[pick.buckets.length - 1]!.thresholdDeg!
  return {
    reply: `Here is what I suggest: cover on "${pick.question}" paying out if the day reaches ${threshold}°${pick.unit} or more.`,
    exposure: { optionId: pick.id, threshold, payoutUsdc: 500, rationale: 'outdoor revenue exposed to extreme heat' },
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
