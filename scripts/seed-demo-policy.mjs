// Seeds yesterday's winning cover as a policy so the demo can show a real,
// already-resolved payout. Run the morning of the demo, then POST /api/resolve.
// Usage: node scripts/seed-demo-policy.mjs <city> <holder>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const GAMMA_API = 'https://gamma-api.polymarket.com'
const city = process.argv[2] ?? 'Madrid'
const holder = process.argv[3] ?? '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

const res = await fetch(`${GAMMA_API}/events?tag_slug=weather&closed=true&order=endDate&ascending=false&limit=60`)
const events = await res.json()

const event = events.find(
  (e) => e.title?.startsWith(`Highest temperature in ${city}`) && e.markets?.some((m) => hasWinner(m)),
)
if (!event) {
  console.error(`no resolved "${city}" event found in the latest closed weather events`)
  process.exit(1)
}

function hasWinner(m) {
  try {
    const prices = JSON.parse(m.outcomePrices ?? '[]')
    return prices.length > 0 && Number(prices[0]) === 1
  } catch {
    return false
  }
}

const winner = event.markets.find(hasWinner)
const tokenId = JSON.parse(winner.clobTokenIds)[0]
const payout = 400
const ask = 0.37

const storePath = '.data/policies.json'
mkdirSync('.data', { recursive: true })
let records = []
try {
  records = JSON.parse(readFileSync(storePath, 'utf8'))
} catch {}

const issuedAt = new Date(Date.now() - 12 * 3600 * 1000).toISOString()
records.push({
  id: records.length,
  holder,
  eventSlug: `polymarket-${event.id}`,
  question: event.title,
  tokenIds: [tokenId],
  conditionIds: [winner.conditionId],
  shares: payout,
  premiumUsdc: Math.round(payout * ask * 100) / 100,
  profile: `outdoor event organizer, ${city}, heat`,
  issuedAt,
  status: 'Issued',
  chain: null,
})
writeFileSync(storePath, JSON.stringify(records, null, 2))

console.log(`seeded policy #${records.length - 1}: ${event.title}`)
console.log(`winning bucket: ${winner.question}`)
console.log('now POST /api/resolve to flip it to Paid and pay the holder on the fork')
