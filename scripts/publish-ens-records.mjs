// Publishes each policy's records as text records on ENS_PARENT_NAME.
// The ENSv2 resolver only accepts writes from the name's owner and exposes no
// delegation, so this runs locally with the owner's key — it never leaves the
// machine and the server never holds it.
//
//   ENS_OWNER_PRIVATE_KEY=0x… node scripts/publish-ens-records.mjs
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, parseAbi, toHex } from 'viem'
import { packetToBytes } from 'viem/ens'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const UNIVERSAL_RESOLVER = '0xeeeeeeee14d718c2b47d9923deab1335e144eeee'
const RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const PARENT = process.env.ENS_PARENT_NAME ?? 'parasolfi.eth'

const account = privateKeyToAccount(process.env.ENS_OWNER_PRIVATE_KEY)
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) })

const resolverAbi = parseAbi([
  'function setText(bytes32 node, string key, string value)',
  'function text(bytes32 node, string key) view returns (string)',
])

const [resolver, node] = await pub.readContract({
  address: UNIVERSAL_RESOLVER,
  abi: parseAbi(['function findResolver(bytes name) view returns (address, bytes32, uint256)']),
  functionName: 'findResolver',
  args: [toHex(packetToBytes(PARENT))],
})
console.log(`${PARENT} -> resolver ${resolver}`)
console.log('owner key:', account.address)

const policies = JSON.parse(readFileSync('.data/policies.json', 'utf8'))
if (policies.length === 0) {
  console.log('no policies to publish')
  process.exit(0)
}

const records = { 'parasol.policies': String(policies.length), description: 'Parasol — parametric cover brokered on prediction markets' }
for (const p of policies) {
  const prefix = `parasol.policy.${p.id}`
  records[`${prefix}.market`] = p.question
  records[`${prefix}.payout`] = `${p.shares} USDC`
  records[`${prefix}.premium`] = `${p.premiumUsdc} USDC`
  records[`${prefix}.status`] = p.status
  if (p.chain) records[`${prefix}.attestation`] = `eip155:16602:${p.chain.txHash}`
  if (p.storage) records[`${prefix}.profile`] = `0g://${p.storage.rootHash}`
}

console.log(`publishing ${Object.keys(records).length} text records...`)
for (const [key, value] of Object.entries(records)) {
  const current = await pub.readContract({ address: resolver, abi: resolverAbi, functionName: 'text', args: [node, key] }).catch(() => '')
  if (current === value) {
    console.log(`  = ${key} (unchanged)`)
    continue
  }
  const tx = await wallet.writeContract({ address: resolver, abi: resolverAbi, functionName: 'setText', args: [node, key, value] })
  await pub.waitForTransactionReceipt({ hash: tx })
  console.log(`  + ${key} -> ${value.slice(0, 48)}  (${tx.slice(0, 12)}…)`)
}
console.log(`done — inspect at https://sepolia.app.ens.domains/${PARENT}`)
