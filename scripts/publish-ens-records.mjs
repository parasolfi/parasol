// Publishes one resolvable ENS name per policy.
//
// The name's resolver is an ENSIP-10 wildcard resolver, so records written on a
// subname's node resolve without the subname existing in any registry. Writes
// are accepted only from the name's owner and the resolver exposes no
// delegation, so this runs locally with the owner's key — it never leaves the
// machine and the server never holds it.
//
//   ENS_OWNER_PRIVATE_KEY=0x… node scripts/publish-ens-records.mjs
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, namehash, parseAbi, toHex } from 'viem'
import { packetToBytes } from 'viem/ens'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const UNIVERSAL_RESOLVER = '0xeeeeeeee14d718c2b47d9923deab1335e144eeee'
const RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const PARENT = process.env.ENS_PARENT_NAME ?? 'parasolfi.eth'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const account = privateKeyToAccount(process.env.ENS_OWNER_PRIVATE_KEY)
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) })

const resolverAbi = parseAbi([
  'function setText(bytes32 node, string key, string value)',
  'function text(bytes32 node, string key) view returns (string)',
])

const [resolver] = await pub.readContract({
  address: UNIVERSAL_RESOLVER,
  abi: parseAbi(['function findResolver(bytes name) view returns (address, bytes32, uint256)']),
  functionName: 'findResolver',
  args: [toHex(packetToBytes(PARENT))],
})
console.log(`${PARENT} -> resolver ${resolver}`)
console.log('signing as:', account.address)

function policyLabel(question, id) {
  const m = question.match(/temperature in (.+?) on ([A-Za-z]+)\s*(\d{1,2})/i)
  if (!m) return `policy-${id}`
  const city = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const month = String(MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1).padStart(2, '0')
  const peril = /highest/i.test(question) ? 'heat' : 'cold'
  return `${city}-${peril}-${month}${m[3].padStart(2, '0')}-${id}`
}

const policies = JSON.parse(readFileSync('.data/policies.json', 'utf8'))
if (policies.length === 0) {
  console.log('no policies to publish')
  process.exit(0)
}

let written = 0
for (const p of policies) {
  const name = `${policyLabel(p.question, p.id)}.${PARENT}`
  const node = namehash(name)
  const records = {
    description: p.question,
    'parasol.payout': `${p.shares} USDC`,
    'parasol.premium': `${p.premiumUsdc} USDC`,
    'parasol.status': p.status,
    'parasol.holder': p.holder,
  }
  if (p.chain) {
    records['parasol.registry'] = `eip155:16602:${p.chain.registry}`
    records['parasol.attestation'] = p.chain.txHash
  }
  if (p.storage) records['parasol.profile'] = `0g://${p.storage.rootHash}`

  console.log(`\n${name}`)
  for (const [key, value] of Object.entries(records)) {
    const current = await pub
      .readContract({ address: resolver, abi: resolverAbi, functionName: 'text', args: [node, key] })
      .catch(() => '')
    if (current === value) {
      console.log(`  = ${key}`)
      continue
    }
    const tx = await wallet.writeContract({
      address: resolver,
      abi: resolverAbi,
      functionName: 'setText',
      args: [node, key, value],
    })
    await pub.waitForTransactionReceipt({ hash: tx })
    console.log(`  + ${key} = ${value.slice(0, 46)}`)
    written++
  }
}

const parentNode = namehash(PARENT)
const countTx = await wallet.writeContract({
  address: resolver,
  abi: resolverAbi,
  functionName: 'setText',
  args: [parentNode, 'parasol.policies', String(policies.length)],
})
await pub.waitForTransactionReceipt({ hash: countTx })

console.log(`\n${written} records written across ${policies.length} policies`)
console.log(`verify: https://sepolia.app.ens.domains/${PARENT}`)
