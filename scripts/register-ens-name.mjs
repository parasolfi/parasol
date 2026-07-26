// Registers ENS_PARENT_NAME on Sepolia for ENS_SIGNER_PRIVATE_KEY, then the
// server publishes one subname per policy. Needs Sepolia ETH on that wallet.
import { createPublicClient, createWalletClient, http, namehash, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const CONTROLLER = '0xFED6a969AaA60E4961FCD3EBF1A2e8913ac65B72'
const PUBLIC_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const DURATION = 31556952n

const label = (process.env.ENS_PARENT_NAME ?? 'parasolfi.eth').replace(/\.eth$/, '')
const account = privateKeyToAccount(process.env.ENS_SIGNER_PRIVATE_KEY)
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) })

const controllerAbi = parseAbi([
  'function available(string name) view returns (bool)',
  'function rentPrice(string name, uint256 duration) view returns ((uint256 base, uint256 premium))',
  'function makeCommitment(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) payable',
])

console.log('wallet:', account.address)
console.log('balance:', (await pub.getBalance({ address: account.address })).toString(), 'wei')

const available = await pub.readContract({ address: CONTROLLER, abi: controllerAbi, functionName: 'available', args: [label] })
console.log(`${label}.eth available:`, available)
if (!available) {
  const owner = await pub.readContract({
    address: REGISTRY,
    abi: parseAbi(['function owner(bytes32 node) view returns (address)']),
    functionName: 'owner',
    args: [namehash(`${label}.eth`)],
  })
  console.log('already registered to:', owner)
  console.log(owner.toLowerCase() === account.address.toLowerCase() ? 'we own it — nothing to do' : 'pick another ENS_PARENT_NAME')
  process.exit(owner.toLowerCase() === account.address.toLowerCase() ? 0 : 1)
}

const price = await pub.readContract({ address: CONTROLLER, abi: controllerAbi, functionName: 'rentPrice', args: [label, DURATION] })
const total = price.base + price.premium
console.log('price:', total.toString(), 'wei')

const secret = `0x${'11'.repeat(32)}`
const args = [label, account.address, DURATION, secret, PUBLIC_RESOLVER, [], false, 0]

const commitment = await pub.readContract({ address: CONTROLLER, abi: controllerAbi, functionName: 'makeCommitment', args })
const commitTx = await wallet.writeContract({ address: CONTROLLER, abi: controllerAbi, functionName: 'commit', args: [commitment] })
console.log('commit tx:', commitTx)
await pub.waitForTransactionReceipt({ hash: commitTx })

console.log('waiting 60s for the commitment to mature...')
await new Promise((r) => setTimeout(r, 60_000))

const registerTx = await wallet.writeContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: 'register',
  args,
  value: (total * 110n) / 100n,
})
console.log('register tx:', registerTx)
await pub.waitForTransactionReceipt({ hash: registerTx })
console.log(`registered ${label}.eth — set ENS_PARENT_NAME=${label}.eth`)
