// Registers ENS_PARENT_NAME on Sepolia so the server can publish one subname
// per policy. The current controller takes a Registration struct — the older
// flat-parameter controller (0xFED6…) is deauthorized and reverts.
import { createPublicClient, createWalletClient, http, namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const CONTROLLER = '0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968'
const PUBLIC_RESOLVER = process.env.ENS_RESOLVER ?? '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5'
const REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const DURATION = 31556952n
const ZERO32 = `0x${'00'.repeat(32)}`

const label = (process.env.ENS_PARENT_NAME ?? 'parasolfi.eth').replace(/\.eth$/, '')
const account = privateKeyToAccount(process.env.ENS_SIGNER_PRIVATE_KEY)
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) })

const abi = parseAbi([
  'struct Registration { string label; address owner; uint256 duration; bytes32 secret; address resolver; bytes[] data; uint8 reverseRecord; bytes32 referrer; }',
  'function available(string label) view returns (bool)',
  'function rentPrice(string label, uint256 duration) view returns ((uint256 base, uint256 premium))',
  'function makeCommitment(Registration registration) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function commitments(bytes32) view returns (uint256)',
  'function minCommitmentAge() view returns (uint256)',
  'function register(Registration registration) payable',
])

const registration = {
  label,
  owner: account.address,
  duration: DURATION,
  secret: `0x${(process.env.ENS_SECRET_BYTE ?? '44').repeat(32)}`,
  resolver: PUBLIC_RESOLVER,
  data: [],
  reverseRecord: 0,
  referrer: ZERO32,
}

console.log('wallet:', account.address, '| balance:', (await pub.getBalance({ address: account.address })).toString())

if (!(await pub.readContract({ address: CONTROLLER, abi, functionName: 'available', args: [label] }))) {
  const owner = await pub.readContract({
    address: REGISTRY,
    abi: parseAbi(['function owner(bytes32 node) view returns (address)']),
    functionName: 'owner',
    args: [namehash(`${label}.eth`)],
  })
  const ours = owner.toLowerCase() === account.address.toLowerCase()
  console.log(ours ? `already ours: ${label}.eth` : `taken by ${owner} — pick another ENS_PARENT_NAME`)
  process.exit(ours ? 0 : 1)
}

const price = await pub.readContract({ address: CONTROLLER, abi, functionName: 'rentPrice', args: [label, DURATION] })
const value = ((price.base + price.premium) * 110n) / 100n
console.log('price:', (price.base + price.premium).toString(), '| sending:', value.toString())

const commitment = await pub.readContract({ address: CONTROLLER, abi, functionName: 'makeCommitment', args: [registration] })
const existing = await pub.readContract({ address: CONTROLLER, abi, functionName: 'commitments', args: [commitment] })
const minAge = await pub.readContract({ address: CONTROLLER, abi, functionName: 'minCommitmentAge' })

if (existing === 0n) {
  const commitTx = await wallet.writeContract({ address: CONTROLLER, abi, functionName: 'commit', args: [commitment] })
  console.log('commit tx:', commitTx)
  await pub.waitForTransactionReceipt({ hash: commitTx })
}

const waitFor = Number(minAge) + 15
console.log(`waiting ${waitFor}s for the commitment to mature...`)
await new Promise((r) => setTimeout(r, waitFor * 1000))

await pub.simulateContract({ address: CONTROLLER, abi, functionName: 'register', args: [registration], value, account })
console.log('simulation OK')

const tx = await wallet.writeContract({ address: CONTROLLER, abi, functionName: 'register', args: [registration], value })
console.log('register tx:', tx)
await pub.waitForTransactionReceipt({ hash: tx })
console.log(`registered ${label}.eth — set ENS_PARENT_NAME=${label}.eth`)
