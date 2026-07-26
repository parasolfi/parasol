import { encodeFunctionData, parseAbi, toHex, type Address } from 'viem'
import { packetToBytes } from 'viem/ens'
import { ENS_PARENT, parentResolverAddress, POLICY_RECORD_KEYS } from '../../utils/ens'

const authorizeAbi = parseAbi([
  'function authorizeTextRoles(bytes toName, string key, address account, bool grant)',
])
const multicallAbi = parseAbi(['function multicall(bytes[] data) returns (bytes[])'])

// Returns an unsigned transaction the name owner signs in their own wallet:
// one multicall granting the server's signer write access to every policy
// record key. Parasol never sees the owner's key.
export default defineEventHandler(async (event) => {
  const { grant } = getQuery(event)
  const writer = process.env.ENS_SIGNER_ADDRESS as Address | undefined
  if (!writer) throw createError({ statusCode: 503, statusMessage: 'ENS_SIGNER_ADDRESS not configured' })

  const resolver = await parentResolverAddress()
  if (!resolver) throw createError({ statusCode: 503, statusMessage: `no resolver for ${ENS_PARENT}` })

  const dnsName = toHex(packetToBytes(ENS_PARENT))
  const granting = grant !== 'false'
  const calls = POLICY_RECORD_KEYS.map((key: string) =>
    encodeFunctionData({ abi: authorizeAbi, functionName: 'authorizeTextRoles', args: [dnsName, key, writer, granting] }),
  )

  return {
    name: ENS_PARENT,
    writer,
    granting,
    keys: POLICY_RECORD_KEYS,
    tx: {
      to: resolver,
      data: encodeFunctionData({ abi: multicallAbi, functionName: 'multicall', args: [calls] }),
      chainId: 11155111,
    },
  }
})
