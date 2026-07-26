// Grants the server's ENS signer permission to write the policy record keys on
// ENS_PARENT_NAME, so policies publish themselves as they are issued.
//
// The name's resolver is an ENSv2 PermissionedResolver: it keeps its own role
// table keyed by (namehash, record key) rather than consulting a registry, so
// delegation is per-key via authorizeTextRoles — no ownership transfer, and the
// legacy approve/setApprovalForAll do not exist on it.
//
//   ENS_OWNER_PRIVATE_KEY=0x… node scripts/authorize-ens-writer.mjs
import { createPublicClient, createWalletClient, http, parseAbi, toHex } from 'viem'
import { packetToBytes } from 'viem/ens'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const UNIVERSAL_RESOLVER = '0xeeeeeeee14d718c2b47d9923deab1335e144eeee'
const RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const PARENT = process.env.ENS_PARENT_NAME ?? 'parasolfi.eth'
const WRITER = process.env.ENS_SIGNER_ADDRESS

const KEYS = [
  'description',
  'parasol.payout',
  'parasol.premium',
  'parasol.status',
  'parasol.holder',
  'parasol.registry',
  'parasol.attestation',
  'parasol.profile',
  'parasol.policies',
]

if (!WRITER) {
  console.error('ENS_SIGNER_ADDRESS missing — source your .env first')
  process.exit(1)
}

const account = privateKeyToAccount(process.env.ENS_OWNER_PRIVATE_KEY)
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) })

const [resolver] = await pub.readContract({
  address: UNIVERSAL_RESOLVER,
  abi: parseAbi(['function findResolver(bytes name) view returns (address, bytes32, uint256)']),
  functionName: 'findResolver',
  args: [toHex(packetToBytes(PARENT))],
})

const abi = parseAbi(['function authorizeTextRoles(bytes toName, string key, address account, bool grant)'])
const dnsName = toHex(packetToBytes(PARENT))

console.log(`${PARENT} -> resolver ${resolver}`)
console.log(`granting ${WRITER} write access to ${KEYS.length} record keys, signed by ${account.address}\n`)

for (const key of KEYS) {
  const tx = await wallet.writeContract({
    address: resolver,
    abi,
    functionName: 'authorizeTextRoles',
    args: [dnsName, key, WRITER, true],
  })
  await pub.waitForTransactionReceipt({ hash: tx })
  console.log(`  + ${key}`)
}

console.log('\ndone — the server can now publish policy records without your key')
