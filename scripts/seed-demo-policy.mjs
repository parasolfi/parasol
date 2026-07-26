// Seeds yesterday's winning cover so the demo can show a real, already-resolved
// payout. Goes through /api/dev/seed-policy — the real issuance path — so the
// seeded policy carries the same proofs as one bought live: encrypted profile on
// 0G Storage, attestation on Galileo, and its own ENS name. Writing the store
// directly, as this used to, produced a policy with none of them.
// Usage: node scripts/seed-demo-policy.mjs <city> <holder>

const GAMMA_API = 'https://gamma-api.polymarket.com'
const APP = process.env.APP_URL ?? 'http://localhost:3100'
const city = process.argv[2] ?? 'Madrid'
const holder = process.argv[3] ?? '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

function hasWinner(m) {
  try {
    const prices = JSON.parse(m.outcomePrices ?? '[]')
    return prices.length > 0 && Number(prices[0]) === 1
  } catch {
    return false
  }
}

const res = await fetch(`${GAMMA_API}/events?tag_slug=weather&closed=true&order=endDate&ascending=false&limit=60`)
const events = await res.json()

const event = events.find((e) => e.title?.startsWith(`Highest temperature in ${city}`) && e.markets?.some(hasWinner))
if (!event) {
  console.error(`no resolved "${city}" event found in the latest closed weather events`)
  process.exit(1)
}

const winner = event.markets.find(hasWinner)
const tokenId = JSON.parse(winner.clobTokenIds)[0]
const payout = 400
const ask = 0.37

const seeded = await fetch(`${APP}/api/dev/seed-policy`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    holder,
    eventSlug: `polymarket-${event.id}`,
    question: event.title,
    tokenIds: [tokenId],
    conditionIds: [winner.conditionId],
    shares: payout,
    premiumUsdc: Math.round(payout * ask * 100) / 100,
    profile: `outdoor event organizer, ${city}, heat`,
    issuedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
  }),
})

if (!seeded.ok) {
  console.error(`seed failed: ${seeded.status} ${(await seeded.text()).slice(0, 200)}`)
  process.exit(1)
}

const { policy } = await seeded.json()
console.log(`seeded policy #${policy.id}: ${event.title}`)
console.log(`winning bucket: ${winner.question}`)
console.log(`  storage:     ${policy.storage ? policy.storage.rootHash : 'none'}`)
console.log(`  attestation: ${policy.chain ? policy.chain.txHash : 'none'}`)
console.log(`  ens:         ${policy.ens ? policy.ens.name : 'none'}`)
console.log('now POST /api/resolve to flip it to Paid and pay the holder on the fork')
