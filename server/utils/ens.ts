import { createPublicClient, http, namehash, type Address } from 'viem'
import { mainnet } from 'viem/chains'

const PARENT = process.env.ENS_PARENT_NAME ?? 'parasol.eth'
const MAINNET_RPC = process.env.ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com'

const ens = createPublicClient({ chain: mainnet, transport: http(MAINNET_RPC) })

export interface PolicyName {
  name: string
  node: `0x${string}`
  records: Record<string, string>
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// One canonical name per policy, derived from the cover itself so the same
// cover always resolves to the same name across venues and clients.
export function policyName(city: string, peril: string, date: string, id: number): string {
  const slugCity = city.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const parsed = date.match(/([A-Za-z]+)\s*(\d{1,2})/)
  const month = parsed ? MONTHS.indexOf(parsed[1]!.slice(0, 3).toLowerCase()) + 1 : 0
  const day = parsed ? parsed[2]!.padStart(2, '0') : '00'
  const stamp = month > 0 ? `${String(month).padStart(2, '0')}${day}` : 'undated'
  return `${slugCity}-${peril}-${stamp}-${id}.${PARENT}`
}

export function policyRecords(policy: {
  question: string
  shares: number
  premiumUsdc: number
  status: string
  chain: { registry: string; txHash: string } | null
  storage: { rootHash: string } | null
}): Record<string, string> {
  const records: Record<string, string> = {
    description: policy.question,
    'parasol.payout': `${policy.shares} USDC`,
    'parasol.premium': `${policy.premiumUsdc} USDC`,
    'parasol.status': policy.status,
  }
  if (policy.chain) {
    records['parasol.registry'] = `eip155:16602:${policy.chain.registry}`
    records['parasol.attestation'] = policy.chain.txHash
  }
  if (policy.storage) records['parasol.profile'] = `0g://${policy.storage.rootHash}`
  return records
}

export function buildPolicyName(
  policy: Parameters<typeof policyRecords>[0] & { id: number },
  city: string,
  peril: string,
  date: string,
): PolicyName {
  const name = policyName(city, peril, date, policy.id)
  return { name, node: namehash(name), records: policyRecords(policy) }
}

export async function resolveText(name: string, key: string): Promise<string | null> {
  try {
    return await ens.getEnsText({ name, key })
  } catch {
    return null
  }
}

export async function resolveOwner(name: string): Promise<Address | null> {
  try {
    return await ens.getEnsAddress({ name })
  } catch {
    return null
  }
}

const nameCache = new Map<string, string | null>()

// Clients are people, not hex strings: policies and the wallet chip show the
// holder's ENS name whenever one reverse-resolves.
export async function reverseName(address: Address): Promise<string | null> {
  const key = address.toLowerCase()
  if (nameCache.has(key)) return nameCache.get(key) ?? null
  let name: string | null = null
  try {
    name = await ens.getEnsName({ address })
  } catch {
    name = null
  }
  nameCache.set(key, name)
  return name
}
