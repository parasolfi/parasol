import { ethers } from 'ethers'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'

const rpc = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'
const provider = new ethers.JsonRpcProvider(rpc)
const wallet = new ethers.Wallet(process.env.ZG_DEPLOYER_PRIVATE_KEY, provider)
console.log('wallet:', wallet.address)

const broker = await createZGComputeNetworkBroker(wallet)
const services = await broker.inference.listService()
console.log(`${services.length} services`)
for (const s of services.slice(0, 12)) {
  console.log('-', s.provider, '|', s.model ?? s.name ?? '?', '|', s.url ?? s.endpoint ?? '')
}

try {
  const ledger = await broker.ledger.getLedger()
  console.log('ledger:', JSON.stringify(ledger, (k, v) => (typeof v === 'bigint' ? v.toString() : v)))
} catch (e) {
  console.log('ledger: aucun (', e.message?.slice(0, 80), ')')
}
