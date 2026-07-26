import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const CONTROLLER = '0xFED6a969AaA60E4961FCD3EBF1A2e8913ac65B72'
const PUBLIC_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const DURATION = 31556952n

const label = (process.env.ENS_PARENT_NAME ?? 'parasolfi.eth').replace(/\.eth$/, '')
const account = privateKeyToAccount(process.env.ENS_SIGNER_PRIVATE_KEY)
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) })

const abi = parseAbi([
  'function rentPrice(string name, uint256 duration) view returns ((uint256 base, uint256 premium))',
  'function makeCommitment(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) pure returns (bytes32)',
  'function commitments(bytes32) view returns (uint256)',
  'function minCommitmentAge() view returns (uint256)',
  'function maxCommitmentAge() view returns (uint256)',
  'function commit(bytes32 commitment)',
  'function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) payable',
])

const secret = `0x${'11'.repeat(32)}`
const args = [label, account.address, DURATION, secret, PUBLIC_RESOLVER, [], false, 0]

const commitment = await pub.readContract({ address: CONTROLLER, abi, functionName: 'makeCommitment', args })
const [committedAt, minAge, maxAge, block] = await Promise.all([
  pub.readContract({ address: CONTROLLER, abi, functionName: 'commitments', args: [commitment] }),
  pub.readContract({ address: CONTROLLER, abi, functionName: 'minCommitmentAge' }),
  pub.readContract({ address: CONTROLLER, abi, functionName: 'maxCommitmentAge' }),
  pub.getBlock(),
])
const age = block.timestamp - committedAt
console.log('commitment:', commitment)
console.log('committedAt:', committedAt.toString(), '| age:', age.toString(), 's | min:', minAge.toString(), '| max:', maxAge.toString())

if (committedAt === 0n) {
  console.log('commitment absent — recommit needed')
  const tx = await wallet.writeContract({ address: CONTROLLER, abi, functionName: 'commit', args: [commitment] })
  console.log('commit tx:', tx)
  process.exit(0)
}
if (age < minAge) {
  console.log(`too young, wait ${(minAge - age).toString()}s more`)
  process.exit(1)
}
if (age > maxAge) {
  console.log('commitment expired — recommit')
  const tx = await wallet.writeContract({ address: CONTROLLER, abi, functionName: 'commit', args: [commitment] })
  console.log('recommit tx:', tx)
  process.exit(0)
}

const price = await pub.readContract({ address: CONTROLLER, abi, functionName: 'rentPrice', args: [label, DURATION] })
const value = ((price.base + price.premium) * 105n) / 100n
console.log('value:', value.toString())

try {
  await pub.simulateContract({ address: CONTROLLER, abi, functionName: 'register', args, value, account })
  console.log('simulation OK')
} catch (e) {
  console.log('SIMULATION FAILED:', (e.shortMessage ?? e.message ?? '').slice(0, 300))
  console.log('details:', (e.details ?? e.metaMessages?.join(' | ') ?? '').slice(0, 300))
  process.exit(1)
}

const tx = await wallet.writeContract({ address: CONTROLLER, abi, functionName: 'register', args, value })
console.log('register tx:', tx)
await pub.waitForTransactionReceipt({ hash: tx })
console.log(`registered ${label}.eth`)
