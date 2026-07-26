import { createPublicClient, createWalletClient, http, labelhash, namehash, parseAbi, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet, sepolia } from 'viem/chains'

const PARENT = process.env.ENS_PARENT_NAME ?? 'parasol.eth'
const NETWORK = process.env.ENS_NETWORK ?? 'sepolia'
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const MAINNET_RPC = process.env.ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com'

export const ENS_REGISTRY: Address = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
export const SEPOLIA_PUBLIC_RESOLVER: Address = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'

const registryAbi = parseAbi([
  'function owner(bytes32 node) view returns (address)',
  'function resolver(bytes32 node) view returns (address)',
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl)',
])

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

// Writing needs the parent name owned by ENS_SIGNER_PRIVATE_KEY; without it
// the name is still derived and displayed, just not published.
export async function publishPolicyName(
  label: string,
  records: Record<string, string>,
): Promise<PublishedName | null> {
  const key = process.env.ENS_SIGNER_PRIVATE_KEY
  if (!key) return null
  try {
    const account = privateKeyToAccount(key as `0x${string}`)
    const wallet = createWalletClient({ account, chain: writeChain, transport: http(writeRpc) })
    const parentNode = namehash(PARENT)
    const owner = await policyClient.readContract({
      address: ENS_REGISTRY,
      abi: registryAbi,
      functionName: 'owner',
      args: [parentNode],
    })
    if (owner.toLowerCase() !== account.address.toLowerCase()) return null

    const labelHash = labelhash(label)
    const name = `${label}.${PARENT}`
    const node = namehash(name)
    const txHashes: string[] = []

    const subOwner = await policyClient.readContract({
      address: ENS_REGISTRY,
      abi: registryAbi,
      functionName: 'owner',
      args: [node],
    })
    if (subOwner.toLowerCase() !== account.address.toLowerCase()) {
      const tx = await wallet.writeContract({
        address: ENS_REGISTRY,
        abi: registryAbi,
        functionName: 'setSubnodeRecord',
        args: [parentNode, labelHash, account.address, SEPOLIA_PUBLIC_RESOLVER, 0n],
      })
      await policyClient.waitForTransactionReceipt({ hash: tx })
      txHashes.push(tx)
    }

    for (const [recordKey, value] of Object.entries(records)) {
      const tx = await wallet.writeContract({
        address: SEPOLIA_PUBLIC_RESOLVER,
        abi: resolverAbi,
        functionName: 'setText',
        args: [node, recordKey, value],
      })
      txHashes.push(tx)
    }
    if (txHashes.length > 0) await policyClient.waitForTransactionReceipt({ hash: txHashes.at(-1) as `0x${string}` })

    return { name, network: writeChain.name, resolver: SEPOLIA_PUBLIC_RESOLVER, txHashes }
  } catch {
    return null
  }
}

export async function readPolicyRecord(name: string, key: string): Promise<string | null> {
  try {
    const node = namehash(name)
    const resolver = await policyClient.readContract({
      address: ENS_REGISTRY,
      abi: registryAbi,
      functionName: 'resolver',
      args: [node],
    })
    if (resolver === '0x0000000000000000000000000000000000000000') return null
    return await policyClient.readContract({ address: resolver, abi: resolverAbi, functionName: 'text', args: [node, key] })
  } catch {
    return null
  }
}

export async function resolveOwner(name: string): Promise<Address | null> {
  try {
    return await identityClient.getEnsAddress({ name })
  } catch {
    return null
  }
}

const nameCache = new Map<string, string | null>()

export async function reverseName(address: Address): Promise<string | null> {
  const key = address.toLowerCase()
  if (nameCache.has(key)) return nameCache.get(key) ?? null
  let name: string | null = null
  try {
    name = await identityClient.getEnsName({ address })
  } catch {
    name = null
  }
  nameCache.set(key, name)
  return name
}
