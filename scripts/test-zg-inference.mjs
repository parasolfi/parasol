import { ethers } from 'ethers'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'

const PROVIDER = '0xa48f01287233509FD694a22Bf840225062E67836'

const rpc = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'
const wallet = new ethers.Wallet(process.env.ZG_DEPLOYER_PRIVATE_KEY, new ethers.JsonRpcProvider(rpc))
const broker = await createZGComputeNetworkBroker(wallet)

try {
  const ledger = await broker.ledger.getLedger()
  console.log('ledger existant, balance:', ledger.totalBalance?.toString?.() ?? JSON.stringify(ledger))
} catch {
  console.log('creation ledger + depot 0.02 OG...')
  await broker.ledger.addLedger(0.02)
  console.log('ledger cree')
}

await broker.inference.acknowledgeProviderSigner(PROVIDER)
console.log('provider acknowledged')

const { endpoint, model } = await broker.inference.getServiceMetadata(PROVIDER)
console.log('endpoint:', endpoint, '| model:', model)

const body = {
  model,
  messages: [
    { role: 'system', content: 'Reply with valid JSON only: {"city": string, "peril": string}' },
    { role: 'user', content: 'I run outdoor events in Madrid, heat kills my attendance' },
  ],
}
const headers = await broker.inference.getRequestHeaders(PROVIDER, JSON.stringify(body))
const res = await fetch(`${endpoint}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})
console.log('HTTP', res.status)
const data = await res.json()
console.log('REPONSE:', data.choices?.[0]?.message?.content ?? JSON.stringify(data).slice(0, 300))
