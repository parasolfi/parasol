import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createWalletClient, createPublicClient, http, keccak256, toHex, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { GALILEO_RPC, registryAbi } from './chain'
import { storeEncryptedProfile } from './zg-storage'
import { policyLabel, policyRecords, publishPolicyName } from './ens'

export interface PolicyRecord {
  id: number
  holder: string
  eventSlug: string
  question: string
  tokenIds: string[]
  conditionIds: string[]
  shares: number
  premiumUsdc: number
  profile: string
  authorization: string
  issuedAt: string
  status: 'Issued' | 'ResolvedYes' | 'ResolvedNo' | 'Paid'
  chain: { network: string; registry: string; txHash: string } | null
  storage: { rootHash: string; txHash: string } | null
  ens: { name: string; network: string; resolver: string; txHashes: string[] } | null
}

const STORE_DIR = '.data'
const STORE = `${STORE_DIR}/policies.json`

function load(): PolicyRecord[] {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8'))
  } catch {
    return []
  }
}

function save(records: PolicyRecord[]) {
  mkdirSync(STORE_DIR, { recursive: true })
  writeFileSync(STORE, JSON.stringify(records, null, 2))
}

// On-chain attestation is best-effort: the local store is the source the
// front reads, the Galileo tx is the proof the jury verifies. Missing key
// or RPC failure degrades to local-only, never blocks issuance.
async function attestOnChain(p: PolicyRecord): Promise<PolicyRecord['chain']> {
  const key = process.env.ZG_DEPLOYER_PRIVATE_KEY
  const registry = process.env.POLICY_REGISTRY_ADDRESS as Address | undefined
  if (!key || !registry) return null
  try {
    const account = privateKeyToAccount(key as `0x${string}`)
    const wallet = createWalletClient({ account, transport: http(GALILEO_RPC) })
    const pub = createPublicClient({ transport: http(GALILEO_RPC) })
    const txHash = await wallet.writeContract({
      chain: null,
      address: registry,
      abi: registryAbi,
      functionName: 'issue',
      args: [
        p.holder as Address,
        p.storage ? (p.storage.rootHash as `0x${string}`) : keccak256(toHex(`${p.profile}|${p.authorization}`)),
        p.eventSlug,
        p.tokenIds.map(BigInt),
        BigInt(Math.round(p.shares * 1e6)),
        BigInt(Math.round(p.premiumUsdc * 1e6)),
      ],
    })
    await pub.waitForTransactionReceipt({ hash: txHash })
    return { network: 'galileo-16602', registry, txHash }
  } catch {
    return null
  }
}

export async function issuePolicy(
  input: Omit<PolicyRecord, 'id' | 'issuedAt' | 'status' | 'chain' | 'storage' | 'ens'>,
  naming?: { city: string; peril: string; date: string },
): Promise<PolicyRecord> {
  const records = load()
  const record: PolicyRecord = {
    ...input,
    id: records.length,
    issuedAt: new Date().toISOString(),
    status: 'Issued',
    chain: null,
    storage: null,
    ens: null,
  }
  record.storage = await storeEncryptedProfile({
    holder: record.holder,
    eventSlug: record.eventSlug,
    question: record.question,
    profile: record.profile,
    shares: record.shares,
    premiumUsdc: record.premiumUsdc,
    authorization: record.authorization,
  })
  record.chain = await attestOnChain(record)
  if (naming)
    record.ens = await publishPolicyName(
      policyLabel(naming.city, naming.peril, naming.date, record.id),
      policyRecords(record),
    )
  records.push(record)
  save(records)
  return record
}

export function listPolicies(): PolicyRecord[] {
  return load()
}

export function updatePolicyStatus(id: number, status: PolicyRecord['status']): PolicyRecord | null {
  const records = load()
  const p = records.find((r) => r.id === id)
  if (!p) return null
  p.status = status
  save(records)
  return p
}
