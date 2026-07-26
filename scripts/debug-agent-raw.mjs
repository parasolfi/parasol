import { ethers } from 'ethers'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'

const PROVIDER = '0xa48f01287233509FD694a22Bf840225062E67836'
const catalogRes = await fetch('http://localhost:3100/api/catalog')
const options = (await catalogRes.json()).options.filter((o) => o.city === 'Madrid')

const digest = options
  .map((o) => {
    const degs = o.buckets.filter((b) => b.thresholdDeg !== null).map((b) => b.thresholdDeg)
    return `${o.id} | ${o.city} | ${o.date} | ${o.peril} | ${Math.min(...degs)}-${Math.max(...degs)}°${o.unit}`
  })
  .join('\n')

const system = `You are Parasol's cover broker. Extract four facts. Never pick markets or compute prices.

MARKETS AVAILABLE (city | date | peril | bucket range):
${digest}

Respond ONLY with JSON, no markdown fences:
{"reply": "<what you say>", "facts": null | {"city": "<city>", "peril": "heat"|"cold", "degrees": <number>, "cost": <number>, "rationale": "<one line>"}}`

const wallet = new ethers.Wallet(process.env.ZG_COMPUTE_PRIVATE_KEY, new ethers.JsonRpcProvider('https://evmrpc-testnet.0g.ai'))
const broker = await createZGComputeNetworkBroker(wallet)
const { endpoint, model } = await broker.inference.getServiceMetadata(PROVIDER)

const body = {
  model,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: 'I run outdoor events in Madrid, above 33C people stop coming. A bad day costs 500 dollars.' },
  ],
  temperature: 0.3,
}
const headers = await broker.inference.getRequestHeaders(PROVIDER, JSON.stringify(body))
const res = await fetch(`${endpoint}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})
console.log('HTTP', res.status)
const data = await res.json()
console.log('RAW:', JSON.stringify(data.choices?.[0]?.message?.content ?? data).slice(0, 900))
