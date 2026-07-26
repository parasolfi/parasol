import { createPublicClient, createWalletClient, http, namehash, parseAbi, toHex, type Address } from 'viem'
import { packetToBytes } from 'viem/ens'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet, sepolia } from 'viem/chains'

const PARENT = process.env.ENS_PARENT_NAME ?? 'parasol.eth'
export const ENS_PARENT = PARENT
const NETWORK = process.env.ENS_NETWORK ?? 'sepolia'
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const MAINNET_RPC = process.env.ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com'

const resolverAbi = parseAbi([
  'function setText(bytes32 node, string key, string value)',
  'function text(bytes32 node, string key) view returns (string)',
])

// Policy names live on Sepolia (test deployment); client identities resolve on
// mainnet, where people actually own their names.
const writeChain = NETWORK === 'mainnet' ? mainnet : sepolia
const writeRpc = NETWORK === 'mainnet' ? MAINNET_RPC : SEPOLIA_RPC

const policyClient = createPublicClient({ chain: writeChain, transport: http(writeRpc) })
const identityClient = createPublicClient({ chain: mainnet, transport: http(MAINNET_RPC) })

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function policyLabel(city: string, peril: string, date: string, id: number): string {
  const slugCity = city.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const parsed = date.match(/([A-Za-z]+)\s*(\d{1,2})/)
  const month = parsed ? MONTHS.indexOf(parsed[1]!.slice(0, 3).toLowerCase()) + 1 : 0
  const day = parsed ? parsed[2]!.padStart(2, '0') : '00'
  const stamp = month > 0 ? `${String(month).padStart(2, '0')}${day}` : 'undated'
  return `${slugCity}-${peril}-${stamp}-${id}`
}

export function policyName(city: string, peril: string, date: string, id: number): string {
  return `${policyLabel(city, peril, date, id)}.${PARENT}`
}

// A policy outlives its market: yesterday's event is gone from the catalogue by
// the time it pays out, so the name is derived from the policy's own question.
export function policyNameFromQuestion(question: string, id: number): string | null {
  const m = question.match(/(highest|lowest) temperature in (.+?) on ([A-Za-z]+\s*\d{1,2})/i)
  if (!m) return null
  const peril = m[1]!.toLowerCase() === 'highest' ? 'heat' : 'cold'
  return policyName(m[2]!, peril, m[3]!, id)
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

export interface PublishedName {
  name: string
  network: string
  resolver: Address
  txHashes: string[]
}

const SEPOLIA_UNIVERSAL_RESOLVER: Address = '0xeeeeeeee14d718c2b47d9923deab1335e144eeee'

const universalResolverAbi = parseAbi([
  'function findResolver(bytes name) view returns (address, bytes32, uint256)',
])

export const POLICY_RECORD_KEYS = [
  'description',
  'parasol.payout',
  'parasol.premium',
  'parasol.status',
  'parasol.holder',
  'parasol.registry',
  'parasol.attestation',
  'parasol.profile',
  'parasol.policies',
] as const

async function parentResolver(): Promise<Address | null> {
  try {
    const [resolver] = await policyClient.readContract({
      address: SEPOLIA_UNIVERSAL_RESOLVER,
      abi: universalResolverAbi,
      functionName: 'findResolver',
      args: [toHex(packetToBytes(PARENT))],
    })
    return resolver === '0x0000000000000000000000000000000000000000' ? null : resolver
  } catch {
    return null
  }
}

export const parentResolverAddress = parentResolver

// The parent's resolver is an ENSv2 PermissionedResolver with a wildcard
// (ENSIP-10) lookup, so records written on a policy's own node resolve without
// the subname existing in any registry. Writing needs ROLE_SET_TEXT on each
// key, granted once by the name owner via scripts/authorize-ens-writer.mjs.
export async function publishPolicyName(
  label: string,
  records: Record<string, string>,
): Promise<PublishedName | null> {
  const key = process.env.ENS_SIGNER_PRIVATE_KEY
  if (!key) return null
  const resolver = await parentResolver()
  if (!resolver) return null
  try {
    const account = privateKeyToAccount(key as `0x${string}`)
    const wallet = createWalletClient({ account, chain: writeChain, transport: http(writeRpc) })
    const name = `${label}.${PARENT}`
    const node = namehash(name)
    const txHashes: string[] = []

    for (const [recordKey, value] of Object.entries(records)) {
      const tx = await wallet.writeContract({
        address: resolver,
        abi: resolverAbi,
        functionName: 'setText',
        args: [node, recordKey, value],
      })
      txHashes.push(tx)
    }
    if (txHashes.length === 0) return null
    await policyClient.waitForTransactionReceipt({ hash: txHashes.at(-1) as `0x${string}` })

    return { name, network: writeChain.name, resolver, txHashes }
  } catch {
    return null
  }
}

// ENSv2 names are not in the legacy registry, so records resolve through the
// UniversalResolver instead of looking the resolver up directly.
export async function readPolicyRecord(name: string, key: string): Promise<string | null> {
  try {
    const value = await policyClient.getEnsText({ name, key, universalResolverAddress: SEPOLIA_UNIVERSAL_RESOLVER })
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

export interface BrokerIdentity {
  name: string
  address: Address | null
  policiesPublished: number
}

export async function brokerIdentity(): Promise<BrokerIdentity | null> {
  try {
    const address = await policyClient.getEnsAddress({
      name: PARENT,
      universalResolverAddress: SEPOLIA_UNIVERSAL_RESOLVER,
    })
    if (!address) return null
    const published = await readPolicyRecord(PARENT, 'parasol.policies')
    return { name: PARENT, address, policiesPublished: Number(published ?? 0) }
  } catch {
    return null
  }
}

// Clients may hold their name on either network — testnet names resolve
// through the UniversalResolver, mainnet through the legacy path.
export async function resolveOwner(name: string): Promise<Address | null> {
  const attempts = [
    () => policyClient.getEnsAddress({ name, universalResolverAddress: SEPOLIA_UNIVERSAL_RESOLVER }),
    () => identityClient.getEnsAddress({ name }),
  ]
  for (const attempt of attempts) {
    try {
      const address = await attempt()
      if (address) return address
    } catch {
      continue
    }
  }
  return null
}

const nameCache = new Map<string, string | null>()

export async function reverseName(address: Address): Promise<string | null> {
  const key = address.toLowerCase()
  if (nameCache.has(key)) return nameCache.get(key) ?? null
  const attempts = [
    () => policyClient.getEnsName({ address, universalResolverAddress: SEPOLIA_UNIVERSAL_RESOLVER }),
    () => identityClient.getEnsName({ address }),
  ]
  let name: string | null = null
  for (const attempt of attempts) {
    try {
      name = await attempt()
      if (name) break
    } catch {
      continue
    }
  }
  nameCache.set(key, name)
  return name
}
