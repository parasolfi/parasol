import { ethers } from 'ethers'
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'

const CHAT_PROVIDER = process.env.ZG_COMPUTE_PROVIDER ?? '0xa48f01287233509FD694a22Bf840225062E67836'
const GALILEO_RPC = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'

interface BrokerSession {
  broker: Awaited<ReturnType<typeof createZGComputeNetworkBroker>>
  endpoint: string
  model: string
}

let session: BrokerSession | null = null
let unavailable = false

// The compute ledger needs a 3 OG minimum: until the wallet is funded this
// resolves to null once and the agent stays on its next fallback tier.
async function getSession(): Promise<BrokerSession | null> {
  if (session) return session
  if (unavailable) return null
  const key = process.env.ZG_COMPUTE_PRIVATE_KEY ?? process.env.ZG_DEPLOYER_PRIVATE_KEY
  if (!key) return null
  try {
    const wallet = new ethers.Wallet(key, new ethers.JsonRpcProvider(GALILEO_RPC))
    const broker = await createZGComputeNetworkBroker(wallet)
    await broker.ledger.getLedger()
    await broker.inference.acknowledgeProviderSigner(CHAT_PROVIDER)
    const { endpoint, model } = await broker.inference.getServiceMetadata(CHAT_PROVIDER)
    session = { broker, endpoint, model }
    return session
  } catch {
    unavailable = true
    return null
  }
}

export async function brokerCompletion(messages: { role: string; content: string }[]): Promise<string | null> {
  const s = await getSession()
  if (!s) return null
  const body = { model: s.model, messages, temperature: 0.3 }
  const headers = await s.broker.inference.getRequestHeaders(CHAT_PROVIDER, JSON.stringify(body))
  const res = await fetch(`${s.endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers as unknown as Record<string, string>) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`0g compute ${res.status}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : null
}
