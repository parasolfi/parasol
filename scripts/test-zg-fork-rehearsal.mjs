// Dress rehearsal of the compute-ledger flow on a Galileo fork with a
// simulated 10 OG balance. Proves our side of the integration; the final
// provider call is EXPECTED to fail (settlement is anchored to the real
// chain — that is 0G's design, and why real inference needs real OG).
import { ethers } from 'ethers'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'

const PROVIDER = '0xa48f01287233509FD694a22Bf840225062E67836'
const rpc = process.env.ZG_RPC_URL ?? 'http://127.0.0.1:8547'

const wallet = new ethers.Wallet(process.env.ZG_DEPLOYER_PRIVATE_KEY, new ethers.JsonRpcProvider(rpc))
const broker = await createZGComputeNetworkBroker(wallet)

console.log('[1] addLedger(3)...')
await broker.ledger.addLedger(3)
const ledger = await broker.ledger.getLedger()
console.log('    OK — ledger balance:', ledger.totalBalance?.toString?.() ?? '?')

console.log('[2] acknowledgeProviderSigner...')
await broker.inference.acknowledgeProviderSigner(PROVIDER)
console.log('    OK')

console.log('[3] getServiceMetadata...')
const { endpoint, model } = await broker.inference.getServiceMetadata(PROVIDER)
console.log('    OK — endpoint:', endpoint, '| model:', model)

console.log('[4] getRequestHeaders...')
const body = { model, messages: [{ role: 'user', content: 'ping' }] }
const headers = await broker.inference.getRequestHeaders(PROVIDER, JSON.stringify(body))
console.log('    OK — headers:', Object.keys(headers).join(', '))

console.log('[5] appel provider reel (echec attendu — reglement ancre sur la vraie chaine)...')
try {
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log('    HTTP', res.status, '—', text.slice(0, 160))
} catch (e) {
  console.log('    erreur reseau:', e.message?.slice(0, 120))
}
