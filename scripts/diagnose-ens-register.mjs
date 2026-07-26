import { createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const CONTROLLER = '0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968'
const RESOLVERS = {
  'new PublicResolver': '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
  'old PublicResolver': '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
  none: '0x0000000000000000000000000000000000000000',
}
const RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const label = 'parasolfi'
const account = privateKeyToAccount(process.env.ENS_SIGNER_PRIVATE_KEY)
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })

const abi = parseAbi([
  'struct Registration { string label; address owner; uint256 duration; bytes32 secret; address resolver; bytes[] data; uint8 reverseRecord; bytes32 referrer; }',
  'function rentPrice(string label, uint256 duration) view returns ((uint256 base, uint256 premium))',
  'function makeCommitment(Registration registration) pure returns (bytes32)',
  'function commitments(bytes32) view returns (uint256)',
  'function register(Registration registration) payable',
])

const price = await pub.readContract({ address: CONTROLLER, abi, functionName: 'rentPrice', args: [label, 31556952n] })
const total = price.base + price.premium
console.log('rentPrice total:', total.toString())

for (const [name, resolver] of Object.entries(RESOLVERS)) {
  for (const secretByte of ['22', '33']) {
    const registration = {
      label,
      owner: account.address,
      duration: 31556952n,
      secret: `0x${secretByte.repeat(32)}`,
      resolver,
      data: [],
      reverseRecord: 0,
      referrer: `0x${'00'.repeat(32)}`,
    }
    const commitment = await pub.readContract({ address: CONTROLLER, abi, functionName: 'makeCommitment', args: [registration] })
    const committedAt = await pub.readContract({ address: CONTROLLER, abi, functionName: 'commitments', args: [commitment] })
    try {
      await pub.simulateContract({
        address: CONTROLLER,
        abi,
        functionName: 'register',
        args: [registration],
        value: (total * 110n) / 100n,
        account,
      })
      console.log(`OK  resolver=${name} secret=0x${secretByte}… committed=${committedAt}`)
    } catch (e) {
      const msg = (e.shortMessage ?? e.message ?? '').replace(/\n/g, ' ').slice(0, 110)
      console.log(`ERR resolver=${name} secret=0x${secretByte}… committed=${committedAt} -> ${msg}`)
    }
  }
}
